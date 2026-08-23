# Fidélité templates Stable ↔ canvas Beta (AXE-346)

## Objectif

Chaque template catalogue Stable (`templates/<id>/`) doit avoir une **réplique native** canvas Beta (blocs + thème + CSS twin), pas seulement une projection approximative.

État actuel : `buildTemplateBlocks` dans `frontend/src/lib/canvasTemplateSpecs.js` **projette** des géométries mm à la main. Ce document + `TEMPLATE_CANVAS_FIDELITY` mesurent l’écart.

## Architecture

```
templates/<id>/{meta.json,template.html,template.css}  ← Stable (Jinja)
        │
        ▼  projection manuelle (à remplacer progressivement par réplique)
canvasTemplateSpecs.js → buildTemplateBlocks / parseCanvasTheme
        │
        ▼
layoutTemplatePresets.createCanvasLayoutForTemplate
        │
        ├─ pont Stable→Beta (designModeBridge.applyStableDesignToCanvas)
        └─ FreeCanvas + CanvasTemplateFidelity.css (.free-canvas-page--tpl-{id})
```

Le template virtuel `beta` (`betaCanvasTemplate.js`) n’est **pas** une twin HTML : c’est le layout canvas libre du profil.

## Matrice (août 2026)

| ID | Famille | Readiness | Fidelity CSS | Gaps principaux |
|----|---------|-----------|--------------|-----------------|
| `minimal` | single-column | near-replica | **rich** | Checklist visuelle OK (PR #170) |
| `classic` | sidebar-right | near-replica | **rich** | Checklist visuelle + densité PDF (AXE-389 / PR #177) |
| `modern` | sidebar-left | projection | medium | Sidebar / accents |
| `creative` | sidebar-left | projection | medium | Titres creative-main |
| `elegant` | single-column | near-replica | **rich** | Checklist visuelle OK (PR #174 / AXE-388) |
| `executive` | sidebar-right | projection | medium | Header band |
| `bold` | sidebar-right | **near-replica** | rich | Écarts typo/exp résiduels |

Source de vérité code : `TEMPLATE_CANVAS_FIDELITY` + `STABLE_CANVAS_TEMPLATE_IDS`.

### Minimal — couches Stable à calquer

1. **HTML** `templates/minimal/template.html` — structure (header sans photo, contact ` · `, titres Title Case, `Organisation :` / `Fonction :` inline)
2. **CSS** `templates/minimal/template.css` — pad `18/28/8`, body `6/28/16`, rule `#d1d5db`, typo Georgia/Inter
3. **Options** `meta.json` + `template_registry` — `show_photo=false`, couleurs/font injectées
4. **Preview overlay** `cvPreviewA4Pages.js` — badge « Page N » (chrome preview, pas du template)
5. **Canvas** `buildTemplateBlocks('minimal')` + `CanvasTemplateFidelity.css` + `FreeCanvasBlock` (`contact_layout`, `exp_style: minimal`)

### Élégant — couches Stable à calquer (AXE-388)

1. **HTML** `templates/elegant/template.html` — photo centrée, contact ` · `, titres Title Case (+ uppercase CSS), chips techniques+outils, exp ATS (Fonction ligne séparée)
2. **CSS** `templates/elegant/template.css` — pad `22/30/16`, body `0/30`, filet `#e2e8f0`, chips `#edf2f7` / tools `#e2e8f0`
3. **Canvas** `buildTemplateBlocks('elegant')` + twin CSS + `exp_style: elegant` + `format: chips` + `skills_nested_outils`

### Classique — couches Stable à calquer (AXE-389)

1. **HTML** `templates/classic/template.html` — header sombre (photo + nom/titre inline, résumé, contact icônes centré), main (exp/formation/projets), sidebar droite compétences
2. **CSS** `templates/classic/template.css` — pad header `12/16`, photo 52px, sidebar 200px, titres uppercase + filet accent
3. **Canvas** `buildTemplateBlocks('classic')` + twin CSS + `exp_style: classic` + `freeform` / `replica_cascade`

## Critères de « réplique native »

Pour un id catalogue :

1. Apply Stable→Beta produit un layout non vide (`theme.template_id` = id)
2. Checklist visuelle vs preview Stable (header, colonnes, titres, sidebar)
3. Écarts résiduels listés ici / dans `gaps[]`
4. Tests structurels verts (`canvasTemplateSpecs.test.js`)

## Suite chantier

1. ~~Inventaire + contrat tests + premier lift `minimal`~~ (PR #165 / #170)
2. ~~Tranche Minimal~~ validée checklist visuelle
3. ~~Élégant~~ (AXE-388 / PR #174) — near-replica
4. ~~Classic~~ (AXE-389 / PR #177) — near-replica ; checklist visuelle + densité PDF à valider
5. Finir `bold` (écarts typo/exp résiduels)
6. Option ultérieure : assets `default_layout.json` par template (voir `docs/editor-vision.md`)

## Alignement contact header-bar

Le bloc contact `header-bar` est **gauche par défaut**. Le centrage est opt-in via `style.align: 'center'` (+ classe `--align-center`) — Classic / Élégant / Bold. Ne pas remettre `justify-content: center` sur le sélecteur global `.free-canvas-block__contact--header-bar`.

## Twin CSS vs design system app

`CanvasTemplateFidelity.css` calque volontairement les couleurs / graisses Stable (`templates/*/template.css`) — hex et `font-weight` 600/700 inclus. Ce n’est pas du chrome produit : la règle `--ds-*` / poids 400–500 s’applique à l’UI éditeur, pas aux répliques CV.

## Hors scope

- Fidélité **canvas ↔ PDF** → `docs/pdf-block-fidelity.md` (AXE-38)
- Carte picker « Beta » → AXE-374 (Done)
