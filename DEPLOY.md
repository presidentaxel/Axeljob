# Guide de deploiement en production

Ce guide couvre le deploiement de CV Bot sur un serveur DigitalOcean (Droplet) avec Docker, un sous-domaine et HTTPS.

---

## Sommaire

1. [Prerequis](#1-prerequis)
2. [Pousser le code (Git workflow)](#2-pousser-le-code-git-workflow)
3. [Preparer le serveur](#3-preparer-le-serveur)
4. [Configurer Supabase](#4-configurer-supabase)
5. [Preparer les variables d'environnement](#5-preparer-les-variables-denvironnement)
6. [Deployer avec Docker](#6-deployer-avec-docker)
7. [Configurer le domaine et HTTPS](#7-configurer-le-domaine-et-https)
8. [Configurer Stripe (optionnel)](#8-configurer-stripe-optionnel)
9. [Verifier que tout marche](#9-verifier-que-tout-marche)
10. [Maintenance et mises a jour](#10-maintenance-et-mises-a-jour)
11. [Securite en production](#11-securite-en-production)

---

## 1. Prerequis

- Un **Droplet DigitalOcean** (Ubuntu 22.04+, 2 GB RAM minimum)
- Un **nom de domaine** avec acces DNS (ex: `cv.tondomaine.com`)
- Un projet **Supabase** (gratuit)
- Une cle API **Google Gemini** (gratuite)
- Docker et Docker Compose installes sur le serveur

---

## 2. Pousser le code (Git workflow)

Cette section explique comment envoyer ton code sur GitHub de maniere propre, **sans jamais exposer tes secrets** (cles API, mots de passe, fichiers `.env`).

### 2.1 Ce qui est protege automatiquement

Le projet contient trois niveaux de protection :

| Fichier | Role |
|---------|------|
| `.gitignore` (racine) | Empeche Git de tracker les `.env`, `__pycache__`, `*.pdf`, `cv_base.json`, `adaptations/`, `logs/`, photos dans `assets/` |
| `frontend/.gitignore` | Empeche Git de tracker les `.env`, `.env.*`, `node_modules`, `dist` du frontend |
| `.dockerignore` (racine) | Empeche Docker d'inclure les `.env`, `.git`, `node_modules`, `logs/`, `adaptations/` dans les images |
| `frontend/.dockerignore` | Empeche Docker d'inclure `node_modules`, `dist`, `.env` dans l'image frontend |

**Fichiers sensibles deja exclus par `.gitignore` :**

```
.env                          # secrets backend (Supabase, Gemini, Stripe...)
frontend/.env                 # secrets frontend (Supabase URL, anon key)
.env.production               # config prod
cv_base.json                  # donnees personnelles du CV
adaptations/*.json            # contenu genere par l'IA
assets/*.jpg / *.png / ...    # photos personnelles
logs/*.jsonl                  # logs d'utilisation
```

**Fichiers `.env.example` qui SONT dans Git** (templates sans valeurs reelles) :

```
.env.example                  # template backend
.env.production.example       # template prod
frontend/.env.example         # template frontend
```

### 2.2 Initialiser le repo et premier push

```bash
cd cv-bot

# Initialiser Git (si pas deja fait)
git init
git remote add origin https://github.com/TON_USER/TON_REPO.git
```

**Avant le premier commit, verifier que rien de sensible n'est stage :**

```bash
# Voir tous les fichiers qui seront commites
git status

# Verifier qu'aucun .env n'apparait
git status | findstr ".env"
# (ne doit rien afficher, ou seulement les .env.example)

# Si un fichier sensible apparait, l'exclure
git rm --cached .env                  # si deja stage
git rm --cached frontend/.env         # idem
git rm --cached cv_base.json          # idem
```

**Premier commit :**

```bash
git add .

# Double-check : lister tous les fichiers stages
git diff --cached --name-only
# Parcourir la liste et verifier qu'il n'y a PAS :
#   .env, frontend/.env, .env.production, cv_base.json, des .pdf, des photos

git commit -m "Initial commit - production ready"
git branch -M main
git push -u origin main
```

> **Repo prive recommande** : ton code contient la logique metier et les prompts IA. Sur GitHub, va dans Settings > Danger Zone > Change visibility > Private.

### 2.3 Workflow quotidien (modif → push → deploy)

Chaque fois que tu fais une modification en local :

```bash
# 1. Verifier les changements
git status
git diff

# 2. Ajouter et commiter
git add .
git status                     # re-verifier, pas de .env
git commit -m "description de la modif"

# 3. Pousser vers GitHub
git push origin main
```

Puis sur le serveur :

```bash
# 4. Recuperer et redemarrer
ssh root@IP_DU_SERVEUR
cd /opt/cv-bot
git pull origin main

# 5. Rebuild les images Docker et relancer
docker compose build
docker compose up -d
```

### 2.4 Que faire si un secret a ete commite par erreur

**Si le push n'est pas encore fait :**

```bash
# Retirer le fichier du dernier commit (sans le supprimer du disque)
git rm --cached .env
git commit --amend --no-edit
```

**Si le push est deja fait :**

Le secret est compromis, meme si tu le retires ensuite. Il faut :

1. **Revoquer immediatement** la cle/le mot de passe expose (Supabase, Gemini, Stripe...)
2. **Generer de nouvelles cles** dans les dashboards respectifs
3. **Mettre a jour** le `.env` local et le `.env` sur le serveur
4. Supprimer le fichier de l'historique Git :

```bash
# Installer git-filter-repo (plus fiable que filter-branch)
pip install git-filter-repo

# Supprimer le fichier de tout l'historique
git filter-repo --invert-paths --path .env --force

# Force push (ecrase l'historique distant)
git push origin main --force
```

> Apres un force push, toute personne ayant clone le repo doit re-cloner.

### 2.5 Checklist avant chaque push

- [ ] `git status` ne montre aucun `.env`, `cv_base.json`, `*.pdf`, photos
- [ ] `git diff --cached --name-only` ne contient que du code source
- [ ] Les fichiers `.env.example` sont a jour (si tu as ajoute de nouvelles variables)
- [ ] Le build local passe (`cd frontend && npm run build`)

### 2.6 Deployer sur le serveur sans exposer les secrets

Le principe est simple : **les `.env` ne transitent jamais par Git**. Ils sont crees manuellement sur le serveur.

```
Local (.env)  ──────── Git push ──────►  GitHub (pas de .env)
                                              │
                                         git pull
                                              │
                                              ▼
                                     Serveur /opt/cv-bot
                                       ├── code source ✓
                                       ├── .env         ← cree a la main
                                       └── frontend/.env ← cree a la main
```

**Sur le serveur, creer les .env une seule fois :**

```bash
cd /opt/cv-bot

# Copier les templates
cp .env.production.example .env.production
cp frontend/.env.example frontend/.env

# Editer avec les vraies valeurs
nano .env.production
nano frontend/.env
```

Le `docker-compose.yml` utilise `env_file: .env.production` — Docker lira les secrets directement depuis ce fichier, qui n'est **jamais dans Git**.

**Pour les mises a jour suivantes**, seul le code change :

```bash
git pull origin main            # recupere le code, pas les .env
docker compose build && docker compose up -d
```

Les `.env` sur le serveur restent intacts entre les deploys. Tu ne les modifies que si tu ajoutes/changes une variable d'environnement.

---

## 3. Preparer le serveur

### Creer un Droplet DigitalOcean

1. Connecte-toi a [DigitalOcean](https://cloud.digitalocean.com/)
2. Create > Droplets
3. Choisis :
   - **Image** : Ubuntu 24.04
   - **Plan** : Basic, 2 GB RAM / 1 vCPU ($12/mois) minimum
   - **Region** : la plus proche de tes utilisateurs (Amsterdam/Frankfurt pour la France)
   - **Auth** : SSH key (recommande)
4. Cree le Droplet et note son **IP publique**

### Installer Docker

```bash
ssh root@IP_DU_SERVEUR

# Installer Docker
curl -fsSL https://get.docker.com | sh

# Installer Docker Compose (plugin)
apt-get install -y docker-compose-plugin

# Verifier
docker --version
docker compose version
```

### Cloner le projet

```bash
cd /opt
git clone https://ton-repo.git cv-bot
cd cv-bot
```

> Si le repo est prive, configure une deploy key SSH ou un token d'acces.

---

## 4. Configurer Supabase

### 4.1 Creer le projet

1. Va sur [supabase.com](https://supabase.com) > New Project
2. Note :
   - **Project URL** : `https://xxxxx.supabase.co`
   - **anon key** : Settings > API > `anon` `public`
   - **service_role key** : Settings > API > `service_role` (NE JAMAIS exposer cote client)
   - **JWT Secret** : Settings > API > JWT Secret

### 4.2 Creer les tables

Dans Supabase Dashboard > **SQL Editor**, execute dans l'ordre :

```sql
-- 1. Schema principal
-- Copier-coller le contenu de backend/supabase_schema.sql

-- 2. Migrations (dans l'ordre)
-- backend/supabase_migration_applications_user_id.sql
-- backend/supabase_migration_events.sql
-- backend/supabase_migration_user_plans.sql
-- backend/supabase_migration_user_plans_paywall_disabled.sql
-- backend/supabase_migration_storage_cv_photos.sql
-- backend/supabase_migration_storage_application_docs.sql
```

### 4.3 Configurer l'auth

Dans Supabase Dashboard > Authentication > Providers :
- Active **Email** (deja actif par defaut)
- Configure le **Site URL** : `https://cv.tondomaine.com`
- Configure les **Redirect URLs** : `https://cv.tondomaine.com/**`

---

## 5. Preparer les variables d'environnement

### 5.1 Fichier .env (backend)

Sur le serveur, a la racine de `/opt/cv-bot` :

```bash
cp .env.production.example .env
nano .env
```

Remplis chaque variable :

```env
# Application
ENVIRONMENT=production

# Google Gemini
GEMINI_API_KEY=AIzaSy...

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...  (service_role)
SUPABASE_JWT_SECRET=ton-jwt-secret

# URLs publiques
CV_BOT_API_BASE_URL=
CV_BOT_FRONTEND_URL=https://cv.tondomaine.com

# Metrics (genere un token aleatoire)
METRICS_AUTH_TOKEN=un-token-secret-aleatoire

# Logo.dev (optionnel)
LOGO_DEV_TOKEN=pk_...

# Frontend build args (lus par docker-compose au build)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...  (anon key)
```

**Notes importantes :**

- `CV_BOT_API_BASE_URL` : laisse **vide**. Nginx proxie `/api/` vers le backend (same-origin), donc pas besoin d'URL separee.
- `CV_BOT_FRONTEND_URL` : **obligatoire** pour CORS et les redirections Stripe.
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` : ces variables sont lues par `docker-compose.yml` au moment du build frontend et injectees dans le bundle JS. C'est la cle `anon` (publique), pas la `service_role`.

---

## 6. Deployer avec Docker

### 6.1 Build

```bash
cd /opt/cv-bot

# Build les images (premiere fois : 3-5 min)
docker compose build
```

Le build :
- **Backend** : installe Python 3.12, les libs systeme WeasyPrint (Pango, Cairo, etc.), les dependances pip
- **Frontend** : `npm ci` + `npm run build` (Vite), copie le `dist/` dans nginx Alpine

### 6.2 Lancer

```bash
docker compose up -d
```

### 6.3 Verifier

```bash
# Logs
docker compose logs -f

# Health check
curl http://localhost/health
# Reponse attendue : {"status":"ok"}

# Verifier les deux containers
docker compose ps
# backend   running (healthy)
# frontend  running
```

### 6.4 Arreter / relancer

```bash
# Arreter
docker compose down

# Relancer
docker compose up -d

# Rebuild apres un changement de code
docker compose build && docker compose up -d
```

---

## 7. Configurer le domaine et HTTPS

### 6.1 DNS

Dans le panneau DNS de ton registrar (ou DigitalOcean Networking) :

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| A | cv | IP_DU_SERVEUR | 300 |

> Remplace `cv` par le sous-domaine souhaite. Si ton domaine est `tondomaine.com`, ca donne `cv.tondomaine.com`.

### 6.2 Option A : Caddy (plus simple)

Caddy gere automatiquement le certificat Let's Encrypt.

```bash
# Installer Caddy
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudflare.com/caddy/stable/debian.deb.pkg' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudflare.com/caddy/stable/deb/ any-version main" | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
```

Creer `/etc/caddy/Caddyfile` :

```
cv.tondomaine.com {
    reverse_proxy localhost:80
}
```

```bash
systemctl restart caddy
```

C'est tout. Caddy obtient et renouvelle le certificat automatiquement.

### 6.2 Option B : nginx + Certbot

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

Creer `/etc/nginx/sites-available/cv-bot` :

```nginx
server {
    listen 80;
    server_name cv.tondomaine.com;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 20M;
    }
}
```

> **Attention** : si le container frontend ecoute deja sur le port 80, il y a un conflit avec nginx sur l'hote. Change le port dans `docker-compose.yml` :

```yaml
    ports:
      - "3000:80"  # au lieu de "80:80"
```

Puis dans le nginx de l'hote, proxie vers `127.0.0.1:3000`.

```bash
ln -s /etc/nginx/sites-available/cv-bot /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Obtenir le certificat SSL
certbot --nginx -d cv.tondomaine.com
```

### 6.2 Option C : Cloudflare (le plus simple)

1. Ajoute ton domaine a Cloudflare
2. DNS : A record `cv` → IP du serveur, proxy active (orange cloud)
3. SSL/TLS : mode **Full (strict)** si tu as un certificat sur le serveur, ou **Flexible** sinon
4. Rien d'autre a configurer cote serveur

---

## 8. Configurer Stripe (optionnel)

Pour activer le plan Pro payant :

### 7.1 Stripe Dashboard

1. Cree un compte sur [stripe.com](https://stripe.com)
2. Cree un **Product** avec un **Price** (abonnement mensuel)
3. Note le `price_id` (commence par `price_...`)
4. Va dans Developers > API Keys et note la **Secret key** (`sk_live_...`)

### 7.2 Webhook

1. Developers > Webhooks > Add endpoint
2. URL : `https://cv.tondomaine.com/api/stripe-webhook`
3. Events : `checkout.session.completed`
4. Note le **Signing secret** (`whsec_...`)

### 7.3 Variables d'environnement

Ajoute dans `.env` :

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID_PRO_MONTHLY=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Puis rebuild et relance :

```bash
docker compose build backend && docker compose up -d
```

---

## 9. Verifier que tout marche

### Checklist

- [ ] `https://cv.tondomaine.com` affiche la landing page
- [ ] L'inscription / connexion fonctionne (Supabase Auth)
- [ ] L'onboarding s'affiche pour un nouvel utilisateur
- [ ] L'adaptation d'un CV fonctionne (teste avec une offre)
- [ ] Le telechargement PDF fonctionne
- [ ] L'export dossier ZIP fonctionne
- [ ] Les candidatures s'affichent dans le kanban
- [ ] Le logo entreprise s'affiche (Logo.dev)
- [ ] Le health check repond : `curl https://cv.tondomaine.com/health`
- [ ] Les metriques repondent (si configure) :
  ```bash
  curl -H "Authorization: Bearer TON_METRICS_TOKEN" https://cv.tondomaine.com/metrics
  ```
- [ ] Swagger est **inaccessible** en prod : `https://cv.tondomaine.com/docs` → 404
- [ ] Les buckets Supabase sont en mode **prive** (pas d'acces public aux photos/documents)

### Tester en local avant de deployer

```bash
# Build local
docker compose build

# Lancer en local
docker compose up

# Ouvrir http://localhost
```

---

## 9. Maintenance et mises a jour

### Mettre a jour le code

```bash
cd /opt/cv-bot
git pull origin main

# Rebuild et relancer
docker compose build && docker compose up -d
```

### Voir les logs

```bash
# Tous les logs
docker compose logs -f

# Backend uniquement
docker compose logs -f backend

# Les 100 dernieres lignes
docker compose logs --tail 100 backend
```

### Redemarrer un service

```bash
docker compose restart backend
docker compose restart frontend
```

### Sauvegardes

Les donnees sont dans Supabase (cloud), pas sur le serveur. Pour sauvegarder :

1. **Supabase** : les backups sont automatiques (plan gratuit : 7 jours)
2. **Fichiers locaux** (si utilises) : `cv_base.json`, `adaptations/`, `logs/`

```bash
# Backup des logs (si besoin)
tar czf /root/cv-bot-logs-$(date +%Y%m%d).tar.gz logs/
```

---

## 10. Securite en production

### Ce qui est deja configure

| Protection | Detail |
|------------|--------|
| CORS restreint | Seul `CV_BOT_FRONTEND_URL` est autorise |
| HTTPS obligatoire | Via Caddy / Certbot / Cloudflare |
| Swagger desactive | `docs_url=None` en production |
| Buckets prives | Photos et documents proteges par signed URLs |
| Rate limiting | 5 req/min sur les endpoints IA, 10 req/min sur PDF/export, 30 req/min general |
| Body size limit | 20 MB max sur toutes les requetes |
| Auth JWT | Toutes les routes sensibles exigent un token Supabase valide |
| Metriques protegees | `/metrics` protege par `METRICS_AUTH_TOKEN` |
| GZip | Compression automatique des reponses |
| Erreurs generiques | Les exceptions Python ne sont jamais exposees au client |
| Logging structure | JSON avec timestamps en production |
| Security headers | X-Frame-Options, X-Content-Type-Options, Referrer-Policy (nginx) |

### A faire manuellement

- [ ] **Rotater les cles** si elles ont ete exposees dans un commit Git
- [ ] **Firewall** : autoriser uniquement les ports 22 (SSH), 80, 443
  ```bash
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw enable
  ```
- [ ] **Fail2ban** pour proteger SSH
  ```bash
  apt-get install -y fail2ban
  systemctl enable fail2ban
  ```
- [ ] **Supabase RLS** : verifier que Row Level Security est active sur toutes les tables
- [ ] **Stripe webhook** : tester avec `stripe listen --forward-to localhost:8000/api/stripe-webhook`

---

## Schema d'architecture

```
                    Internet
                       │
                   [Cloudflare]  (optionnel, HTTPS + CDN)
                       │
                   [Caddy/nginx]  (HTTPS termination)
                       │
                  port 80/443
                       │
              ┌────────┴────────┐
              │   Frontend      │
              │   (nginx)       │
              │                 │
              │  /api/* ────────┼──► Backend (FastAPI)
              │  /metrics ──────┼──► Backend
              │  /health ───────┼──► Backend
              │  /* ────────────┼──► index.html (SPA)
              └─────────────────┘
                                      │
                               ┌──────┴──────┐
                               │  Supabase   │
                               │  (Postgres) │
                               │  (Storage)  │
                               │  (Auth)     │
                               └─────────────┘
```

Le frontend nginx sert les fichiers statiques et proxie toutes les requetes `/api/*` vers le container backend sur le port 8000 (reseau Docker interne). L'utilisateur ne voit qu'un seul domaine.
