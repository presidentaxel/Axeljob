"""
Monitoring opérationnel : métriques HTTP (toutes routes), charge système, utilisateurs actifs,
alertes email (Resend), agrégats pour le dashboard admin.

Limites : un worker uvicorn = une vue mémoire. Multi-workers : agréger dans Prometheus ou Redis.
"""

from __future__ import annotations

import asyncio
import html
import logging
import os
import re
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from prometheus_client import Counter, Gauge, Histogram
from starlette.requests import Request
from starlette.responses import Response

from backend.config import (
    MONITORING_ACTIVE_USER_TTL_SEC,
    MONITORING_ALERT_5XX_THRESHOLD,
    MONITORING_ALERT_5XX_WINDOW_SEC,
    MONITORING_ALERT_CPU_PCT,
    MONITORING_ALERT_EMAILS,
    MONITORING_ALERT_ENABLED,
    MONITORING_ALERT_MEM_PCT,
    MONITORING_ALERT_MIN_INTERVAL_SEC,
    MONITORING_ALERT_SLOW_COUNT_THRESHOLD,
    MONITORING_ALERT_SLOW_REQUEST_SEC,
    MONITORING_ALERT_SPIKE_CPU_RATIO,
    MONITORING_ALERT_SPIKE_MIN_CPU,
    MONITORING_CAPACITY_EMA_ALPHA,
    MONITORING_CAPACITY_IDLE_CPU_BASELINE_PCT,
    MONITORING_CAPACITY_MIN_CPU_SAMPLE_PCT,
    MONITORING_CAPACITY_MIN_MARGINAL_CPU_SAMPLE_PCT,
    MONITORING_CAPACITY_SAMPLE_MAX,
    MONITORING_CAPACITY_TARGET_CPU_PCT,
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
    SUPPORT_ADMIN_EMAILS,
    SUPPORT_EMAIL,
    USE_SUPABASE_PG,
)
from backend.supabase_jwt import decode_supabase_access_token

logger = logging.getLogger("cv_bot.monitoring")

_PROCESS_START = time.time()

_HTTP_BUCKETS = (
    0.005,
    0.01,
    0.025,
    0.05,
    0.075,
    0.1,
    0.25,
    0.5,
    0.75,
    1.0,
    2.5,
    5.0,
    10.0,
    20.0,
    60.0,
    float("inf"),
)

# Tailles corps HTTP (octets) — utile pour corréler charge réseau / parsing avec la latence.
_BYTES_BUCKETS = (
    0.0,
    256,
    1024,
    4096,
    16_384,
    65_536,
    262_144,
    1_048_576,
    4_194_304,
    16_777_216,
    67_108_864,
    float("inf"),
)

HTTP_REQUESTS = Counter(
    "cv_bot_http_requests_total",
    "Requêtes HTTP (toutes routes)",
    ["method", "route", "status_class"],
)
HTTP_DURATION = Histogram(
    "cv_bot_http_request_duration_seconds",
    "Durée de traitement HTTP par route (template)",
    ["route"],
    buckets=_HTTP_BUCKETS,
)
HTTP_REQUEST_CONTENT_LENGTH = Histogram(
    "cv_bot_http_request_content_length_bytes",
    "Content-Length entrant quand présent (0 si absent ou invalide)",
    ["route"],
    buckets=_BYTES_BUCKETS,
)
HTTP_RESPONSE_CONTENT_LENGTH = Histogram(
    "cv_bot_http_response_content_length_bytes",
    "Content-Length sortant quand présent (réponses chunked sans en-tête omises)",
    ["route"],
    buckets=_BYTES_BUCKETS,
)
HTTP_INFLIGHT = Gauge("cv_bot_http_inflight_requests", "Requêtes en cours (ce worker)")
HTTP_CONCURRENT_MAX = Gauge(
    "cv_bot_http_concurrent_requests_max",
    "Pic de requêtes simultanées depuis le démarrage (ce worker)",
)
ACTIVE_USERS_GAUGE = Gauge(
    "cv_bot_active_users_with_jwt",
    "Utilisateurs distincts (sub JWT) vus dans la fenêtre TTL",
)
ACTIVE_USERS_PEAK_GAUGE = Gauge(
    "cv_bot_active_users_peak",
    "Pic de la jauge utilisateurs actifs depuis le démarrage",
)
SLOW_REQUESTS = Counter(
    "cv_bot_http_slow_requests_total",
    f"Requêtes plus lentes que {MONITORING_ALERT_SLOW_REQUEST_SEC}s",
    ["route"],
)
PROCESS_CPU = Gauge("cv_bot_process_cpu_percent", "CPU processus uvicorn (%)")
SYSTEM_CPU = Gauge("cv_bot_system_cpu_percent", "CPU système (tout le droplet / VM) (%)")
PROCESS_RSS = Gauge("cv_bot_process_resident_memory_bytes", "RSS processus (octets)")
PROCESS_VMS = Gauge("cv_bot_process_virtual_memory_bytes", "Mémoire virtuelle processus (octets)")
SYSTEM_MEM_PCT = Gauge("cv_bot_system_memory_used_percent", "RAM système utilisée (%)")
SYSTEM_SWAP_PCT = Gauge("cv_bot_system_swap_used_percent", "Swap utilisé (%) si disponible")
SYSTEM_LOAD1 = Gauge("cv_bot_system_load1", "Charge moyenne 1 min (Unix) ; 0 si non disponible")
PROCESS_THREADS = Gauge("cv_bot_process_threads", "Nombre de threads du processus API")
PROCESS_OPEN_FDS = Gauge(
    "cv_bot_process_open_fds",
    "Descripteurs de fichiers ouverts (Unix) ; absent / 0 sous Windows",
)
PROCESS_UPTIME_SECONDS = Gauge(
    "cv_bot_process_uptime_seconds",
    "Durée depuis le démarrage du processus (secondes)",
)
CAPACITY_ESTIMATED_MAX_ACTIVE_USERS = Gauge(
    "cv_bot_capacity_estimated_max_active_users",
    "Estimation EMA du nombre max d’utilisateurs JWT actifs @ CPU cible (voir MONITORING_CAPACITY_*) ; 0 si pas encore d’historique",
)
CAPACITY_INSTANT_MAX_ACTIVE_USERS = Gauge(
    "cv_bot_capacity_instant_max_active_users",
    "Dernière extrapolation instantanée (tick) depuis actifs JWT + CPU ; 0 si non fiable",
)
DB_UP = Gauge("cv_bot_dependency_database_up", "1 si le ping DB récent a réussi")
DB_LATENCY_MS = Gauge("cv_bot_dependency_database_latency_ms", "Latence dernier ping DB (ms)")

_lock = threading.Lock()
_active_sub_last_seen: dict[str, float] = {}
_max_inflight_seen = 0
_inflight_local = 0
_active_users_peak = 0
_route_stats: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "sum_sec": 0.0})


# 3000 entrées ≈ couverture saine de la fenêtre 15 min (recent_error_summary(900))
# pour un trafic réaliste 1-3 r/s. Avant : 8000 (~2,4 Mo de tuples). Tuned via env si besoin.
def _recent_http_maxlen() -> int:
    try:
        v = int(os.getenv("MONITORING_RECENT_HTTP_MAXLEN", "3000"))
    except ValueError:
        v = 3000
    return max(500, min(20000, v))


_recent_http: deque[tuple[float, int, str, float]] = deque(maxlen=_recent_http_maxlen())
_cpu_samples: deque[float] = deque(maxlen=120)
# Anti-bruit CPU: exiger plusieurs ticks élevés consécutifs avant d'alerter.
_cpu_high_streak = 0
_CPU_HIGH_REQUIRED_TICKS = max(1, int(os.getenv("MONITORING_ALERT_CPU_REQUIRED_TICKS", "3")))
_CPU_HIGH_AVG_WINDOW_TICKS = max(1, int(os.getenv("MONITORING_ALERT_CPU_AVG_WINDOW_TICKS", "4")))
_CPU_HIGH_AVG_MIN_PCT = float(
    os.getenv("MONITORING_ALERT_CPU_AVG_MIN_PCT", str(MONITORING_ALERT_CPU_PCT))
)
_last_alert_at: dict[str, float] = {}
_alert_log: deque[dict[str, Any]] = deque(maxlen=30)
_psutil_process: Any = None
_last_db_check: dict[str, Any] = {"ok": True, "ms": 0.0, "ts": 0.0}
_last_snap: dict[str, float] = {
    "system_cpu": 0.0,
    "process_cpu": 0.0,
    "system_mem_pct": 0.0,
    "process_rss": 0.0,
    "process_vms": 0.0,
    "system_swap_pct": 0.0,
    "system_load1": 0.0,
    "process_threads": 0.0,
    "process_open_fds": 0.0,
}
# Estimations « max actifs @ CPU cible » : fenêtre glissante + EMA (rempli par tick_system_and_db)
_capacity_point_estimates: deque[float] = deque(maxlen=max(8, MONITORING_CAPACITY_SAMPLE_MAX))
_capacity_ema: float | None = None


def datetime_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_psutil_process():
    global _psutil_process
    if _psutil_process is not None:
        return _psutil_process
    try:
        import psutil

        _psutil_process = psutil.Process()
    except Exception:
        _psutil_process = False
    return _psutil_process


def route_template(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None) if route is not None else None
    if path:
        return path
    raw = request.url.path.split("?")[0] or "/"
    raw = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "{uuid}", raw, flags=re.I
    )
    raw = re.sub(r"/\d+", "/{id}", raw)
    return raw[:200] or "/"


def _parse_content_length(value: str | None) -> int | None:
    if not value:
        return None
    try:
        n = int(value.strip())
    except (TypeError, ValueError):
        return None
    if n < 0 or n > 256 * 1024 * 1024:
        return None
    return n


def _status_class(code: int) -> str:
    if 200 <= code < 300:
        return "2xx"
    if 300 <= code < 400:
        return "3xx"
    if 400 <= code < 500:
        return "4xx"
    if 500 <= code < 600:
        return "5xx"
    return "other"


def _jwt_sub(request: Request) -> str | None:
    """Même logique que l’API (HS256 ou JWKS) pour compter les subs distincts."""
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        payload = decode_supabase_access_token(token)
        sub = payload.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None


def _touch_active_user(sub: str) -> None:
    now = time.time()
    ttl = max(60.0, float(MONITORING_ACTIVE_USER_TTL_SEC))
    with _lock:
        _active_sub_last_seen[sub] = now
        cutoff = now - ttl
        dead = [k for k, t in _active_sub_last_seen.items() if t < cutoff]
        for k in dead:
            del _active_sub_last_seen[k]
        n = len(_active_sub_last_seen)
        global _active_users_peak
        if n > _active_users_peak:
            _active_users_peak = n
        ACTIVE_USERS_GAUGE.set(n)
        ACTIVE_USERS_PEAK_GAUGE.set(_active_users_peak)


def _record_request(
    method: str,
    route: str,
    status_code: int,
    elapsed: float,
    request_content_length: int | None = None,
    response_content_length: int | None = None,
) -> None:
    sc = _status_class(status_code)
    HTTP_REQUESTS.labels(method=method, route=route, status_class=sc).inc()
    HTTP_DURATION.labels(route=route).observe(elapsed)
    if request_content_length is not None:
        HTTP_REQUEST_CONTENT_LENGTH.labels(route=route).observe(float(request_content_length))
    if response_content_length is not None:
        HTTP_RESPONSE_CONTENT_LENGTH.labels(route=route).observe(float(response_content_length))
    with _lock:
        st = _route_stats[route]
        st["count"] += 1
        st["sum_sec"] += elapsed
        _recent_http.append((time.time(), status_code, route, elapsed))
    if elapsed >= MONITORING_ALERT_SLOW_REQUEST_SEC:
        SLOW_REQUESTS.labels(route=route).inc()


def _maybe_touch_user(request: Request) -> None:
    sub = _jwt_sub(request)
    if sub:
        _touch_active_user(sub)


async def observe_http_request(request: Request, call_next: Callable) -> Response:
    path = request.url.path
    if path == "/metrics":
        return await call_next(request)

    method = request.method.upper()
    route = route_template(request)
    req_cl = _parse_content_length(request.headers.get("content-length"))
    global _inflight_local, _max_inflight_seen
    with _lock:
        _inflight_local += 1
        if _inflight_local > _max_inflight_seen:
            _max_inflight_seen = _inflight_local
        HTTP_INFLIGHT.set(_inflight_local)
        HTTP_CONCURRENT_MAX.set(_max_inflight_seen)

    t0 = time.perf_counter()
    status_code = 500
    response: Response | None = None
    try:
        _maybe_touch_user(request)
        response = await call_next(request)
        status_code = int(getattr(response, "status_code", 200) or 200)
        return response
    except Exception:
        status_code = 500
        raise
    finally:
        elapsed = time.perf_counter() - t0
        with _lock:
            _inflight_local = max(0, _inflight_local - 1)
            HTTP_INFLIGHT.set(_inflight_local)
        resp_cl = None
        if response is not None:
            resp_cl = _parse_content_length(response.headers.get("content-length"))
        _record_request(method, route, status_code, elapsed, req_cl, resp_cl)


def _alert_can_send(key: str) -> bool:
    now = time.time()
    last = _last_alert_at.get(key, 0.0)
    if now - last < MONITORING_ALERT_MIN_INTERVAL_SEC:
        return False
    _last_alert_at[key] = now
    return True


def _alert_recipients() -> list[str]:
    if MONITORING_ALERT_EMAILS:
        return [e.strip() for e in MONITORING_ALERT_EMAILS if e.strip()]
    if SUPPORT_ADMIN_EMAILS:
        return [SUPPORT_ADMIN_EMAILS[0]]
    if SUPPORT_EMAIL:
        return [SUPPORT_EMAIL.strip()]
    return []


def _send_alert_email(subject: str, text_body: str) -> None:
    to_list = _alert_recipients()
    if not to_list or not RESEND_API_KEY or not RESEND_FROM_EMAIL:
        logger.warning(
            "Alerte monitoring non envoyée (destinataires ou Resend manquants): %s", subject
        )
        return
    try:
        import resend

        resend.api_key = RESEND_API_KEY
        safe = html.escape(text_body)
        resend.Emails.send(
            {
                "from": RESEND_FROM_EMAIL,
                "to": to_list[:5],
                "subject": subject[:200],
                "html": f"<pre style='font-family:monospace;font-size:13px;white-space:pre-wrap'>{safe}</pre>",
            }
        )
        logger.info("Monitoring alert email sent: %s", subject)
    except Exception as e:
        logger.exception("Resend monitoring alert failed: %s", e)


def _append_alert_log(kind: str, detail: str) -> None:
    _alert_log.append(
        {
            "ts": datetime_iso(),
            "kind": kind,
            "detail": detail[:2000],
        }
    )


def tick_system_and_db() -> None:
    proc = _get_psutil_process()
    if proc and proc is not False:
        try:
            import psutil

            mem_info = proc.memory_info()
            rss = int(mem_info.rss)
            vms = int(getattr(mem_info, "vms", 0) or 0)
            PROCESS_RSS.set(rss)
            PROCESS_VMS.set(vms)
            cpu_p = proc.cpu_percent(interval=None)
            PROCESS_CPU.set(cpu_p)
            sys_cpu = psutil.cpu_percent(interval=0.15)
            mem_pct = psutil.virtual_memory().percent
            SYSTEM_CPU.set(sys_cpu)
            SYSTEM_MEM_PCT.set(mem_pct)
            try:
                sw = psutil.swap_memory()
                swap_pct = float(sw.percent)
            except Exception:
                swap_pct = 0.0
            SYSTEM_SWAP_PCT.set(swap_pct)
            try:
                if hasattr(os, "getloadavg"):
                    load1 = float(os.getloadavg()[0])
                else:
                    load1 = 0.0
            except Exception:
                load1 = 0.0
            SYSTEM_LOAD1.set(load1)
            try:
                PROCESS_THREADS.set(int(proc.num_threads()))
            except Exception:
                PROCESS_THREADS.set(0)
            try:
                nfd = int(proc.num_fds()) if hasattr(proc, "num_fds") else 0
            except Exception:
                nfd = 0
            PROCESS_OPEN_FDS.set(nfd)
            PROCESS_UPTIME_SECONDS.set(time.time() - _PROCESS_START)
            with _lock:
                _last_snap["system_cpu"] = sys_cpu
                _last_snap["process_cpu"] = cpu_p
                _last_snap["system_mem_pct"] = mem_pct
                _last_snap["process_rss"] = float(rss)
                _last_snap["process_vms"] = float(vms)
                _last_snap["system_swap_pct"] = swap_pct
                _last_snap["system_load1"] = load1
                try:
                    _last_snap["process_threads"] = float(proc.num_threads())
                except Exception:
                    _last_snap["process_threads"] = 0.0
                _last_snap["process_open_fds"] = float(nfd)
            _cpu_samples.append(sys_cpu)
            _record_capacity_sample()
        except Exception as e:
            logger.debug("psutil tick skipped: %s", e)

    if USE_SUPABASE_PG:
        t_db = time.perf_counter()
        ok = False
        try:
            from backend import supabase_pg

            pool = supabase_pg.get_pool()
            if pool:
                with pool.connection() as conn, conn.cursor() as cur:
                    cur.execute("SELECT 1")
                ok = True
        except Exception:
            ok = False
        ms = (time.perf_counter() - t_db) * 1000.0
        _last_db_check["ok"] = ok
        _last_db_check["ms"] = round(ms, 2)
        _last_db_check["ts"] = time.time()
        DB_UP.set(1 if ok else 0)
        DB_LATENCY_MS.set(ms)


def evaluate_alerts() -> None:
    if not MONITORING_ALERT_ENABLED:
        return

    now = time.time()
    win = max(30.0, float(MONITORING_ALERT_5XX_WINDOW_SEC))
    with _lock:
        recent = [(t, c, r, d) for t, c, r, d in _recent_http if now - t <= win]
        sys_cpu = _last_snap["system_cpu"]
        mem_pct = _last_snap["system_mem_pct"]

    total = len(recent)
    n5 = sum(1 for _t, c, _r, _d in recent if c >= 500)
    n_slow = sum(1 for _t, _c, _r, d in recent if d >= MONITORING_ALERT_SLOW_REQUEST_SEC)

    global _cpu_high_streak
    if sys_cpu >= MONITORING_ALERT_CPU_PCT:
        _cpu_high_streak += 1
    else:
        _cpu_high_streak = 0

    cpu_avg_ok = False
    cpu_avg = float(sys_cpu)
    avg_window: list[float] = []
    if _cpu_samples:
        avg_window = list(_cpu_samples)[-_CPU_HIGH_AVG_WINDOW_TICKS:]
        if avg_window:
            cpu_avg = sum(avg_window) / len(avg_window)
            cpu_avg_ok = cpu_avg >= _CPU_HIGH_AVG_MIN_PCT

    if _cpu_high_streak >= _CPU_HIGH_REQUIRED_TICKS and cpu_avg_ok and _alert_can_send("cpu_high"):
        msg = (
            f"CPU système {sys_cpu:.1f}% (seuil {MONITORING_ALERT_CPU_PCT}%) "
            f"sur {_cpu_high_streak} ticks consécutifs (~{_cpu_high_streak * 45}s), "
            f"moyenne {len(avg_window)} ticks={cpu_avg:.1f}% (min {_CPU_HIGH_AVG_MIN_PCT:.1f}%). "
            "Worker unique - voir aussi Prometheus."
        )
        _send_alert_email("[AxeL Job] Alerte CPU élevée", msg)
        _append_alert_log("cpu_high", msg)

    if mem_pct >= MONITORING_ALERT_MEM_PCT and _alert_can_send("mem_high"):
        msg = f"Mémoire système {mem_pct:.1f}% utilisée (seuil {MONITORING_ALERT_MEM_PCT}%)."
        _send_alert_email("[AxeL Job] Alerte mémoire système", msg)
        _append_alert_log("mem_high", msg)

    if total >= 20 and n5 >= MONITORING_ALERT_5XX_THRESHOLD and _alert_can_send("5xx_burst"):
        msg = f"{n5} réponses 5xx sur {int(total)} requêtes en {int(win)}s (seuil {MONITORING_ALERT_5XX_THRESHOLD})."
        _send_alert_email("[AxeL Job] Alerte erreurs serveur (5xx)", msg)
        _append_alert_log("5xx_burst", msg)

    if (
        total >= 30
        and n_slow >= MONITORING_ALERT_SLOW_COUNT_THRESHOLD
        and _alert_can_send("slow_burst")
    ):
        msg = (
            f"{n_slow} requêtes lentes (>={MONITORING_ALERT_SLOW_REQUEST_SEC}s) sur {int(total)} en {int(win)}s "
            f"(seuil {MONITORING_ALERT_SLOW_COUNT_THRESHOLD})."
        )
        _send_alert_email("[AxeL Job] Alerte lenteurs HTTP", msg)
        _append_alert_log("slow_burst", msg)

    if USE_SUPABASE_PG and not _last_db_check.get("ok") and _alert_can_send("db_down"):
        msg = (
            f"Ping base de données échoué (dernière latence mesurée {_last_db_check.get('ms')} ms)."
        )
        _send_alert_email("[AxeL Job] Alerte base de données", msg)
        _append_alert_log("db_down", msg)

    if len(_cpu_samples) >= 8:
        arr = list(_cpu_samples)[-30:]
        avg = sum(arr) / len(arr)
        if (
            avg > 5
            and sys_cpu >= avg * MONITORING_ALERT_SPIKE_CPU_RATIO
            and sys_cpu >= MONITORING_ALERT_SPIKE_MIN_CPU
            and _alert_can_send("cpu_spike")
        ):
            msg = f"Pic CPU : {sys_cpu:.1f}% vs moyenne récente ~{avg:.1f}% (ratio ×{MONITORING_ALERT_SPIKE_CPU_RATIO})."
            _send_alert_email("[AxeL Job] Pic CPU suspect", msg)
            _append_alert_log("cpu_spike", msg)


def _median_sorted(values: list[float]) -> float | None:
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    mid = n // 2
    if n % 2:
        return float(s[mid])
    return (s[mid - 1] + s[mid]) / 2.0


def _capacity_baseline_and_marginal(sys_cpu: float) -> tuple[float, float]:
    """Plateau idle (config) et CPU marginal = mesure − plateau (>= 0)."""
    baseline = max(0.0, min(60.0, float(MONITORING_CAPACITY_IDLE_CPU_BASELINE_PCT)))
    marginal = max(0.0, float(sys_cpu) - baseline)
    return baseline, marginal


def _capacity_point_from_observation(active: int, sys_cpu: float) -> float | None:
    """
    Modèle : CPU_total ≈ baseline + k × actifs → à la cible, actifs × (cible − baseline) / marginal.
    Retourne None si l’extrapolation n’est pas fiable.
    """
    target = max(10.0, min(95.0, float(MONITORING_CAPACITY_TARGET_CPU_PCT)))
    min_cpu = max(1.0, float(MONITORING_CAPACITY_MIN_CPU_SAMPLE_PCT))
    min_marginal = max(0.25, float(MONITORING_CAPACITY_MIN_MARGINAL_CPU_SAMPLE_PCT))
    baseline, marginal = _capacity_baseline_and_marginal(sys_cpu)
    headroom = target - baseline
    if active < 1 or sys_cpu < min_cpu or marginal < min_marginal or headroom <= 1.0:
        return None
    return float(active) * (headroom / marginal)


def _record_capacity_sample() -> None:
    """
    Un point par tick (~45 s) : extrapolation linéaire sur le CPU marginal (mesure − plateau idle).
    """
    global _capacity_ema
    alpha = max(0.05, min(0.5, float(MONITORING_CAPACITY_EMA_ALPHA)))
    instant_out = 0.0
    ema_out = 0.0
    with _lock:
        active = len(_active_sub_last_seen)
        sys_cpu = float(_last_snap["system_cpu"])
        point = _capacity_point_from_observation(active, sys_cpu)
        if point is None:
            ema_out = float(_capacity_ema) if _capacity_ema is not None else 0.0
        else:
            instant_out = float(point)
            _capacity_point_estimates.append(point)
            if _capacity_ema is None:
                _capacity_ema = point
            else:
                _capacity_ema = alpha * point + (1.0 - alpha) * _capacity_ema
            ema_out = float(_capacity_ema)
    CAPACITY_INSTANT_MAX_ACTIVE_USERS.set(instant_out)
    CAPACITY_ESTIMATED_MAX_ACTIVE_USERS.set(ema_out)


def capacity_estimate(active_users: int, system_cpu: float) -> dict[str, Any]:
    """
    Capacité indicative : EMA + médiane sur fenêtre ; modèle baseline + charge marginale par actif.
    """
    target = max(10.0, min(95.0, float(MONITORING_CAPACITY_TARGET_CPU_PCT)))
    min_cpu = max(1.0, float(MONITORING_CAPACITY_MIN_CPU_SAMPLE_PCT))
    min_marginal = max(0.25, float(MONITORING_CAPACITY_MIN_MARGINAL_CPU_SAMPLE_PCT))
    alpha_cfg = max(0.05, min(0.5, float(MONITORING_CAPACITY_EMA_ALPHA)))
    cpu_now = float(system_cpu)
    baseline, marginal_now = _capacity_baseline_and_marginal(cpu_now)
    headroom = target - baseline

    instant: int | None = None
    if active_users > 0 and marginal_now >= min_marginal and cpu_now >= min_cpu and headroom > 1.0:
        instant = int(round(active_users * (headroom / marginal_now)))

    with _lock:
        points = list(_capacity_point_estimates)
        ema_val = _capacity_ema

    common_meta = {
        "idle_cpu_baseline_percent": round(baseline, 2),
        "target_marginal_headroom_percent": round(headroom, 2),
        "min_marginal_cpu_sample_percent": min_marginal,
    }

    if not points and ema_val is None:
        if active_users <= 0:
            return {
                "method": "baseline_marginal_linear",
                "note": (
                    f"Aucun échantillon encore : besoin d’au moins 1 actif JWT, CPU système >= {min_cpu:.0f}% "
                    f"et marge CPU (mesure − plateau ~{baseline:.0f}%) >= {min_marginal:.1f}%."
                ),
                "estimated_max_active_users_at_target_cpu": None,
                "target_cpu_percent": target,
                "samples_in_window": 0,
                "min_cpu_sample_percent": min_cpu,
                **common_meta,
            }
        return {
            "method": "baseline_marginal_linear",
            "note": (
                f"Valeur instantanée seule (historique vide). Modèle : ~{baseline:.0f}% plateau idle retiré ; "
                f"extrapolation jusqu’à {target:.0f}% CPU total. Stabilisation après quelques ticks."
            ),
            "inputs": {
                "active_users_with_jwt": active_users,
                "system_cpu_percent": round(cpu_now, 2),
                "marginal_cpu_percent": round(marginal_now, 2),
            },
            "target_cpu_percent": target,
            "estimated_max_active_users_at_target_cpu": instant,
            "instant_estimate": instant,
            "samples_in_window": 0,
            "min_cpu_sample_percent": min_cpu,
            **common_meta,
        }

    if ema_val is None:
        ema_val = float(points[-1]) if points else 0.0
    med = _median_sorted(points)
    if len(points) >= 5 and med is not None:
        blended = 0.55 * ema_val + 0.45 * med
        refined = int(max(1, round(blended)))
    else:
        refined = int(max(1, round(ema_val)))

    note = (
        f"Lissage EMA (α={alpha_cfg:.2f}) sur {len(points)} mesures"
        + (" + médiane (>= 5 pts)" if len(points) >= 5 and med is not None else "")
        + f" ; plateau idle ~{baseline:.0f}% retiré, marge CPU >= {min_marginal:.1f}% pour échantillonner."
    )
    if active_users <= 0:
        note += " Aucun actif dans la fenêtre TTL : chiffre basé sur l’historique récent."
    elif instant is not None:
        note += f" Instantané courant ~{instant}."

    out: dict[str, Any] = {
        "method": "baseline_marginal_linear",
        "note": note,
        "inputs": {
            "active_users_with_jwt": active_users,
            "system_cpu_percent": round(cpu_now, 2),
            "marginal_cpu_percent": round(marginal_now, 2),
        },
        "target_cpu_percent": target,
        "estimated_max_active_users_at_target_cpu": refined,
        "instant_estimate": instant,
        "samples_in_window": len(points),
        "ema_estimate": round(ema_val, 1),
        "min_cpu_sample_percent": min_cpu,
        **common_meta,
    }
    if med is not None and len(points) >= 3:
        out["window_median_estimate"] = int(round(med))
    return out


def top_routes(limit: int = 25) -> list[dict[str, Any]]:
    with _lock:
        items = []
        for route, st in _route_stats.items():
            c = int(st["count"])
            if c == 0:
                continue
            avg = st["sum_sec"] / c
            items.append(
                {
                    "route": route,
                    "requests": c,
                    "avg_duration_sec": round(avg, 4),
                    "total_duration_sec": round(st["sum_sec"], 2),
                }
            )
        items.sort(key=lambda x: x["requests"], reverse=True)
        return items[:limit]


def recent_error_summary(window_sec: float = 300.0) -> dict[str, Any]:
    now = time.time()
    with _lock:
        recent = [(t, c, r, d) for t, c, r, d in _recent_http if now - t <= window_sec]
    n = len(recent)
    n5 = sum(1 for _t, c, _r, _d in recent if c >= 500)
    n4 = sum(1 for _t, c, _r, _d in recent if 400 <= c < 500)
    dur_sum = sum(d for _t, _c, _r, d in recent)
    return {
        "window_sec": int(window_sec),
        "requests": n,
        "status_5xx": n5,
        "status_4xx": n4,
        "approx_error_rate_5xx": round(n5 / n, 4) if n else 0.0,
        "avg_duration_sec": round(dur_sum / n, 4) if n else 0.0,
    }


def get_admin_snapshot() -> dict[str, Any]:
    with _lock:
        active = len(_active_sub_last_seen)
        peak_users = _active_users_peak
        inflight = _inflight_local
        max_conc = _max_inflight_seen
        snap = dict(_last_snap)

    registered = None
    if USE_SUPABASE_PG:
        try:
            from backend import supabase_pg

            registered = supabase_pg.count_auth_users()
        except Exception as e:
            logger.info("count_auth_users skipped: %s", e)

    uptime_sec = int(time.time() - _PROCESS_START)
    sys_cpu = snap["system_cpu"]

    return {
        "process": {
            "uptime_sec": uptime_sec,
            "uptime_human": f"{uptime_sec // 86400}j {(uptime_sec % 86400) // 3600}h",
            "inflight_requests": inflight,
            "max_concurrent_requests": max_conc,
        },
        "users": {
            "registered_total": registered,
            "active_with_jwt_ttl_sec": MONITORING_ACTIVE_USER_TTL_SEC,
            "active_distinct_subs": active,
            "peak_active_distinct_subs": peak_users,
            "note": "« Actifs » = comptes ayant envoyé au moins une requête avec JWT valide dans la fenêtre TTL.",
        },
        "system": {
            "psutil_available": _get_psutil_process() not in (None, False),
            "system_cpu_percent": round(snap["system_cpu"], 2),
            "process_cpu_percent": round(snap["process_cpu"], 2),
            "system_memory_used_percent": round(snap["system_mem_pct"], 2),
            "system_swap_used_percent": round(snap.get("system_swap_pct", 0.0), 2),
            "system_load1": round(snap.get("system_load1", 0.0), 3),
            "process_rss_bytes": int(snap["process_rss"]),
            "process_virtual_memory_bytes": int(snap.get("process_vms", 0.0)),
            "process_threads": int(snap.get("process_threads", 0.0)),
            "process_open_fds": int(snap.get("process_open_fds", 0.0)),
        },
        "database_ping": {
            "ok": bool(_last_db_check.get("ok")) if USE_SUPABASE_PG else None,
            "latency_ms": _last_db_check.get("ms"),
            "last_check_ts": _last_db_check.get("ts"),
        },
        "http_since_process_start": {
            "top_routes": top_routes(35),
            "last_5m": recent_error_summary(300),
            "last_15m": recent_error_summary(900),
        },
        "capacity_estimate": capacity_estimate(active, sys_cpu),
        "alerts": {
            "enabled": MONITORING_ALERT_ENABLED,
            "last_events": list(_alert_log),
            "config": {
                "cpu_threshold_pct": MONITORING_ALERT_CPU_PCT,
                "mem_threshold_pct": MONITORING_ALERT_MEM_PCT,
                "5xx_window_sec": MONITORING_ALERT_5XX_WINDOW_SEC,
                "5xx_min_count": MONITORING_ALERT_5XX_THRESHOLD,
                "slow_window_sec": MONITORING_ALERT_5XX_WINDOW_SEC,
                "slow_min_count": MONITORING_ALERT_SLOW_COUNT_THRESHOLD,
                "slow_request_sec": MONITORING_ALERT_SLOW_REQUEST_SEC,
                "min_interval_sec": MONITORING_ALERT_MIN_INTERVAL_SEC,
                "cpu_required_ticks": _CPU_HIGH_REQUIRED_TICKS,
                "cpu_avg_window_ticks": _CPU_HIGH_AVG_WINDOW_TICKS,
                "cpu_avg_min_pct": round(_CPU_HIGH_AVG_MIN_PCT, 2),
            },
        },
    }


async def monitoring_ticker_loop() -> None:
    await asyncio.sleep(5)
    while True:
        try:
            tick_system_and_db()
            evaluate_alerts()
            await asyncio.sleep(45)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("monitoring_ticker_loop error")
            await asyncio.sleep(45)


def start_monitoring_background() -> None:
    try:
        tick_system_and_db()
        loop = asyncio.get_event_loop()
        loop.create_task(monitoring_ticker_loop())
    except Exception as e:
        logger.warning("monitoring background task not started: %s", e)
