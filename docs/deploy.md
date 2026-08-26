# Guide de deploiement (production)

Reference de deploiement `cv-bot` avec Docker.

## Sommaire

1. Prerequis
2. Installation initiale
3. Verification post-deploiement
4. Mise a jour
5. Configuration critique
6. Checklist production
7. Sentry (observabilite)

## 1) Prerequis

- Serveur Linux (2 Go RAM minimum recommande).
- Nom de domaine et DNS.
- Projet Supabase configure.
- Cle API Gemini.
- Docker + plugin Docker Compose.

## 2) Installation initiale

```bash
cd /opt
git clone <repo-url> cv-bot
cd cv-bot
cp .env.example .env
# renseigner les valeurs production dans .env
docker compose build
docker compose up -d
```

## 3) Verification post-deploiement

```bash
docker compose ps
docker compose logs --tail 200 backend
curl http://localhost/health
```

Resultat attendu :

- backend sain ;
- frontend actif ;
- endpoint `/health` sur statut `ok`.

## 4) Mise a jour

```bash
cd /opt/cv-bot
git pull origin main
docker compose build
docker compose up -d
```

## 5) Configuration critique

- Configurer un reverse proxy HTTPS (Caddy, nginx ou Cloudflare).
- Definir un `METRICS_AUTH_TOKEN` robuste.
- Laisser Swagger/ReDoc desactive en production.
- Garder les buckets Supabase prives par defaut.
- Aligner `CV_BOT_API_BASE_URL` et `CV_BOT_FRONTEND_URL` sur les URLs publiques reelles.

> [!WARNING]
> Ne pas deployer sans valider les variables d'environnement et le healthcheck.

## 6) Checklist production

- [ ] Variables d'environnement completees et verifiees.
- [ ] Build Docker ok.
- [ ] Healthcheck valide.
- [ ] Logs backend sans erreur bloquante.
- [ ] Workflow securite CI vert.

Pour les commandes d'exploitation quotidiennes, voir `docs/ops-commands.md`.

## 7) Sentry (observabilite)

Decisions figées : [`docs/observabilite.md`](observabilite.md) ([AXE-366](https://linear.app/axel-project/issue/AXE-366)).

- Pas de SDK tant que [AXE-367](https://linear.app/axel-project/issue/AXE-367) / [AXE-368](https://linear.app/axel-project/issue/AXE-368) ne sont pas livrés.
- DSN vide = no-op (dev / CI). Variables : ticket [AXE-369](https://linear.app/axel-project/issue/AXE-369).
- `VITE_SENTRY_DSN` et `VITE_SENTRY_ENVIRONMENT` sont des **build args** Docker (comme `VITE_AXEL_GTM_ID`), pas du runtime.
- `SENTRY_AUTH_TOKEN` : secret de build uniquement, jamais dans l'image.
- Session Replay : **off**. CV / annonce : **jamais** dans un event.
- Recette post-deploy : [AXE-371](https://linear.app/axel-project/issue/AXE-371).
