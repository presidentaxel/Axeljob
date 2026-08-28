"""AXE-369 : placeholders Sentry vides, pas de AUTH_TOKEN runtime."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
_INTERPOLATE = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")
_DOTENV = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def _parse_dotenv(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = _DOTENV.match(stripped)
        if match:
            out[match.group(1)] = match.group(2)
    return out


def _interpolate(raw: str, env: dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        name = match.group(1)
        default = match.group(2) if match.group(2) is not None else ""
        if name in env:
            return env[name]
        return default

    return _INTERPOLATE.sub(repl, raw)


def _backend_environment_assignments(compose_text: str) -> list[str]:
    """KEY=VALUE du bloc `environment` du service backend (liste Compose)."""
    items: list[str] = []
    in_backend = False
    in_environment = False
    for line in compose_text.splitlines():
        if line.startswith("  backend:"):
            in_backend = True
            continue
        if in_backend and line.startswith("  ") and not line.startswith("    "):
            break
        if in_backend and line.startswith("    environment:"):
            in_environment = True
            continue
        if not in_environment:
            continue
        stripped = line.strip()
        if stripped.startswith("- "):
            items.append(stripped[2:])
            continue
        if not stripped or stripped.startswith("#"):
            continue
        break
    return items


def _backend_runtime_env(compose_text: str, dotenv_text: str) -> dict[str, str]:
    """Fusion env_file + environment, comme Compose (environment gagne)."""
    file_env = _parse_dotenv(dotenv_text)
    runtime = dict(file_env)
    for item in _backend_environment_assignments(compose_text):
        if "=" not in item:
            continue
        key, _, raw = item.partition("=")
        runtime[key] = _interpolate(raw, file_env)
    return runtime


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
    assert "- SENTRY_AUTH_TOKEN=" in text
    assert "SENTRY_AUTH_TOKEN: ${SENTRY_AUTH_TOKEN:-}" in text
    assert "VITE_SENTRY_DSN:" in text
    assert "SENTRY_DSN=${SENTRY_DSN:-}" in text


def test_real_compose_blanks_probe_auth_token() -> None:
    """Le docker-compose.yml du depot ecrase SENTRY_AUTH_TOKEN=probe via override vide."""
    compose = _read("docker-compose.yml")
    runtime = _backend_runtime_env(
        compose,
        "SENTRY_DSN=keep-dsn\nSENTRY_AUTH_TOKEN=probe\n",
    )
    assert runtime.get("SENTRY_AUTH_TOKEN") == ""
    assert runtime.get("SENTRY_DSN") == "keep-dsn"
    assert "probe" not in runtime.values()


def test_compose_config_blanks_probe_auth_token(tmp_path: Path) -> None:
    """Rendu `docker compose config` du vrai fichier : probe absent du runtime."""
    if shutil.which("docker") is None:
        pytest.skip("docker absent")
    (tmp_path / "docker-compose.yml").write_bytes((ROOT / "docker-compose.yml").read_bytes())
    (tmp_path / ".env").write_text(
        "SENTRY_DSN=keep-dsn\nSENTRY_AUTH_TOKEN=probe\n",
        encoding="utf-8",
    )
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("SENTRY") and not key.startswith("VITE_SENTRY")
    }
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(tmp_path / ".env"),
            "-f",
            str(tmp_path / "docker-compose.yml"),
            "config",
            "--format",
            "json",
        ],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        pytest.skip(result.stderr[:300] or result.stdout[:300])
    data = json.loads(result.stdout)
    backend_env = data["services"]["backend"].get("environment") or {}
    assert "probe" not in json.dumps(backend_env)
    assert "keep-dsn" in json.dumps(backend_env)


def test_frontend_dockerfile_sentry_args_stay_in_build_stage() -> None:
    text = _read("frontend/Dockerfile")
    assert "ARG VITE_SENTRY_DSN" in text
    assert "ARG SENTRY_AUTH_TOKEN" in text
    nginx_stage = text.split("FROM nginx", 1)[1]
    assert "SENTRY" not in nginx_stage
    build_stage = text.split("FROM nginx", 1)[0]
    assert "ENV SENTRY_AUTH_TOKEN" in build_stage


def test_no_dsn_url_committed_in_env_examples() -> None:
    blob = _read(".env.example") + _read("frontend/.env.example")
    assert "ingest." not in blob.lower()
    assert "sentry.io" not in blob.lower()
