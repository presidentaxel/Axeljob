# Aide-memoire commandes - cv-bot

Version ultra-courte des commandes frequentes.
Pour le detail : `docs/ops-commands.md` et `docs/deploy.md`.

Chaque section propose une variante **Bash** (Linux / macOS / Git Bash / WSL) et une variante **PowerShell** (Windows).

## Sommaire

1. Prerequis machine
2. Lancer local
3. Docker
4. Logs
5. Rebuild
6. Redemarrage
7. Git
8. Pre-push (CI locale)

## 1) Prerequis machine (premiere installation)

### Bash (Linux / macOS)

```bash
python3 --version
# Debian / Ubuntu
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm git
# macOS (Homebrew)
brew install python node git
```

> [!NOTE]
> Sur Debian/Ubuntu, `python3-venv` est necessaire pour creer le `.venv`. Pour Node.js recent, preferer [nvm](https://github.com/nvm-sh/nvm) plutot que le paquet `apt`.

### PowerShell (Windows)

```powershell
python --version
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 2) Lancer l'application en local

### Backend

#### Bash (Linux / macOS)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

#### PowerShell (Windows)

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

#### Bash (Linux / macOS)

```bash
cd frontend
npm ci
npm run dev
```

#### PowerShell (Windows)

```powershell
cd frontend
npm ci
npm run dev
```

## 3) Docker (local ou serveur)

### Bash (Linux / macOS)

```bash
cd /opt/cv-bot
docker compose build
docker compose up -d
```

### PowerShell (Windows)

```powershell
cd D:\Code\cv-bot
docker compose build
docker compose up -d
```

## 4) Logs

### Bash (Linux / macOS)

```bash
cd /opt/cv-bot
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs --tail 100 backend
```

### PowerShell (Windows)

```powershell
cd /opt/cv-bot
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs --tail 100 backend
```

## 5) Rebuild cible

### Bash (Linux / macOS)

```bash
cd /opt/cv-bot
git pull origin main
docker compose build --no-cache backend
docker compose up -d backend
docker compose build --no-cache frontend
docker compose up -d frontend
```

### PowerShell (Windows)

```powershell
git pull origin main
docker compose build --no-cache backend
docker compose up -d backend
docker compose build --no-cache frontend
docker compose up -d frontend
```

## 6) Redemarrage rapide

### Bash (Linux / macOS)

```bash
cd /opt/cv-bot
docker compose restart backend
docker compose restart frontend
```

### PowerShell (Windows)

```powershell
cd D:\Code\cv-bot
docker compose restart backend
docker compose restart frontend
```

## 7) Git (workflow standard)

### Bash (Linux / macOS)

```bash
git status
git add .
git commit -m "feat: description du changement"
git push
```

### PowerShell (Windows)

```powershell
git status
git add .
git commit -m "feat: description du changement"
git push
```

> [!WARNING]
> Ne pas committer de secrets (`.env`, cles API, tokens).

## 8) Pre-push (CI + security locale)

### Setup automatique (recommandé, une fois par clone)

#### Bash (Linux / macOS)

```bash
bash scripts/setup-dev.sh
# ou : make setup
```

Branches : **`main`** = prod ; **`wip/innovation`** = dev éditeur Beta / canvas (une seule branche de travail).

Configure `.venv` (Black **24.10.0** comme GitHub), active le hook **pre-push** Git (`.githooks/`), et rappelle les hooks **Cursor** (`.cursor/hooks.json`).

### Cursor (tous les chats / agent)

- **Règle** : `.cursor/rules/pre-push-ci.mdc` — l'agent doit lancer `bash scripts/pre-push.sh --skip-extras --skip-gitleaks` avant tout `git push`.
- **Hook** : `.cursor/hooks.json` — bloque `git push` dans le terminal de l'agent si la CI locale échoue (timeout 15 min).
- Contournement urgence : `SKIP_PREPUSH=1 git push`.
- Après modification de `hooks.json`, redémarrer Cursor si le hook ne se déclenche pas (onglet **Hooks** / canal **Hooks**).

> **Note** : le hook Git (`.githooks/pre-push`) et le hook Cursor couvrent la même gate. `pre-commit` ne duplique pas le pre-push (évite deux runs à chaque push). Pour la gate **security** complète (pip-audit, bandit, gitleaks), lancer `bash scripts/pre-push.sh` sans `--skip-extras`.

Aligne `**.github/workflows/ci.yml**` (ruff, black, mypy, pytest avec couverture CV + seuil 62, `npm ci`, lint, build) et `**.github/workflows/security.yml**` sauf **CodeQL** (réservé à GitHub Actions).

Étapes security rejouées ici : **gitleaks** (si la CLI est dans le `PATH`), **pip-audit** sur `backend/requirements.txt`, **bandit** sur `backend`, **npm audit --audit-level=high** dans `frontend/`.

### Commande unique (recommandée)


| Plateforme                | Commande                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| Linux / macOS / Git Bash  | `bash scripts/pre-push.sh`                                        |
| Windows (PowerShell)      | `powershell -ExecutionPolicy Bypass -File .\scripts\pre-push.ps1` |
| **Makefile** (détecte OS) | `make prepush`                                                    |


### Hook Git (lance le pre-push à chaque `git push`)

#### Bash (Linux / macOS)

```bash
bash scripts/install-git-hooks.sh
```

#### PowerShell (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-git-hooks.ps1
```

Cela définit `git config core.hooksPath .githooks` : le hook `.githooks/pre-push` enchaîne **pwsh** / **powershell** / **bash** selon ce qui est disponible.

### Options


| Script     | Option                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Bash       | `--skip-extras` — pas pip-audit, bandit, npm audit, gitleaks                                                   |
| Bash       | `--skip-gitleaks` — pas gitleaks (garde pip-audit, bandit, npm audit)                                          |
| Bash       | `--with-e2e` — Playwright après le build (long ; `npx playwright install chromium` dans `frontend/` au besoin) |
| PowerShell | `-SkipExtras` — pas pip-audit, bandit, npm audit, gitleaks                                                     |
| PowerShell | `-SkipGitleaks` — pas gitleaks (garde pip-audit, bandit, npm audit)                                            |
| PowerShell | `-WithE2E` — Playwright après le build (long ; `npx playwright install chromium` dans `frontend/` au besoin)   |


### Prérequis `.venv`

Comme en CI : créer un `.venv`, l'activer, puis installer les dépendances et les outils de la workflow.

#### Bash (Linux / macOS)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
pip install black==24.10.0 ruff==0.8.4 mypy==1.13.0 pytest==8.3.3 pytest-cov==6.0.0
```

#### PowerShell (Windows)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
pip install black==24.10.0 ruff==0.8.4 mypy==1.13.0 pytest==8.3.3 pytest-cov==6.0.0
```

Le script fixe `PYTHONPATH` sur la racine du dépôt.

### Gitleaks

Pour la même couverture que la CI : [installer gitleaks](https://github.com/gitleaks/gitleaks) et vérifier `gitleaks version`.

#### Bash (Linux / macOS)

```bash
# Debian / Ubuntu : binaire pre-compile
curl -sSL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_x64.tar.gz \
  | sudo tar -xz -C /usr/local/bin gitleaks
gitleaks version
# macOS (Homebrew)
brew install gitleaks
```

#### PowerShell (Windows)

```powershell
# Via Chocolatey
choco install gitleaks
# ou Scoop
scoop install gitleaks
gitleaks version
```

Sans binaire, un avertissement jaune s’affiche ; utilisez `--skip-gitleaks` (Bash) ou `-SkipGitleaks` (PowerShell) pour ne pas tenter le scan.