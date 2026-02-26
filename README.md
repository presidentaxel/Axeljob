# cv-bot — CV personnalisés par offre d'emploi

Outil pour générer des CV adaptés à chaque offre à partir d’un template HTML/CSS unique et d’un CV de base (JSON). L’IA (Google Gemini) adapte le résumé et les bullet points selon l’annonce ; le rendu reste maîtrisé par le template.

**Fonctionnalités :**
- Questionnaire interactif ou fichier JSON pour remplir ton CV une fois
- Interface web : coller l’annonce, adapter le CV avec Gemini, télécharger le PDF
- Ligne de commande : scraper une URL d’offre (ou coller la description), générer le PDF
- Export « dossier candidature » : CV + lettre + fiche de poste dans un sous-dossier

---

## Installation

### 1. Prérequis

- **Python 3.10+**
- **Playwright** (navigateur pour le scraping d’offres)

```bash
cd cv-bot
pip install -r requirements.txt
playwright install chromium
```

### 2. Variables d’environnement (fichier `.env`)

Le projet utilise un fichier **`.env`** à la racine de `cv-bot`. **Ne commite jamais ce fichier** (il est dans `.gitignore`).

Copie le modèle et complète les valeurs :

```bash
cp .env.example .env
```

Édite `.env` et renseigne au minimum :

| Variable | Description | Obligatoire |
|----------|-------------|-------------|
| **`GEMINI_API_KEY`** | Clé API Google AI (Gemini). Clé gratuite : [Google AI Studio](https://aistudio.google.com/app/apikey) | Oui pour l’adaptation IA |
| **`WEASYPRINT_DLL_DIRECTORIES`** | **(Windows uniquement)** Chemin vers les DLL Pango/GTK (ex. `C:\msys64\mingw64\bin`) pour que WeasyPrint génère le PDF. À remplir après avoir installé MSYS2 et `mingw-w64-x86_64-pango`. | Oui sur Windows pour le PDF |
| **`CV_BOT_EXPORT_BASE`** | Dossier racine où créer les sous-dossiers « Entreprise - Poste » (CV + lettre + fiche de poste). Ex. `D:\Candidatures` ou `/home/user/candidatures`. | Non (optionnel, pour l’export package) |

**Exemple `.env` (Windows) :**

```env
GEMINI_API_KEY=ta_cle_gemini_ici
CV_BOT_EXPORT_BASE=D:\Candidatures
WEASYPRINT_DLL_DIRECTORIES=C:\msys64\mingw64\bin
```

**Exemple `.env` (Linux / macOS) :**

```env
GEMINI_API_KEY=ta_cle_gemini_ici
CV_BOT_EXPORT_BASE=/home/vous/candidatures
```

Sur Linux/macOS, pas besoin de `WEASYPRINT_DLL_DIRECTORIES` ; installe les paquets système (voir section WeasyPrint ci-dessous).

### 3. WeasyPrint (génération PDF)

- **Windows**  
  1. Installer [MSYS2](https://www.msys2.org/).  
  2. Dans le shell MSYS2 : `pacman -S mingw-w64-x86_64-pango`  
  3. Dans ton `.env`, définir `WEASYPRINT_DLL_DIRECTORIES` vers le dossier `bin` (ex. `C:\msys64\mingw64\bin`).

- **macOS** : `brew install pango gdk-pixbuf libffi`  
- **Linux** : `sudo apt-get install libpango-1.0-0 libgdk-pixbuf2.0-0 libffi-dev`

---

## Lancer l’application

**Premier lancement (après un clone)** : tu dois d’abord avoir un fichier `cv_base.json`. Soit tu lances `python main.py --setup` pour le remplir via le questionnaire, soit tu copies `cv_base_vierge.json` vers `cv_base.json` et tu le complètes à la main.

### Interface web (recommandé)

```bash
python app.py
```

Puis ouvre [http://localhost:5000](http://localhost:5000). Tu peux :
- Voir l’aperçu du CV (basé sur `cv_base.json`)
- Coller l’annonce dans la zone de texte
- Cliquer sur « Adapter le CV avec Gemini » puis « Télécharger le PDF »

La clé **`GEMINI_API_KEY`** doit être définie dans `.env` pour l’adaptation.

### Ligne de commande

- **Configurer le CV (une fois)**  
  Questionnaire interactif → enregistrement dans `cv_base.json` :

  ```bash
  python main.py --setup
  ```

- **Générer un CV adapté à une offre (URL)**  
  Scraping de l’offre, score de pertinence, adaptation Gemini, génération du PDF :

  ```bash
  python main.py --url "https://..." --output ./cvs
  ```

- **Générer un PDF sans adaptation** (test du rendu) :

  ```bash
  python main.py --pdf-only --output .
  ```

---

## Données CV : JSON vierge et démo

- **`cv_base_vierge.json`** — Template vide avec toutes les balises. Tu peux le copier en `cv_base.json` et le remplir à la main, ou t’en inspirer pour la structure.
- **`preview_data.json`** — Données de démo (nom et expériences fictives) pour prévisualiser le template **avant** d’ajouter tes données.

**Prévisualisation du template (sans l’app, sans PDF) :**

```bash
python preview.py
```

Puis ouvre `preview.html` dans un navigateur. Le rendu utilise `preview_data.json` (démo). Une fois ton `cv_base.json` rempli, l’interface web et le PDF utiliseront tes vraies données.

---

## Fichiers à ne pas commiter (déjà dans `.gitignore`)

- **`.env`** — Clés API et chemins personnels
- **`*.pdf`** — PDF générés
- **`adaptations/*.json`** — Fichiers d’adaptation par offre (peuvent contenir des extraits de ton CV)
- Dossiers Python / venv / IDE usuels

Tu peux aussi ajouter `cv_base.json` dans `.gitignore` si tu ne veux pas le pousser sur GitHub.

---

## Récapitulatif des commandes

| Commande | Description |
|----------|-------------|
| `python app.py` | Lance l’interface web (port 5000) |
| `python main.py --setup` | Questionnaire pour remplir `cv_base.json` |
| `python main.py --url "URL"` | Scraper l’offre, adapter le CV, générer le PDF |
| `python main.py --pdf-only` | Générer un PDF à partir de `cv_base.json` (sans IA) |
| `python preview.py` | Générer `preview.html` à partir de `preview_data.json` |

---

## Gestion des erreurs

- **Scraping impossible** : le script propose de coller la description du poste au clavier.
- **Limite d’appels Gemini (429)** : attente 15 s puis nouvel essai automatique.
- **WeasyPrint manquant / erreur PDF** : vérifier l’installation (MSYS2 + `WEASYPRINT_DLL_DIRECTORIES` sur Windows, paquets système sur Linux/macOS).

---

## Licence / contribution

Projet personnel ; tu peux le forker et l’adapter à tes besoins. Aucun secret (`.env`, PDF, etc.) ne doit être poussé sur GitHub.
