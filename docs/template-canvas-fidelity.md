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
| `minimal` | single-column | projection | medium | Header/contact/titres/exp alignés (tranche 2) ; Outils nestés + densités + multi-page à valider |
| `classic` | sidebar-right | thin | thin | CSS Stable dense vs twin mince |
| `modern` | sidebar-left | projection | medium | Sidebar / accents |
| `creative` | sidebar-left | projection | medium | Titres creative-main |
| `elegant` | single-column | projection | thin | Chips / centrage |
| `executive` | sidebar-right | projection | medium | Header band |
| `bold` | sidebar-right | **near-replica** | rich | Écarts typo/exp résiduels |

Source de vérité code : `TEMPLATE_CANVAS_FIDELITY` + `STABLE_CANVAS_TEMPLATE_IDS`.

### Minimal — couches Stable à calquer

1. **HTML** `templates/minimal/template.html` — structure (header sans photo, contact ` · `, titres Title Case, `Organisation :` / `Fonction :` inline)
2. **CSS** `templates/minimal/template.css` — pad `18/28/8`, body `6/28/16`, règle `#d1d5db`, typo Georgia/Inter
3. **Options** `meta.json` + `template_registry` — `show_photo=false`, couleurs/font injectées
4. **Preview overlay** `cvPreviewA4Pages.js` — badge « Page N » (chrome preview, pas du template)
5. **Canvas** `buildTemplateBlocks('minimal')` + `CanvasTemplateFidelity.css` + `FreeCanvasBlock` (`contact_layout`, `exp_style: minimal`)

## Critères de « réplique native »

Pour un id catalogue :

1. Apply Stable→Beta produit un layout non vide (`theme.template_id` = id)
2. Checklist visuelle vs preview Stable (header, colonnes, titres, sidebar)
3. Écarts résiduels listés ici / dans `gaps[]`
4. Tests structurels verts (`canvasTemplateSpecs.test.js`)

## Suite chantier

1. ~~Inventaire + contrat tests + premier lift `minimal`~~ (PR #165)
2. **Tranche 2 `minimal`** : header sans photo, contact ` · `, Title Case, exp ATS inline, règle grise (cette PR — **ne pas merger** tant que la checklist visuelle Stable≠Beta n’est pas OK)
3. Monter `classic` / `elegant` (fidelity CSS + géométrie)
4. Finir `bold` en réplique validée (checklist visuelle)
5. Option ultérieure : assets `default_layout.json` par template (voir `docs/editor-vision.md`)

## Hors scope

- Fidélité **canvas ↔ PDF** → `docs/pdf-block-fidelity.md` (AXE-38)
- Carte picker « Beta » → AXE-374 (Done)
