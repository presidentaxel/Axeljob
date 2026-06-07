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
| Templates CV | Classic, Modern, Minimal + templates personnalisés (Supabase, accès par user_id) |
| Import CV | Import PDF/Word existant, l'IA le structure automatiquement |
| Suivi candidatures | Kanban avec statuts, questionnaires refus/entretien, export CSV |
| Export dossier | ZIP ou dossier local avec CV + lettre + fiche de poste |
| Stripe | Plan gratuit (3 adaptations) et plan Pro illimite |

---

## Architecture

```
cv-bot/
├── backend/                 # API FastAPI (Python 3.12)
│   ├── main.py              # Routes API (orchestration HTTP)
│   ├── config.py            # Configuration (env vars)
│   ├── db.py                # Acces Supabase / fallback fichiers
│   ├── event_log.py         # Logs structures (memoire / analyse)
│   ├── cv_analytics.py      # Metriques de contenu CV
│   ├── cv_html_render.py    # Rendu HTML CV (render_cv_html, caches Jinja)
│   ├── template_registry.py # Registry des templates CV
│   ├── Dockerfile           # Image Docker backend
│   ├── requirements.txt     # Dependances pinnees
│   ├── scripts/             # Scripts utilitaires
│   │   └── cv_pdf_to_template.py  # Import PDF → template (couleurs extraites, insere en __pending__)
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
├── backend/templates/documents/ # Templates PDF lettre + fiche de poste
│   ├── letter_template.html
│   ├── letter_template.css
│   ├── fiche_poste_template.html
│   └── fiche_poste_template.css
│
├── backend/services/        # Services metier (adaptation, render CV, billing, PDF, export)
│   ├── adapter.py
│   ├── cv_render_helpers.py
│   ├── cv_select_a4.py
│   ├── billing_notifications.py
│   ├── generator.py
│   ├── letter_generator.py
│   ├── mots_cles.py
│   └── export_package.py
├── backend/services/rules.py # Regles de scoring ATS
│
├── docker-compose.yml       # Orchestration prod
└── .env.example             # Template variables (dev/prod via ENVIRONMENT)
```

### Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19, Vite 7, react-router-dom 7, Supabase Auth |
| Backend | FastAPI 0.128, uvicorn, Jinja2 |
| IA | Google Gemini (modèles configurables via variables d'environnement) |
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
cd cv-bot
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
| `GEMINI_MODEL` | Modèle Gemini par défaut (adaptation, lettre, A4) | Non |
| `GEMINI_MODEL_LINKEDIN` | Modèle Gemini pour adaptation des champs LinkedIn | Non |
| `GEMINI_MODEL_IMPORT` | Modèle Gemini pour l'import CV texte -> JSON | Non |
| `GEMINI_MODELS_VISION` | Liste CSV ordonnée de modèles Gemini vision (import PDF -> template) | Non |
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
| `supabase_migration_cv_templates.sql` | Table `cv_templates` (templates perso HTML/CSS, owner + allowed_user_ids) |
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

## Scripts de maintenance

| Commande | Description |
|----------|-------------|
| **`python -m backend.scripts.cv_pdf_to_template`** | **Ouvre l'explorateur de fichiers → tu choisis un PDF → le script extrait les couleurs, genere un template HTML/CSS et l'insere dans Supabase en `__pending__` (personne ne le voit ; un humain assigne ensuite `owner_user_id` et `allowed_user_ids` dans la table `cv_templates`).** |
| `python -m backend.scripts.cv_pdf_to_template "chemin/vers/CV.pdf"` | Idem en passant le chemin du PDF en argument |
| `python -m backend.scripts.cv_pdf_to_template "CV.pdf" --name "Mon template"` | Avec nom et description optionnels |

### Import d'un PDF en template (une commande, design reproduit par l'IA)

Depuis la racine `cv-bot`, lance :

```bash
python -m backend.scripts.cv_pdf_to_template
```

L'explorateur de fichiers s'ouvre : tu choisis ton CV (PDF). Le script :

1. **Si `GEMINI_API_KEY` est définie** : envoie la première page du PDF à Gemini, qui génère un template HTML/CSS qui **reproduit le design** (mise en page, couleurs, polices) pour un vrai effet « copier-coller » visuel. Les variables Jinja2 (prénom, nom, expériences, etc.) sont injectées pour que le CV généré par l'app utilise ce design.
2. **Sinon ou en cas d'échec IA** : extraction des couleurs dominantes + template « classic » avec ces couleurs.
3. Insertion dans Supabase (`cv_templates`) avec `owner_user_id = '__pending__'` et `allowed_user_ids = []`.

Option **`--no-ai`** : ne pas appeler l'IA, uniquement couleurs + template classic.

Aucun utilisateur ne voit le template tant qu'un humain n'a pas fait la liaison dans Supabase (Table Editor → `cv_templates` : mettre `owner_user_id` et/ou `allowed_user_ids` sur la ligne concernée).

---

## Deploiement Docker (production)

> Guide detaille dans [docs/deploy.md](docs/deploy.md) - aide-memoire commandes (dev, Docker, SSH) : [docs/ops-commands.md](docs/ops-commands.md)

### Resume

```bash
# 1. Configurer
cp .env.example .env
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
| `docs/examples/cv_base_vierge.json` | Structure vide du CV (template) |
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
| GET | `/api/templates` | Lister les templates (fichiers + perso Supabase pour l'utilisateur connecté) |
| POST | `/api/templates/custom` | Créer un template personnalisé (HTML/CSS, `allowed_user_ids`) |
| PATCH | `/api/templates/custom/:id` | Modifier un template (owner uniquement) |
| DELETE | `/api/templates/custom/:id` | Supprimer un template (owner uniquement) |
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

## Workflow equipe (pro)

Le projet inclut des standards de contribution et des quality gates :

- Guide contribution : `docs/contributing.md`
- Guide bonnes pratiques : `docs/guide-bonnes-pratiques.md`
- Audit conformité guide : `docs/conformity-audit.md`
- Politique securite : `docs/security.md`
- Standards engineering : `docs/engineering-standards.md`
- CI GitHub Actions : `.github/workflows/ci.yml`
- Workflow securite : `.github/workflows/security.yml` (CodeQL, Gitleaks, pip-audit)
- Dependabot : `.github/dependabot.yml`
- Qualite Python : `pyproject.toml` (`ruff`, `black`, `mypy`, `pytest`), gate CI sur rendu CV (`cv_render_helpers`, `cv_html_render`, seuil dans `ci.yml`)
- Hooks Git : `.pre-commit-config.yaml`

### Setup qualite local (venv recommande)

```bash
cd cv-bot
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

python -m pip install --upgrade pip
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
pip install black ruff mypy pytest pytest-cov pre-commit bandit pip-audit
npm --prefix frontend ci
pre-commit install
```

### Verification avant PR

```bash
ruff check .
black --check .
mypy backend
pytest tests
pytest tests --cov=backend.services.cv_render_helpers --cov=backend.cv_html_render --cov-report=term-missing --cov-fail-under=62
bandit -r backend -c pyproject.toml
pip-audit -r backend/requirements.txt
npm --prefix frontend run lint
```

---

## Licence

Developpe par **Axel Project** (SAS - 989 841 911 R.C.S. Nanterre).
Open source sous **licence MIT**. Voir [LICENSE](LICENSE).
