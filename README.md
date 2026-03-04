<div align="center">

# 📄 CV Bot

**Un CV, des offres. Ton CV s’adapte à chaque fiche de poste.**

Colle l’annonce → l’IA (Gemini) adapte résumé et bullet points → tu récupères le **CV**, la **lettre de motivation** et la **fiche de poste** en PDF.

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## ✨ À propos

CV Bot te permet de garder **un seul CV de base** (template HTML/CSS + données JSON) et de générer pour chaque offre :

- un **CV adapté** aux mots-clés de l’annonce (résumé et expériences reformulés par Gemini),
- une **lettre de motivation** générée par l’IA,
- la **fiche de poste** en PDF.

Pas de scraping : tu colles le texte de l’annonce, tout se fait à partir de ça.

| Tu peux… | Comment |
|----------|--------|
| Utiliser l’interface web | React + FastAPI : profil, annonce, adaptation, export PDF, suivi des candidatures |
| Tout faire en CLI | `main.py` pour adapter à une fiche et générer les PDF |
| Exporter un dossier candidature | Un sous-dossier « Entreprise - Poste » avec CV + lettre + fiche en PDF |

---

## 🚀 Démarrage rapide

> Tu veux juste l’interface web ? Voici le minimum.

1. **Cloner et préparer l’environnement**

```bash
cd cv-bot
pip install -r backend/requirements.txt
```

2. **Créer ton fichier `.env`** à la racine de `cv-bot` (voir [Variables d’environnement](#-variables-denvironnement)) avec au minimum :

```env
GEMINI_API_KEY=ta_cle_gemini
```

*(Clé gratuite : [Google AI Studio](https://aistudio.google.com/app/apikey))*

3. **Lancer le backend**

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

4. **Dans un autre terminal, lancer le frontend**

```bash
cd frontend
cp .env.example .env
# Optionnel : éditer .env et mettre VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

5. **Ouvrir** [http://localhost:5173](http://localhost:5173)

Au premier lancement, tu devras configurer ton CV (onglet **Profil**) ou utiliser le questionnaire en ligne de commande : `python main.py --setup`.

---

## 📑 Sommaire

- [Installation](#-installation)
- [Lancer l’application](#-lancer-lapplication)
- [Variables d’environnement](#-variables-denvironnement)
- [WeasyPrint (génération PDF)](#-weasyprint-génération-pdf)
- [Données et fichiers](#-données-et-fichiers)
- [Ligne de commande](#-ligne-de-commande)
- [Dépannage](#-dépannage)
- [Licence](#-licence)

---

## 📦 Installation

**Prérequis :** Python 3.10+, Node.js (pour l’interface web).

Depuis la racine du projet :

```bash
cd cv-bot
pip install -r requirements.txt
```

*(Pour l’app web uniquement, `pip install -r backend/requirements.txt` suffit.)*

---

## 🖥️ Lancer l’application

### Interface web (React + FastAPI)

**1. Backend** — À la racine de `cv-bot` :

```bash
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

- API : [http://localhost:8000](http://localhost:8000)
- Santé : [http://localhost:8000/health](http://localhost:8000/health)
- Métriques (Prometheus) : [http://localhost:8000/metrics](http://localhost:8000/metrics)

**2. Frontend** — Dans un second terminal :

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Ouvre [http://localhost:5173](http://localhost:5173).

Le frontend lit `VITE_API_URL` dans `frontend/.env` (défaut : `http://localhost:8000`). Pour l’auth Supabase, configure aussi `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans ce même fichier.

**3. Premier lancement**

Le fichier `cv_base.json` (tes infos CV) n’est pas dans le dépôt. Tu peux :

- soit lancer le questionnaire : `python main.py --setup` ;
- soit copier `cv_base_vierge.json` en `cv_base.json` et le remplir à la main ;
- soit tout faire depuis l’onglet **Profil** de l’interface (avec Supabase, les données sont stockées en base).

---

## 🔐 Variables d’environnement

Le fichier **`.env`** est à la **racine de `cv-bot`**. Ne le commite pas (il est dans `.gitignore`).

```bash
cp .env.example .env
```

| Variable | Description | Obligatoire |
|----------|-------------|-------------|
| `GEMINI_API_KEY` | Clé API Google AI (Gemini). [Clé gratuite ici](https://aistudio.google.com/app/apikey). | Oui (pour l’adaptation IA) |
| `WEASYPRINT_DLL_DIRECTORIES` | **(Windows)** Chemin vers les DLL Pango/GTK (ex. `C:\msys64\mingw64\bin`). Voir [WeasyPrint](#-weasyprint-génération-pdf). | Oui sur Windows (PDF) |
| `CV_BOT_EXPORT_BASE` | Dossier racine pour les exports « dossier candidature » (ex. `D:\Candidatures`). | Non |
| `SUPABASE_URL` | URL du projet Supabase (backend). | Non (sinon fallback `cv_base.json` + `adaptations/`) |
| `SUPABASE_SERVICE_KEY` | Clé **service_role** Supabase. | Non |
| `SUPABASE_JWT_SECRET` | JWT Secret (Dashboard Supabase → API) pour l’auth. | Si tu utilises l’auth Supabase |

**Exemple minimal (Windows) :**

```env
GEMINI_API_KEY=ta_cle_gemini
WEASYPRINT_DLL_DIRECTORIES=C:\msys64\mingw64\bin
```

**Exemple minimal (Linux / macOS) :**

```env
GEMINI_API_KEY=ta_cle_gemini
```

Sur Linux/macOS, installe les paquets système pour WeasyPrint (voir ci-dessous).

---

## 📄 WeasyPrint (génération PDF)

Sans WeasyPrint, l’adaptation et l’interface marchent, mais la génération de PDF échouera.

| OS | À faire |
|----|--------|
| **Windows** | 1. Installer [MSYS2](https://www.msys2.org/).<br>2. Dans le shell MSYS2 : `pacman -S mingw-w64-x86_64-pango`<br>3. Dans `.env` : `WEASYPRINT_DLL_DIRECTORIES=C:\msys64\mingw64\bin` |
| **macOS** | `brew install pango gdk-pixbuf libffi` |
| **Linux** | `sudo apt-get install libpango-1.0-0 libgdk-pixbuf2.0-0 libffi-dev` |

---

## 📁 Données et fichiers

| Fichier / dossier | Rôle |
|------------------|------|
| `cv_base_vierge.json` | Structure vide du CV. Copie en `cv_base.json` et remplis (ou utilise `python main.py --setup`). |
| `cv_base.json` | Ton CV (données). **Dans `.gitignore`** — à créer localement. |
| `preview_data.json` | Données de démo pour prévisualiser le template. |
| `assets/` | Mets ta **photo** ici : `photo.jpg`, `photo.jpeg`, `photo.png` ou `photo.webp`. Voir `assets/README.md`. |
| `adaptations/` | Fichiers d’adaptation par offre (générés par l’app). Dans `.gitignore`. |

**Prévisualiser le template sans lancer l’app :**

```bash
python preview.py
```

Puis ouvre `preview.html` dans le navigateur (fichier généré, ignoré par Git).

---

## ⌨️ Ligne de commande

Utile si tu veux tout faire sans interface web (ou pour scripter).

| Commande | Description |
|----------|-------------|
| `python main.py --setup` | Questionnaire interactif → enregistre dans `cv_base.json` |
| `python main.py --description "texte de l'annonce..." --output ./cvs` | Adapte le CV à la fiche et génère le PDF |
| `python main.py --description-file fiche.txt -o ./cvs` | Idem avec la fiche dans un fichier |
| `python main.py --pdf-only --output .` | Génère un PDF à partir de `cv_base.json` (sans IA) |
| `python preview.py` | Génère `preview.html` à partir de `preview_data.json` |

Exemple complet :

```bash
python main.py --description-file offre.txt --titre "Alternance Risk" --entreprise "Rothschild" -o ./cvs
```

---

## 🔧 Dépannage

| Problème | Solution |
|----------|----------|
| **Erreur 429 (Gemini)** | Limite d’appels dépassée. L’app réessaie après 15 s. |
| **WeasyPrint / erreur PDF** | Vérifier l’installation (voir [WeasyPrint](#-weasyprint-génération-pdf)). |
| **« cannot load library 'libgobject-2.0-0' » (Windows)** | Installer MSYS2, puis `pacman -S mingw-w64-x86_64-pango`, et définir `WEASYPRINT_DLL_DIRECTORIES` dans `.env`. Redémarrer l’app. |
| **`cv_base.json` introuvable** | Lancer `python main.py --setup` ou créer le fichier à partir de `cv_base_vierge.json`. |

---

## 📜 Licence

Ce projet est développé par **Axel Project** (SAS — 989 841 911 R.C.S. Nanterre).  
Il est **open source** et distribué sous **licence MIT** : utilisation, modification et redistribution libres. Voir [LICENSE](LICENSE).
