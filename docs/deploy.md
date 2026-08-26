# Guide de deploiement (production)

Reference de deploiement `cv-bot` avec Docker.

Branche Git de production : **`prod`**. `main` est l'integration — voir [`ADR_MAIN_PROD.md`](ADR_MAIN_PROD.md).

## Sommaire

1. Prerequis
2. Installation initiale
3. Verification post-deploiement
4. Promote `main` → `prod`
5. Mise a jour serveur (depuis `prod`)
6. Configuration critique
7. Checklist production
8. Sentry (observabilite)
9. Fallback CD (jusqu'a AXE-317)

## 1) Prerequis

- Serveur Linux (2 Go RAM minimum recommande).
- Nom de domaine et DNS.
- Projet Supabase configure.
- Cle API Gemini.
- Docker + plugin Docker Compose.

## 2) Installation initiale

Le clone par defaut GitHub pointe sur `main` (integration). En production, checkout **`prod`** avant le premier build.

```bash
cd /opt
git clone <repo-url> cv-bot
cd cv-bot
git checkout prod
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

Si les DSN Sentry sont colles dans `.env` : checklist Sentry du §7 + recette [`observabilite.md`](observabilite.md) (AXE-371). Pas de route `/sentry-test`.

## 4) Promote `main` → `prod`

Rien n'arrive en production tant qu'une PR dont la **base** est `prod` n'est pas mergee.

```bash
gh pr create --base prod --head main \
  --title "release: promote main → prod" \
  --body "$(cat <<'EOF'
## Summary
Promote integration (`main`) vers production (`prod`).

## Linear
Fixes AXE-XX

## Test plan
- [ ] CI verte sur cette PR
- [ ] Apres merge : CD (AXE-317) ou fallback §9
- [ ] `curl …/health` → ok
EOF
)"
```

Hotfix urgence : brancher depuis `origin/prod`, PR vers `prod`, puis backport `main`. Detail : [`git-workflow.md`](git-workflow.md).

> [!WARNING]
> Ne pas merger une PR feature directement dans `prod` (sauf hotfix). Ne pas deployer depuis `main`.

## 5) Mise a jour serveur (depuis `prod`)

Apres merge de la PR promote (ou hotfix) dans `prod` :

```bash
cd /opt/cv-bot
git fetch origin
git checkout prod
git pull origin prod
docker compose build
docker compose up -d
```

> [!WARNING]
> Ne plus `git pull origin main` sur le serveur de production. `main` n'est plus la prod.

Quand [AXE-317](https://linear.app/axel-project/issue/AXE-317) sera livre, un `push` sur `prod` declenchera le CD (`deploy-prod.yml`) et cette etape manuelle ne sera plus le chemin nominal — garder §9 si le CD est down.

## 6) Configuration critique

- Configurer un reverse proxy HTTPS (Caddy, nginx ou Cloudflare).
- Definir un `METRICS_AUTH_TOKEN` robuste.
- Laisser Swagger/ReDoc desactive en production.
- Garder les buckets Supabase prives par defaut.
- Aligner `CV_BOT_API_BASE_URL` et `CV_BOT_FRONTEND_URL` sur les URLs publiques reelles.

> [!WARNING]
> Ne pas deployer sans valider les variables d'environnement et le healthcheck.

## 7) Checklist production

- [ ] PR promote (ou hotfix) mergee dans `prod` — pas un simple merge `main`.
- [ ] Serveur sur la branche `prod` (`git rev-parse --abbrev-ref HEAD`).
- [ ] Variables d'environnement completees et verifiees.
- [ ] Build Docker ok.
- [ ] Healthcheck valide.
- [ ] Logs backend sans erreur bloquante.
- [ ] Workflow securite CI vert.

Sentry (apres DSN colles, [AXE-371](https://linear.app/axel-project/issue/AXE-371) / [`observabilite.md`](observabilite.md)) :

- [ ] `SENTRY_DSN` + `VITE_SENTRY_DSN` poses (pas dans Git) ; `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` = `production` sur le serveur `prod`.
- [ ] Frontend **rebuild** apres changement de `VITE_*` ; backend recree (`--force-recreate`).
- [ ] Smoke backend + smoke frontend visibles, puis issues de test Resolved (pas de route `/sentry-test`).
- [ ] Alerte email high-priority active sur `axel-job-frontend` et `axel-job-backend`.
- [ ] Alerte email tag `flow=billing` active sur `axel-job-backend` (events warning AXE-370).
- [ ] Aucun contenu de CV / e-mail dans l'issue ouverte ; `user` = UUID ou absent.
- [ ] Source maps : stack front lisible seulement si `SENTRY_AUTH_TOKEN` etait present au **build** (jamais dans `.env`).

Pour les commandes d'exploitation quotidiennes, voir `docs/ops-commands.md`.

## 8) Sentry (observabilite)

Decisions figées : [`docs/observabilite.md`](observabilite.md) ([AXE-366](https://linear.app/axel-project/issue/AXE-366)).
Placeholders env : ce guide + `.env.example` ([AXE-369](https://linear.app/axel-project/issue/AXE-369)). **Aucune valeur DSN dans Git.**

SDK backend : [AXE-367](https://linear.app/axel-project/issue/AXE-367) (`backend/sentry_config.py`). Frontend : [AXE-368](https://linear.app/axel-project/issue/AXE-368). DSN vide = no-op (dev / CI) — voulu tant que les DSN ne sont pas colles **sur le serveur**.

### Ou coller les valeurs (serveur / PC, pas Git)

1. **Dev quotidien** : laisser `SENTRY_DSN` et `VITE_SENTRY_DSN` **vides** (pas d'events depuis le laptop).
2. **Recette laptop ([AXE-371](https://linear.app/axel-project/issue/AXE-371))** : coller les DSN + `SENTRY_ENVIRONMENT=staging` et `VITE_SENTRY_ENVIRONMENT=staging` (Compose force `ENVIRONMENT=production`).
3. **Prod / staging serveur** (`.env` a la racine du clone Docker) :
   - `SENTRY_DSN` = DSN projet `axel-job-backend` (runtime backend)
   - `VITE_SENTRY_DSN` = DSN projet `axel-job-frontend` (**build arg** frontend)
   - `SENTRY_ENVIRONMENT` / `VITE_SENTRY_ENVIRONMENT` = `production` ou `staging` (lecon AXE-271 : pas `MODE` Vite)
   - optionnel : `SENTRY_RELEASE` / `VITE_SENTRY_RELEASE` = SHA git ; `SENTRY_TRACES_SAMPLE_RATE` / `VITE_SENTRY_TRACES_SAMPLE_RATE`
4. Puis **rebuild front** : `docker compose build frontend && docker compose up -d` — changer le `.env` sans rebuild ne met pas Sentry dans le bundle.
5. Backend : `docker compose up -d --force-recreate backend` (lit `.env` au runtime).

Protocole smoke + alertes email : [`observabilite.md`](observabilite.md) section Recette DSN.

`SENTRY_AUTH_TOKEN` : secret de **build** uniquement (source maps, AXE-368). **Pas** dans `.env` runtime backend (`env_file` l'injecterait). Compose force `SENTRY_AUTH_TOKEN=` vide au runtime backend. Pour l'upload des maps : build-arg frontend (`docker compose build frontend`) si le token est dans l'environnement du **build** (interpolation Compose), jamais dans l'image nginx. Sans token, le build réussit et les `.map` sont supprimés.

Recuperer les DSN : Sentry → projet → Settings → Client Keys (DSN). Un DSN par projet, ne pas les melanger.

Session Replay : **off**. CV / annonce : **jamais** dans un event.
Recette post-deploy : [AXE-371](https://linear.app/axel-project/issue/AXE-371).

## 9) Fallback CD (jusqu'a AXE-317)

Le workflow GitHub `deploy-prod.yml` n'existe pas encore. Apres merge dans `prod` :

1. Executer §5 a la main (toujours `prod`, jamais `main`).
2. Verifier `/health`.

Si le CD est down plus tard : **meme fallback**.
