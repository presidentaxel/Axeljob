"""Tests for scripts/materialize_dotenv.py (Cursor Cloud / local .env merge)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "materialize_dotenv.py"


def load_mod():
    spec = importlib.util.spec_from_file_location("materialize_dotenv", SCRIPT)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def dotenv():
    return load_mod()


def test_fill_injects_secrets_and_keeps_comments(dotenv):
    example = (
        "# header\n"
        "GEMINI_API_KEY=\n"
        "# GEMINI_MODEL=gemini-2.5-flash-lite\n"
        "SUPABASE_URL=\n"
        "ENVIRONMENT=development\n"
    )
    out = dotenv.fill_template(example, None, {"GEMINI_API_KEY": "secret-abc"})
    assert "GEMINI_API_KEY=secret-abc" in out
    assert "# GEMINI_MODEL=gemini-2.5-flash-lite" in out
    assert "# header" in out
    assert "ENVIRONMENT=development" in out


def test_existing_file_wins_over_empty_env(dotenv):
    example = "GEMINI_API_KEY=\nSUPABASE_URL=\n"
    existing = "GEMINI_API_KEY=keep-me\nSUPABASE_URL=\n"
    out = dotenv.fill_template(example, existing, {})
    assert "GEMINI_API_KEY=keep-me" in out


def test_process_env_overrides_existing_file(dotenv):
    example = "GEMINI_API_KEY=\n"
    existing = "GEMINI_API_KEY=old\n"
    out = dotenv.fill_template(example, existing, {"GEMINI_API_KEY": "new-from-cloud"})
    assert "GEMINI_API_KEY=new-from-cloud" in out
    assert "old" not in out


def test_vite_supabase_url_aliases_backend_url(dotenv):
    example = "VITE_SUPABASE_URL=\nSUPABASE_URL=\n"
    out = dotenv.fill_template(example, None, {"SUPABASE_URL": "https://proj.supabase.co"})
    assert "VITE_SUPABASE_URL=https://proj.supabase.co" in out
    assert "SUPABASE_URL=https://proj.supabase.co" in out


def test_dev_defaults_for_local_urls(dotenv):
    example = "VITE_API_URL=\nCV_BOT_FRONTEND_URL=\nENVIRONMENT=\n"
    out = dotenv.fill_template(example, None, {})
    assert "VITE_API_URL=http://localhost:8000" in out
    assert "CV_BOT_FRONTEND_URL=http://localhost:5173" in out
    assert "ENVIRONMENT=development" in out


def test_does_not_print_secret_values(dotenv, tmp_path, capsys):
    (tmp_path / ".env.example").write_text("GEMINI_API_KEY=\n", encoding="utf-8")
    frontend = tmp_path / "frontend"
    frontend.mkdir()
    (frontend / ".env.example").write_text("VITE_API_URL=\n", encoding="utf-8")
    dotenv.materialize(tmp_path, {"GEMINI_API_KEY": "super-secret-value"})
    captured = capsys.readouterr()
    assert "super-secret-value" not in captured.out
    assert "super-secret-value" not in captured.err
    assert (tmp_path / ".env").read_text(encoding="utf-8").count("super-secret-value") == 1


def test_materialize_writes_both_env_files(dotenv, tmp_path):
    (tmp_path / ".env.example").write_text("GEMINI_API_KEY=\n", encoding="utf-8")
    frontend = tmp_path / "frontend"
    frontend.mkdir()
    (frontend / ".env.example").write_text("VITE_SUPABASE_ANON_KEY=\n", encoding="utf-8")
    written = dotenv.materialize(
        tmp_path,
        {"GEMINI_API_KEY": "k", "VITE_SUPABASE_ANON_KEY": "anon"},
    )
    assert [p.name for p in written] == [".env", ".env"]
    assert "GEMINI_API_KEY=k" in (tmp_path / ".env").read_text(encoding="utf-8")
    assert "VITE_SUPABASE_ANON_KEY=anon" in (frontend / ".env").read_text(encoding="utf-8")
