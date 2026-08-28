# Guide de contribution

Flux recommande pour produire des PR petites, lisibles et faciles a merger.

## Sommaire

1. Branches et commits
2. Setup local
3. Quality gates avant PR
4. Pre-commit
5. Checklist PR

## 1) Branches et commits

- Creer les branches depuis `main` : `feature/<sujet-court>` ou `fix/<sujet-court>`.
- Limiter une PR a une intention principale.
- Utiliser Conventional Commits : `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.

> [!IMPORTANT]
> Pour un **chantier AxeL Job** (projet / issue Linear, miroir GitHub, draft PR, liens cliquables) : suivre
> [`docs/linear-github-workflow.md`](linear-github-workflow.md).
> Branche = **exactement** le `gitBranchName` Linear (`louisvedovato/axe-XX-…`), titre PR `fix(AXE-XX): …` / `feat(AXE-XX): …`,
> body avec `Fixes AXE-XX` + `Closes #N`, et attachments liens sur l'issue Linear.
>
> Workflow Git / PR-first (`main` = intégration, `prod` = production, `wip/innovation`) : [`docs/git-workflow.md`](git-workflow.md) · [`docs/ADR_MAIN_PROD.md`](ADR_MAIN_PROD.md).  
> Protections branches : [`docs/branch-protections.md`](branch-protections.md).

> [!TIP]
> Une PR petite se revoit, se teste et se rollback plus facilement.

## 2) Setup local

Linux / macOS : `bash scripts/setup-dev.sh` (venv, hooks, materialise `.env` depuis l'environnement si present).

Les secrets Cursor Cloud ne remplacent pas un `.env` sur un PC physique.

### Backend (Python)

```powershell
cd cv-bot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
pip install black ruff mypy pytest pytest-cov pre-commit bandit pip-audit
```

### Frontend (React/Vite)

```powershell
cd cv-bot\frontend
npm ci
```

## 3) Quality gates avant PR

Executer les checks avant d'ouvrir (ou mettre a jour) une PR :

```powershell
cd cv-bot
.\.venv\Scripts\python -m ruff check .
.\.venv\Scripts\python -m black --check .
.\.venv\Scripts\python -m mypy backend
.\.venv\Scripts\python -m pytest tests
# Couverture gate (aligné sur la CI, modules rendu CV + helpers ATS) :
# .\.venv\Scripts\python -m pytest tests --cov=backend.services.cv_render_helpers --cov=backend.cv_html_render --cov-report=term-missing --cov-fail-under=62
.\.venv\Scripts\python -m bandit -r backend -c pyproject.toml
.\.venv\Scripts\python -m pip_audit -r backend/requirements.txt
npm --prefix frontend run lint
```

## 4) Hooks git (recommande)

```powershell
cd cv-bot
.\.venv\Scripts\pre-commit install
.\.venv\Scripts\pre-commit run --all-files
```

## 5) Checklist PR

- [ ] CI est verte.
- [ ] Les tests couvrent le comportement nouveau ou corrige.
- [ ] Les checks securite sont verts (`bandit`, `pip-audit`, workflow securite CI).
- [ ] La documentation est a jour (`README`, `docs/`, variables env si besoin).
- [ ] Aucun secret n'apparait dans le diff.
- [ ] La checklist de conformite guide est validee (`docs/conformity-audit.md`).

> [!WARNING]
> Ne jamais committer de `.env`, tokens, cles API ou donnees de production.
