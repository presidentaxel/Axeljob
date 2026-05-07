# Aide-memoire commandes - cv-bot

Version ultra-courte des commandes frequentes.
Pour le detail : `docs/ops-commands.md` et `docs/deploy.md`.

## Sommaire

1. Prerequis Windows
2. Lancer local
3. Docker
4. Logs
5. Rebuild
6. Redemarrage
7. Git
8. Pre-push (CI locale)

## 1) Prerequis Windows (premiere machine)

```powershell
python --version
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2) Lancer l'application en local

### Backend

```powershell
cd D:\Code\cv-bot
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```powershell
cd D:\Code\cv-bot\frontend
npm ci
npm run dev
```

## 3) Docker (local ou serveur)

```bash
cd /opt/cv-bot
docker compose build
docker compose up -d
```

## 4) Logs

```bash
cd /opt/cv-bot
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs --tail 100 backend
```

## 5) Rebuild cible

```bash
cd /opt/cv-bot
git pull origin main
docker compose build --no-cache backend
docker compose up -d backend
docker compose build --no-cache frontend
docker compose up -d frontend
```

## 6) Redemarrage rapide

```bash
cd /opt/cv-bot
docker compose restart backend
docker compose restart frontend
```

## 7) Git (workflow standard)

```powershell
cd D:\Code\cv-bot
git status
git add .
git commit -m "feat: description du changement"
git push
```

> [!WARNING]
> Ne pas committer de secrets (`.env`, cles API, tokens).

## 8) Pre-push (CI + security locale)

Aligne **`.github/workflows/ci.yml`** (ruff, black, mypy, pytest avec couverture CV + seuil 62, `npm ci`, lint, build) et **`.github/workflows/security.yml`** sauf **CodeQL** (réservé à GitHub Actions).

Étapes security rejouées ici : **gitleaks** (si la CLI est dans le `PATH`), **pip-audit** sur `backend/requirements.txt`, **bandit** sur `backend`, **npm audit --audit-level=high** dans `frontend/`.

### Commande unique (recommandée)

| Plateforme | Commande |
|------------|----------|
| Windows (PowerShell) | `powershell -ExecutionPolicy Bypass -File .\scripts\pre-push.ps1` |
| Linux / macOS / Git Bash | `bash scripts/pre-push.sh` |
| **Makefile** (détecte OS) | `make prepush` |

### Hook Git (lance le pre-push à chaque `git push`)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-git-hooks.ps1
```

```bash
bash scripts/install-git-hooks.sh
```

Cela définit `git config core.hooksPath .githooks` : le hook `.githooks/pre-push` enchaîne **pwsh** / **powershell** / **bash** selon ce qui est disponible.

### Options

| Script | Option |
|--------|--------|
| PowerShell | `-SkipExtras` — pas pip-audit, bandit, npm audit, gitleaks |
| PowerShell | `-SkipGitleaks` — pas gitleaks (garde pip-audit, bandit, npm audit) |
| PowerShell | `-WithE2E` — Playwright après le build (long ; `npx playwright install chromium` dans `frontend/` au besoin) |
| Bash | `--skip-extras`, `--skip-gitleaks`, `--with-e2e` |

### Prérequis `.venv`

Comme en CI : `python -m venv .venv`, activer, puis  
`pip install -r backend/requirements.txt -r backend/requirements-dev.txt`  
et les outils de la workflow (ex. `pip install black==24.10.0 ruff==0.8.4 mypy==1.13.0 pytest==8.3.3 pytest-cov==6.0.0`). Le script fixe `PYTHONPATH` sur la racine du dépôt.

### Gitleaks

Pour la même couverture que la CI : [installer gitleaks](https://github.com/gitleaks/gitleaks) et vérifier `gitleaks version`. Sans binaire, un avertissement jaune s’affiche sous PowerShell ; utilisez `-SkipGitleaks` pour ne pas tenter le scan.
