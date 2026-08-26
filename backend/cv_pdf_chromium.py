"""
PDF CV via Chromium headless (Playwright).

Utilisé lorsque CV_BOT_PDF_ENGINE=chromium. Le HTML est préparé comme pour WeasyPrint
(prepare_cv_html_for_weasyprint) : injection du bundle pdf_export (layout + align).
Sans lui, les templates fixent souvent .cv à height/max-height 297mm → PDF tronqué sur 1 page.

Modes d'exécution :
  * 1 worker (CV_BOT_PDF_CHROMIUM_POOL_SIZE=1, défaut) : un thread dédié pilote Playwright ;
    obligatoire car la sync_api est liée au thread (les routes sync FastAPI changent de thread
    dans le pool Starlette → erreur greenlet si Playwright vivait sur le thread requête).
  * Pool (CV_BOT_PDF_CHROMIUM_POOL_SIZE >= 2) : N workers indépendants, chacun avec son
    propre process Playwright + browser, dispatchés via une queue de jobs. La sync_api
    Playwright impose qu'un Playwright soit piloté depuis son thread d'origine → on
    encapsule chaque slot dans un thread daemon dédié. Coût RAM : ~150 Mo / slot.
    À activer uniquement si la latence PDF devient un goulot et qu'il reste de la RAM.

Prérequis :
  pip install playwright
  playwright install chromium
  (Docker : voir backend/Dockerfile - install --with-deps)

Ressources (/api/assets/, polices externes) : le document contient souvent <base href="CV_BOT_API_BASE_URL">.
En conteneur, pointe l'API vers une URL joignable depuis le processus PDF (ex. http://127.0.0.1:8000).
"""

from __future__ import annotations

import asyncio
import atexit
import logging
import os
import queue
import sys
import threading
import time
from concurrent.futures import Future
from pathlib import Path
from typing import Any

_log = logging.getLogger("cv_bot.pdf.chromium")


def _ensure_windows_playwright_asyncio() -> None:
    """
    Sous Windows, la politique SelectorEventLoop ne gère pas subprocess → Playwright sync lève
    NotImplementedError dans asyncio.create_subprocess_exec (ex. Python 3.12+ / thread Uvicorn).
    ProactorEventLoop est requis pour lancer le navigateur Chromium.
    """
    if sys.platform != "win32":
        return
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass


# Hauteur viewport : si trop basse (~1 page A4), Chromium sous-estime scrollHeight / fragmentation PDF.
_DEFAULT_CHROMIUM_VIEWPORT_HEIGHT = 20_000

# Hauteur sidebar arrondie aux multiples d'une page A4 (297 mm en px CSS 96 dpi) : la dernière page
# garde la bande couleur jusqu'en bas, pas seulement jusqu'à la fin du texte du main.
# cv-print-split : 1re « tranche » = page − header ; suivantes = pageH pleine.
_CHROMIUM_SYNC_SIDEBAR_JS = """async () => {
    const MM_TO_PX = 96 / 25.4;
    const pageH = Math.round(297 * MM_TO_PX);
    const extraRaw = getComputedStyle(document.documentElement)
        .getPropertyValue("--cv-pdf-chromium-sidebar-extra-px")
        .trim();
    const extra = parseFloat(extraRaw);
    const bump = Number.isFinite(extra) ? extra : 0;
    const colH = (el) => {
        if (!el) return 0;
        return Math.ceil(Math.max(el.scrollHeight, el.getBoundingClientRect().height));
    };
    const snapDual = (mainH) => {
        const m = Math.max(1, mainH + bump);
        return Math.ceil(m / pageH) * pageH;
    };
    const snapSplit = (mainH, headerEl) => {
        const m = Math.max(1, mainH + bump);
        const hh = headerEl ? Math.ceil(headerEl.getBoundingClientRect().height) : 0;
        const p1 = Math.max(1, pageH - hh);
        if (m <= p1) return p1;
        const ov = m - p1;
        const ep = Math.ceil(ov / pageH);
        return p1 + ep * pageH;
    };
    const run = () => {
        document.querySelectorAll(".cv.cv-print-split").forEach((cv) => {
            const body = cv.querySelector(":scope > .cv-body");
            const header = cv.querySelector(":scope > .cv-header");
            const main = body?.querySelector(":scope > .cv-main");
            const side = body?.querySelector(":scope > .cv-sidebar");
            if (!body || !main || !side) return;
            const snapped = snapSplit(colH(main), header);
            side.style.setProperty("height", snapped + "px", "important");
            side.style.setProperty("min-height", snapped + "px", "important");
            side.style.setProperty("bottom", "auto", "important");
            side.style.setProperty("top", "0", "important");
            body.style.setProperty("min-height", snapped + "px", "important");
        });
        document.querySelectorAll("article.cv.cv-pdf-dual-column, .cv.cv-pdf-dual-column").forEach((cv) => {
            const main = cv.querySelector(":scope > .cv-main");
            const side = cv.querySelector(":scope > .cv-sidebar");
            if (!main || !side) return;
            const snapped = snapDual(colH(main));
            side.style.setProperty("min-height", snapped + "px", "important");
            side.style.setProperty("height", snapped + "px", "important");
            main.style.setProperty("min-height", snapped + "px", "important");
        });
    };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    run();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    run();
}"""


def _chromium_viewport_height() -> int:
    raw = os.environ.get("CV_BOT_PDF_CHROMIUM_VIEWPORT_HEIGHT", "").strip()
    if not raw:
        return _DEFAULT_CHROMIUM_VIEWPORT_HEIGHT
    try:
        v = int(raw)
        if v >= 2000:
            return v
    except ValueError:
        pass
    return _DEFAULT_CHROMIUM_VIEWPORT_HEIGHT


def _chromium_launch_args() -> list[str]:
    args: list[str] = ["--disable-dev-shm-usage"]
    flag = os.environ.get("CV_BOT_PDF_CHROMIUM_NO_SANDBOX", "").strip().lower()
    if flag in ("1", "true", "yes") or Path("/.dockerenv").is_file():
        args.extend(["--no-sandbox", "--disable-setuid-sandbox"])
    extra = os.environ.get("CV_BOT_PDF_CHROMIUM_ARGS", "").strip()
    if extra:
        args.extend(p.strip() for p in extra.replace(",", ";").split(";") if p.strip())
    return args


def _chromium_idle_timeout_sec() -> float:
    """Inactivité au bout de laquelle on ferme le browser (0 = jamais). Défaut 5 min."""
    raw = os.environ.get("CV_BOT_PDF_CHROMIUM_IDLE_TIMEOUT_SEC", "").strip()
    try:
        v = float(raw) if raw else 300.0
    except ValueError:
        v = 300.0
    return max(0.0, v)


def _chromium_pool_size() -> int:
    """Nombre de workers PDF (threads dédiés Playwright). 1 (défaut) = un navigateur partagé.

    Au-delà de 1 : N browsers en parallèle, ~150 Mo RAM / slot. À utiliser seulement si la
    latence PDF devient critique sous charge. Borné à 8 par sécurité.
    """
    raw = os.environ.get("CV_BOT_PDF_CHROMIUM_POOL_SIZE", "").strip()
    try:
        v = int(raw) if raw else 1
    except ValueError:
        v = 1
    return max(1, min(8, v))


# --- Singleton Playwright + Chromium browser ---------------------------------------
# La sync_api Playwright n'est pas thread-safe : un seul thread peut piloter le driver
# Node à la fois. On sérialise tous les renders via _engine_lock. Les nouveaux contextes
# (`browser.new_context`) restent isolés par render → pas de fuite d'état entre PDFs.

_engine_lock = threading.Lock()
_playwright_instance: Any = None
_browser_instance: Any = None
_browser_pid: int | None = None
_last_used_at: float = 0.0


def _close_browser_silently() -> None:
    """Ferme le browser (mais garde le driver Playwright vivant pour relance rapide)."""
    global _browser_instance, _browser_pid
    if _browser_instance is None:
        return
    try:
        _browser_instance.close()
    except Exception:
        pass
    _browser_instance = None
    _browser_pid = None


def _close_playwright_silently() -> None:
    """Coupe complètement le driver Node (à n'appeler qu'au shutdown du process)."""
    global _playwright_instance
    _close_browser_silently()
    if _playwright_instance is None:
        return
    try:
        _playwright_instance.stop()
    except Exception:
        pass
    _playwright_instance = None


def _browser_is_alive(browser: Any) -> bool:
    if browser is None:
        return False
    try:
        ic = getattr(browser, "is_connected", None)
        if callable(ic):
            return bool(ic())
        return True
    except Exception:
        return False


def _maybe_close_idle_browser(now: float) -> None:
    """Ferme le browser si inactif depuis trop longtemps, pour rendre la RAM au repos.

    Appelé sous _engine_lock (avant nouveau render). N'appelle pas malloc_trim ici :
    le caller le fera après le render qui suit ou après la fermeture.
    """
    timeout = _chromium_idle_timeout_sec()
    if timeout <= 0 or _browser_instance is None:
        return
    if (now - _last_used_at) > timeout:
        _log.info("Chromium idle > %ss → close browser to release RAM", int(timeout))
        _close_browser_silently()


def _ensure_browser():
    """Retourne un browser Chromium prêt à l'emploi (lazy init / auto-recover).

    Doit être appelé sous _engine_lock.
    """
    global _playwright_instance, _browser_instance, _browser_pid

    now = time.time()
    _maybe_close_idle_browser(now)

    if _browser_is_alive(_browser_instance):
        return _browser_instance

    # Cleanup d'un browser cassé éventuel
    _close_browser_silently()

    _ensure_windows_playwright_asyncio()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise ImportError(
            "Moteur PDF Chromium : installer Playwright.\n"
            "  pip install playwright\n"
            "  playwright install chromium\n"
            "(Docker : image avec playwright install --with-deps chromium)"
        ) from e

    if _playwright_instance is None:
        _playwright_instance = sync_playwright().start()
        _log.info("Playwright driver started")

    _browser_instance = _playwright_instance.chromium.launch(
        headless=True, args=_chromium_launch_args()
    )
    try:
        proc = getattr(_browser_instance, "process", None)
        _browser_pid = getattr(proc, "pid", None) if proc is not None else None
    except Exception:
        _browser_pid = None
    _log.info("Chromium browser launched (pid=%s)", _browser_pid)
    return _browser_instance


def shutdown_chromium_singleton() -> None:
    """Ferme proprement browser + driver Playwright (singleton ET pool si actifs).

    Conserve le nom historique pour compat FastAPI/atexit. Coupe les deux modes
    (idempotent) : on ne sait pas forcément ici lequel est actif.
    """
    _shutdown_all()


def _render_pdf_once(html_str: str, context_base: str, template_id: str | None) -> bytes:
    """Render unique (un context jetable, sous _engine_lock)."""
    global _last_used_at

    browser = _ensure_browser()
    context = browser.new_context(
        base_url=context_base,
        viewport={"width": 794, "height": _chromium_viewport_height()},
    )
    try:
        page = context.new_page()
        page.emulate_media(media="screen")
        timeout_ms = 90_000
        try:
            t = int(os.environ.get("CV_BOT_PDF_CHROMIUM_TIMEOUT_MS", "").strip() or "0")
            if t >= 10_000:
                timeout_ms = t
        except ValueError:
            pass
        page.set_content(html_str, wait_until="load", timeout=timeout_ms)
        try:
            page.evaluate(
                "() => (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()"
            )
        except Exception:
            pass
        try:
            page.evaluate(_CHROMIUM_SYNC_SIDEBAR_JS)
        except Exception:
            pass
        pdf_bytes = page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            prefer_css_page_size=True,
        )
    finally:
        try:
            context.close()
        except Exception:
            pass
        _last_used_at = time.time()
    return pdf_bytes


# --- Pool de workers (CV_BOT_PDF_CHROMIUM_POOL_SIZE >= 2) -------------------------
# Chaque worker possède son propre Playwright + browser, exécutés dans son thread
# d'origine (contrainte sync_api). Le dispatch passe par un job queue partagé.

_POOL_LOCK = threading.Lock()
_POOL_WORKERS: list[_BrowserWorker] = []
_POOL_JOB_QUEUE: queue.Queue[tuple[str, str, str | None, Future]] | None = None
_POOL_STARTED = False


class _BrowserWorker(threading.Thread):
    """Worker thread qui possède son propre (playwright, browser) et exécute des renders en série."""

    def __init__(
        self, worker_id: int, job_queue: queue.Queue[tuple[str, str, str | None, Future]]
    ) -> None:
        super().__init__(name=f"chromium-pool-{worker_id}", daemon=True)
        self._worker_id = worker_id
        self._jobs = job_queue
        self._stop_event = threading.Event()
        self._playwright: Any = None
        self._browser: Any = None
        self._last_used_at: float = 0.0

    def stop(self) -> None:
        self._stop_event.set()
        # Sentinel pour débloquer un get() bloquant
        try:
            self._jobs.put_nowait((None, None, None, None))
        except Exception:
            pass

    def _ensure_browser(self) -> Any:
        if _browser_is_alive(self._browser):
            return self._browser
        self._close_browser()
        _ensure_windows_playwright_asyncio()
        from playwright.sync_api import sync_playwright

        if self._playwright is None:
            self._playwright = sync_playwright().start()
            _log.info("Chromium pool worker #%s: Playwright started", self._worker_id)
        self._browser = self._playwright.chromium.launch(
            headless=True, args=_chromium_launch_args()
        )
        _log.info("Chromium pool worker #%s: browser launched", self._worker_id)
        return self._browser

    def _close_browser(self) -> None:
        if self._browser is not None:
            try:
                self._browser.close()
            except Exception:
                pass
            self._browser = None

    def _close_all(self) -> None:
        self._close_browser()
        if self._playwright is not None:
            try:
                self._playwright.stop()
            except Exception:
                pass
            self._playwright = None

    def _render(self, html_str: str, context_base: str, template_id: str | None) -> bytes:
        browser = self._ensure_browser()
        context = browser.new_context(
            base_url=context_base,
            viewport={"width": 794, "height": _chromium_viewport_height()},
        )
        try:
            page = context.new_page()
            page.emulate_media(media="screen")
            timeout_ms = 90_000
            try:
                t = int(os.environ.get("CV_BOT_PDF_CHROMIUM_TIMEOUT_MS", "").strip() or "0")
                if t >= 10_000:
                    timeout_ms = t
            except ValueError:
                pass
            page.set_content(html_str, wait_until="load", timeout=timeout_ms)
            try:
                page.evaluate(
                    "() => (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()"
                )
            except Exception:
                pass
            try:
                page.evaluate(_CHROMIUM_SYNC_SIDEBAR_JS)
            except Exception:
                pass
            pdf_bytes = page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                prefer_css_page_size=True,
            )
        finally:
            try:
                context.close()
            except Exception:
                pass
            self._last_used_at = time.time()
        return pdf_bytes

    def run(self) -> None:
        idle_timeout = _chromium_idle_timeout_sec()
        while not self._stop_event.is_set():
            try:
                # Petit timeout pour pouvoir vérifier idle close périodiquement
                job = self._jobs.get(timeout=30.0)
            except queue.Empty:
                if (
                    idle_timeout > 0
                    and self._browser is not None
                    and (time.time() - self._last_used_at) > idle_timeout
                ):
                    _log.info(
                        "Chromium pool worker #%s idle > %ss → close browser",
                        self._worker_id,
                        int(idle_timeout),
                    )
                    self._close_browser()
                continue
            html_str, context_base, template_id, fut = job
            if fut is None:  # sentinel
                break
            if fut.cancelled():
                continue
            last_exc: BaseException | None = None
            for attempt in (1, 2):
                try:
                    result = self._render(html_str, context_base, template_id)
                    fut.set_result(result)
                    last_exc = None
                    break
                except Exception as e:
                    last_exc = e
                    _log.warning(
                        "Chromium pool worker #%s render failed (attempt %d/2): %s - recreating browser",
                        self._worker_id,
                        attempt,
                        e,
                    )
                    self._close_browser()
            if last_exc is not None:
                fut.set_exception(last_exc)
        self._close_all()


def _ensure_pool_started() -> queue.Queue[tuple[str, str, str | None, Future]]:
    """Lance le pool de workers la première fois. Idempotent."""
    global _POOL_JOB_QUEUE, _POOL_STARTED
    if _POOL_STARTED and _POOL_JOB_QUEUE is not None:
        return _POOL_JOB_QUEUE
    with _POOL_LOCK:
        if _POOL_STARTED and _POOL_JOB_QUEUE is not None:
            return _POOL_JOB_QUEUE
        size = _chromium_pool_size()
        _POOL_JOB_QUEUE = queue.Queue()
        for i in range(size):
            w = _BrowserWorker(worker_id=i + 1, job_queue=_POOL_JOB_QUEUE)
            w.start()
            _POOL_WORKERS.append(w)
        _POOL_STARTED = True
        _log.info("Chromium pool started with %s worker(s)", size)
        return _POOL_JOB_QUEUE


def _shutdown_pool(timeout_sec: float = 5.0) -> None:
    if not _POOL_STARTED:
        return
    for w in _POOL_WORKERS:
        try:
            w.stop()
        except Exception:
            pass
    for w in _POOL_WORKERS:
        try:
            w.join(timeout=timeout_sec)
        except Exception:
            pass
    _POOL_WORKERS.clear()


def _shutdown_all() -> None:
    """Coupe le pool si actif, sinon le singleton. Appelé via atexit + on_event('shutdown')."""
    try:
        _shutdown_pool()
    except Exception:
        pass
    try:
        with _engine_lock:
            _close_playwright_silently()
    except Exception:
        pass


# Filet de sécurité : si le process Python sort sans passer par le shutdown FastAPI,
# tente quand même de couper le driver Node (sinon il peut survivre quelques secondes).
# Doit être après la définition de _shutdown_all (import-time lookup).
atexit.register(_shutdown_all)


def html_to_simple_pdf_bytes_chromium(html_str: str, base_dir: Path) -> bytes:
    """PDF depuis HTML + CSS déjà autonome (pas de préparation CV / bundle WeasyPrint).

    Utilisé pour la fiche de poste lorsque WeasyPrint n'est pas utilisable (ex. Windows sans GTK).
    Même file d'attente que le PDF CV : Playwright sync_api sur thread dédié.
    """
    base_dir = Path(base_dir).resolve()
    context_base = f"{base_dir.as_uri()}/"
    jobs = _ensure_pool_started()
    fut: Future = Future()
    jobs.put((html_str, context_base, None, fut))
    return fut.result()


def html_to_cv_pdf_bytes_chromium(
    html_str: str,
    base_dir: Path,
    template_id: str | None = None,
) -> bytes:
    """Render PDF CV via Chromium (toujours via le pool de threads dédiés).

    En cas de crash du browser entre deux renders (process tué, OOM, etc.) le worker retente
    une fois après recréation. Au-delà, l'erreur remonte au caller.
    """
    from backend.config import API_BASE_URL
    from backend.cv_pdf_weasyprint import PDF_FROM_HTML_FINAL_CSS, prepare_cv_html_for_weasyprint

    html_str = prepare_cv_html_for_weasyprint(html_str, template_id=template_id)
    if 'id="cv-bot-pdf-chromium-final"' not in html_str:
        _final = f'<style id="cv-bot-pdf-chromium-final">{PDF_FROM_HTML_FINAL_CSS}</style>'
        _lower = html_str.lower()
        _i = _lower.rfind("</body>")
        if _i != -1:
            html_str = html_str[:_i] + _final + html_str[_i:]
        elif "</head>" in html_str:
            html_str = html_str.replace("</head>", _final + "</head>", 1)
        else:
            html_str = html_str + _final

    base_dir = Path(base_dir).resolve()
    api = (API_BASE_URL or "").strip().rstrip("/")
    # Résolution des URL relatives dans le contexte (complément au <base> du HTML)
    context_base = f"{api}/" if api else f"{base_dir.as_uri()}/"

    # Toujours le pool (y compris taille 1) : Playwright sync_api + greenlets imposent que
    # start()/launch()/pdf restent sur le même thread OS. Les handlers FastAPI `def` tournent
    # sur le threadpool Starlette → thread variable ; le worker dédié évite l'erreur
    # « Cannot switch to a different thread ».
    jobs = _ensure_pool_started()
    try:
        from backend.sentry_business import maybe_capture_pdf_pool_saturated

        maybe_capture_pdf_pool_saturated(jobs.qsize(), _chromium_pool_size())
    except Exception:
        pass
    fut: Future = Future()
    jobs.put((html_str, context_base, template_id, fut))
    return fut.result()
