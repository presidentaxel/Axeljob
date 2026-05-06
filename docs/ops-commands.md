# Commandes operations

Commandes d'exploitation pour local et serveur.

> [!TIP]
> Copier-coller ces blocs tels quels, puis adapter le chemin si necessaire.

## Sommaire

1. Developpement local
2. Docker
3. Logs
4. Rebuild cible
5. Redemarrage

## 1) Developpement local

### Backend

```powershell
cd D:\Code\cv-bot
.\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```powershell
cd D:\Code\cv-bot\frontend
npm run dev
```

## 2) Docker (local ou serveur)

```bash
cd /opt/cv-bot
docker compose build
docker compose up -d
```

## 3) Logs

```bash
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs --tail 100 backend
```

## 4) Rebuild cible

### Backend

```bash
docker compose build --no-cache backend
docker compose up -d backend
```

### Frontend

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

## 5) Redemarrage sans rebuild

```bash
docker compose restart backend
docker compose restart frontend
```
