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
| 2 colonnes | −8 | `layout.grid` + `sidebar_ratio` significatif |
| 3+ colonnes | −15 | Compte des "zones X" distinctes |
| Contenu sémantique fractionné multi-colonnes | −5 supplémentaire | `experiences` réparti sur ≥ 2 colonnes |
| Présence d'une sidebar | −5 | `sidebar_ratio > 0` |
| Tableau pour le layout | −10 | `<table>` dans le HTML rendu |
| Positions absolues d'éléments textuels (L3) | −2 par bloc texte (plafond −10) | `layout.grid == "free"` |
| Texte sur image de fond | −5 | `block.style.background_image` présent |
| Bullets non standards (▪ ★ ➜) | −1 | Regex sur le texte rendu |
| Dates au format exotique | −1 par occurrence (plafond −5) | Regex stricte sur `cv.experiences[].date_*` |
| Police "exotique" (script, decorative) | −5 | Allowlist : Arial, Calibri, Helvetica, Inter, Plus Jakarta Sans, Georgia, Times |
| Taille de corps < 9pt ou > 12pt | −3 | `layout.theme.font_size_body` |

#### 9.2.3 Pénalités légères (préférences ATS)

| Règle | Delta | Détection |
| --- | --- | --- |
| Photo présente | −3 | `layout.theme.show_photo == true && cv.photo_url` |
| Couleurs de fond saturées | −1 | HSL : saturation > 60% sur block.style.bg |
| Émojis dans le texte | −2 | Regex Unicode |
| Liens en image plutôt qu'en texte | −1 | `block.type == "image" && block.target_url` |

#### 9.2.4 Bonus (design ATS-friendly)

| Règle | Delta | Détection |
| --- | --- | --- |
| Mono-colonne | +10 | `sidebar_ratio == 0` et `grid != "free"` |
| Titres de section avec mots-clés standards | +1 par section (plafond +3) | sections "identity", "experiences", "formations", "skills", "languages" reconnues |
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

#### 14.3.1 Toggle Stable / Beta (déjà livré, P0.5)

Pour éviter le big-bang lors du switch vers la nouvelle expérience, un toggle est
exposé en permanence dans la topbar de l'app (`AppTopbar.jsx`, juste avant le
menu compte). Tant qu'il n'est pas activé, l'utilisateur reste sur la version
stable (formulaires de profil actuels, `ProfileView`, etc.). Quand il est activé,
l'application exposera progressivement les écrans L1 → L3 sans réécrire la
version stable.

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Storage + dispatch (module pur, testable hors React) | `frontend/src/lib/betaMode.js` |
| Hook React de consommation | `frontend/src/lib/useBetaMode.js` |
| Composant UI (slider topbar) | `frontend/src/components/BetaModeToggle.jsx` |
| Styles dédiés | `frontend/src/styles/BetaModeToggle.css` |
| Tests unitaires (`node --test`) | `frontend/tests/unit/betaMode.test.js` |

**Contrat d'API publique** (à utiliser pour brancher les nouvelles vues) :

```js
import { isBetaModeEnabled, setBetaModeEnabled, subscribeBetaMode } from '../lib/betaMode.js';
import { useBetaMode } from '../lib/useBetaMode.js';

// Côté composant React
const [betaEnabled, setBetaEnabled] = useBetaMode();
return betaEnabled ? <NewCvEditor/> : <ProfileView/>;

// Hors React (route guard, lib, etc.)
if (isBetaModeEnabled()) { ... }
```

**Comportement attendu** :
- Persistance dans `localStorage` sous la clé versionnée `cv_bot_beta_mode_v1`
  (renommer la clé en `_v2` quand on migrera ou nettoiera).
- Tolérance aux storages indisponibles (mode privé) : `setBetaModeEnabled`
  retourne `false`, l'UI doit savoir le signaler proprement.
- Synchronisation cross-onglets via l'event natif `storage` et cross-composants
  via le CustomEvent `cv-bot:beta-mode-changed`.
- Aucune régression visuelle ni fonctionnelle quand le toggle est OFF : c'est
  un opt-in pur.

**Critères d'acceptation du toggle (P0.5)** :
- [x] Le toggle est visible et opérationnel dans `topbar-right`.
- [x] L'état persiste après reload.
- [x] Tous les tests unitaires `npm run test:unit` passent.
- [x] Aucun lint error introduit dans les fichiers nouveaux.
- [ ] (P1) Au moins une vue (`/app/profil`) bascule réellement sur l'expérience
      Beta quand le toggle est ON.

#### 14.3.2 Drawer Inspecteur Style (livré, P1.4)

Premier panneau structuré de l'éditeur Beta : permet d'éditer les options de
template qui ne se prêtent pas à l'édition inline (couleurs, polices,
affichage de la photo). Sert aussi de fondation au futur drawer de mise en
page L2 (qui exposera le `layout` JSON plutôt que les `templateOptions`).

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Schéma + sanitisation (pur, testable) | `frontend/src/lib/templateOptionsSchema.js` |
| Drawer latéral | `frontend/src/components/editor/EditorInspectorDrawer.jsx` |
| Champ générique (color / select / boolean) | `frontend/src/components/editor/EditorInspectorField.jsx` |
| Styles dédiés | `frontend/src/styles/EditorInspector.css` |
| Tests unitaires (`node --test`) | `frontend/tests/unit/templateOptionsSchema.test.js` |

**Choix techniques** :

- **Side-by-side, pas modal** : quand on ouvre le drawer, le canvas réduit sa
  largeur pour laisser place au drawer (340px par défaut). L'utilisateur voit
  l'effet en temps réel — c'est essentiel pour évaluer des changements de
  couleur ou de typo. Sur écran <900px, le drawer passe en plein large sous
  le canvas.
- **Aucun appel réseau** : les changements n'affectent que `templateOptions`
  qui est déjà persisté via le mécanisme d'auto-save existant. Le drawer n'a
  jamais à connaître le backend.
- **Schéma lu depuis le template** : la liste des champs et leurs `default`,
  `choices`, `type` proviennent de `templates/<id>/meta.json` (champ
  `options`). Aucun in-line de la liste des couleurs ou des polices : ajouter
  un champ se fait uniquement côté template.
- **Sanitisation systématique** : `sanitizeTemplateOptionValue` filtre toute
  valeur invalide (hex malformé, choix hors `choices`) avant remontée vers le
  parent. Empêche un user (ou un copy/paste corrompu) de stocker des valeurs
  qui casseraient le rendu PDF côté backend.

**Critères d'acceptation (P1.4)** :
- [x] Le bouton "Inspecteur" est visible dans la topbar éditeur Beta.
- [x] Les champs déclarés dans `meta.json` apparaissent regroupés (couleurs,
      typographie, affichage).
- [x] Une modification de couleur / police / toggle se voit immédiatement sur
      le CV et est sauvegardée par l'auto-save existant.
- [x] Le bouton "Réinitialiser aux valeurs par défaut" rétablit les options
      du template courant.
- [x] Tests unitaires verts (15 nouveaux tests sur le schéma).
- [x] Aucun lint warning sur les fichiers du drawer.

#### 14.3.3 Panneau "Contenu" — add / remove / reorder (livré, P1.5)

Second onglet du drawer inspecteur : permet de gérer les listes répétées du
CV (expériences, formations, certifications, projets). Pour chaque item :
boutons `↑` / `↓` pour réordonner, `×` pour supprimer ; en bas de section,
bouton `+ Ajouter une <singular>`. Réordonnancement à la souris via
drag-and-drop natif HTML5 (handle `⋮⋮`), sans dépendance externe (pas de
dnd-kit / react-dnd).

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Helpers purs (add / remove / move + reorder index) | `frontend/src/lib/cvSectionOps.js` |
| Panneau React | `frontend/src/components/editor/EditorContentPanel.jsx` |
| Système d'onglets Style / Contenu | `frontend/src/components/editor/EditorInspectorDrawer.jsx` |
| Styles (items, drag highlight, +) | `frontend/src/styles/EditorInspector.css` |
| Tests unitaires (`node --test`) | `frontend/tests/unit/cvSectionOps.test.js` (19 tests) |

**Choix techniques** :

- **Pourquoi pas inline dans `CvEditablePreview` ?** `CvEditablePreview` est
  partagé avec le mode stable (utilisé dans `ProfileView` pour la preview).
  Y ajouter des handles modifierait le DOM rendu et risquerait de casser
  le mode stable. On garde l'isolation : tous les contrôles d'édition de
  structure sont dans le drawer.
- **Drag-and-drop natif HTML5** plutôt qu'une lib externe : aucun coût en
  bundle, suffisant pour des listes de <50 items, accessibilité préservée
  par les boutons `↑` / `↓` (qui restent les contrôles primaires pour le
  clavier).
- **Mutations pures** : `addItemToSection`, `removeItemFromSection`,
  `moveItemInSection` retournent toujours un nouveau CV. Cela facilite les
  tests, garantit l'absence de mutation accidentelle, et joue bien avec le
  scheduler d'auto-save (qui détecte les changements par référence).
- **`id` stable par item** : chaque item ajouté reçoit un id généré par
  `generateItemId(prefix)` (base36 timestamp + random). Indispensable pour
  les `key` React et pour l'identification côté backend.

**Critères d'acceptation (P1.5)** :
- [x] L'onglet "Contenu" est accessible dans le drawer inspecteur.
- [x] Les 4 sections (Expériences, Formations, Certifications, Projets)
      sont listées avec leur count.
- [x] `+ Ajouter` crée un item vide, persisté via l'auto-save.
- [x] `↑` / `↓` réordonnent l'item (désactivés aux bornes).
- [x] `×` supprime l'item.
- [x] Le handle `⋮⋮` permet le drag-and-drop, avec feedback visuel sur la
      ligne survolée.
- [x] Aucun item sans id (pour le rendu et la persistance).
- [x] 19 nouveaux tests unitaires verts.
- [x] 0 lint error sur les nouveaux fichiers.

#### 14.3.4 L1 polish — édition inline propre (livré, L1 polish)

Une fois les fondations posées (P1.1 → P1.5), il restait l'expérience
d'édition inline elle-même : les spans `contentEditable` étaient
fonctionnels mais bruts (placeholder absent, Enter cassant le layout
sur les champs single-line, pas de moyen d'annuler, paste multi-ligne
non nettoyé). Cette itération corrige tout ça **sans toucher au JSX
des templates**, via une couche de comportement attachée
dynamiquement.

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Mapping `path -> { placeholder, multiline }` + handlers (Enter / Escape / paste) | `frontend/src/lib/editableFieldBehavior.js` |
| Attachement DOM (useEffect dans `CvEditablePreview`) | `frontend/src/components/CvEditablePreview.jsx` |
| Styles placeholder + hover/focus enrichi + auto-grow multi-line | `frontend/src/components/CvEditablePreview.css` |
| Tests unitaires (`node --test`) | `frontend/tests/unit/editableFieldBehavior.test.js` (17 tests) |

**Choix techniques** :

- **Pourquoi pas un composant `<EditableField>` ?** `CvEditablePreview`
  contient ~80 spans `[data-cv-field]` répartis dans 4 templates
  différents. Refactorer tous les spans en composant aurait été
  invasif et risqué côté mode stable (partagé). On garde le JSX et on
  attache la behavior via `useEffect` + `document.querySelectorAll`.
- **Pure JS testable** : le mapping `path -> config` et tous les
  handlers vivent dans `lib/editableFieldBehavior.js`, testable hors
  React/jsdom avec un mock DOM minimal.
- **Placeholders via `::before` + `attr()`** : zéro JSX touché, le
  placeholder s'adapte automatiquement au texte (sombre sur fond clair,
  clair sur fond sombre) grâce à `currentColor` + opacité 0.38.
  `::before` n'est PAS dans le DOM donc PAS dans `textContent` -> ne
  pollue jamais l'auto-save.
- **Normalisation des paths** : `experiences.0.bullet_points.2` est
  normalisé en `experiences.*.bullet_points.*` pour matcher un seul
  motif côté config (un seul placeholder par TYPE de champ).
- **Single-line vs multi-line** : déterminé par la config (ex.
  `prenom: { multiline: false }`, `resume: { multiline: true }`).
  Sur single-line, Enter blur + focus le champ suivant ; sur
  multi-line, Enter insère un saut natif.
- **Escape annule** : snapshot du `textContent` pris au focus, restauré
  au keydown Escape + blur.
- **Paste single-line nettoyé** : un coller multi-ligne dans un champ
  nom / titre / dates est aplati (sauts → espace) avant insertion.

**Critères d'acceptation (L1 polish)** :
- [x] Quand un champ est vide, un placeholder italique discret
      apparaît (ex. "Prénom", "Action ou résultat clé").
- [x] Au focus, le placeholder s'atténue pour donner la priorité au
      curseur.
- [x] Hover : fond bleu très subtil + cursor `text` sur tous les
      champs éditables.
- [x] Focus : outline indigo 2px + fond bleu très clair (cohérent
      avec le hover, sans clignotement à l'arrivée).
- [x] Enter sur un champ single-line valide + passe au champ suivant
      logique (`querySelectorAll('[data-cv-field]')` order).
- [x] Enter sur un champ multi-line insère un saut de ligne natif.
- [x] Escape restaure la valeur qu'avait le champ au focus + blur.
- [x] Paste multi-ligne dans un single-line est aplati (sauts →
      espace).
- [x] Les champs multi-line vides ont une largeur minimale (`14em`)
      suffisante pour afficher l'intégralité du placeholder.
- [x] Aucun changement de JSX dans les templates (4 layouts).
- [x] 17 tests unitaires verts (`editableFieldBehavior.test.js`).
- [x] 0 lint error, 0 régression sur le build.

### 14.4 P2 — L2 Mise en page configurable (en hibernation, repris en P3)

> **Note du 19 mai 2026** : après itération sur l'UX (P2.1 → P2.4b),
> on a constaté qu'une mise en page modulaire dans un *drawer latéral*
> reste structurellement un produit dégradé par rapport à ce qu'on
> doit livrer en P3 (canvas libre type Canva sur tout l'écran). Sur
> décision produit, on a **retiré l'onglet « Mise en page » du
> drawer** et abandonné le drag/drop par zones pour l'instant. La
> mise en page modulaire complète sera réintroduite en P3 dans le
> contexte d'un canvas libre où l'utilisateur compose son CV bloc à
> bloc.
>
> **Ce qui reste dans le code (fondations pour P3)** :
> - `frontend/src/lib/cvLayoutModelV2.js` + tests (modèle pur zone-aware).
> - Persistance backend `cv_base.data.layout` (Supabase JSONB) +
>   préservation au save (`save_cv_base`) + 5 tests Python.
> - Les attributs `data-cv-section="..."` dans `CvEditablePreview.jsx`
>   comme points d'ancrage pour un futur renderer layout-aware.
>
> **Ce qui a été supprimé** :
> - `EditorLayoutPanel.jsx`, `EditorLayoutMiniMap.jsx` (UI obsolètes).
> - `lib/sectionsAvailability.js` + tests (consommé uniquement par
>   le panel v1).
> - `lib/applyLayoutToDom.js` + tests (DOM patching sans renderer).
>
> Le score ATS « live sur layout custom » (P2.2) est aussi en pause :
> tant que l'user ne peut pas modifier le layout côté front, le badge
> ATS se base uniquement sur `templateId`. Quand P3 livre le canvas
> libre, le scoring sera rebranché sur le modèle v2.

#### Livrables initialement prévus (en attente de P3)
- Schéma `layout` (côté front + Pydantic côté back).
- Migration SQL `user_layouts`.
- `layout_renderer.py`.
- Drawer "Mise en page" avec drag de sections + ratio sidebar + thèmes.
- Score ATS live qui réagit aux changements de layout.

#### 14.4.1 Schéma `layout` côté front (livré, P2.0)

Modèle pur en JavaScript, isolé de React et du DOM, pour pouvoir le tester
et le réutiliser depuis un renderer ultérieur.

| Rôle | Fichier |
|---|---|
| Modèle + helpers (sanitize, move, reset, default) | `frontend/src/lib/cvLayoutModel.js` |
| Tests unitaires (`node --test`) | `frontend/tests/unit/cvLayoutModel.test.js` (18 tests) |

**Forme du layout** :

```js
{
  sectionsOrder: ['resume', 'experiences', 'formations', 'certifications', 'projets', 'competences'],
  sidebarRatio: 0,        // 0 | 25 | 30 | 33 | 35 | 40 — voir SIDEBAR_RATIOS
  theme: 'neutral',
}
```

`sanitizeLayout(input)` est la seule porte d'entrée d'un layout externe :
filtre les clés inconnues, dédoublonne, complète avec les clés canoniques
manquantes, refuse les ratios hors liste. Le reste du code peut considérer
le layout comme bien formé.

#### 14.4.2 Onglet « Mise en page » dans le drawer (livré, P2.1)

Troisième onglet du drawer inspecteur (à côté de Style et Contenu). Affiche
les sections du CV dans l'ordre courant et permet de les réordonner via :
- drag-and-drop natif HTML5 (handle `⋮⋮`), même pattern que P1.5 (réutilise
  `computeReorderTargetIndex` de `lib/cvSectionOps.js`)
- boutons `↑` / `↓` (accessibles clavier)

Bouton « Réinitialiser l'ordre par défaut », désactivé si le layout est
déjà au défaut (calcul via `isDefaultLayout`).

| Rôle | Fichier |
|---|---|
| Panneau React | `frontend/src/components/editor/EditorLayoutPanel.jsx` |
| Branchement (state local) | `frontend/src/components/editor/CvEditorBeta.jsx` |
| Styles | `frontend/src/styles/EditorInspector.css` (section P2.1) |
| Drawer (3e onglet) | `frontend/src/components/editor/EditorInspectorDrawer.jsx` |

**Limites volontaires de l'état actuel** :
- Le layout vit en **state local** de `CvEditorBeta`, **non persisté côté
  backend**. La migration SQL `user_layouts` et le payload `PUT /api/cv`
  étendu viendront en P2.3.
- Le **rendu effectif** des sections selon `layout.sectionsOrder` n'est
  pas encore branché. Le canvas continue de rendre l'ordre du template.
  Ce sera l'objet de P2.2 (nouveau renderer ou patch DOM ciblé après le
  rendu de `CvEditablePreview`).
- Le **score ATS** ne réagit pas encore au layout custom (il utilise
  uniquement `templateId`). Quand on aura le renderer + la persistance,
  on basculera `EditorAtsScoreBadge` sur le layout custom (il accepte
  déjà la prop `layout`, donc c'est juste un câblage).

**Critères d'acceptation (P2.0 + P2.1)** :
- [x] Modèle pur + 18 tests verts.
- [x] Onglet « Mise en page » accessible dans le drawer.
- [x] L'ordre se modifie via drag-and-drop ou flèches.
- [x] Le bouton Réinitialiser fonctionne et se désactive au défaut.
- [x] Aucun lint warning sur les nouveaux fichiers.
- [x] (P2.2) Le canvas reflète l'ordre choisi.
- [x] (P2.2) Le score ATS reflète l'ordre choisi.
- [ ] (P2.3) Le layout est persisté en base et survit au reload.

#### 14.4.3 Rendu effectif + ATS live (livré, P2.2)

L'ordre `sectionsOrder` est désormais APPLIQUÉ au canvas et au scoring ATS.

| Rôle | Fichier |
|---|---|
| Reorder DOM pur + tests | `frontend/src/lib/applyLayoutToDom.js` + `tests/unit/applyLayoutToDom.test.js` (8 tests) |
| Conversion FE -> backend scoring | `frontend/src/lib/cvLayoutModel.js` -> `frontendLayoutToScoringLayout()` (4 tests) |
| Marquage HTML | `frontend/src/components/CvEditablePreview.jsx` -> `data-cv-section="<key>"` ajouté sur chaque `<section>` éditable des 4 layouts (Minimal / Modern / Elegant / Default) |
| Câblage | `frontend/src/components/CvEditablePreview.jsx` -> nouvelle prop `layoutSectionsOrder` + `useLayoutEffect` |
| Câblage côté éditeur | `frontend/src/components/editor/CvEditorBeta.jsx` -> `scoringLayout` mémoisé + props vers Preview et Badge |

**Stratégie « DOM patch post-render »** (pourquoi ne pas refactorer le JSX en `.map(sectionKey => …)` ?) :

- Le JSX de `CvEditablePreview` rend 4 variantes de layout (Minimal /
  Modern / Elegant / Default sidebar), totalisant plusieurs centaines de
  lignes. Refactorer pour rendre les sections dans un ordre dynamique
  multiplierait la surface d'attaque et le risque de régression sur le
  mode stable (qui partage ce composant).
- À la place, on ajoute un attribut HTML stable `data-cv-section="<key>"`
  sur chaque section, et on réordonne via `useLayoutEffect` immédiatement
  après le render React. C'est isolable (no-op si `layoutSectionsOrder`
  est null), idempotent (helpers testés), et compatible avec la
  réconciliation React (qui se base sur la virtual DOM + keys, non sur
  la position DOM réelle).
- Limite consciente : pour le template sidebar (default), les sections
  réparties entre la colonne principale et la sidebar ont des parents DOM
  différents. Le reorder n'opère que par parent (cf. `applyLayoutToDom.js`
  - boucle `byParent`), donc l'utilisateur peut réordonner à l'intérieur
  de chaque colonne, mais pas faire passer une section de la sidebar à la
  colonne principale (ou inversement). La gestion cross-column viendra
  avec le sidebar ratio configurable (P2.4) et/ou un vrai renderer
  layout-aware (P3).

**Score ATS live** : `EditorAtsScoreBadge` accepte déjà la prop `layout`.
`CvEditorBeta` calcule `scoringLayout` (au format snake_case attendu par
le backend) via `frontendLayoutToScoringLayout`. Quand le layout est au
défaut, on garde `templateId` (path rapide côté backend qui charge le
meta du template). Dès qu'on personnalise, on bascule sur `layout`
custom — le backend supporte les deux modes (cf. `backend/api_ats.py`
`resolve_layout_for_scoring`).

**Critères d'acceptation (P2.2)** :
- [x] Réordonner une section dans le drawer met à jour le canvas en
      moins de 16 ms (un seul `insertBefore` ciblé).
- [x] Le score ATS recalcule automatiquement sur layout custom.
- [x] Aucune régression sur le mode stable (test : ouvrir `/app/profil`
      sans toggle Beta, le rendu doit être identique à avant).
- [x] 8 nouveaux tests purs sur `applyLayoutToDom.js`.
- [x] 4 nouveaux tests sur `frontendLayoutToScoringLayout`.
- [x] Lint clean, build OK.

#### 14.4.4 Verrouillage visuel des sections non rendues (livré, P2.2.b)

Quand un template (ex. `executive`, `classic`) place une section dans
le header (typiquement `resume`) ou dans une zone non identifiée par
`data-cv-section`, l'utilisateur cliquait sur ↑ / ↓ sans rien voir
bouger sur le canvas. Cause : `applyLayoutToDom` regroupe par parent
DOM et le header n'est pas un parent réordonnable.

| Rôle | Fichier |
|---|---|
| Détection DOM pure + tests | `frontend/src/lib/sectionsAvailability.js` + `tests/unit/sectionsAvailability.test.js` (7 tests) |
| Remontée vers le parent | `frontend/src/components/CvEditablePreview.jsx` -> nouvelle prop `onLayoutAvailabilityChange` + `useEffect` après render |
| Stockage et propagation | `frontend/src/components/editor/CvEditorBeta.jsx` -> state `sectionsAvailability` |
| UX verrouillage | `frontend/src/components/editor/EditorLayoutPanel.jsx` -> handle 🔒 + boutons disabled + badge "Principal" / "Sidebar" |

Conventions UX :
- Section **rendue** : handle ⋮⋮, draggable, badge vert "Principal" ou
  jaune "Sidebar". Les boutons ↑ / ↓ sont actifs uniquement si la
  section voisine est dans la même zone (sinon le déplacement n'aurait
  AUCUN effet visuel).
- Section **verrouillée** (présente dans `layout.sectionsOrder` mais
  pas dans `[data-cv-section]` du DOM) : grisée, handle 🔒, drag
  désactivé, boutons disabled. Tooltip explicite.

#### 14.4.5 Persistance backend du layout (livré, P2.3)

Le layout est désormais persistant dans Supabase à côté du CV (champ
`data.layout` du JSONB `cv_base`). Aucune migration SQL nécessaire :
Supabase accepte le champ supplémentaire dans le JSONB existant.

| Rôle | Fichier |
|---|---|
| Préservation côté DB | `backend/db.py::save_cv_base` -> garde le `layout` existant si payload partiel |
| Route PATCH | `backend/main.py::api_cv_patch` -> `layout` accepté dans `allowed` |
| Tests DB | `tests/test_cv_layout_persistence.py` (5 tests : save/load, préservation partielle, null = reset, ne casse pas template_id) |
| Hydratation côté FE | `frontend/src/components/editor/CvEditorBeta.jsx` -> `setLayout(sanitizeLayout(incoming.layout))` au GET |
| PUT côté FE | `saveFn` ajoute `layout: isDefaultLayout(layout) ? null : layout` -> backend stocke `null` quand l'user revient au défaut |
| Trigger auto-save | `handleLayoutChange` appelle `autoSave.schedule(cv)` -> debounce 1.5s avant le PUT |

Conventions :
- Le frontend envoie `layout: null` quand l'utilisateur revient au layout
  défaut. Le backend stocke `null` (et un futur GET le réinitialisera
  via `sanitizeLayout`).
- Le payload PATCH legacy (sans `layout`) ne touche PAS au layout
  existant grâce à la préservation `db.py::save_cv_base`.
- ProfileView (mode stable) continue d'appeler PUT sans `layout` ->
  préservation automatique.

**Critères d'acceptation (P2.3)** :
- [x] Reorder + reload du navigateur : l'ordre est conservé.
- [x] Reset layout par défaut : `data.layout` devient `null` côté DB.
- [x] Le mode stable (ProfileView) ne perd jamais le layout du mode Beta.
- [x] 5 nouveaux tests Python (`tests/test_cv_layout_persistence.py`).
- [x] Lint, type, build clean.

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

**Décisions produit (19 mai 2026, démarrage P3)** :
- **Remplace l'éditeur Beta** : quand P3 sera assez mûr, le canvas libre
  prendra la place de l'éditeur Beta actuel (pas de toggle "guidée /
  libre" dans la topbar Beta).
- **Point de départ utilisateur** : choix explicite entre **page blanche**
  ou **partir d'un template existant** (qui sera converti en blocs libres
  pré-placés).
- **Approche incrémentale** : on découpe P3 en P3.0 → P3.10, chaque étape
  petite, testée, commitée séparément. On peut s'arrêter à tout moment
  sans casser le mode Beta actuel.

#### 14.5.1 P3.0 — Modèle pur `cvLayoutModelV3` (livré, 19 mai 2026)

Le canvas libre repose sur un modèle de données différent de v1/v2 :
au lieu de "zones avec sections", on a une **liste de pages** et chaque
page contient une **liste de blocs positionnés en coordonnées absolues
(mm)** sur une feuille A4.

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Modèle pur (constantes, sanitize, ops blocs/pages/theme, migration v1/v2→v3) | `frontend/src/lib/cvLayoutModelV3.js` |
| Tests unitaires (`node --test`) | `frontend/tests/unit/cvLayoutModelV3.test.js` (46 tests) |

**Forme canonique d'un layout v3** :

```json
{
  "version": 3,
  "format": "A4",
  "grid": "free",
  "unit": "mm",
  "pages": [
    {
      "id": "page_xxx",
      "blocks": [
        { "id": "blk_xxx", "type": "identity",     "bind": ["prenom","nom","titre_professionnel"], "x": 10, "y": 10, "w": 190, "h": 22, "z": 1, "style": { "align": "left" } },
        { "id": "blk_xxx", "type": "text",         "content": "Disponible des septembre",          "x": 10, "y": 275, "w": 100, "h": 8, "z": 1, "style": { "italic": true } },
        { "id": "blk_xxx", "type": "shape:line",                                                    "x": 10, "y": 35,  "w": 190, "h": 0.5, "z": 1, "style": { "color": "#1e2a3a" } }
      ]
    }
  ],
  "theme": { "font_heading": "Inter", "color_accent": "#1e2a3a" }
}
```

**Types de blocs supportés** :
- **Sémantiques** (lient `cv` via `bind`) : `identity`, `photo`, `contact`,
  `resume`, `experiences`, `formations`, `certifications`, `projets`,
  `skills`, `languages`.
- **Non sémantiques** (contenu inline dans `content`) : `text`, `title`,
  `shape:line`, `shape:rect`, `icon`, `qrcode`.

**API publique exposée (P3.0)** :

```js
// Creation
createBlankLayoutV3()                  // page blanche, 0 bloc
createStarterLayoutV3()                // 1 page avec 6 blocs semantiques pre-places

// Validation / inspection
sanitizeLayoutV3(input)                // re-clampe et nettoie un input quelconque
sanitizeBlock(input)                   // sanitize d un bloc isole (null si type invalide)
findBlock(layout, blockId)             // { pageIndex, blockIndex, block } | null
listAllBlocks(layout)                  // tous les blocs, toutes pages
isEmptyLayoutV3(layout)                // true si aucun bloc sur aucune page
detectLayoutVersion(input)             // 0 | 1 | 2 | 3
isLayoutV3Shape(input)                 // true si ca ressemble a du v3
isSemanticBlockType(type) / isNonSemanticBlockType(type)

// Mutations (toutes pures, retournent un NOUVEAU layout)
addBlockToPage(layout, pageIndex, partial)
removeBlock(layout, blockId)
updateBlock(layout, blockId, patch)            // merge superficiel + style merge
setBlockPosition / setBlockSize / moveBlockBy
bringToFront(layout, blockId)                  // z = max + 1
sendToBack(layout, blockId)                    // z = min - 1 (clamp 0)
updateBlockStyle(layout, blockId, stylePatch)
appendBlankPage(layout) / removePage(layout, pageIndex)   // refuse de supprimer la derniere
updateTheme(layout, patch)
migrateLayoutToV3(input)                       // v1 / v2 / inconnu -> starter (preserve theme)
```

**Choix techniques** :

- **Unité = `mm`** (et non `px`/`%`) : aligné sur le rendu WeasyPrint
  côté backend (qui pense en mm pour le PDF) et sur la norme A4. Évite
  les arrondis pixel-perfect qui divergeraient entre preview et export.
- **Clamps systématiques dans `sanitizeBlock`** : `w/h ≥ minimums`,
  `x + w ≤ 210mm`, `y + h ≤ 297mm`, `z ≥ 0`. Toutes les ops passent par
  `sanitizeBlock` au final → impossible de produire un bloc hors-page,
  même via un patch malicieux.
- **Migration v1/v2 → v3 = retombe sur le starter** : on n'essaie PAS de
  reproduire pixel-perfect une mise en page modulaire (impossible sans
  rendu réel + retour utilisateur P2 a montré que c'est fragile). On
  préserve uniquement le `theme`. Quand on aura un convertisseur fidèle
  template-par-template (P3.x), il viendra remplacer ce fallback.
- **Pure JS, 0 dépendance React/DOM** → 100% testable sous `node --test`
  (46 tests), portable backend si besoin (futur scoring L3).
- **Immutabilité stricte** : chaque op retourne un nouveau layout. Pré-
  requis pour le store undo/redo de P3.1.

**Critères d'acceptation (P3.0)** :
- [x] Le modèle est entièrement pur (aucun import React/DOM).
- [x] `createBlankLayoutV3()` et `createStarterLayoutV3()` produisent
      des layouts valides et sanitizables.
- [x] `sanitizeBlock` filtre les types inconnus et clampe les coords
      hors-page.
- [x] Toutes les mutations retournent un nouveau layout (immuabilité).
- [x] `migrateLayoutToV3` est idempotente sur du v3, retombe sur le
      starter pour v1/v2/null tout en préservant le `theme`.
- [x] 46 tests unitaires verts.
- [x] 0 lint error sur le nouveau fichier.

#### 14.5.2 P3.1 — Store immutable + undo/redo (livré, 19 mai 2026)

Avant le premier drag, on pose l'historique. Rétrofiter l'undo/redo
après est un cauchemar (cf. §7.6) ; le doc le dit explicitement.
Store maison `past/present/future`, 0 dépendance ajoutée.

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Store pur (commit / undo / redo / coalesce / limit) | `frontend/src/lib/layoutHistoryStore.js` |
| Hook React qui expose le store + keybindings Cmd+Z / Cmd+Shift+Z / Ctrl+Y | `frontend/src/lib/useLayoutHistory.js` |
| Tests unitaires (`node --test`) | `frontend/tests/unit/layoutHistoryStore.test.js` (21 tests) |

**Forme du store** :

```js
{
  past: Layout[],           // anciens etats (LIFO)
  present: Layout,          // etat courant
  future: Layout[],         // etats annules par undo, redo-ables
  lastCommitAt: number,     // pour le coalescing
  lastGroupKey: string|null,
}
```

**API publique (store pur)** :

```js
createHistoryStore(initialLayout)
getPresent(store) / canUndo(store) / canRedo(store)
commit(store, newLayout, { groupKey?, now?, coalesceWindowMs? })
undo(store) / redo(store)
reset(newLayout)
getHistoryDepth(store)  // { past, future }
```

**Hook React** :

```js
const { layout, commit, undo, redo, reset, canUndo, canRedo, historyDepth } =
  useLayoutHistory(() => createBlankLayoutV3(), { keyboardShortcuts: true });
```

**Choix techniques clés** :

- **Coalescing par `groupKey` + fenêtre temps** : pendant un drag, le
  caller commit potentiellement à 60Hz. Plutôt que de pousser 60 entrées
  dans `past` en 1 seconde, on coalesce les commits qui partagent le
  même `groupKey` (ex. `"drag:blk_xyz"`) dans une fenêtre de 300ms. Le
  PREMIER commit du drag reste dur (sinon on perdrait la possibilité
  d'annuler), les suivants se contentent de remplacer le `present`.
- **`HISTORY_LIMIT = 50`** : fenêtre glissante. Au-delà, les états les
  plus anciens sont droppés. 50 × ~5 KB = ~250 KB max → négligeable.
- **`undo` puis `commit` invalide `future`** : convention React /
  Photoshop, conforme à l'attente utilisateur.
- **Keybindings désactivés dans les champs éditables** : si l'user a le
  focus dans un `<input>`, `<textarea>` ou un `contenteditable`,
  `Cmd+Z` reste l'undo natif du texte (pas de vol). Détection par
  `tagName` + `isContentEditable`.
- **`reset(newLayout)`** : purge tout l'historique. Utilisé au login,
  au changement de profil, ou à l'import d'un layout externe.

**Critères d'acceptation (P3.1)** :
- [x] Store entièrement pur, testable hors React.
- [x] Coalescing par `groupKey` + fenêtre temps (premier commit JAMAIS
      coalescé pour préserver l'undo).
- [x] `HISTORY_LIMIT` glissant : pas de fuite mémoire après N opérations.
- [x] Hook React expose les keybindings standards (Cmd+Z / Cmd+Shift+Z
      / Ctrl+Y) avec fallback dans les champs éditables.
- [x] 21 tests unitaires verts sur le store pur.
- [x] 0 lint error, 0 dépendance ajoutée au `package.json`.

#### 14.5.3 P3.2 — `<FreeCanvas>` read-only (livré, 19 mai 2026)

Premier rendu **visible** du canvas libre : une page A4 (ou plusieurs)
avec les blocs positionnés en `mm`, contenu CV résolu via `bind`. Pas
encore de drag / resize — objectif = valider le pipeline
`layout v3 + cv → pixels`.

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Composant page + scale viewport | `frontend/src/components/editor/FreeCanvas.jsx` |
| Rendu d’un bloc (sémantique + décoratif) | `frontend/src/components/editor/FreeCanvasBlock.jsx` |
| Échelle A4 (mm → px, `ResizeObserver`) | `frontend/src/lib/freeCanvasScale.js` |
| Résolution `bind` → texte / listes CV | `frontend/src/lib/freeCanvasContent.js` |
| Styles page + blocs + picker démarrage | `frontend/src/styles/FreeCanvas.css` |
| Intégration Beta (toggle + hydratation layout) | `frontend/src/components/editor/CvEditorBeta.jsx` |
| Tests purs | `freeCanvasScale.test.js` (5), `freeCanvasContent.test.js` (6) |

**Intégration dans l’éditeur Beta** :
- Toggle topbar **Édition guidée** / **Canvas libre** (L1 inchangé en mode guidé).
- Hydratation : `layout` API → `migrateLayoutToV3` ; absence de layout →
  page blanche + **picker** « Partir d’un modèle » / « Page blanche ».
- Boutons Annuler / Rétablir + raccourcis clavier actifs en mode libre.
- Auto-save envoie `layout` uniquement en mode canvas libre (non vide).

**Critères d'acceptation (P3.2)** :
- [x] La page A4 s’affiche centrée et mise à l’échelle dans le viewport.
- [x] Les blocs du `createStarterLayoutV3()` apparaissent aux coords `x/y/w/h`.
- [x] Les blocs sémantiques affichent le contenu du CV (identity, expériences, …).
- [x] Les blocs `text`, `title`, `shape:line`, etc. s’affichent en read-only.
- [x] Toggle guidé / libre sans régression sur L1.
- [x] Choix page blanche vs starter au premier démarrage sans layout.
- [x] 11 tests unitaires purs + build frontend OK.

#### 14.5.4 P3.3 — Sélection + drag natif (livré, 19 mai 2026)

**Comportement P3.2 clarifié** : chaque bloc avait `overflow: auto` sur
`.free-canvas-block__inner` — d’où des **barres de scroll à l’intérieur**
des sections (expériences, etc.) quand le contenu dépassait la hauteur
fixe du bloc starter. C’était un compromis read-only, **pas** la vision
Canva finale. Règle produit (P3.3+) : **jamais de scroll interne** dans un bloc —
`overflow: hidden` / `clip` à 100 % largeur/hauteur du cadre. Contenu
trop long = rogné. Pour adapter : **redimensionner** le bloc (P3.4),
**typo** (theme / inspecteur, à venir) ou **moins de contenu** (drawer
Contenu / édition guidée). L’auto-grow optionnel reste prévu en P3.10.

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Conversion delta souris (px) → mm selon `scale` | `frontend/src/lib/freeCanvasDrag.js` |
| Pointer capture + drag sur blocs | `frontend/src/components/editor/FreeCanvas.jsx` |
| Curseur grab/grabbing, z-index élevé au drag | `frontend/src/styles/FreeCanvas.css` |
| `commit(layout)` avec `groupKey: drag:<blockId>` (coalescing undo) | `CvEditorBeta.jsx` + `useLayoutHistory` |
| Tests | `freeCanvasDrag.test.js` (4) |

**Critères d'acceptation (P3.3)** :
- [x] Clic sur un bloc → sélection (contour indigo).
- [x] Clic sur la page vide → désélection.
- [x] Glisser un bloc → position mise à jour en mm (clamp page).
- [x] Un seul pas undo pour tout un drag (coalescing `groupKey`).
- [x] Auto-save déclenché à la fin du drag.
- [x] Aucun scroll interne dans les blocs (contenu rogné, cadre 100 %).

#### 14.5.5 P3.4 — Redimensionnement (poignées aux coins) (livré, 19 mai 2026)

**Note produit — cadre vs contenu** : les blocs **ne s’agrandissent pas
avec le texte** (pas d’auto-grow en P3.4). C’est voulu type Canva : taille
= propriété du layout en mm. Contenu trop long = rogné jusqu’à ce que
l’utilisateur **tire une poignée** ou réduise le contenu / la typo (plus
tard). L’auto-grow optionnel reste en P3.10 si besoin.

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Calcul resize nw/ne/sw/se en mm + clamps page | `frontend/src/lib/freeCanvasResize.js` |
| Poignées sur bloc sélectionné + pointer capture | `FreeCanvasBlock.jsx`, `FreeCanvas.jsx` |
| `updateBlock` + coalescing `resize:<blockId>` | `CvEditorBeta.jsx` |
| Tests | `freeCanvasResize.test.js` (5) |

**Critères d'acceptation (P3.4)** :
- [x] Bloc sélectionné → 4 poignées aux coins.
- [x] Drag poignée → `w/h` (et `x/y` si coin ouest/nord) mis à jour en mm.
- [x] Un undo pour tout un redimensionnement (coalescing).
- [x] Tailles min et limites page respectées.
- [x] Pas d’auto-grow : l’utilisateur agrandit le cadre pour voir la fin du contenu.

#### 14.5.6 P3.5 — Barre d’insertion de blocs (livré, 19 mai 2026)

Barre **Insérer** au-dessus du canvas (mode libre uniquement) :
texte, titre, trait (`shape:line`), bandeau (`shape:rect`), icône.

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Presets + placement (empile sous le dernier bloc) | `frontend/src/lib/freeCanvasBlockPresets.js` |
| UI barre d’outils | `frontend/src/components/editor/EditorInsertToolbar.jsx` |
| Styles | `frontend/src/styles/EditorInsertToolbar.css` |
| `addBlockToPage` + sélection auto + save | `CvEditorBeta.jsx` |
| Bonus : bouton « Supprimer bloc » si sélection | `CvEditorBeta.jsx` |
| Tests | `freeCanvasBlockPresets.test.js` (5) |

**Critères d'acceptation (P3.5)** :
- [x] 5 types insérables depuis la barre.
- [x] Nouveau bloc empilé sous les blocs existants (gap 6 mm).
- [x] Bloc sélectionné automatiquement après insertion.
- [x] Layout persisté via auto-save en mode libre.
- [x] Barre masquée tant que le picker « page blanche / modèle » est affiché.

#### 14.5.7 P3.6 — Inspecteur du bloc sélectionné (livré, 19 mai 2026)

Onglet **Bloc** dans le drawer (mode canvas libre, bloc sélectionné) :
position/taille en mm, z-index, premier/arrière plan, contenu
(texte libre / icône / limite), style (alignement, couleur, format…).

**Implémentation** :

| Rôle | Fichier |
|---|---|
| Schéma des champs par type | `frontend/src/lib/blockInspectorSchema.js` |
| Panneau React | `frontend/src/components/editor/EditorBlockInspectorPanel.jsx` |
| Onglet dynamique dans le drawer | `EditorInspectorDrawer.jsx` |
| Wiring commit layout | `CvEditorBeta.jsx` |
| Styles | `EditorInspector.css` |
| Tests | `blockInspectorSchema.test.js` (5) |

**Critères d'acceptation (P3.6)** :
- [x] Onglet Bloc visible quand un bloc est sélectionné sur le canvas.
- [x] Modification x/y/w/h/z reflétée en direct sur le canvas.
- [x] Texte libre / titre éditable dans l’inspecteur.
- [x] Blocs sémantiques : hint + contenu via onglet Contenu.
- [x] Boutons premier plan / arrière-plan.
- [x] Styles pertinents par type (couleur trait, format expériences, etc.).

#### 14.5.8 P3.7–P3.9 — Snap, rendu backend, score ATS L3 (livré)

**P3.7** : grille 5 mm, guides magnétiques (bords page, centre, marges, quarts,
autres blocs), priorité magnétique sur la grille. Fichiers :
`freeCanvasSnap.js`, `FreeCanvas.jsx`, `FreeCanvas.css`.

**P3.8** : `backend/services/layout_renderer.py` + `layout_bindings.py` ;
`POST /api/render-html` accepte `layout` v3. Tests : `test_layout_renderer.py`.

**P3.9** : règles ATS canvas libre (`grid == "free"`) dans
`backend/services/ats_score/rules/free_canvas.py` :

| Règle | Delta |
| --- | --- |
| `malus_free_canvas_reading_order` | −3 par inversion d’ordre sémantique (plafond −9) |
| `malus_identity_not_first` | −5 si l’identité n’est pas lue en premier |
| `malus_experiences_before_resume` | −5 si expériences avant le résumé |
| `malus_contact_low_on_page` | −3 si contact sous 30 % hauteur page |

Le badge ATS en mode canvas libre envoie le `layout` v3 courant (plus le
`template_id`). Version scoring : `2026.05.1`.

#### 14.5.9 Robustesse ATS + P3.10 pagination (livré)

**ATS** : debounce 550 ms, retry (3 tentatives), empreinte layout stable,
pause pendant drag/resize, conservation du dernier score en erreur, bouton
réessayer. Fichiers : `useAtsScoreFetching.js`, `atsScoreLayoutFingerprint.js`.

**P3.10** : `layoutPagination.js` — blocs dont le bas dépasse 297 mm sont
déplacés sur la page suivante à la fin du drag/resize (`pagination:auto`).

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
