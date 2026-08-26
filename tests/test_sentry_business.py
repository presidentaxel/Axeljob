"""AXE-370 : events métier Sentry — no-op DSN vide, fingerprint, pas de PII."""

from __future__ import annotations

from backend.gemini_usage import GeminiQuotaExceeded, ensure_budget
from backend.sentry_business import (
    capture_adapt_gemini_failure,
    capture_business_event,
    capture_empty_pdf_if_needed,
    capture_pdf_engine_failure,
    classify_gemini_exc,
    maybe_capture_pdf_pool_saturated,
    record_jwt_reject,
    reset_business_event_state,
)


class _FakeScope:
    def __init__(self) -> None:
        self.tags: dict[str, object] = {}
        self.extras: dict[str, object] = {}
        self.fingerprint: list[str] | None = None

    def set_tag(self, key: str, value: object) -> None:
        self.tags[key] = value

    def set_extra(self, key: str, value: object) -> None:
        self.extras[key] = value

    def __enter__(self) -> _FakeScope:
        return self

    def __exit__(self, *args: object) -> bool:
        return False


def _patch_sentry(monkeypatch, scope: _FakeScope) -> list[tuple[str, str]]:
    captured: list[tuple[str, str]] = []

    def fake_capture_message(message: str, level: str = "info") -> None:
        captured.append((message, level))

    monkeypatch.setenv("SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0")
    import sentry_sdk

    monkeypatch.setattr(sentry_sdk, "new_scope", lambda: scope)
    monkeypatch.setattr(sentry_sdk, "capture_message", fake_capture_message)
    reset_business_event_state()
    return captured


def test_capture_business_event_noop_without_dsn(monkeypatch) -> None:
    monkeypatch.setenv("SENTRY_DSN", "")
    reset_business_event_state()
    called: list[int] = []
    import sentry_sdk

    monkeypatch.setattr(sentry_sdk, "capture_message", lambda *args, **kwargs: called.append(1))
    capture_business_event("adapt", "Quota Gemini dépassé", kind="gemini_quota")
    assert called == []


def test_capture_business_event_tags_flow_and_fingerprint(monkeypatch) -> None:
    scope = _FakeScope()
    captured = _patch_sentry(monkeypatch, scope)
    capture_business_event(
        "adapt",
        "Quota Gemini dépassé",
        kind="gemini_quota",
        size_bytes=2048,
        engine="n/a",
    )
    assert captured == [("Quota Gemini dépassé", "warning")]
    assert scope.tags["flow"] == "adapt"
    assert scope.tags["kind"] == "gemini_quota"
    assert scope.fingerprint == ["axel-job", "adapt", "gemini_quota"]
    assert scope.extras["size_bytes"] == 2048


def test_capture_business_event_drops_pii_extras(monkeypatch) -> None:
    scope = _FakeScope()
    captured = _patch_sentry(monkeypatch, scope)
    capture_business_event(
        "adapt",
        "Erreur API Gemini",
        kind="gemini_api_error",
        cv_text="Jean Dupont CV secret",
        email="jean@example.com",
        annonce="Offre secrète Dev",
        html="<p>CV</p>",
        size_bytes=512,
        provider_code="ClientError",
    )
    assert captured
    blob = str(scope.extras)
    assert "Jean Dupont" not in blob
    assert "jean@example.com" not in blob
    assert "Offre secrète" not in blob
    assert "cv_text" not in scope.extras
    assert "email" not in scope.extras
    assert "annonce" not in scope.extras
    assert scope.extras["size_bytes"] == 512
    assert scope.extras["provider_code"] == "ClientError"


def test_quota_fingerprint_differs_from_api_error(monkeypatch) -> None:
    scope_quota = _FakeScope()
    _patch_sentry(monkeypatch, scope_quota)
    capture_adapt_gemini_failure(kind="gemini_quota")
    fp_quota = list(scope_quota.fingerprint or [])

    scope_api = _FakeScope()
    _patch_sentry(monkeypatch, scope_api)
    capture_adapt_gemini_failure(kind="gemini_api_error", exc=RuntimeError("GOOGLE 500"))
    fp_api = list(scope_api.fingerprint or [])

    assert fp_quota == ["axel-job", "adapt", "gemini_quota"]
    assert fp_api == ["axel-job", "adapt", "gemini_api_error"]
    assert fp_quota != fp_api


def test_classify_gemini_timeout() -> None:
    class TimeoutErrorLike(Exception):
        pass

    assert classify_gemini_exc(TimeoutErrorLike("deadline exceeded")) == "gemini_timeout"
    assert classify_gemini_exc(RuntimeError("RESOURCE_EXHAUSTED")) == "gemini_api_error"


def test_ensure_budget_emits_quota_event(monkeypatch) -> None:
    scope = _FakeScope()
    captured = _patch_sentry(monkeypatch, scope)
    monkeypatch.setattr(
        "backend.gemini_usage.check_gemini_budget",
        lambda _uid: (False, 12.0, 10.0),
    )
    try:
        ensure_budget("user-1")
        raise AssertionError("expected GeminiQuotaExceeded")
    except GeminiQuotaExceeded:
        pass
    assert captured == [("Quota Gemini dépassé", "warning")]
    assert scope.tags["flow"] == "adapt"
    assert scope.tags["kind"] == "gemini_quota"


def test_gemini_quota_is_debounced(monkeypatch) -> None:
    scope = _FakeScope()
    captured = _patch_sentry(monkeypatch, scope)
    capture_adapt_gemini_failure(kind="gemini_quota")
    capture_adapt_gemini_failure(kind="gemini_quota")
    assert captured == [("Quota Gemini dépassé", "warning")]


def test_sentry_aware_pool_is_context_manager() -> None:
    from backend.supabase_pg import _SentryAwarePool

    class _Inner:
        def __enter__(self) -> _Inner:
            return self

        def __exit__(self, *args: object) -> bool:
            return False

    wrap = _SentryAwarePool(_Inner())
    with wrap as pool:
        assert pool is wrap


def test_empty_pdf_emits_export_event(monkeypatch) -> None:
    scope = _FakeScope()
    captured = _patch_sentry(monkeypatch, scope)
    capture_empty_pdf_if_needed(b"", "chromium")
    assert captured == [("Export PDF vide", "warning")]
    assert scope.tags["flow"] == "export"
    assert scope.tags["kind"] == "empty_pdf"
    assert scope.extras["size_bytes"] == 0
    assert scope.fingerprint == ["axel-job", "export", "empty_pdf"]

    captured.clear()
    capture_empty_pdf_if_needed(b"%PDF-1.4 dummy", "chromium")
    assert captured == []


def test_pdf_engine_timeout_kind(monkeypatch) -> None:
    scope = _FakeScope()
    captured = _patch_sentry(monkeypatch, scope)
    capture_pdf_engine_failure("chromium", TimeoutError("page.set_content timeout"))
    assert captured
    assert scope.tags["flow"] == "export"
    assert scope.tags["kind"] == "pdf_timeout"
    assert scope.extras["provider_code"] == "TimeoutError"


def test_pdf_pool_saturated_threshold(monkeypatch) -> None:
    scope = _FakeScope()
    captured = _patch_sentry(monkeypatch, scope)
    maybe_capture_pdf_pool_saturated(0, 1)
    assert captured == []
    maybe_capture_pdf_pool_saturated(2, 1)
    assert captured
    assert scope.tags["kind"] == "pdf_pool_saturated"
    assert scope.tags["flow"] == "export"


def test_jwt_burst_only_after_threshold(monkeypatch) -> None:
    scope = _FakeScope()
    captured = _patch_sentry(monkeypatch, scope)
    monkeypatch.setenv("SENTRY_JWT_BURST_THRESHOLD", "3")
    monkeypatch.setenv("SENTRY_JWT_BURST_WINDOW_SEC", "60")
    record_jwt_reject()
    record_jwt_reject()
    assert captured == []
    record_jwt_reject()
    assert captured == [("Rejets JWT en rafale", "warning")]
    assert scope.tags["flow"] == "auth"
    assert scope.tags["kind"] == "jwt_burst"
    assert scope.extras["burst_count"] == 3
    captured.clear()
    record_jwt_reject()
    assert captured == []


def test_each_flow_has_identifiable_tag(monkeypatch) -> None:
    for flow, kind, message in (
        ("adapt", "gemini_unparseable", "Réponse Gemini non parsable"),
        ("export", "empty_pdf", "Export PDF vide"),
        ("import", "pdf_unreadable", "PDF import illisible"),
        ("billing", "stripe_bad_signature", "Webhook Stripe signature invalide"),
        ("auth", "pg_pool", "Pool Supabase PG saturé"),
    ):
        scope = _FakeScope()
        captured = _patch_sentry(monkeypatch, scope)
        capture_business_event(flow, message, kind=kind)
        assert captured, flow
        assert scope.tags["flow"] == flow
        assert scope.tags["kind"] == kind
        assert scope.fingerprint == ["axel-job", flow, kind]
