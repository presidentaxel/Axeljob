"""Sentry backend (AXE-367) : init no-op si DSN vide, scrubbing PII, ignore 4xx."""

from __future__ import annotations

import os
import re
from typing import Any

from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

_SENSITIVE_KEYS = frozenset(
    {
        "authorization",
        "cookie",
        "set-cookie",
        "email",
        "password",
        "secret",
        "token",
        "jwt",
        "access_token",
        "refresh_token",
        "api_key",
        "apikey",
        "gemini_api_key",
        "stripe_secret_key",
        "stripe_webhook_secret",
        "supabase_service_key",
        "supabase_jwt_secret",
        "sentry_auth_token",
        "dsn",
        "cv",
        "cv_base",
        "html",
        "html_str",
        "annonce",
        "offer",
        "offer_text",
        "job_description",
        "photo",
        "phone",
        "telephone",
        "address",
        "adresse",
        "nom",
        "name",
        "fullname",
        "full_name",
    }
)
_SENSITIVE_KEY_RE = re.compile(
    r"(password|secret|token|jwt|authorization|cookie|api[_-]?key|email|annonce|offer)",
    re.I,
)
_SENSITIVE_PATH_RE = re.compile(
    r"/api/(adapt|import|cv|stripe|billing)|/webhook",
    re.I,
)
_FILTERED = "[Filtered]"
_HTTP_IGNORE_MAX = 499


def sentry_dsn() -> str:
    return os.environ.get("SENTRY_DSN", "").strip()


def sentry_environment() -> str:
    env = os.environ.get("SENTRY_ENVIRONMENT", "").strip()
    if env:
        return env
    return os.environ.get("ENVIRONMENT", "").strip() or "production"


def traces_sample_rate(environment: str | None = None) -> float:
    raw = os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "").strip()
    if raw:
        try:
            return max(0.0, min(1.0, float(raw)))
        except ValueError:
            pass
    env = environment or sentry_environment()
    return 1.0 if env == "staging" else 0.1


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower().replace("-", "_")
    if lowered in _SENSITIVE_KEYS:
        return True
    return bool(_SENSITIVE_KEY_RE.search(lowered))


def _redact(value: Any, key: str = "") -> Any:
    if key and _is_sensitive_key(key):
        return _FILTERED
    if isinstance(value, dict):
        return {str(k): _redact(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_redact(item) for item in value)
    return value


def _request_path(event: dict[str, Any]) -> str:
    request = event.get("request") or {}
    url = str(request.get("url") or "")
    return url


def _drop_http_noise(hint: dict[str, Any]) -> bool:
    exc_info = hint.get("exc_info")
    if not exc_info or len(exc_info) < 2:
        return False
    exc = exc_info[1]
    if isinstance(exc, StarletteHTTPException):
        return int(getattr(exc, "status_code", 500) or 500) <= _HTTP_IGNORE_MAX
    if isinstance(exc, ValidationError):
        return True
    return False


def _pdf_engine_tag() -> str:
    try:
        from backend.cv_pdf_dispatch import cv_pdf_engine

        return cv_pdf_engine()
    except Exception:
        return "unknown"


def scrub_event(event: dict[str, Any], hint: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """before_send : drop 4xx / validation, redacte PII, pose les tags pdf_engine / flow."""
    hint = hint or {}
    if _drop_http_noise(hint):
        return None

    transaction = str(event.get("transaction") or "")
    if transaction in ("/health", "/metrics") or transaction.endswith("/health"):
        if event.get("level") in ("info", "warning"):
            return None

    event = _redact(event) if isinstance(event, dict) else event
    if not isinstance(event, dict):
        return event

    request = event.get("request")
    if isinstance(request, dict):
        url = str(request.get("url") or "")
        if _SENSITIVE_PATH_RE.search(url) or _SENSITIVE_PATH_RE.search(transaction):
            request.pop("data", None)
            request.pop("cookies", None)
            headers = request.get("headers")
            if isinstance(headers, dict):
                request["headers"] = {
                    k: _FILTERED if _is_sensitive_key(str(k)) else v for k, v in headers.items()
                }
        event["request"] = request

    tags = event.setdefault("tags", {})
    if isinstance(tags, dict):
        tags.setdefault("pdf_engine", _pdf_engine_tag())
        exc_info = hint.get("exc_info")
        exc = exc_info[1] if exc_info and len(exc_info) >= 2 else None
        if exc is not None:
            name = type(exc).__name__
            module = getattr(type(exc), "__module__", "") or ""
            if "Gemini" in name or "gemini" in module:
                tags.setdefault("flow", "gemini")
            elif "pdf" in name.lower() or "playwright" in module.lower():
                tags.setdefault("flow", "pdf")

    raw_user = event.get("user")
    if isinstance(raw_user, dict):
        uid = raw_user.get("id")
        if uid:
            event["user"] = {"id": uid}
        else:
            event.pop("user", None)
    elif "user" in event:
        event.pop("user", None)

    return event


def _traces_sampler(sampling_context: dict[str, Any]) -> float:
    asgi = sampling_context.get("asgi_scope") or {}
    path = str(asgi.get("path") or "")
    if path in ("/health", "/metrics", "/favicon.ico"):
        return 0.0
    tx = sampling_context.get("transaction_context") or {}
    name = str(tx.get("name") or "")
    if name in ("/health", "/metrics") or name.endswith("/health"):
        return 0.0
    return traces_sample_rate()


def init_sentry() -> bool:
    """Init SDK. False = DSN vide, aucun client, aucun warning."""
    dsn = sentry_dsn()
    if not dsn:
        return False

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    environment = sentry_environment()
    only_5xx = frozenset(range(500, 600))
    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        release=os.environ.get("SENTRY_RELEASE", "").strip() or None,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sampler=_traces_sampler,
        profiles_sample_rate=0.0,
        before_send=scrub_event,
        integrations=[
            StarletteIntegration(failed_request_status_codes=only_5xx),
            FastApiIntegration(failed_request_status_codes=only_5xx),
            LoggingIntegration(level=None, event_level=None),
        ],
    )
    sentry_sdk.set_tag("pdf_engine", _pdf_engine_tag())
    return True


def bind_sentry_user(user_id: str | None, plan: str | None = None) -> None:
    """UUID opaque + tag plan. Jamais d'email."""
    if not sentry_dsn() or not user_id:
        return
    import sentry_sdk

    sentry_sdk.set_user({"id": user_id})
    if plan in ("free", "pro"):
        sentry_sdk.set_tag("user_plan", plan)
        sentry_sdk.set_tag("plan", plan)
