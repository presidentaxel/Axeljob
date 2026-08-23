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

Les `title_style` catalogue (`modern-main`, `creative-main`, `classic-main`,
`executive-main`, `bold-main`, `elegant-section`, `minimal-section`, variants
sidebar) sont mappés en PDF (`twin-main` / `modern-sidebar` / `creative-sidebar`
/ `sidebar-bar`) via `--layout-section-title` / `--layout-accent` /
`--layout-sidebar` / `--layout-header` du thème.

Zones sombres (`style.zone: sidebar|header`) : texte identité / contact / listes
en blanc (le fond vient des `shape:rect` du layout). Presets `photo_border`
(`light`, `accent`, `accent-thick`, `accent-thin`) exportés.

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
