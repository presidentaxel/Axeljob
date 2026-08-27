"""AXE-317 : CD uniquement sur `prod`, script de deploy + fallback documenté."""

from __future__ import annotations

import shutil
import stat
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "deploy-prod.yml"
SCRIPT = ROOT / "scripts" / "deploy-prod.sh"


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def _prepare_repo(tmp_path: Path, branch: str) -> Path:
    subprocess.run(
        ["git", "init", "-b", branch, str(tmp_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.email", "ci@example.com"],
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "-C", str(tmp_path), "config", "user.name", "ci"],
        check=True,
        capture_output=True,
        text=True,
    )
    (tmp_path / "README").write_text("deploy-prod test\n", encoding="utf-8")
    subprocess.run(
        ["git", "-C", str(tmp_path), "add", "README"],
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["git", "-C", str(tmp_path), "commit", "-m", "init"],
        check=True,
        capture_output=True,
        text=True,
    )
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    dest = scripts / "deploy-prod.sh"
    shutil.copy(SCRIPT, dest)
    dest.chmod(dest.stat().st_mode | stat.S_IEXEC)
    return tmp_path


def _run_script(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(cwd / "scripts" / "deploy-prod.sh"), *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )


def test_workflow_file_exists() -> None:
    assert WORKFLOW.is_file()


def test_workflow_triggers_only_on_prod_push() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "branches: [prod]" in text
    assert "pull_request" not in text
    assert "workflow_dispatch" not in text
    on_idx = text.index("\non:")
    jobs_idx = text.index("\njobs:")
    on_block = text[on_idx:jobs_idx]
    assert "main" not in on_block
    assert "wip/innovation" not in on_block
    assert "prod" in on_block


def test_workflow_uses_production_environment_and_keeps_inflight_deploys() -> None:
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "environment: production" in text
    assert "cancel-in-progress: false" in text
    assert "github.ref == 'refs/heads/prod'" in text
    assert "appleboy/ssh-action@v1.2.5" in text
    assert "scripts/deploy-prod.sh --skip-pull" in text
    assert "DEPLOY_HOST" in text
    assert "DEPLOY_USER" in text
    assert "DEPLOY_SSH_KEY" in text


def test_script_refuses_non_prod_branch(tmp_path: Path) -> None:
    repo = _prepare_repo(tmp_path, "main")
    result = _run_script(repo, "--dry-run")
    assert result.returncode == 1, result.stdout + result.stderr
    assert "besoin prod" in result.stderr


def test_script_dry_run_ok_on_prod(tmp_path: Path) -> None:
    repo = _prepare_repo(tmp_path, "prod")
    result = _run_script(repo, "--dry-run", "--skip-pull")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "HEAD=prod" in result.stdout
    assert "docker compose" in result.stdout


def test_script_unknown_arg_exits_error(tmp_path: Path) -> None:
    repo = _prepare_repo(tmp_path, "prod")
    result = _run_script(repo, "--nope")
    assert result.returncode == 1
    assert "argument inconnu" in result.stderr


def test_deploy_docs_describe_cd_and_fallback() -> None:
    deploy = _read("docs/deploy.md")
    assert "deploy-prod.yml" in deploy
    assert "scripts/deploy-prod.sh" in deploy
    assert "DEPLOY_HOST" in deploy
    assert "DEPLOY_SSH_KEY" in deploy
    assert "Environment GitHub `production`" in deploy
    adr = _read("docs/ADR_MAIN_PROD.md")
    assert "AXE-317" in adr
    git_wf = _read("docs/git-workflow.md")
    assert "deploy-prod.yml" in git_wf
    protections = _read("docs/branch-protections.md")
    assert "deploy-prod.yml" in protections
