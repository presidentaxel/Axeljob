"""AXE-367 : Sentry backend — no-op DSN vide, scrubbing PII, ignore 4xx."""

from __future__ import annotations

import json

from fastapi import HTTPException
from pydantic import ValidationError

from backend.gemini_usage import GeminiQuotaExceeded
from backend.sentry_config import (
    bind_sentry_user,
    init_sentry,
    scrub_event,
    sentry_dsn,
    sentry_environment,
    traces_sample_rate,
)


def test_init_sentry_noop_when_dsn_empty(monkeypatch) -> None:
    monkeypatch.setenv("SENTRY_DSN", "")
    assert sentry_dsn() == ""
    assert init_sentry() is False


def test_traces_sample_rate_staging_vs_prod(monkeypatch) -> None:
    monkeypatch.delenv("SENTRY_TRACES_SAMPLE_RATE", raising=False)
    assert traces_sample_rate("staging") == 1.0
    assert traces_sample_rate("production") == 0.1


def test_sentry_environment_prefers_sentry_env(monkeypatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "staging")
    assert sentry_environment() == "staging"


def test_before_send_drops_http_404() -> None:
    exc = HTTPException(status_code=404, detail="missing")
    assert scrub_event({"message": "nope"}, {"exc_info": (HTTPException, exc, None)}) is None


def test_before_send_drops_http_422_validation() -> None:
    from pydantic import BaseModel

    class _Payload(BaseModel):
        x: int

    try:
        _Payload(x="nope")  # type: ignore[arg-type]
    except ValidationError as err:
        assert (
            scrub_event({"message": "invalid"}, {"exc_info": (ValidationError, err, None)}) is None
        )
    else:
        raise AssertionError("expected ValidationError")


def test_before_send_scrubs_cv_and_annonce() -> None:
    event = {
        "message": "adapt failed",
        "extra": {"cv": "Jean Dupont CV secret", "annonce": "Offre secrète Dev"},
        "request": {
            "url": "https://api.example/api/adapt",
            "data": {"cv": "Jean Dupont CV secret"},
            "headers": {"Authorization": "Bearer super-secret-jwt"},
        },
        "user": {"id": "uuid-1", "email": "jean@example.com"},
    }
    out = scrub_event(event, {})
    assert out is not None
    blob = json.dumps(out)
    assert "Jean Dupont" not in blob
    assert "Offre secrète" not in blob
    assert "jean@example.com" not in blob
    assert "super-secret-jwt" not in blob
    assert out.get("user") == {"id": "uuid-1"}
    assert out.get("tags", {}).get("pdf_engine")


def test_before_send_scrubs_exception_and_breadcrumb_on_adapt() -> None:
    event = {
        "transaction": "/api/adapt",
        "message": "échec adapt Jean Dupont CV secret",
        "logentry": {"message": "échec adapt Jean Dupont CV secret"},
        "exception": {
            "values": [
                {"type": "ValueError", "value": "CV payload: Jean Dupont CV secret"},
            ]
        },
        "breadcrumbs": {
            "values": [
                {"message": "annonce Offre secrète Dev", "data": {"body": "Jean Dupont"}},
            ]
        },
        "request": {"url": "https://api.example/api/adapt"},
    }
    out = scrub_event(event, {})
    assert out is not None
    blob = json.dumps(out)
    assert "Jean Dupont" not in blob
    assert "Offre secrète" not in blob
    assert out["message"] == "[Filtered]"
    assert out["logentry"]["message"] == "[Filtered]"
    assert out["exception"]["values"][0]["value"] == "[Filtered]"
    assert out["exception"]["values"][0]["type"] == "ValueError"
    assert out["breadcrumbs"]["values"][0]["message"] == "[Filtered]"


def test_before_send_keeps_business_message_on_adapt() -> None:
    event = {
        "transaction": "/api/adapt",
        "message": "Quota Gemini dépassé",
        "level": "warning",
        "tags": {"kind": "gemini_quota", "flow": "adapt"},
        "request": {"url": "https://api.example/api/adapt"},
    }
    out = scrub_event(event, {})
    assert out is not None
    assert out["message"] == "Quota Gemini dépassé"
    assert out["tags"]["kind"] == "gemini_quota"
    assert out["tags"]["flow"] == "adapt"


def test_before_send_keeps_500_and_tags_gemini() -> None:
    exc = GeminiQuotaExceeded()
    out = scrub_event(
        {"message": "gemini", "level": "error"},
        {"exc_info": (GeminiQuotaExceeded, exc, None)},
    )
    assert out is not None
    assert out["tags"]["flow"] == "adapt"


def test_bind_sentry_user_skips_without_dsn(monkeypatch) -> None:
    monkeypatch.setenv("SENTRY_DSN", "")
    bind_sentry_user("user-1", "pro")


def test_no_sentry_test_route_in_main() -> None:
    from pathlib import Path

    text = Path("backend/main.py").read_text(encoding="utf-8")
    assert "sentry-test" not in text.lower()
    assert '@app.get("/sentry' not in text.lower()


def test_requirements_pin_sentry_sdk() -> None:
    from pathlib import Path

    text = Path("backend/requirements.txt").read_text(encoding="utf-8")
    assert "sentry-sdk[fastapi]==2.68.1" in text
