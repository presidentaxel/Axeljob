PYTHON ?= python
VENV_DIR ?= .venv
VENV_PY = $(VENV_DIR)/Scripts/python.exe
VENV_PIP = $(VENV_DIR)/Scripts/pip.exe
VENV_PRE_COMMIT = $(VENV_DIR)/Scripts/pre-commit.exe

.PHONY: help venv install-dev install-frontend install-hooks setup lint lint-back lint-front format test test-back test-front security security-back ci prepush pre-commit-install

help:
	@echo "Targets:"
	@echo "  make venv              Create Python virtual environment"
	@echo "  make install-dev       Install backend dev dependencies in .venv"
	@echo "  make install-frontend  Install frontend dependencies"
	@echo "  make lint              Run backend + frontend lint"
	@echo "  make format            Run backend formatters"
	@echo "  make test              Run backend + frontend tests"
	@echo "  make security          Run backend security checks"
	@echo "  make ci                Run local CI checks"
	@echo "  make prepush           Full local gate (same as scripts/pre-push.* + security audits)"
	@echo "  make setup             .venv (CI pins) + git pre-push hook + rappel Cursor"
	@echo "  make install-hooks     Active .githooks/pre-push sur ce clone"
	@echo "  make pre-commit-install Install pre-commit + pre-push hooks"

venv:
	$(PYTHON) -m venv $(VENV_DIR)
	$(VENV_PIP) install --upgrade pip

install-dev: venv
	$(VENV_PIP) install -r backend/requirements.txt -r backend/requirements-dev.txt
	$(VENV_PIP) install black==24.10.0 ruff==0.8.4 mypy==1.13.0 pytest==8.3.3 pytest-cov==6.0.0 pre-commit bandit pip-audit

install-frontend:
	npm --prefix frontend ci

lint-back:
	$(VENV_PY) -m ruff check .
	$(VENV_PY) -m black --check .
	$(VENV_PY) -m mypy backend

lint-front:
	npm --prefix frontend run lint

lint: lint-back lint-front

format:
	$(VENV_PY) -m ruff check --fix .
	$(VENV_PY) -m black .

test-back:
	$(VENV_PY) -m pytest tests --cov=backend --cov-report=term-missing --cov-fail-under=60

test-front:
	npm --prefix frontend run test:unit
	npm --prefix frontend run test:e2e

test: test-back test-front

security-back:
	$(VENV_PY) -m bandit -r backend -c pyproject.toml
	$(VENV_PY) -m pip_audit -r backend/requirements.txt

security: security-back

ci: lint test-back security-back

ifeq ($(OS),Windows_NT)
prepush:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pre-push.ps1
else
prepush:
	bash scripts/pre-push.sh
endif

install-hooks:
	bash scripts/install-git-hooks.sh

setup:
	bash scripts/setup-dev.sh

pre-commit-install:
	$(VENV_PRE_COMMIT) install --hook-type pre-commit
	@echo "Pre-push Git : make install-hooks  (ou bash scripts/setup-dev.sh)"
