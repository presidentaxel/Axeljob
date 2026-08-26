"""Échecs métier Sentry (AXE-370) : capture_message warning, tags flow/kind, sans PII.

Les 4xx FastAPI sont droppés par ``before_send`` (AXE-367). Les échecs convertis
en 429/401/400 (quota Gemini, JWT, webhook Stripe, PDF illisible) n'apparaissent
donc jamais comme exceptions : il faut un ``capture_message`` **avant** la
conversion HTTP. DSN vide = no-op (même contrat que ``init_sentry``).
"""

from __future__ import annotations

import logging
import os
import time
from collections import deque
from collections.abc import Mapping

logger = logging.getLogger(__name__)

ALLOWED_FLOWS = frozenset({"adapt", "export", "import", "billing", "auth"})

BUSINESS_KINDS = frozenset(
    {
        "gemini_quota",
        "gemini_timeout",
        "gemini_unparseable",
        "gemini_empty",
        "gemini_api_error",
        "empty_pdf",
        "pdf_engine_fail",
        "pdf_timeout",
        "pdf_pool_saturated",
        "pdf_unreadable",
        "docx_unreadable",
        "pymupdf_fail",
        "stripe_bad_signature",
        "stripe_bad_payload",
        "stripe_orphan_subscription",
        "jwt_burst",
        "pg_pool",
    }
)

_ALLOWED_CONTEXT_KEYS = frozenset(
    {
        "engine",
        "size_bytes",
        "duration_ms",
        "provider_code",
        "http_status",
        "timeout",
        "reason",
        "pool_wait_ms",
        "burst_count",
        "qsize",
        "pool_size",
    }
)

_INT_CONTEXT_KEYS = frozenset(
    {
        "size_bytes",
        "duration_ms",
        "http_status",
        "pool_wait_ms",
        "burst_count",
        "qsize",
        "pool_size",
    }
)

_KIND_MESSAGES = {
    "gemini_quota": "Quota Gemini dépassé",
    "gemini_timeout": "Timeout Gemini",
    "gemini_unparseable": "Réponse Gemini non parsable",
    "gemini_empty": "Réponse Gemini vide",
    "gemini_api_error": "Erreur API Gemini",
    "empty_pdf": "Export PDF vide",
    "pdf_engine_fail": "Échec moteur PDF",
    "pdf_timeout": "Timeout moteur PDF",
    "pdf_pool_saturated": "Pool PDF Chromium saturé",
    "pdf_unreadable": "PDF import illisible",
    "docx_unreadable": "DOCX import illisible",
    "pymupdf_fail": "PyMuPDF import en échec",
    "stripe_bad_signature": "Webhook Stripe signature invalide",
    "stripe_bad_payload": "Webhook Stripe payload invalide",
    "stripe_orphan_subscription": "Abonnement Stripe sans utilisateur",
    "jwt_burst": "Rejets JWT en rafale",
    "pg_pool": "Pool Supabase PG saturé",
}

_DEBOUNCE_SEC = {
    "pdf_pool_saturated": 60.0,
    "pg_pool": 60.0,
    "stripe_bad_signature": 30.0,
    "stripe_bad_payload": 30.0,
}

_last_emit_at: dict[tuple[str, str], float] = {}
_jwt_fail_ts: deque[float] = deque()
_jwt_burst_emitted_at = 0.0


def is_business_kind(kind: object) -> bool:
    return str(kind or "") in BUSINESS_KINDS


def classify_gemini_exc(exc: BaseException) -> str:
    blob = f"{type(exc).__name__} {exc}".lower()
    if any(token in blob for token in ("timeout", "timed out", "deadline", "deadlineexceeded")):
        return "gemini_timeout"
    return "gemini_api_error"


def reset_business_event_state() -> None:
    """Tests : remet les debounce / rafales à zéro."""
    _last_emit_at.clear()
    _jwt_fail_ts.clear()
    global _jwt_burst_emitted_at
    _jwt_burst_emitted_at = 0.0


def _dsn_configured() -> bool:
    try:
        from backend.sentry_config import sentry_dsn

        return bool(sentry_dsn())
    except Exception:
        return bool((os.environ.get("SENTRY_DSN") or "").strip())


def _coerce_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _sanitize_context(context: Mapping[str, object]) -> dict[str, object]:
    extras: dict[str, object] = {}
    for key, raw in context.items():
        if key not in _ALLOWED_CONTEXT_KEYS:
            continue
        if raw is None:
            continue
        if key in _INT_CONTEXT_KEYS:
            parsed = _coerce_int(raw)
            if parsed is None:
                continue
            extras[key] = parsed
            continue
        if key == "timeout":
            extras[key] = bool(raw)
            continue
        text = str(raw).strip()
        if text:
            extras[key] = text[:80]
    return extras


def _should_emit(flow: str, kind: str) -> bool:
    wait = _DEBOUNCE_SEC.get(kind, 0.0)
    if wait <= 0:
        return True
    key = (flow, kind)
    now = time.monotonic()
    last = _last_emit_at.get(key, 0.0)
    if now - last < wait:
        return False
    _last_emit_at[key] = now
    return True


def capture_business_event(
    flow: str,
    message: str,
    *,
    level: str = "warning",
    kind: str | None = None,
    fingerprint: list[str] | None = None,
    **context: object,
) -> None:
    """Envoie un warning Sentry tagué ``flow`` / ``kind``. No-op si DSN vide."""
    if not _dsn_configured():
        return
    flow_tag = flow if flow in ALLOWED_FLOWS else "unknown"
    kind_tag = str(kind).strip()[:80] if kind else ""
    if kind_tag and kind_tag not in BUSINESS_KINDS:
        # Kinds hors liste : on envoie quand même, fingerprint isolé, pas de PII.
        kind_tag = kind_tag[:80]
    if kind_tag and not _should_emit(flow_tag, kind_tag):
        return

    extras = _sanitize_context(context)
    text = (message or "").strip() or _KIND_MESSAGES.get(kind_tag, "Échec métier")
    text = text[:200]
    fp = fingerprint or ["axel-job", flow_tag, kind_tag or text[:80]]

    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("flow", flow_tag)
            if kind_tag:
                scope.set_tag("kind", kind_tag)
            for extra_key, extra_val in extras.items():
                scope.set_extra(extra_key, extra_val)
            scope.fingerprint = fp
            sentry_sdk.capture_message(text, level=level)
    except Exception:
        logger.debug("sentry business event skipped", exc_info=True)


def capture_adapt_gemini_failure(
    kind: str | None = None,
    exc: BaseException | None = None,
    **context: object,
) -> None:
    resolved = kind or (classify_gemini_exc(exc) if exc is not None else "gemini_api_error")
    extras: dict[str, object] = dict(context)
    if exc is not None and "provider_code" not in extras:
        extras["provider_code"] = type(exc).__name__[:80]
    capture_business_event(
        "adapt",
        _KIND_MESSAGES.get(resolved, "Échec adaptation IA"),
        kind=resolved,
        **extras,
    )


def capture_empty_pdf_if_needed(pdf_bytes: bytes | None, engine: str) -> None:
    if pdf_bytes:
        return
    capture_business_event(
        "export",
        _KIND_MESSAGES["empty_pdf"],
        kind="empty_pdf",
        engine=str(engine or "unknown")[:40],
        size_bytes=0,
    )


def capture_pdf_engine_failure(engine: str, exc: BaseException) -> None:
    name = type(exc).__name__
    blob = f"{name} {exc}".lower()
    kind = "pdf_timeout" if "timeout" in blob else "pdf_engine_fail"
    capture_business_event(
        "export",
        _KIND_MESSAGES[kind],
        kind=kind,
        engine=str(engine or "unknown")[:40],
        provider_code=name[:80],
    )


def maybe_capture_pdf_pool_saturated(qsize: int, pool_size: int, engine: str = "chromium") -> None:
    workers = max(int(pool_size or 1), 1)
    waiting = int(qsize or 0)
    if waiting < max(workers, 2):
        return
    capture_business_event(
        "export",
        _KIND_MESSAGES["pdf_pool_saturated"],
        kind="pdf_pool_saturated",
        engine=str(engine or "chromium")[:40],
        qsize=waiting,
        pool_size=workers,
    )


def capture_pg_pool_exhausted(exc: BaseException) -> None:
    capture_business_event(
        "auth",
        _KIND_MESSAGES["pg_pool"],
        kind="pg_pool",
        provider_code=type(exc).__name__[:80],
    )


def record_jwt_reject() -> None:
    """Compte les JWT invalides. N'émet un event que si le seuil (rafale) est atteint."""
    if not _dsn_configured():
        return
    try:
        window = float(os.environ.get("SENTRY_JWT_BURST_WINDOW_SEC", "60") or "60")
    except ValueError:
        window = 60.0
    try:
        threshold = int(os.environ.get("SENTRY_JWT_BURST_THRESHOLD", "20") or "20")
    except ValueError:
        threshold = 20
    window = max(window, 1.0)
    threshold = max(threshold, 2)

    now = time.monotonic()
    _jwt_fail_ts.append(now)
    cutoff = now - window
    while _jwt_fail_ts and _jwt_fail_ts[0] < cutoff:
        _jwt_fail_ts.popleft()
    count = len(_jwt_fail_ts)
    if count < threshold:
        return
    global _jwt_burst_emitted_at
    if now - _jwt_burst_emitted_at < window:
        return
    _jwt_burst_emitted_at = now
    capture_business_event(
        "auth",
        _KIND_MESSAGES["jwt_burst"],
        kind="jwt_burst",
        burst_count=count,
    )


def note_pdf_bytes(pdf_bytes: bytes | None, engine: str) -> bytes:
    """Filet dispatch : event si PDF vide, puis renvoie les bytes (éventuellement vides)."""
    capture_empty_pdf_if_needed(pdf_bytes, engine)
    return pdf_bytes or b""
