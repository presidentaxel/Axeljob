<div align="center">

# AxeL Job

**Adapte automatiquement ton CV a chaque offre d'emploi grace a l'IA.**

Colle l'annonce, l'IA (Gemini) adapte resume et bullet points, tu recuperes **CV**, **lettre de motivation** et **fiche de poste** en PDF.

[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![React 19](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev/)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## A propos

AxeL Job est une application web full-stack qui permet de maintenir un CV de base et de generer pour chaque offre :

- un **CV adapte** aux mots-cles de l'annonce (resume et experiences reformules par Gemini)
- une **lettre de motivation** generee par l'IA
- la **fiche de poste** en PDF
- un **suivi des candidatures** avec tableau kanban (drag & drop)

| Fonctionnalite | Detail |
|----------------|--------|
| Adaptation IA | Colle une offre, l'IA adapte ton CV en temps reel avec score ATS |
| Chat d'affinage | Affine le resultat par messages : "mets plus en valeur mon experience React" |
| Edition directe | Clique sur n'importe quel texte du CV pour l'editer dans l'apercu |
| 3 templates | Classic, Modern, Minimal avec personnalisation couleurs |
| Import CV | Import PDF/Word existant, l'IA le structure automatiquement |
| Suivi candidatures | Kanban avec statuts, questionnaires refus/entretien, export CSV |
| Export dossier | ZIP ou dossier local avec CV + lettre + fiche de poste |
| Stripe | Plan gratuit (3 adaptations) et plan Pro illimite |

---

## Architecture

```
cv-bot/
├── backend/                 # API FastAPI (Python 3.12)
│   ├── main.py              # Routes API (~1600 lignes)
│   ├── config.py            # Configuration (env vars)
│   ├── db.py                # Acces Supabase / fallback fichiers
│   ├── event_log.py         # Logs structures (memoire / analyse)
│   ├── cv_analytics.py      # Metriques de contenu CV
│   ├── template_registry.py # Registry des templates CV
│   ├── Dockerfile           # Image Docker backend
│   ├── requirements.txt     # Dependances pinnees
│   └── supabase_*.sql       # Schema + migrations Supabase
│
├── frontend/                # SPA React 19 + Vite 7
│   ├── src/
│   │   ├── App.jsx          # Composant principal
│   │   ├── api.js           # Client API (fetch wrapper)
│   │   ├── lib/supabase.js  # Client Supabase
│   │   ├── constants.js     # Constantes partagees
│   │   └── components/      # AuthForm, ProfileView, LandingPage, etc.
│   ├── Dockerfile           # Multi-stage build (Node → nginx)
│   ├── nginx.conf           # Reverse proxy + SPA fallback
│   └── package.json
│
├── templates/               # Templates CV (HTML/CSS/JSON)
│   ├── classic/
│   ├── modern/
│   └── minimal/
│
├── adapter.py               # Logique d'adaptation IA (Gemini)
├── generator.py             # Generation PDF (WeasyPrint)
├── letter_generator.py      # Generation lettre de motivation
├── export_package.py        # Export dossier candidature
├── mots_cles.py             # Extraction mots-cles
├── rules.py                 # Regles de scoring ATS
├── main.py                  # CLI (setup, adaptation, PDF)
│
├── docker-compose.yml       # Orchestration prod
├── .env.production.example  # Template variables de prod
└── .env.example             # Template variables de dev
```

### Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19, Vite 7, react-router-dom 7, Supabase Auth |
| Backend | FastAPI 0.128, uvicorn, Jinja2 |
| IA | Google Gemini (gemini-2.5-flash-lite / gemini-2.0-flash) |
| PDF | WeasyPrint 68 |
| Base de donnees | Supabase (PostgreSQL) ou fallback fichiers JSON |
| Stockage fichiers | Supabase Storage (buckets prives, signed URLs) |
| Paiement | Stripe (checkout sessions, webhooks) |
| Monitoring | Prometheus (metriques), logs JSON structures |
| Deploiement | Docker, docker-compose, nginx |

---

## Demarrage rapide (dev local)

### Prerequis

- Python 3.10+
- Node.js 18+
- Un projet [Supabase](https://supabase.com) (gratuit) pour l'auth et le stockage
- Une cle API [Google Gemini](https://aistudio.google.com/app/apikey) (gratuite)

### 1. Backend

```bash
cd cv-bot
cp .env.example .env
# Editer .env : mettre au minimum GEMINI_API_KEY

pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# Editer .env : VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

npm install
npm run dev
```

### 3. Ouvrir

[http://localhost:5173](http://localhost:5173)

---

## Variables d'environnement

### Backend (`.env` a la racine de `cv-bot`)

| Variable | Description | Requis |
|----------|-------------|--------|
| `GEMINI_API_KEY` | Cle API Google AI (Gemini) | Oui |
| `SUPABASE_URL` | URL du projet Supabase | Oui (prod) |
| `SUPABASE_SERVICE_KEY` | Cle `service_role` Supabase | Oui (prod) |
| `SUPABASE_JWT_SECRET` | JWT Secret (Dashboard > API) | Oui (prod) |
| `CV_BOT_API_BASE_URL` | URL publique du backend (HTTPS en prod) | Non |
| `CV_BOT_FRONTEND_URL` | URL publique du frontend (CORS + Stripe redirect) | Oui (prod) |
| `ENVIRONMENT` | `development` ou `production` | Non (default: development) |
| `STRIPE_SECRET_KEY` | Cle secrete Stripe | Non |
| `STRIPE_PRICE_ID_PRO_MONTHLY` | Price ID Stripe pour l'abo Pro | Non |
| `STRIPE_WEBHOOK_SECRET` | Secret webhook Stripe | Non |
| `METRICS_AUTH_TOKEN` | Token pour proteger `/metrics` | Non |
| `LOGO_DEV_TOKEN` | Token publishable Logo.dev | Non |
| `WEASYPRINT_DLL_DIRECTORIES` | (Windows) Chemin DLL Pango/GTK | Windows only |
| `CV_BOT_EXPORT_BASE` | Dossier racine export candidatures | Non |

### Frontend (`frontend/.env`)

| Variable | Description | Requis |
|----------|-------------|--------|
| `VITE_API_URL` | URL du backend (`http://localhost:8000` en dev, vide en prod) | Dev only |
| `VITE_SUPABASE_URL` | URL du projet Supabase | Oui |
| `VITE_SUPABASE_ANON_KEY` | Cle `anon` Supabase | Oui |

---

## Supabase

### Schema initial

Executer dans Supabase Dashboard > SQL Editor :

1. `backend/supabase_schema.sql` - tables `cv_base` et `applications`

### Migrations (dans l'ordre)

| Fichier | Description |
|---------|-------------|
| `supabase_migration_applications_user_id.sql` | Colonne `user_id` sur `applications` |
| `supabase_migration_events.sql` | Table `events` (logs structures) |
| `supabase_migration_user_plans.sql` | Table `user_plans` (free/pro, Stripe) |
| `supabase_migration_user_plans_paywall_disabled.sql` | Colonne `paywall_disabled` |
| `supabase_migration_storage_cv_photos.sql` | Bucket Storage `cv_photos` |
| `supabase_migration_storage_application_docs.sql` | Bucket Storage `application_docs` |
| `supabase_migration_rls_service_role_only.sql` | RLS : politiques limitées au rôle `service_role` (corrige le linter) |

---

## WeasyPrint (generation PDF)

| OS | Installation |
|----|-------------|
| **Windows** | Installer [MSYS2](https://www.msys2.org/), puis `pacman -S mingw-w64-x86_64-pango`. Mettre `WEASYPRINT_DLL_DIRECTORIES=C:\msys64\mingw64\bin` dans `.env`. |
| **macOS** | `brew install pango gdk-pixbuf libffi` |
| **Linux** | `sudo apt-get install libpango-1.0-0 libgdk-pixbuf2.0-0 libffi-dev` |
| **Docker** | Automatique (les libs sont dans le Dockerfile backend) |

---

## Ligne de commande (CLI)

| Commande | Description |
|----------|-------------|
| `python main.py --setup` | Questionnaire interactif pour creer `cv_base.json` |
| `python main.py --description "texte..." -o ./cvs` | Adapter le CV et generer le PDF |
| `python main.py --description-file fiche.txt -o ./cvs` | Idem avec un fichier |
| `python main.py --pdf-only -o .` | Generer un PDF sans adaptation IA |
| `python preview.py` | Generer `preview.html` pour previsualiser le template |

---

## Deploiement Docker (production)

> Guide detaille dans [DEPLOY.md](DEPLOY.md)

### Resume

```bash
# 1. Configurer
cp .env.production.example .env
# Editer .env avec tes vraies cles

# 2. Build et lancer
docker compose build
docker compose up -d

# 3. Verifier
curl http://localhost/health
```

Le frontend (nginx) ecoute sur le port 80, proxie `/api/` vers le backend.
Il faut un reverse proxy externe (Caddy, nginx, ou Cloudflare) pour HTTPS.

---

## Donnees et fichiers

| Fichier / dossier | Role |
|-------------------|------|
| `cv_base_vierge.json` | Structure vide du CV (template) |
| `cv_base.json` | Ton CV de base (gitignore) |
| `adaptations/` | Adaptations par offre (gitignore) |
| `logs/` | Logs structures JSONL (gitignore) |
| `assets/` | Photo CV (gitignore) |
| `templates/` | Templates CV (classic, modern, minimal) |

---

## API

En mode development, la doc interactive est accessible sur :

- Swagger : [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc : [http://localhost:8000/redoc](http://localhost:8000/redoc)

> En production, Swagger/ReDoc sont desactives automatiquement.

### Endpoints principaux

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cv` | CV de l'utilisateur |
| PUT | `/api/cv` | Sauvegarder le CV de base |
| POST | `/api/adapt` | Adapter le CV a une offre |
| POST | `/api/adapt-refine` | Affiner par instruction chat |
| POST | `/api/pdf` | Generer le CV en PDF |
| POST | `/api/render-html` | Rendu HTML du CV (preview) |
| POST | `/api/cv/import` | Importer un CV (PDF/Word) |
| GET | `/api/applications` | Lister les candidatures |
| POST | `/api/applications` | Creer une candidature manuelle |
| PATCH | `/api/applications/:id` | Mettre a jour statut/infos |
| GET | `/api/templates` | Lister les templates disponibles |
| GET | `/health` | Health check |
| GET | `/metrics` | Metriques Prometheus (protege) |

---

## Depannage

| Probleme | Solution |
|----------|----------|
| Erreur 429 (Gemini) | Limite d'appels depassee, l'app reessaie apres 15 s |
| WeasyPrint / erreur PDF | Verifier l'installation (voir section WeasyPrint) |
| `cannot load library 'libgobject-2.0-0'` (Windows) | Installer MSYS2 + Pango, definir `WEASYPRINT_DLL_DIRECTORIES` |
| Build frontend echoue | Verifier que `frontend/src/lib/supabase.js` existe |
| CORS errors en prod | Verifier `CV_BOT_FRONTEND_URL` dans `.env` |
| 401 sur toutes les routes | Verifier `SUPABASE_JWT_SECRET` dans `.env` |

---

## Licence

Developpe par **Axel Project** (SAS - 989 841 911 R.C.S. Nanterre).
Open source sous **licence MIT**. Voir [LICENSE](LICENSE).
