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

## 8) Pre-push (CI locale)

Meme base que `.github/workflows/ci.yml` : ruff, black, mypy, pytest (cov modules CV + seuil 62), `npm ci`, lint, build. En plus : `pip-audit` sur `backend/requirements.txt` et `bandit -c pyproject.toml --severity-level high` sur `backend` (pas d’alerte High = OK ; Low/Medium listés seulement si tu baisses le seuil). E2E Playwright en option.

Installer les deps dev backend comme en CI : `pip install -r backend/requirements.txt -r backend/requirements-dev.txt` (stubs mypy / types-requests). Le script positionne `PYTHONPATH` sur la racine du repo pour que `pytest` importe `backend.*` sous Windows.

```powershell
cd D:\Code\cv-bot
powershell -ExecutionPolicy Bypass -File .\scripts\pre-push.ps1
```

Sans audits (plus rapide) : `.\scripts\pre-push.ps1 -SkipExtras`

Avec E2E (Playwright ; premier run : `cd frontend ; npx playwright install chromium`) : `.\scripts\pre-push.ps1 -WithE2E`
