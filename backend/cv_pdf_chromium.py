"""
PDF CV via Chromium headless (Playwright).

Utilisé lorsque CV_BOT_PDF_ENGINE=chromium. Le HTML est préparé comme pour WeasyPrint
(prepare_cv_html_for_weasyprint) : injection du bundle pdf_export (layout + align).
Sans lui, les templates fixent souvent .cv à height/max-height 297mm → PDF tronqué sur 1 page.

Prérequis :
  pip install playwright
  playwright install chromium
  (Docker : voir backend/Dockerfile — install --with-deps)

Ressources (/api/assets/, polices externes) : le document contient souvent <base href="CV_BOT_API_BASE_URL">.
En conteneur, pointe l’API vers une URL joignable depuis le processus PDF (ex. http://127.0.0.1:8000).
"""
from __future__ import annotations

import os
from pathlib import Path


# Hauteur viewport : si trop basse (~1 page A4), Chromium sous-estime scrollHeight / fragmentation PDF.
_DEFAULT_CHROMIUM_VIEWPORT_HEIGHT = 20_000

# Hauteur sidebar arrondie aux multiples d’une page A4 (297 mm en px CSS 96 dpi) : la dernière page
# garde la bande couleur jusqu’en bas, pas seulement jusqu’à la fin du texte du main.
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


def html_to_cv_pdf_bytes_chromium(
    html_str: str,
    base_dir: Path,
    template_id: str | None = None,
) -> bytes:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise ImportError(
            "Moteur PDF Chromium : installer Playwright.\n"
            "  pip install playwright\n"
            "  playwright install chromium\n"
            "(Docker : image avec playwright install --with-deps chromium)"
        ) from e

    from backend.config import API_BASE_URL
    from backend.cv_pdf_weasyprint import PDF_FROM_HTML_FINAL_CSS, prepare_cv_html_for_weasyprint

    html_str = prepare_cv_html_for_weasyprint(html_str, template_id=template_id)
    if 'id="cv-bot-pdf-chromium-final"' not in html_str:
        _final = (
            f'<style id="cv-bot-pdf-chromium-final">{PDF_FROM_HTML_FINAL_CSS}</style>'
        )
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

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=_chromium_launch_args())
        try:
            context = browser.new_context(
                base_url=context_base,
                viewport={"width": 794, "height": _chromium_viewport_height()},
            )
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
            browser.close()

    return pdf_bytes
