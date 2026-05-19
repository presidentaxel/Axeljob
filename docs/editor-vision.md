# Vision Éditeur de CV : L1 → L3 + Score ATS

> Document de référence autonome. Il décrit la cible produit, l'architecture, les schémas JSON, le système de scoring ATS, et les règles de code et de test associées. Quiconque lit ce document doit pouvoir comprendre **où on va**, **pourquoi**, et **comment contribuer** sans connaissance préalable du repo.

## Sommaire

1. [Préambule — pour quelqu'un qui débarque](#1-préambule--pour-quelquun-qui-débarque)
2. [Glossaire](#2-glossaire)
3. [État actuel du produit](#3-état-actuel-du-produit)
4. [Vision cible en une phrase](#4-vision-cible-en-une-phrase)
5. [Niveau L1 — Édition inline (Word-like)](#5-niveau-l1--édition-inline-word-like)
6. [Niveau L2 — Mise en page configurable](#6-niveau-l2--mise-en-page-configurable)
7. [Niveau L3 — Canvas libre (Canva-like)](#7-niveau-l3--canvas-libre-canva-like)
8. [Le double schéma JSON : `cv` + `layout`](#8-le-double-schéma-json--cv--layout)
9. [Score ATS : Parsing + Match](#9-score-ats--parsing--match)
10. [Architecture cible (front + back)](#10-architecture-cible-front--back)
11. [Pipeline d'export PDF (parité écran / PDF)](#11-pipeline-dexport-pdf-parité-écran--pdf)
12. [Règles de code](#12-règles-de-code)
13. [Règles de tests](#13-règles-de-tests)
14. [Roadmap de livraison](#14-roadmap-de-livraison)
15. [Risques produit et techniques](#15-risques-produit-et-techniques)
16. [Annexes — schémas JSON complets](#16-annexes--schémas-json-complets)

---

## 1. Préambule — pour quelqu'un qui débarque

**cv-bot** est une plateforme SaaS qui aide un utilisateur à :

1. saisir son CV de base (profil, expériences, formations, compétences) ;
2. l'adapter automatiquement à une offre d'emploi via une IA (Gemini) ;
3. exporter le résultat en PDF mis en page selon un template (Minimal, Modern, Classic, etc.).

Stack haut niveau :

| Couche | Technologie |
| --- | --- |
| Frontend | React 19 + Vite 7 (SPA) |
| Backend | FastAPI (Python 3.x) |
| Base & auth | Supabase (Postgres + Auth) |
| IA | Gemini (via `backend/services/adapter.py`, `offre_infer.py`) |
| PDF | WeasyPrint (HTML/CSS → PDF) |
| Templates | HTML + CSS statiques dans `templates/<id>/` |
| Paiement | Stripe |

Aujourd'hui, l'utilisateur édite son CV via un **formulaire à champs** (`frontend/src/components/ProfileView.jsx`) avec un aperçu PDF à droite. Le but de ce document est de décrire la **nouvelle expérience d'édition** que l'on veut livrer, en trois niveaux d'ambition (L1, L2, L3), accompagnée d'un système de **scoring ATS** unique sur le marché.

> [!IMPORTANT]
> Le présent document est **prospectif**. Il décrit la cible et le chemin pour y arriver. Il ne décrit pas l'état actuel exhaustif (voir `docs/guide-bonnes-pratiques.md` pour cela).

---

## 2. Glossaire

| Terme | Définition |
| --- | --- |
| **CV (objet)** | Structure JSON sémantique représentant le contenu du CV (nom, expériences, etc.). Voir `frontend/src/data/cvDefault.js`. |
| **Layout (objet)** | Structure JSON décrivant la mise en page visuelle (positions, tailles, thème). N'existe pas encore, introduit par ce document. |
| **Template** | Mise en page préfabriquée livrée par le produit (Minimal, Modern…). Dossiers `templates/<id>/`. |
| **Bloc** | Unité de mise en page dans le nouveau modèle Layout. Peut être sémantique (lié à une donnée du CV) ou libre (texte/forme arbitraire). |
| **ATS** | _Applicant Tracking System_. Logiciel des recruteurs qui parse le PDF pour en extraire le texte. Workday, Taleo, Greenhouse, Lever, iCIMS, etc. |
| **Score Parsing** | Note 0-100 estimant la qualité de lecture machine du PDF. Dépend du layout. |
| **Score Match** | Note 0-100 estimant la couverture des mots-clés et exigences de l'offre par le CV. Dépend du contenu. |
| **Ground truth (parsing)** | Validation du Score Parsing par extraction réelle du texte du PDF généré (PyMuPDF / pdfplumber). |
| **WYSIWYG** | _What You See Is What You Get_. L'écran doit afficher exactement ce que produira le PDF. |
| **A4** | Format de page cible (210 × 297 mm). |
| **`contentEditable`** | Attribut HTML qui rend un élément éditable directement par l'utilisateur. Déjà utilisé dans `CvEditablePreview.jsx`. |

---

## 3. État actuel du produit

### 3.1 Composants clés existants

| Fichier | Rôle |
| --- | --- |
| `frontend/src/components/ProfileView.jsx` | Page `/app/profil` actuelle : formulaire à gauche, aperçu à droite, auto-save. |
| `frontend/src/components/CvEditablePreview.jsx` | Composant d'aperçu **déjà éditable inline** (`contentEditable`). Cœur de L1. |
| `frontend/src/components/TemplatePicker.jsx` | Barre + modal de sélection de template, couleurs, typographie. À éclater dans une topbar en L1+. |
| `frontend/src/data/cvDefault.js` | Schéma du CV sémantique. |
| `templates/<id>/template.html` + `template.css` + `meta.json` | Templates HTML/CSS, rendus côté serveur via Jinja + WeasyPrint. |
| `backend/main.py` | Routes FastAPI (`/api/render-html`, `/api/pdf`, `/api/cv`, …). |
| `backend/services/cv_render_helpers.py`, `backend/cv_pdf_weasyprint.py` | Pipeline de rendu HTML/PDF. |
| `backend/services/adapter.py`, `services/offre_infer.py`, `services/mots_cles.py` | Logique IA d'adaptation et de scoring de mots-clés. |

### 3.2 Limites du modèle actuel

- L'utilisateur **switche en permanence** entre formulaire et aperçu, l'attention est cassée.
- Le formulaire est long, intimidant pour les nouveaux utilisateurs.
- La personnalisation visuelle est limitée aux options déclarées dans `meta.json` (couleurs, polices, photo on/off).
- Aucun feedback sur la **qualité ATS** du design choisi : un utilisateur peut prendre un template multi-colonnes sans savoir qu'il prend un risque.

### 3.3 Acquis à conserver

- **Auto-save** debouncée (1.5 s) → comportement attendu en L1+.
- **Parité écran/PDF** via `/api/render-html` (CSS extrait, polices identiques).
- **Pagination A4** automatique via `applyA4PageFramesInHost`.
- **Adaptation IA** : reçoit `cv` JSON, renvoie `cv` JSON adapté. À ne pas perturber.

---

## 4. Vision cible en une phrase

> Offrir à l'utilisateur **trois niveaux progressifs** d'édition de CV (inline, configurable, libre) tout en lui montrant **en temps réel** comment ses choix de design impactent la lisibilité machine du PDF (Score ATS), pour qu'il prenne ses décisions en connaissance de cause.

---

## 5. Niveau L1 — Édition inline (Word-like)

### 5.1 Objectif

Remplacer le formulaire de `/app/profil` par une vue **plein page** où l'utilisateur tape directement sur le rendu visuel du CV, avec une **topbar type Google Docs** en haut pour les actions et options de mise en page.

### 5.2 Ce qui change pour l'utilisateur

- Plus de double pane formulaire / aperçu : un seul rendu, A4 centré.
- L'utilisateur **clique sur le texte** pour l'éditer (déjà supporté par `CvEditablePreview`).
- Les actions (export PDF, import LinkedIn, template, couleurs…) sont dans une **topbar persistante**.
- Les champs invisibles dans le template (ex. `secteur`, `lieu`, mots-clés ATS) restent accessibles via un **drawer "Inspecteur"** repliable à droite.

### 5.3 Layout cible

```
┌──────────────────────────────────────────────────────────────────┐
│ Fichier ▾  Insertion ▾  Mise en page ▾  Compte ▾  Aide ▾  ✓ Sauvegardé │ ← ruban
├──────────────────────────────────────────────────────────────────┤
│ Template ▾  Police ▾  Taille ▾  Couleur ▾  Photo  [Détails ▸]    │ ← barre outils
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│         ╔══════════════════════════════════╗                     │
│         ║         A4 page 1 (édition)      ║                     │
│         ╚══════════════════════════════════╝                     │
│         ╔══════════════════════════════════╗                     │
│         ║         A4 page 2 (si besoin)    ║                     │
│         ╚══════════════════════════════════╝                     │
│                                                                  │
│ Zoom: −  100%  +                            Profil complet 78%   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.4 Topbar : décomposition des menus

- **Fichier**
  - Télécharger PDF (réutilise `downloadBaseCvPdf` de `ProfileView.jsx`).
  - Importer JSON / DOCX (réutilise `importFileRef`).
  - Synchroniser depuis LinkedIn (réutilise `fetchLinkedInWithToken`).
  - Gérer la photo (réutilise `photoModalOpen` et le crop existant).
- **Insertion**
  - + Expérience, + Formation, + Certification, + Projet, + Compétence, + Langue.
  - Chaque action insère une entrée dans `cv.experiences` (etc.) et fait scroller jusqu'au nouveau bloc.
- **Mise en page** (réutilisation directe de `TemplatePicker`)
  - Template (modal carrousel existant).
  - Couleurs : header, sidebar, accent.
  - Typographie : presets (compact / défaut / lisible) + sliders.
  - Toggles : photo, mots-clés ATS.
- **Compte** : abonnement, mot de passe, invitation, déconnexion.
- **Aide** : guide, raccourcis clavier, contact.

À droite du ruban : indicateur d'auto-save (`Sauvegardé` / `Sauvegarde…`), existant via `setMessage('Sauvegardé')` dans `ProfileView.jsx`.

### 5.5 Édition inline améliorée

À ajouter dans `CvEditablePreview.jsx` :

1. **Boutons fantômes `+`** au hover entre deux blocs (entre deux expériences, entre deux sections), pour insérer un nouveau bloc sans remonter dans la topbar.
2. **Handle `⋮⋮`** à gauche de chaque bloc :
   - drag pour réorganiser (déplace l'élément dans `cv.experiences[]`),
   - click droit pour supprimer / dupliquer.
3. **Placeholders inline** via `:empty::before { content: attr(data-placeholder); }` :
   - Champ vide → texte grisé "Ajouter le poste…" / "Décris ton expérience…".
   - Évite l'écran blanc intimidant.
4. **Touches clavier**
   - `Enter` dans un bullet → nouveau bullet (pattern `addExpBullet`).
   - `Backspace` sur bullet vide → supprime le bullet.
   - `Tab` / `Shift+Tab` → champ suivant / précédent.
5. **Floating toolbar à la sélection** (optionnel v1) : popover B / I / U / Lien au-dessus de la sélection.

### 5.6 Drawer Inspecteur

Repliable à droite (220-280 px), s'ouvre **quand on clique sur un bloc**. Affiche uniquement les champs **non visibles** du bloc sélectionné.

Exemple pour une expérience :

```
┌─ Inspecteur ─────────────┐
│ Expérience #2            │
│ Secteur     [_________]  │
│ Lieu        [_________]  │
│ Contexte    [_________]  │
│ Clients     [_________]  │
│ Mots-clés   [+ ajouter]  │
└──────────────────────────┘
```

### 5.7 Architecture composants (L1)

```
CvEditor.jsx                ← page /app/profil (nouvelle)
├── EditorTopbar.jsx        ← ruban + barre outils
├── CvEditableCanvas.jsx    ← wrapper paginé A4 (réutilise CvEditablePreview)
│   └── CvEditablePreview.jsx (existant, amélioré : `+`, handles, placeholders)
├── EditorInspectorDrawer.jsx
└── EditorFooter.jsx        ← zoom + completion + (plus tard) score ATS
```

### 5.8 Pièges à anticiper

- **`handleBlur` global** dans `CvEditablePreview.jsx` (ligne 224-239) lit tous les fields à chaque blur. Avec insertion/suppression inline, passer à un patch ciblé sur l'élément qui a `blur` (utiliser `event.target.getAttribute('data-cv-field')`).
- **Pagination A4 qui saute** quand l'utilisateur tape : throttler `applyA4PageFramesInHost` (debounce 200 ms après la dernière frappe).
- **Champ caché = champ inéditable** : si un champ n'est rendu nulle part par le template, il faut le drawer Inspecteur. Ne pas l'oublier dans le découpage.
- **Mobile** : A4 ne tient pas sur petit écran. Soit forcer une vue simplifiée (liste de cards), soit rediriger vers l'ancien formulaire si `window.innerWidth < 768`. Décision produit à acter.

### 5.9 Données

Le schéma `cv` ne change pas (voir `frontend/src/data/cvDefault.js`). L1 est une **réorganisation UI pure** : pas de migration SQL, pas de changement de format.

---

## 6. Niveau L2 — Mise en page configurable

### 6.1 Objectif

Permettre à l'utilisateur de **modifier la mise en page** du template choisi sans pour autant la dessiner de zéro :

- réordonner les sections (haut/bas),
- masquer/afficher des sections,
- changer le **ratio sidebar / main** (1/3, 2/5, 1/2),
- changer le **thème global** (couleurs, polices, espacements).

Le L2 reste **structurellement safe pour l'ATS** parce qu'il n'autorise pas le free-form (pas de positionnement absolu, pas de chevauchement).

### 6.2 Modèle de données introduit

L2 introduit le second JSON : `layout`. C'est ici qu'il faut **dédoubler** :

- `cv` reste le **contenu sémantique** (manipulé par l'IA, jamais touché par le layout).
- `layout` est la **mise en page** (manipulée par l'utilisateur, jamais touchée par l'IA).

Schéma minimal L2 :

```json
{
  "format": "A4",
  "grid": "single-or-sidebar",
  "sidebar_ratio": 0.33,
  "sidebar_position": "left",
  "sections_order": [
    { "id": "identity",     "visible": true,  "in": "header" },
    { "id": "resume",       "visible": true,  "in": "main" },
    { "id": "experiences",  "visible": true,  "in": "main", "limit": 6 },
    { "id": "formations",   "visible": true,  "in": "main" },
    { "id": "skills",       "visible": true,  "in": "sidebar" },
    { "id": "languages",    "visible": true,  "in": "sidebar" },
    { "id": "certifications","visible": false,"in": "sidebar" }
  ],
  "theme": {
    "font_heading": "Inter",
    "font_body": "Inter",
    "font_size_body": 9,
    "color_accent": "#1e2a3a",
    "color_header": "#ffffff",
    "color_sidebar": "#f4f4f2",
    "show_photo": true,
    "show_mots_cles_ats": true
  }
}
```

### 6.3 UX

- **Drawer "Mise en page"** ouvert depuis la topbar (`Mise en page ▸ Personnaliser…`).
- Liste réordonnable (`dnd-kit`) des sections, avec toggle `Visible` et destination `Main / Sidebar`.
- Slider `Ratio sidebar` (1/4 → 1/2).
- Choix `Sidebar à gauche / à droite`.
- Sélecteur de **thème prédéfini** (Sobre, Coloré, Pastel, Mono, Élégant…) qui pré-remplit `theme.*`.

### 6.4 Comportement

- Modifier le `layout` ne change **jamais** `cv`.
- Le backend `services/layout_renderer.py` (nouveau, voir §10) prend `(cv, layout)` et produit du HTML.
- Le mode L2 est **rétrocompatible** : un `cv` sans `layout` continue de marcher avec les templates statiques actuels (chargement d'un `layout` par défaut dérivé de `meta.json`).

### 6.5 Pièges

- **Cohérence templates ↔ layout perso** : si l'utilisateur change de template alors qu'il a personnalisé son layout, il faut une UX claire. Solution : flag `userModified: true` sur les sections modifiées ; bouton `Repartir du préréglage du template` avec confirmation.
- **Overflow page 2** : si le contenu déborde du A4, la page 2 doit suivre les mêmes règles de layout. Logique déjà partiellement gérée par `applyA4PageFramesInHost`.

---

## 7. Niveau L3 — Canvas libre (Canva-like)

### 7.1 Objectif

Permettre à l'utilisateur de **poser des blocs librement** sur la page (positions, tailles, z-index), avec ajout de blocs **non sémantiques** (texte libre, forme, séparateur, icône, QR code, image).

C'est le niveau le plus puissant **et le plus risqué pour l'ATS**. Il doit toujours être accompagné du **Score ATS en temps réel** (voir §9).

### 7.2 Modèle de données (extension du layout L2)

```json
{
  "format": "A4",
  "grid": "free",
  "unit": "mm",
  "pages": [
    {
      "blocks": [
        { "id": "b_identity", "type": "identity",    "bind": ["prenom","nom","titre_professionnel"], "x": 10, "y": 10, "w": 130, "h": 25, "style": { "align": "left" } },
        { "id": "b_photo",    "type": "photo",       "bind": "photo_url",                             "x": 150, "y": 10, "w": 50, "h": 50 },
        { "id": "b_exp",      "type": "experiences", "bind": "experiences",                           "x": 10, "y": 70, "w": 130, "h": 200, "style": { "format": "compact" }, "limit": 6 },
        { "id": "b_skills",   "type": "skills",      "bind": "competences.techniques",                "x": 150, "y": 70, "w": 50, "h": 100, "style": { "format": "chips" } },
        { "id": "b_text",     "type": "text",        "content": "Disponible dès septembre",           "x": 10, "y": 275, "w": 130, "h": 10, "style": { "font_size": 8, "italic": true } },
        { "id": "b_line",     "type": "shape:line",  "x": 10, "y": 65, "w": 190, "h": 0.5, "style": { "color": "#1e2a3a" } }
      ]
    }
  ],
  "theme": { "font_heading": "Inter", "color_accent": "#1e2a3a" }
}
```

### 7.3 Types de blocs supportés

| Type | Sémantique ? | Contenu lié | Notes |
| --- | --- | --- | --- |
| `identity` | oui | `cv.prenom`, `cv.nom`, `cv.titre_professionnel` | Nom + titre, format paramétrable. |
| `photo` | oui | `cv.photo_url` | Crop, forme (carré/cercle). |
| `contact` | oui | `cv.email`, `cv.telephone`, `cv.linkedin`, `cv.ville` | Icônes optionnelles. |
| `resume` | oui | `cv.resume` | Paragraphe libre. |
| `experiences` | oui | `cv.experiences[]` | `limit`, format (compact/détaillé). |
| `formations` | oui | `cv.formations[]` | |
| `certifications` | oui | `cv.certifications[]` | |
| `projets` | oui | `cv.projets[]` | |
| `skills` | oui | `cv.competences.techniques[]` | Format : liste / chips / barres / catégorisées. |
| `languages` | oui | `cv.competences.langues[]` | |
| `text` | non | `block.content` (string) | Texte libre. |
| `title` | non | `block.content` | Titre custom (style heading). |
| `shape:line` | non | — | Trait. |
| `shape:rect` | non | — | Rectangle de fond. |
| `icon` | non | `block.icon_name` | HiPhone, HiEnvelope, etc. |
| `qrcode` | non | `block.target_url` | QR code généré côté serveur. |

### 7.4 Outils d'édition (UX L3)

- **Drag & drop** : déplacement libre (`react-rnd` ou `dnd-kit`).
- **Snap grid** optionnel (5 mm) : alignement plus propre.
- **Magnetic guides** : lignes pointillées qui apparaissent quand un bloc s'aligne avec un autre.
- **Z-index** : `Cmd+]` / `Cmd+[` pour avancer/reculer un bloc.
- **Sélection multiple** : `Shift+clic`, déplacement groupé.
- **Undo/redo** : `Cmd+Z` / `Cmd+Shift+Z` sur le layout entier. Store immutable (Zustand + `temporal`).
- **Copier-coller** : `Cmd+C` / `Cmd+V` sur un bloc.
- **Tableau de blocs** : panneau latéral qui liste tous les blocs (z-order), masquer/verrouiller.

### 7.5 Overflow et pagination

Sur Canva, dépasser tronque. Sur un CV, c'est inacceptable.

Stratégie :

1. Chaque bloc sémantique a une **hauteur min** et une **hauteur naturelle** (calculée d'après le contenu).
2. Si le contenu dépasse la hauteur du bloc, deux options visibles dans l'inspecteur du bloc :
   - **Auto-grow** : le bloc s'étend, les blocs en dessous se décalent (recommandé par défaut).
   - **Spill to next page** : le contenu déborde sur la page suivante (utile pour `experiences`).
3. Si débordement sur page 2 et `auto-grow` est activé sur tout, on crée une page 2 automatiquement (logique `applyA4PageFramesInHost` étendue).

### 7.6 Pièges

- **Drag/drop performance** : memoïser les blocs par id, éviter de re-renderer tout le canvas à chaque déplacement.
- **Undo/redo dès le départ** : rétrofiter est l'enfer. Imposer un store immutable (Zustand `temporal`, ou Immer + stack maison) avant de coder le premier drag.
- **Ordre de lecture pour l'ATS** : un bloc à `(150, 10)` peut être lu **avant** un bloc à `(10, 10)`. Voir §9 pour la pénalité dans le Score Parsing.
- **Cohérence multi-templates** : changer de template casse le layout. Bouton `Réappliquer un preset` explicite.

---

## 8. Le double schéma JSON : `cv` + `layout`

### 8.1 Principe

> **`cv`** = quoi dire, **`layout`** = comment le montrer. Les deux JSON sont **indépendants**.

| | `cv` | `layout` |
| --- | --- | --- |
| Manipulé par l'IA | ✅ (adaptation, mots-clés) | ❌ jamais |
| Manipulé par l'utilisateur | ✅ (texte) | ✅ (mise en page) |
| Stocké par utilisateur | 1 seul (le profil de base) | 1 par template / par offre adaptée |
| Source de la table SQL | `cvs` (existant) | `layouts` (nouveau, voir §10.4) |

### 8.2 Avantage

- L'IA d'adaptation (`backend/services/adapter.py`) **ne change pas**. Elle continue de prendre un `cv` JSON, de le réécrire pour matcher une offre, et de retourner un `cv` JSON.
- L'utilisateur peut **changer de mise en page** sans toucher au contenu.
- On peut **réimprimer** le même CV adapté dans plusieurs layouts (par exemple "Design pour le mail recruteur" + "ATS-safe pour l'upload sur Workday").

### 8.3 Convention : pas de duplication

Aucun champ ne doit exister **à la fois** dans `cv` et dans `layout`.

- Couleurs / typographie → uniquement dans `layout.theme`.
- Photo URL → uniquement dans `cv.photo_url` (le `layout` référence via `bind`).
- Visibilité d'une section → uniquement dans `layout.sections_order[].visible`.

### 8.4 Schémas TypeScript (référence)

Voir [§16 Annexes](#16-annexes--schémas-json-complets) pour les schémas complets.

### 8.5 Migration des templates actuels vers le double schéma

Chaque template livré (`templates/<id>/`) gagne un nouveau fichier `default_layout.json` qui décrit son layout par défaut. Au démarrage, si un utilisateur ouvre un CV sans `layout`, on charge le `default_layout.json` du template courant.

---

## 9. Score ATS : Parsing + Match

### 9.1 Deux scores séparés, jamais agrégés en un seul nombre opaque

```
ATS global : 84/100
 ├─ Parsing (lecture machine) : 92/100  ✓
 └─ Match (adéquation offre)   : 76/100  ⚠
```

| Score | Indépendant de | Dépend de | Calculé par |
| --- | --- | --- | --- |
| **Parsing** | l'offre, du contenu | `layout` (et un peu de `cv` pour le format des dates, des bullets, …) | Algo déterministe + validation PDF (§9.4) |
| **Match** | du layout, du design | `cv` + l'offre | Heuristiques + IA (existant : `services/mots_cles.py`, `services/offre_infer.py`) |

> [!IMPORTANT]
> Ne jamais afficher uniquement un score agrégé. L'utilisateur doit comprendre **pourquoi** son score bouge.

### 9.2 Règles du Score Parsing (déterministes)

Base : **100**. Plancher : **0**. Plafond : **100**.

#### 9.2.1 Pénalités lourdes (dealbreakers)

| Règle | Delta | Détection |
| --- | --- | --- |
| PDF rasterisé (image au lieu de texte) | −40 | Au check ground truth : `pdfplumber.extract_text() == ""` |
| Police non-embarquée | −15 | Inspection metadata PDF |
| Texte critique dans header/footer PDF | −10 par champ critique | Inspection layout |
| Caractères en ligatures non-extractibles | −8 | Diff entre texte extrait et texte source |

#### 9.2.2 Pénalités moyennes (design risqué)

| Règle | Delta | Détection |
| --- | --- | --- |
| 2 colonnes | −5 | `layout.grid` + `sidebar_ratio` significatif |
| 3+ colonnes | −12 | Compte des "zones X" distinctes |
| Contenu sémantique fractionné multi-colonnes | −5 supplémentaire | `experiences` réparti sur ≥ 2 colonnes |
| Présence d'une sidebar | −3 | `sidebar_ratio > 0` |
| Tableau pour le layout | −10 | `<table>` dans le HTML rendu |
| Positions absolues d'éléments textuels (L3) | −2 par bloc texte | `layout.grid == "free"` |
| Texte sur image de fond | −5 | `block.style.background_image` présent |
| Bullets non standards (▪ ★ ➜) | −1 | Regex sur le texte rendu |
| Dates au format exotique | −1 par occurrence | Regex stricte sur `cv.experiences[].date_*` |
| Police "exotique" (script, decorative) | −5 | Allowlist : Arial, Calibri, Helvetica, Inter, Plus Jakarta Sans, Georgia, Times |
| Taille de corps < 9pt ou > 12pt | −3 | `layout.theme.font_size_body` |

#### 9.2.3 Pénalités légères (préférences ATS)

| Règle | Delta | Détection |
| --- | --- | --- |
| Photo présente | −2 | `layout.theme.show_photo == true && cv.photo_url` |
| Couleurs de fond saturées | −1 | HSL : saturation > 60% sur block.style.bg |
| Émojis dans le texte | −2 | Regex Unicode |
| Liens en image plutôt qu'en texte | −1 | `block.type == "image" && block.target_url` |

#### 9.2.4 Bonus (design ATS-friendly)

| Règle | Delta | Détection |
| --- | --- | --- |
| Mono-colonne | +10 | `sidebar_ratio == 0` et `grid != "free"` |
| Titres de section avec mots-clés standards | +1 chacun | "Expérience professionnelle", "Formation", "Compétences", "Languages" présents |
| Contact (email, téléphone) dans les 30% supérieurs de la page 1 | +5 | Inspection positions |
| Format de dates cohérent (MM/YYYY ou YYYY partout) | +3 | Analyse uniformité |
| Bullets en `<li>` réels (pas des `<p>` avec "• ") | +3 | Inspection HTML rendu |
| Taille fichier < 1 MB | +1 | `os.path.getsize(pdf)` |

### 9.3 Calcul du Score Match

Réutilise et étend les services existants :

- `backend/services/offre_infer.py` : extrait les exigences de l'offre (mots-clés, années d'XP attendues, compétences requises).
- `backend/services/mots_cles.py` : compare aux compétences et bullets du CV.

Heuristique de scoring :

```
match = 100 * (
    0.40 * keyword_overlap_ratio +
    0.20 * skill_overlap_ratio +
    0.15 * years_of_experience_match +
    0.15 * title_similarity +
    0.10 * education_match
)
```

> Détail des pondérations à calibrer par AB testing dans `backend/services/ats_score.py`.

### 9.4 Validation ground truth du Score Parsing

À chaque export PDF, on **vérifie réellement** ce que le PDF produit, et on l'utilise pour calibrer les règles.

```python
# backend/services/ats_parsing_check.py (squelette)
def verify_parsing_quality(pdf_bytes: bytes, expected_cv: dict) -> dict:
    """
    Parse le PDF avec plusieurs extracteurs, compare au cv sémantique attendu.
    Retourne un dict de métriques utilisable pour ajuster le Score Parsing.
    """
    text_pdfplumber = _extract_text_pdfplumber(pdf_bytes)
    text_pymupdf    = _extract_text_pymupdf(pdf_bytes)
    expected_linear = _linearize_cv(expected_cv)
    return {
        "all_critical_fields_present": _check_email_phone_name(text_pdfplumber, expected_cv),
        "section_order_correct": _lcs_ratio(text_pdfplumber, expected_linear),
        "bullets_parsed_as_list": _count_bullets(text_pdfplumber) == _count_expected_bullets(expected_cv),
        "no_text_loss_coverage": _coverage_ratio(text_pdfplumber, expected_linear),
        "parser_disagreement": _normalized_diff(text_pdfplumber, text_pymupdf),
    }
```

- **Si `section_order_correct < 0.85`** → on déclenche un warning UX et on logue dans `event_log` pour calibrer le poids des pénalités multi-colonnes.
- **Si `parser_disagreement > 0.15`** → le design est ambigu (deux parsers lisent différemment) → on baisse le score `parsing` de 5 points.

### 9.5 Honnêteté envers l'utilisateur

À écrire dans la doc produit (infobulle sur le score) :

- Les vrais parsers ATS (Workday, Taleo) sont propriétaires. Personne en dehors d'eux ne sait exactement ce qu'ils font.
- Le Score Parsing est une **estimation conservatrice** basée sur les patterns connus publiquement.
- Un score 95 ne **garantit pas** un succès ; un score 30 garantit presque un échec.
- Pour les métiers créatifs, un toggle `ATS strict / Équilibré / Design libre` est proposé. En mode "Design libre", la jauge est **désactivée** (pas masquée verte — ce serait mentir).

### 9.6 UX du score

Petit panneau flottant en bas à droite, type Lighthouse Chrome :

```
┌─ ATS Score ────────────────────┐
│           84 / 100             │
│  ████████████████████░░░░░░    │
│                                │
│ ▾ Détails                      │
│  +10  Mono-colonne             │
│  +5   Contact en haut          │
│  +3   Dates cohérentes         │
│  −3   Sidebar (lecture amb.)   │
│  −2   Photo présente           │
│ ────────────────────────────── │
│  [⚡ Optimiser pour ATS]        │
└────────────────────────────────┘
```

- Recalcul en live (~50 ms) à chaque modification du layout.
- Bouton **Optimiser** : applique les changements positifs en cascade, sauvegarde le layout précédent (undo possible).

### 9.7 Score sur les templates livrés

Calculé une fois au build/registration et stocké dans `template_registry.py`, exposé dans le sélecteur de templates :

```
Templates disponibles
┌──────────────────────────────────────────────────────────────┐
│ ⓘ Minimal       ████████████████████  98  Recommandé ATS     │
│   Classic       ████████████████░░░░  82                     │
│   Modern        ████████████░░░░░░░░  68  Sidebar = -10      │
│   Bold          ████████░░░░░░░░░░░░  54  2 colonnes = -12   │
│   Creative      ██████░░░░░░░░░░░░░░  42  Multi-col + photo  │
│   Executive     ████████████████░░░░  79                     │
│   Elegant       ███████████████░░░░░  76                     │
└──────────────────────────────────────────────────────────────┘
```

Bonus produit : à l'export, proposer **"Générer aussi une version ATS-friendly"** qui prend le même `cv` JSON et le rend dans le template Minimal. Deux PDFs côte à côte.

### 9.8 Calibration continue

- Chaque check ground truth est loggué (anonymisé) dans `event_log`.
- Un job mensuel (cron) recalcule les **corrélations** entre les règles de scoring et les vraies divergences observées.
- Les pondérations dans `ats_score.py` sont **versionnées** (`SCORING_VERSION = "2026.05"`) pour que les scores historiques restent reproductibles.

---

## 10. Architecture cible (front + back)

### 10.1 Vue globale

```
┌────────────────────────────── FRONTEND ─────────────────────────────┐
│                                                                     │
│  /app/profil                                                        │
│    └── CvEditor.jsx                                                 │
│        ├── EditorTopbar.jsx (Fichier / Insertion / Mise en page …) │
│        ├── EditorCanvas.jsx                                         │
│        │   ├── L1: CvEditablePreview.jsx (templates fixes)          │
│        │   ├── L2: SectionListEditor.jsx (drag réordonner)         │
│        │   └── L3: FreeCanvas.jsx (drag/resize libre)               │
│        ├── EditorInspectorDrawer.jsx                                │
│        ├── AtsScorePanel.jsx                                        │
│        └── EditorFooter.jsx                                         │
│                                                                     │
│  src/lib/                                                           │
│    ├── atsScore.js          (calcul Score Parsing déterministe)    │
│    ├── layoutDefaults.js    (default_layout par template)          │
│    └── layoutSerializer.js  (sérialisation / migration)            │
│                                                                     │
│  src/store/                                                         │
│    ├── editorStore.js       (Zustand + temporal pour undo/redo)    │
│    └── atsStore.js          (cache score, dernière validation)     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────── BACKEND ─────────────────────────────┐
│                                                                     │
│  backend/main.py (routes)                                           │
│    POST /api/render-html                                            │
│    POST /api/pdf                                                    │
│    POST /api/ats/score-parsing       (nouveau)                      │
│    POST /api/ats/score-match         (nouveau)                      │
│    POST /api/ats/verify-pdf          (nouveau, ground truth)        │
│    GET  /api/layout/defaults/<tpl>   (nouveau)                      │
│                                                                     │
│  backend/services/                                                  │
│    ├── ats_score.py                  (parsing + match, déterministe)│
│    ├── ats_parsing_check.py          (vérif PDF réel)               │
│    ├── layout_renderer.py            (cv + layout → HTML)           │
│    ├── adapter.py                    (existant, inchangé)           │
│    └── cv_render_helpers.py          (existant, étendu pour layout) │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Nouveaux modules backend

#### `backend/services/ats_score.py`

```python
"""Score ATS déterministe (Parsing + Match)."""
from dataclasses import dataclass

SCORING_VERSION = "2026.05"

@dataclass(frozen=True)
class Rule:
    id: str
    label: str
    delta: int
    severity: str  # "info" | "warning" | "error"

@dataclass(frozen=True)
class ScoreResult:
    total: int           # 0..100
    rules: list[Rule]    # toutes les règles appliquées (delta non nul)
    version: str

def score_parsing(cv: dict, layout: dict) -> ScoreResult: ...
def score_match(cv: dict, offre: dict) -> ScoreResult: ...
```

#### `backend/services/ats_parsing_check.py`

```python
"""Vérification ground truth d'un PDF généré."""

def verify_parsing_quality(pdf_bytes: bytes, expected_cv: dict) -> dict: ...
def adjust_score_with_ground_truth(score: ScoreResult, gt: dict) -> ScoreResult: ...
```

#### `backend/services/layout_renderer.py`

```python
"""Rendu d'un (cv, layout) en HTML, exploitable par WeasyPrint."""

def render_html(cv: dict, layout: dict, theme: dict | None = None) -> str: ...
```

### 10.3 Nouveaux composants frontend

| Composant | Rôle |
| --- | --- |
| `CvEditor.jsx` | Page éditeur (remplace l'usage actuel de `ProfileView` sur `/app/profil`). |
| `EditorTopbar.jsx` | Ruban + barre outils. |
| `EditorCanvas.jsx` | Wrapper qui charge L1/L2/L3 selon le mode. |
| `SectionListEditor.jsx` (L2) | Liste réordonnable des sections. |
| `FreeCanvas.jsx` (L3) | Canvas libre, drag/resize. |
| `EditorInspectorDrawer.jsx` | Champs cachés du bloc sélectionné. |
| `AtsScorePanel.jsx` | Affichage du score en temps réel. |
| `EditorFooter.jsx` | Zoom, completion, mode actif. |

### 10.4 Migration SQL

Nouvelle table dédiée au layout :

```sql
-- backend/supabase_migration_user_layouts.sql

create table if not exists user_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null,                  -- template d'origine (minimal, modern, …)
  layout_json jsonb not null,
  is_default boolean not null default false,  -- layout par défaut du user pour ce template
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (user_id, template_id, is_default)
);

create index user_layouts_user_id_idx on user_layouts(user_id);
```

Politique RLS (cohérent avec `supabase_migration_rls_service_role_only.sql`) :

```sql
alter table user_layouts enable row level security;
-- Pas de policy : seul le backend (service_role) accède.
```

### 10.5 Routes API nouvelles

| Méthode | Route | Description |
| --- | --- | --- |
| POST | `/api/ats/score-parsing` | `{ cv, layout } → ScoreResult` |
| POST | `/api/ats/score-match` | `{ cv, offre } → ScoreResult` |
| POST | `/api/ats/verify-pdf` | `{ pdf_url_or_bytes, cv } → ground_truth metrics` |
| GET | `/api/layout/defaults/:template_id` | Layout par défaut d'un template |
| GET | `/api/user/layouts` | Layouts persistés de l'utilisateur connecté |
| PUT | `/api/user/layouts/:id` | Mise à jour layout |
| POST | `/api/render-html` (étendu) | Accepte maintenant un `layout` optionnel en plus de `cv` et `template_id`. |

Contrôle d'accès : toutes les routes `layout` exigent un JWT Supabase valide, vérifié via `backend/supabase_jwt.py` (voir `docs/security.md`).

---

## 11. Pipeline d'export PDF (parité écran / PDF)

### 11.1 Principe

> Ce que l'utilisateur voit dans l'éditeur **doit être identique** au PDF exporté, pixel près. La parité actuelle (`render-html` côté serveur, CSS extrait côté client) doit être conservée et étendue.

### 11.2 Deux options techniques pour le rendu PDF

#### Option A — WeasyPrint avec CSS partagé (actuel, recommandé)

- Le backend rend un HTML à partir de `(cv, layout)` via `services/layout_renderer.py`.
- WeasyPrint convertit le HTML en PDF.
- Le **même HTML** est rendu dans l'iframe côté frontend.
- WeasyPrint supporte CSS Grid, Flexbox, positions absolues, polices web, fonds, bordures, ombres simples → couvre 90% des cas Canva.

**Avantages** : stack actuelle, pas de nouvelle dépendance, déterministe.

**Limites** : ombres complexes, certains effets typographiques (variable fonts) peuvent diverger entre Chrome et WeasyPrint.

#### Option B — Headless Chromium (Puppeteer / Playwright)

- Le backend lance un Chrome headless qui rend le même composant React qu'à l'écran.
- "Screenshot PDF" via `page.pdf()`.

**Avantages** : pixel-perfect par construction.

**Limites** : +200 MB de dépendances, ressources CPU/mémoire serveur multipliées, nouvelle surface de sécurité.

**Décision par défaut** : Option A. Bascule en Option B uniquement si on rencontre des cas WeasyPrint bloquants.

### 11.3 Garanties à tenir

1. **Mêmes polices** côté écran (web fonts) et côté PDF (embarquées par WeasyPrint).
2. **Même CSS** : `services/cv_render_helpers.py` extrait le CSS rendu côté serveur et le réinjecte côté client (déjà fait via `extractStylesFromHtml` dans `CvEditablePreview.jsx`).
3. **Même grille A4** : `applyA4PageFramesInHost` côté client = `@page { size: A4 }` côté WeasyPrint.
4. **Tests de non-régression** : voir §13.4 (PDF snapshot).

---

## 12. Règles de code

### 12.1 Référence prioritaire

Le présent document **complète** mais ne remplace pas :

- `docs/guide-bonnes-pratiques.md` (référence prioritaire de style et de sécurité).
- `docs/engineering-standards.md` (Definition of Done, pyramide de tests).
- `docs/contributing.md` (process PR, quality gates).
- `docs/security.md` (baseline sécurité).

En cas de conflit, le `guide-bonnes-pratiques.md` fait foi.

### 12.2 Règles spécifiques au domaine éditeur

#### Frontend

1. **Séparer `cv` et `layout`** : aucun composant ne doit muter à la fois `cv` et `layout` dans le même setter. Si une action modifie les deux, faire deux updates explicites.
2. **`cv` reste sérialisable JSON pur** : pas de Date, pas de Map, pas de Set. Toutes les dates en string ISO ou format libre lisible.
3. **Composants éditeur dans `src/components/editor/`** : nouveau dossier dédié pour ne pas polluer `src/components/`.
4. **Hooks éditeur dans `src/lib/editor/`** : `useEditorStore`, `useAtsScore`, `useLayoutMutation`.
5. **Aucune logique de scoring ATS côté composant** : tout passe par `src/lib/atsScore.js` (pur, déterministe, testable).
6. **Memoïzation** : les blocs L3 sont systématiquement `React.memo` + comparaison par id+version pour éviter les re-renders en cascade lors du drag.
7. **Pas de mutation directe d'un bloc** : passer par les actions du store (`moveBlock`, `resizeBlock`, `bindBlock`).
8. **`contentEditable` reste limité aux champs sémantiques** (`data-cv-field`). Pas de `contentEditable` sur des éléments structurels (bordures, séparateurs).
9. **Accessibilité** : tout bloc cliquable doit avoir un `role` explicite et un `aria-label` traduisible.
10. **i18n** : les libellés UI passent par un module central (à créer si pas déjà fait), pas de string en dur dans les composants.

#### Backend

1. **`ats_score.py` doit être pur** : pas d'I/O, pas d'appel réseau, pas de DB. Prend `(cv, layout, offre?)`, retourne un `ScoreResult`. Permet la testabilité totale.
2. **Versioning du scoring** : la constante `SCORING_VERSION` est incrémentée à chaque changement de pondération. Stockée avec chaque score calculé.
3. **`layout_renderer.py` est l'unique point d'entrée** pour transformer `(cv, layout) → HTML`. Pas de logique de rendu dans les routes.
4. **Schéma `layout`** : validé par Pydantic à l'entrée des routes API. Schéma versionné (champ `version` obligatoire dans le JSON).
5. **Migrations SQL** : une migration = une intention, non destructive (cf. `guide-bonnes-pratiques.md` §5.2).
6. **Privacy / journalisation** : les scores ATS sont loguables, le contenu `cv` ne l'est pas (cf. `docs/security.md`).

### 12.3 Style transverse

- Conventional Commits obligatoires (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- ESLint, Prettier, Ruff, Black, Mypy doivent passer sans warnings.
- Couverture minimale CI (cf. `.github/workflows/ci.yml`) maintenue ; les nouveaux modules `ats_score`, `layout_renderer`, `ats_parsing_check` doivent **atteindre 80% de couverture** dès leur ajout.

### 12.4 Anti-patterns interdits

- ❌ Mettre la couleur d'accent dans `cv.template_options` (doit aller dans `layout.theme`).
- ❌ Faire du scoring ATS dans `frontend/src/components/*` (passe par `src/lib/atsScore.js`).
- ❌ Logger un `cv` complet (PII).
- ❌ Stocker un layout sans `version` ni `template_id`.
- ❌ Faire muter `cv` depuis une action de drag/drop (les drags ne touchent **jamais** au contenu).
- ❌ Ajouter une règle ATS hardcodée dans un composant React (toutes les règles vivent dans `atsScore.js` / `ats_score.py`).

---

## 13. Règles de tests

### 13.1 Pyramide

| Niveau | Outils | Cible |
| --- | --- | --- |
| Unitaires | `pytest` (back), `vitest` ou équivalent (front) | logique pure : scoring, layout migrations, sérialisation |
| Intégration | `pytest` + httpx | routes API `/api/ats/*`, `/api/layout/*` |
| Snapshot PDF | `pytest` + WeasyPrint + comparaison structurée du texte extrait | parité écran/PDF |
| E2E | Playwright (`frontend/e2e/`) | parcours édition L1 → export PDF |

### 13.2 Tests unitaires obligatoires

#### `tests/test_ats_score.py`

- Golden fixtures : 10+ CV + layout connus, chacun avec un score attendu.
- Tests des règles individuelles (chaque règle a un test isolé qui prouve qu'elle déclenche).
- Test de bornage (jamais < 0, jamais > 100).
- Test de versioning (un changement de pondération est détecté).

```python
def test_mono_column_bonus_applied():
    cv = fixture_cv("minimal_filled")
    layout = fixture_layout("mono_column")
    result = ats_score.score_parsing(cv, layout)
    assert any(r.id == "bonus_mono_column" and r.delta == 10 for r in result.rules)
```

#### `tests/test_ats_parsing_check.py`

- Pour chaque template livré, générer un PDF avec un CV de test, vérifier que `verify_parsing_quality` retourne `section_order_correct >= 0.9`.
- Test de robustesse : PDF rasterisé volontairement → `verify_parsing_quality` doit retourner `coverage_ratio == 0`.

#### `tests/test_layout_renderer.py`

- Pour chaque template, charger son `default_layout.json`, faire `render_html(cv, layout)`, vérifier que le HTML contient les sections attendues et **rien d'autre**.
- Test de rétrocompatibilité : un `cv` sans `layout` continue à se rendre (chargement automatique du `default_layout`).

#### `frontend/src/lib/__tests__/atsScore.test.js`

- Les mêmes fixtures que côté Python.
- Test crucial : **le score Python et le score JS doivent être identiques** sur les fixtures partagées. Voir §13.5.

### 13.3 Tests d'intégration

#### `tests/test_api_ats_routes.py`

- POST `/api/ats/score-parsing` avec un payload valide → 200 + structure attendue.
- POST avec payload invalide → 400 + message clair.
- Sans JWT → 401.
- Race conditions : 10 appels concurrents sur le même user → pas de corruption d'état.

#### `tests/test_api_layout_routes.py`

- CRUD complet sur `/api/user/layouts/*`.
- Isolation : un user ne peut pas lire le layout d'un autre.

### 13.4 Tests de snapshot PDF (parité)

```python
# tests/test_pdf_layout_snapshot.py
@pytest.mark.parametrize("template_id", ["minimal", "classic", "modern", "bold", "creative", "elegant", "executive"])
def test_pdf_matches_html_structure(template_id):
    cv = fixture_cv("standard_filled")
    layout = load_default_layout(template_id)
    html = layout_renderer.render_html(cv, layout)
    pdf = cv_pdf_weasyprint.render(html)
    extracted = ats_parsing_check.extract_text_pdfplumber(pdf)
    expected_chunks = expected_text_chunks(cv, layout)
    for chunk in expected_chunks:
        assert chunk in extracted, f"Texte manquant dans le PDF : {chunk!r}"
```

### 13.5 Tests "parité Python ↔ JS"

Le Score Parsing existe **dans les deux langues** (Python pour le serveur et le scoring batch des templates ; JavaScript pour le temps réel dans l'éditeur). Ils doivent rester synchrones.

```python
# tests/test_ats_score_parity.py
@pytest.mark.parametrize("fixture", load_shared_fixtures("ats-fixtures/"))
def test_python_score_matches_js_snapshot(fixture):
    py_result = ats_score.score_parsing(fixture["cv"], fixture["layout"])
    js_snapshot = fixture["expected_score"]   # produit en CI par le test JS
    assert py_result.total == js_snapshot["total"]
    assert {r.id for r in py_result.rules} == set(js_snapshot["rule_ids"])
```

Les fixtures partagées vivent dans `tests/fixtures/ats-fixtures/*.json` et sont **lues par les deux côtés**.

### 13.6 Tests E2E (Playwright)

Scénarios à couvrir (`frontend/e2e/`) :

1. **L1 happy path** : login → édition inline du nom et d'un bullet → vérifier auto-save → reload → données persistées.
2. **L2 réordonner** : ouvrir drawer Mise en page, drag une section vers le haut → vérifier l'ordre PDF → comparer score ATS avant/après.
3. **L3 drag bloc** : ajouter un bloc texte libre, le déplacer, vérifier que le score baisse.
4. **Score ATS live** : modifier une couleur → score recalculé en < 200 ms.
5. **Export PDF** : déclencher download, ouvrir le PDF avec `pdf-parse` → vérifier que le texte attendu y est.

### 13.7 Quality gates avant PR

Reprise du `docs/contributing.md` §3, complétée pour l'éditeur :

```bash
# Backend
ruff check .
black --check .
mypy backend
pytest tests
pytest tests --cov=backend.services.ats_score --cov=backend.services.layout_renderer --cov=backend.services.ats_parsing_check --cov-report=term-missing --cov-fail-under=80
bandit -r backend -c pyproject.toml
pip-audit -r backend/requirements.txt

# Frontend
npm --prefix frontend run lint
npm --prefix frontend run test          # vitest unitaires
npm --prefix frontend run test:e2e      # Playwright si critique

# Parité Python ↔ JS (à lancer en plus dans la CI éditeur)
pytest tests/test_ats_score_parity.py
```

### 13.8 Fixtures partagées

Convention : tout test multi-langue lit ses fixtures depuis `tests/fixtures/ats-fixtures/` :

```
tests/fixtures/ats-fixtures/
├── 01-minimal-mono-column.json     ← { cv, layout, expected_score }
├── 02-modern-with-sidebar.json
├── 03-creative-multi-column.json
├── 04-free-canvas-text-shift.json
└── README.md                       ← comment ajouter une fixture
```

Chaque fixture contient un `expected_score` calculé une fois et **versionné** avec `SCORING_VERSION`. Tout changement de version casse les tests volontairement → on doit recalculer les fixtures et committer.

---

## 14. Roadmap de livraison

### 14.1 Vue d'ensemble

```
┌────────────┬──────────────┬───────────────────────────────────────┐
│ Phase      │ Durée cible  │ Livrable                              │
├────────────┼──────────────┼───────────────────────────────────────┤
│ P0         │ 1 semaine    │ Score ATS sur templates existants     │
│ P1 (L1)    │ 2 semaines   │ Édition inline plein page + topbar   │
│ P2 (L2)    │ 4 semaines   │ Mise en page configurable + scoring  │
│ P3 (L3)    │ 8 semaines   │ Canvas libre + scoring temps réel    │
│ P4         │ continu      │ Calibration scoring + nouveaux blocs │
└────────────┴──────────────┴───────────────────────────────────────┘
```

### 14.2 P0 — Score ATS MVP (1 semaine)

**Objectif** : afficher un score parsing sur les 7 templates existants, sans toucher à l'éditeur.

Livrables :
- `backend/services/ats_score.py` avec ~20 règles.
- `backend/services/ats_parsing_check.py` (validation post-export).
- `tests/test_ats_score.py` + fixtures.
- Affichage du score dans `TemplatePicker.jsx`.
- Documentation utilisateur (FAQ "C'est quoi ce score ?").

Critères d'acceptation :
- Chaque template a un score stable (±0 entre deux exécutions).
- Le score apparaît dans le sélecteur.
- Validation ground truth log dans `event_log` à chaque export.

### 14.3 P1 — L1 Édition inline (2 semaines)

Livrables :
- `frontend/src/components/editor/CvEditor.jsx` + sous-composants.
- Migration de `/app/profil` vers la nouvelle vue (avec toggle "ancienne vue" temporaire).
- Drawer Inspecteur fonctionnel.
- Boutons `+` flottants et handles `⋮⋮`.

Critères d'acceptation :
- Tous les champs du CV restent éditables (page ou inspecteur).
- Auto-save toujours sous 2s.
- Aucune régression sur l'export PDF.

### 14.4 P2 — L2 Mise en page configurable (4 semaines)

Livrables :
- Schéma `layout` (côté front + Pydantic côté back).
- Migration SQL `user_layouts`.
- `layout_renderer.py`.
- Drawer "Mise en page" avec drag de sections + ratio sidebar + thèmes.
- Score ATS live qui réagit aux changements de layout.

Critères d'acceptation :
- Un user peut réordonner ses sections et le PDF reflète l'ordre.
- Score ATS recalculé en < 100 ms après chaque changement.
- Rétrocompatibilité : les CVs sans `layout` continuent de marcher.

### 14.5 P3 — L3 Canvas libre (8 semaines)

Livrables :
- `FreeCanvas.jsx` + drag/resize libre.
- Blocs libres (texte, titre, forme, icône, QR code).
- Undo/redo complet sur le layout.
- Score ATS en temps réel avec règles "free canvas" (positions absolues, etc.).
- Bouton "Optimiser pour ATS".
- Export double PDF (Design + ATS-friendly).

Critères d'acceptation :
- L'utilisateur peut composer un CV à partir d'une page blanche.
- Le score ATS reflète honnêtement les risques.
- Le PDF généré est identique au rendu écran (test snapshot).

### 14.6 P4 — Calibration et expansion (continu)

- Job mensuel de recalibration des pondérations sur les ground truths collectées.
- Nouveaux blocs (timeline, graphique de compétences, …).
- Templates communautaires (sous conditions de sécurité).

---

## 15. Risques produit et techniques

### 15.1 Produit

| Risque | Impact | Mitigation |
| --- | --- | --- |
| L'utilisateur trouve l'éditeur intimidant après le formulaire | abandon | Tutorial guidé première utilisation ; toggle "ancienne vue" temporaire ; placeholders inline généreux. |
| Score ATS faux ami : "j'ai 95 mais je ne suis pas embauché" | confiance | Honnêteté éditoriale ; affichage du Match score séparément ; FAQ explicite. |
| Score ATS trop punitif : tout le monde finit en Minimal | uniformisation | Toggle "ATS strict / Équilibré / Design libre" ; pas de menace, recommandations. |
| L3 ouvert à tous = CVs cassés | support overload | Verrou L3 derrière un onboarding ; templates de départ ; mode "Optimiser" automatique. |

### 15.2 Technique

| Risque | Impact | Mitigation |
| --- | --- | --- |
| Divergence WeasyPrint ↔ navigateur | bug PDF | Tests snapshot PDF ; option B (Puppeteer) en backup. |
| Performance L3 sur grands CV | drag laggy | Memoïzation, virtualisation, debouncing du score. |
| Désynchronisation scoring Python/JS | bug score | Fixtures partagées + test parity dans la CI. |
| Migration SQL `user_layouts` casse les comptes existants | régression | Migration non-destructive ; fallback `default_layout` automatique. |
| Storage Supabase explose (layouts par template ×N users) | coût | TTL ou compression JSON ; limiter à N layouts par user (ex. 10). |

### 15.3 Sécurité

| Risque | Impact | Mitigation |
| --- | --- | --- |
| Bloc `qrcode` pointant vers URL malicieuse | phishing | Validation URL côté back ; allowlist scheme `https://`. |
| XSS via `block.content` en texte libre | injection | Échappement strict côté `layout_renderer.py` ; pas d'HTML brut. |
| Layout d'un user lu par un autre | fuite données | RLS + service_role only ; tests d'intégration cross-user. |

---

## 16. Annexes — schémas JSON complets

### 16.1 Schéma `cv` (référence, existant)

Voir `frontend/src/data/cvDefault.js`. Pour mémoire :

```json
{
  "prenom": "string",
  "nom": "string",
  "email": "string",
  "telephone": "string",
  "linkedin": "string",
  "ville": "string",
  "titre_professionnel": "string",
  "resume": "string",
  "photo_url": "string",
  "experiences": [
    { "id": "exp_1", "poste": "", "entreprise": "", "secteur": "", "date_debut": "", "date_fin": "", "lieu": "", "contexte": "", "bullet_points": ["", ""], "mots_cles": [], "clients": "" }
  ],
  "formations":     [ { "id": "form_1", "diplome": "", "etablissement": "", "date": "", "mention": "" } ],
  "certifications": [ { "id": "cert_1", "nom": "", "organisme": "", "date": "" } ],
  "competences":    { "techniques": [""], "logiciels": [""], "langues": [{"langue":"","niveau":""}], "autres": [""] },
  "projets":        [ { "id": "proj_1", "nom": "", "description": "", "mots_cles": [] } ]
}
```

### 16.2 Schéma `layout` complet (nouveau)

```json
{
  "version": "2026.05",
  "template_id": "minimal",
  "format": "A4",
  "grid": "single-or-sidebar",
  "unit": "mm",
  "sidebar_position": "left",
  "sidebar_ratio": 0.33,

  "sections_order": [
    { "id": "identity",       "visible": true,  "in": "header",  "format": "default" },
    { "id": "resume",         "visible": true,  "in": "main",    "format": "default" },
    { "id": "experiences",    "visible": true,  "in": "main",    "format": "default", "limit": 6 },
    { "id": "formations",     "visible": true,  "in": "main",    "format": "default" },
    { "id": "skills",         "visible": true,  "in": "sidebar", "format": "chips" },
    { "id": "languages",      "visible": true,  "in": "sidebar", "format": "default" },
    { "id": "certifications", "visible": false, "in": "sidebar", "format": "default" },
    { "id": "projets",        "visible": false, "in": "main",    "format": "default" }
  ],

  "pages": [
    {
      "blocks": [
        { "id": "b_identity", "type": "identity", "bind": ["prenom","nom","titre_professionnel"],
          "x": 10, "y": 10, "w": 130, "h": 25, "style": { "align": "left" } },
        { "id": "b_photo",    "type": "photo",    "bind": "photo_url",
          "x": 150, "y": 10, "w": 50, "h": 50, "style": { "shape": "square" } },
        { "id": "b_exp",      "type": "experiences", "bind": "experiences",
          "x": 10, "y": 70, "w": 130, "h": 200, "limit": 6, "style": { "format": "compact" } },
        { "id": "b_text",     "type": "text",     "content": "Disponible dès septembre",
          "x": 10, "y": 275, "w": 130, "h": 10, "style": { "font_size": 8, "italic": true } },
        { "id": "b_line",     "type": "shape:line",
          "x": 10, "y": 65, "w": 190, "h": 0.5, "style": { "color": "#1e2a3a" } }
      ]
    }
  ],

  "theme": {
    "font_heading": "Inter",
    "font_body":    "Inter",
    "font_size_name":   15,
    "font_size_title":  10,
    "font_size_section": 9.5,
    "font_size_body":    9,
    "font_size_bullet":  9,
    "color_accent":  "#1e2a3a",
    "color_header":  "#ffffff",
    "color_sidebar": "#f4f4f2",
    "color_body":    "#1a1a1a",
    "color_section_title": "#1e2a3a",
    "show_photo": true,
    "show_mots_cles_ats": true
  },

  "metadata": {
    "created_at": "2026-05-19T14:00:00Z",
    "updated_at": "2026-05-19T14:00:00Z",
    "user_modified": true,
    "scoring_version": "2026.05"
  }
}
```

### 16.3 Schéma `ScoreResult`

```json
{
  "kind": "parsing",
  "total": 84,
  "version": "2026.05",
  "rules": [
    { "id": "bonus_mono_column",       "label": "Mono-colonne",                "delta": 10, "severity": "info" },
    { "id": "bonus_contact_top",       "label": "Contact en haut de page",     "delta": 5,  "severity": "info" },
    { "id": "bonus_dates_consistent",  "label": "Dates cohérentes",            "delta": 3,  "severity": "info" },
    { "id": "malus_sidebar",           "label": "Sidebar (lecture ambiguë)",   "delta": -3, "severity": "warning" },
    { "id": "malus_photo",             "label": "Photo présente",              "delta": -2, "severity": "info" }
  ],
  "computed_at": "2026-05-19T14:01:00Z"
}
```

### 16.4 Convention de bindings

Quand un bloc `bind` une donnée, la syntaxe est :

- **string simple** : `"experiences"` → tout le tableau.
- **string avec path** : `"competences.techniques"` → un sous-arbre.
- **array de paths** : `["prenom","nom","titre_professionnel"]` → composer plusieurs champs.

Le `layout_renderer.py` résout les bindings via une fonction `resolve_binding(cv, binding) -> Any` partagée avec le frontend (test parity).

### 16.5 Convention d'identifiants

| Élément | Préfixe | Exemple |
| --- | --- | --- |
| Expérience | `exp_` | `exp_1`, `exp_1716135123` |
| Formation | `form_` | `form_1` |
| Certification | `cert_` | `cert_1` |
| Projet | `proj_` | `proj_1` |
| Bloc layout | `b_` | `b_identity`, `b_exp_main` |

Les ids sont **persistants** (jamais recalculés à partir de l'ordre). Voir helpers `newExpId`, `newFormId`, etc. dans `frontend/src/data/cvDefault.js`.

---

## 17. Pour aller plus loin

- `docs/guide-bonnes-pratiques.md` — référence prioritaire de style et de sécurité.
- `docs/engineering-standards.md` — Definition of Done, pyramide de tests, release process.
- `docs/security.md` — baseline sécurité (JWT, RLS, secrets, dépendances).
- `docs/contributing.md` — process PR, hooks, quality gates.
- `frontend/src/components/CvEditablePreview.jsx` — cœur de L1, déjà éditable.
- `backend/services/cv_render_helpers.py` — pipeline de rendu actuel.
- `backend/template_registry.py` — registre des templates et options.

---

*Dernière mise à jour : initialisation de la vision L1 → L3 + Score ATS (Parsing + Match) avec règles de code et de test alignées sur le `guide-bonnes-pratiques.md`.*
