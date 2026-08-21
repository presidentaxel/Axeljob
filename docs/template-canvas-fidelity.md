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
| `minimal` | single-column | projection | thin→medium | Réplique mono-colonne en cours ; valider vs preview Stable |
| `classic` | sidebar-right | thin | thin | CSS Stable dense vs twin mince |
| `modern` | sidebar-left | projection | medium | Sidebar / accents |
| `creative` | sidebar-left | projection | medium | Titres creative-main |
| `elegant` | single-column | projection | thin | Chips / centrage |
| `executive` | sidebar-right | projection | medium | Header band |
| `bold` | sidebar-right | **near-replica** | rich | Écarts typo/exp résiduels |

Source de vérité code : `TEMPLATE_CANVAS_FIDELITY` + `STABLE_CANVAS_TEMPLATE_IDS`.

## Critères de « réplique native »

Pour un id catalogue :

1. Apply Stable→Beta produit un layout non vide (`theme.template_id` = id)
2. Checklist visuelle vs preview Stable (header, colonnes, titres, sidebar)
3. Écarts résiduels listés ici / dans `gaps[]`
4. Tests structurels verts (`canvasTemplateSpecs.test.js`)

## Suite chantier

1. ~~Inventaire + contrat tests + premier lift `minimal`~~ (cette PR)
2. Monter `classic` / `elegant` (fidelity CSS + géométrie)
3. Finir `bold` en réplique validée (checklist visuelle)
4. Option ultérieure : assets `default_layout.json` par template (voir `docs/editor-vision.md`)

## Hors scope

- Fidélité **canvas ↔ PDF** → `docs/pdf-block-fidelity.md` (AXE-38)
- Carte picker « Beta » → AXE-374 (Done)
