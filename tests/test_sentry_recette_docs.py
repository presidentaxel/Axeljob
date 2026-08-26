"""AXE-371 : recette DSN documentée, pas de route de test, pas de DSN dans Git."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def test_observabilite_has_axe_371_recette_without_test_route() -> None:
    text = _read("docs/observabilite.md")
    assert "AXE-371" in text
    assert "Recette DSN" in text
    assert "/sentry-test" in text
    assert "pas de route `/sentry-test`" in text or "Pas de route `/sentry-test`" in text
    assert "flow` = `billing`" in text or "flow=billing" in text
    assert "high priority" in text.lower() or "high-priority" in text.lower()
    assert "ActiveMembers" in text
    assert "AXE-371 recette smoke backend" in text
    assert "AXE-371 recette smoke frontend" in text
    assert "ingest.sentry.io" in text  # CSP allowlist, pas un DSN
    assert "https://o" not in text  # pas de DSN https://oNNNN.ingest...


def test_deploy_checklist_includes_sentry_post_deploy() -> None:
    text = _read("docs/deploy.md")
    assert "AXE-371" in text
    assert "flow=billing" in text
    assert "/sentry-test" in text
    assert "SENTRY_ENVIRONMENT=staging" in text
    assert "high-priority" in text or "high priority" in text


def test_env_examples_still_have_empty_dsn() -> None:
    blob = _read(".env.example") + _read("frontend/.env.example")
    assert "ingest." not in blob.lower()
    for line in blob.splitlines():
        if line.startswith("SENTRY_DSN=") or line.startswith("VITE_SENTRY_DSN="):
            assert line.endswith("=")
