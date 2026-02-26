# cv-bot — CV personnalisés par fiche de poste

Outil pour générer des CV adaptés à chaque offre à partir d’un template HTML/CSS unique et d’un CV de base (JSON). **Dépôt de la fiche de poste** (texte) → l’IA (Google Gemini) adapte le résumé et les bullet points → génération du **CV**, de la **lettre de motivation** et de la **fiche de poste** en PDF. Pas de scraping : tout se fait à partir du texte que tu déposes.

**Fonctionnalités :**
- Questionnaire interactif ou fichier JSON pour remplir ton CV une fois
- Interface web : coller la fiche de poste, adapter le CV avec Gemini, télécharger le PDF (CV, lettre, fiche de poste)
- Ligne de commande : passer la fiche de poste en texte ou fichier, générer le PDF
- Export « dossier candidature » : un sous-dossier par candidature avec CV + lettre + fiche de poste

---

## Installation

### 1. Prérequis

- **Python 3.10+**

```bash
cd cv-bot
pip install -r requirements.txt
```

(Aucun navigateur ni Playwright : pas de scraping.)

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

**Premier lancement (après un clone)** : `cv_base.json` et `preview.html` ne sont pas dans le dépôt (ils sont dans le `.gitignore` pour ne pas exposer tes infos). Tu dois créer **`cv_base.json`** : soit `python main.py --setup` (questionnaire), soit copie `cv_base_vierge.json` vers `cv_base.json` puis complète-le à la main.

### Interface web (recommandé)

```bash
python app.py
```

Puis ouvre [http://localhost:5000](http://localhost:5000). Tu peux :
- Voir l’aperçu du CV (basé sur `cv_base.json`)
- **Déposer la fiche de poste** (coller le texte de l’annonce)
- Cliquer sur « Adapter le CV avec Gemini » puis télécharger le **CV PDF**, et éventuellement exporter le **dossier candidature** (CV + lettre + fiche de poste)

La clé **`GEMINI_API_KEY`** doit être définie dans `.env` pour l’adaptation.

### Ligne de commande

- **Configurer le CV (une fois)**  
  Questionnaire interactif → enregistrement dans `cv_base.json` :

  ```bash
  python main.py --setup
  ```

- **Adapter à une fiche de poste et générer le PDF**  
  Texte de la fiche en argument ou dans un fichier :

  ```bash
  python main.py --description "Alternance Risk Management. Missions : ..." --output ./cvs
  python main.py --description-file fiche.txt --titre "Alternance Risk" --entreprise "Rothschild" -o ./cvs
  ```

- **Générer un PDF sans adaptation** (test du rendu) :

  ```bash
  python main.py --pdf-only --output .
  ```

---

## Données CV : JSON vierge, démo et photo

- **`cv_base_vierge.json`** — Template vide avec toutes les balises. Après un clone, copie-le en **`cv_base.json`** et remplis-le (ou lance `python main.py --setup`). **`cv_base.json` est dans le `.gitignore`** : il ne sera pas poussé en ligne.
- **`preview_data.json`** — Données de démo (nom et expériences fictives) pour prévisualiser le template **avant** d’ajouter tes données.
- **Photo du CV** — Place **ta photo** dans le dossier **`assets/`** pour qu’elle apparaisse sur le CV et le PDF. Fichiers reconnus : `photo.jpg`, `photo.jpeg`, `photo.png` ou `photo.webp` (un seul fichier utilisé). Voir `assets/README.md` pour les détails. **Les images dans `assets/` sont dans le `.gitignore`** : elles ne sont pas versionnées ni poussées en ligne, tu dois les ajouter localement après un clone.

**Prévisualisation du template (sans l’app, sans PDF) :**

```bash
python preview.py
```

Puis ouvre **`preview.html`** dans un navigateur (ce fichier est généré et ignoré par Git, il ne sera pas poussé en ligne). Le rendu utilise `preview_data.json` (démo). Une fois ton `cv_base.json` rempli, l’interface web et le PDF utiliseront tes vraies données.

---

## Fichiers à ne pas commiter (déjà dans `.gitignore`)

- **`.env`** — Clés API et chemins personnels
- **`*.pdf`** — PDF générés
- **`cv_base.json`** — Tes infos CV (nom, expériences, etc.) ; à créer localement après un clone (copie de `cv_base_vierge.json` ou `python main.py --setup`).
- **`preview.html`** — Fichier généré par `python preview.py` ; il contient les données utilisées pour l’aperçu (donc tes infos si tu as lancé le preview avec ton CV). Ne pas pousser en ligne.
- **`assets/*.jpg`, `assets/*.png`, etc.** — Photos du CV (à ajouter localement). Si des photos ont déjà été commitées : `git rm --cached assets/*.jpg assets/*.png` puis commit.
- **`adaptations/*.json`** — Fichiers d’adaptation par offre (peuvent contenir des extraits de ton CV)
- Dossiers Python / venv / IDE usuels

Si `cv_base.json` ou `preview.html` ont déjà été commitées, exécute `git rm --cached cv_base.json preview.html` puis commit à nouveau pour les retirer du dépôt.

---

## Récapitulatif des commandes

| Commande | Description |
|----------|-------------|
| `python app.py` | Lance l’interface web (port 5000) |
| `python main.py --setup` | Questionnaire pour remplir `cv_base.json` |
| `python main.py --description "..."` | Adapter le CV à la fiche de poste et générer le PDF |
| `python main.py --description-file fiche.txt` | Idem avec la fiche dans un fichier |
| `python main.py --pdf-only` | Générer un PDF à partir de `cv_base.json` (sans IA) |
| `python preview.py` | Générer `preview.html` à partir de `preview_data.json` |

---

## Gestion des erreurs

- **Limite d’appels Gemini (429)** : attente 15 s puis nouvel essai automatique.
- **WeasyPrint manquant / erreur PDF** : vérifier l’installation (MSYS2 + `WEASYPRINT_DLL_DIRECTORIES` sur Windows, paquets système sur Linux/macOS).

---

## Licence

Ce logiciel appartient à **Axel Project** (SAS, société par actions simplifiée — 989 841 911 R.C.S. Nanterre, création 31/07/2025, activité : Conseil en systèmes et logiciels informatiques, code NAF/APE 62.02A).

**Il est open source et le restera.** Il est distribué sous licence MIT : tu peux l’utiliser, le modifier et le redistribuer librement. Voir le fichier [LICENSE](LICENSE) pour le texte complet.
