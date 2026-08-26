"""Garde-fous : pas de push direct vers main / master / prod (AXE-319)."""

from __future__ import annotations

import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "guard-push-via-pr.sh"


def _git_command(cmd: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(SCRIPT), "--git-command", cmd],
        capture_output=True,
        text=True,
        check=False,
    )


def _pre_push_stdin(line: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(SCRIPT), "--pre-push-stdin"],
        input=line,
        capture_output=True,
        text=True,
        check=False,
    )


def test_allows_feature_branch_push() -> None:
    result = _git_command("git push -u origin louisvedovato/axe-319-docs")
    assert result.returncode == 0, result.stderr


def test_explicit_feature_refspec_allowed_when_cwd_is_main(tmp_path: Path) -> None:
    """CI GitHub checkout ``main`` : un push explicite vers une feature doit passer."""
    subprocess.run(
        ["git", "init", "-b", "main", str(tmp_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    result = subprocess.run(
        [
            "bash",
            str(SCRIPT),
            "--git-command",
            "git push -u origin louisvedovato/axe-319-docs",
        ],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def test_bare_push_origin_denied_when_cwd_is_main(tmp_path: Path) -> None:
    subprocess.run(
        ["git", "init", "-b", "main", str(tmp_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.email", "ci@example.test"],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.name", "ci"],
        check=True,
        capture_output=True,
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(tmp_path),
            "commit",
            "--allow-empty",
            "-m",
            "init",
        ],
        check=True,
        capture_output=True,
    )
    result = subprocess.run(
        ["bash", str(SCRIPT), "--git-command", "git push origin"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1
    assert "interdit" in result.stderr


def test_allows_wip_innovation_push() -> None:
    result = _git_command("git push origin wip/innovation")
    assert result.returncode == 0, result.stderr


def test_denies_push_origin_main() -> None:
    result = _git_command("git push origin main")
    assert result.returncode == 1
    assert "interdit" in result.stderr


def test_denies_push_origin_prod() -> None:
    result = _git_command("git push origin prod")
    assert result.returncode == 1
    assert "prod" in result.stderr


def test_denies_push_origin_master() -> None:
    result = _git_command("git push origin master")
    assert result.returncode == 1


def test_denies_head_colon_prod() -> None:
    result = _git_command("git push origin HEAD:prod")
    assert result.returncode == 1


def test_denies_refs_heads_prod() -> None:
    result = _git_command("git push origin HEAD:refs/heads/prod")
    assert result.returncode == 1


def test_non_push_command_is_ignored() -> None:
    result = _git_command("git status")
    assert result.returncode == 0


def test_pre_push_stdin_denies_prod() -> None:
    result = _pre_push_stdin("refs/heads/feat abc123 refs/heads/prod def456\n")
    assert result.returncode == 1
    assert "interdit" in result.stderr


def test_pre_push_stdin_denies_main() -> None:
    result = _pre_push_stdin("refs/heads/feat abc123 refs/heads/main def456\n")
    assert result.returncode == 1


def test_pre_push_stdin_allows_feature() -> None:
    result = _pre_push_stdin("refs/heads/feat abc123 refs/heads/feat/x def456\n")
    assert result.returncode == 0, result.stderr


def test_usage_without_args_exits_2() -> None:
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 2
    assert "Usage" in result.stderr
