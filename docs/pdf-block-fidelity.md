# Matrice de fidélité canvas ↔ PDF (AXE-38)

Source de vérité pour le support des blocs layout v3 entre l’éditeur Beta
(`FreeCanvas`) et l’export PDF (`backend/services/layout_renderer.py`).

**Règle d’équipe :** ne pas ajouter un nouveau type de bloc UI tant que
l’export PDF et cette matrice ne sont pas alignés (supporté ou
explicitement `unsupported` + badge).

Classification UI : `frontend/src/lib/canvasPdfFidelity.js`
(`ok` / `partial` / `unsupported`).

| Niveau | Signification |
|--------|----------------|
| **ok** | Rendu PDF aligné pour l’usage courant |
| **partial** | Exporté, mais simplifié (badge « PDF » ambre) |
| **unsupported** | Placeholder / non fidèle (badge rouge + bandeau export) |

---

## Blocs sémantiques

| Type | Canvas | PDF | Niveau | Notes |
|------|--------|-----|--------|-------|
| `identity` | oui | oui | ok | Séparateur / accent (`identity_divider`, `title_accent`) exportés |
| `contact` | oui | oui | ok | `contact_uppercase` / `contact_divider` exportés ; icônes téléphone/email/lien |
| `photo` | oui | oui | ok | Focal, zoom, formes, bordures |
| `resume` | oui | oui | ok | Typo bloc + rich text sanitize |
| `experiences` | oui | oui | ok | `exp_style` twin (ATS, dates `-`/`–`, bullets dash / ▸ creative) |
| `formations` | oui | oui | ok | |
| `certifications` | oui | oui | ok | |
| `projets` | oui | oui | ok | |
| `skills` | oui | oui | ok | chips / list |
| `languages` | oui | oui | ok | |

## Blocs non sémantiques

| Type | Canvas | PDF | Niveau | Notes |
|------|--------|-----|--------|-------|
| `text` / `title` | oui | oui | ok / **partial** | `effect` décoratif → partial |
| `image` | oui | oui | ok | Focal, zoom, radius, bordures |
| `icon` | ~70 hi2 | 5 SVG | ok / **partial** | Whitelist : HiPhone, HiDevicePhoneMobile, HiEnvelope, HiLink, HiMapPin |
| `qrcode` | placeholder | placeholder | **unsupported** | Pas de génération de matrice QR |
| `shape:line` | oui | oui | ok | Orientation verticale / stroke |
| `shape:rect` | oui | oui | ok | Fill, radius, stroke |
| `shape:circle` … `shape:heart` | SVG | SVG | ok | Paths alignés sur `canvasShapePresets.js` |
| Autres formes | — | — | **unsupported** | Doivent être ajoutées au renderer + matrice |

## Styles template (twins)

## Styles (interprète canvas, pas un template figé)

Le PDF lit **`block.style`** comme `FreeCanvasBlock` : `title_style`, `exp_style`,
`formation_style`, `zone`, `contact_layout` × `align` × `contact_separator`,
`list_format`, `skills_nested_outils`, `show_section_title`, `header_layout`,
`identity_layout`, `nowrap`. Un layout libre (Beta) ou un mix de tokens
(titre Creative + expériences Bold) s’exporte sans `template_id`.

`theme.template_id` ne sert qu’à l’exception canvas Classic : la page
`--tpl-classic` restyle les tokens `bold-*` en filet bas (comme
`CanvasTemplateFidelity.css`). Couleurs / polices viennent des CSS vars
thème (`--layout-accent`, `--layout-section-title`, …).

Règles d’en-tête alignées sur `FreeCanvasBlock` :

- `section_label` → titre ; `sidebar_category` seul → catégorie
- `show_section_title: false` → pas de titre (résumé header)
- liste vide → placeholder seul, sans titre
- `formation_style: minimal|classic` → dates à droite
- `list_format: list` vs `inline` (langues / compétences)
- zones `header` / `sidebar` : encre claire **seulement** si le bloc recouvre
  un `shape:rect` sombre (`data-on-dark`) ; `sidebar-light` / `main` : sombre

Presets `photo_border` (`light`, `accent`, `accent-thick`, `accent-thin`)
exportés — `accent-thick` = **0.8 mm** (comme le canvas Bold), pas 1.1 mm.
Contour photo : bordure sur le cadre, clip de l’image en enfant (WeasyPrint
clippe sinon l’anneau). Filets < 0.4 mm relevés, y compris les `shape:rect` (`bar()` canvas, pas seulement
`shape:line`). Icônes contact = **outline hi2** + `stroke` hex (pas fill solid).
Chips Elegant : pas de bordure (`#edf2f7`) ; filet sous section `#e2e8f0`.
Tirets bullets : `#1e293b` (chevron Creative / Elegant = accent).
Dates formation : tone `ink` / `brand` / `accent` / `soft` selon le token,
pas toujours `--layout-accent`.

Polices : `@font-face` locaux `pdf_export/fonts/` (Inter + Plus Jakarta Sans)
pour WeasyPrint (pas de fetch Google Fonts à l’export).

Centrage vertical header/sidebar identité + contact ; séparateurs expériences
twin ; titres Bold sidebar = barre gauche (pas filet bas).

Les effets de bloc (`style.effect`) ne sont pas exportés → **partial**.

**Limite :** densités / line-height twin CSS ne sont pas toutes portées. Objectif =
chrome + couleurs + polices + structure lisibles, pas un clone pixel-perfect.

---

## Persistance

`backend/services/layout_sanitize.py` autorise tous les types de la matrice
ci-dessus (y compris les formes vectorielles listées). Un type hors allowlist
est droppé à la sauvegarde.

---

## Tests

- `tests/test_layout_renderer.py` — fragments + snapshots HTML
- `frontend/tests/unit/canvasPdfFidelity.test.js` — classifier UI

Mettre à jour ce document **dans la même PR** qu’un changement de
renderer ou de classifier.
