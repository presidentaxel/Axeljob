"""AXE-369 : placeholders Sentry vides, pas de AUTH_TOKEN runtime."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def test_root_env_example_has_empty_sentry_dsn() -> None:
    text = _read(".env.example")
    assert "\nSENTRY_DSN=\n" in text or text.startswith("SENTRY_DSN=\n")
    for line in text.splitlines():
        if line.startswith("SENTRY_DSN="):
            assert line == "SENTRY_DSN="
        if line.startswith("VITE_SENTRY_DSN="):
            assert line == "VITE_SENTRY_DSN="


def test_frontend_env_example_has_empty_vite_sentry_dsn() -> None:
    text = _read("frontend/.env.example")
    assert "VITE_SENTRY_DSN=" in text
    for line in text.splitlines():
        if line.startswith("VITE_SENTRY_DSN="):
            assert line == "VITE_SENTRY_DSN="


def test_no_sentry_auth_token_assignment_in_env_examples() -> None:
    """env_file .env enverrait le token dans le conteneur backend."""
    for rel in (".env.example", "frontend/.env.example"):
        for line in _read(rel).splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            assert not stripped.startswith("SENTRY_AUTH_TOKEN="), rel


def test_compose_does_not_pass_auth_token() -> None:
    text = _read("docker-compose.yml")
    assert "SENTRY_AUTH_TOKEN:" not in text
    assert "SENTRY_AUTH_TOKEN=" not in text
    assert "VITE_SENTRY_DSN:" in text
    assert "SENTRY_DSN=${SENTRY_DSN:-}" in text


def test_frontend_dockerfile_sentry_args_stay_in_build_stage() -> None:
    text = _read("frontend/Dockerfile")
    assert "ARG VITE_SENTRY_DSN" in text
    nginx_stage = text.split("FROM nginx", 1)[1]
    assert "SENTRY" not in nginx_stage
    assert "ARG SENTRY_AUTH_TOKEN" not in text
    assert "ENV SENTRY_AUTH_TOKEN" not in text


def test_no_dsn_url_committed_in_env_examples() -> None:
    blob = _read(".env.example") + _read("frontend/.env.example")
    assert "ingest." not in blob.lower()
    assert "sentry.io" not in blob.lower()
