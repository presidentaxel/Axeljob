# Design system AxeL Job (v1)

Contrat pour construire les prochains écrans.  
L’analyse visuelle Cohere (`docs/DESIGN-cohere.md`) est une **planche d’inspiration**, pas la source de vérité.

Source unique : `frontend/src/design/tokens.json` → CSS `--ds-*` (`npm run tokens`).

## 3 couches

```
Primitives  →  Sémantique  →  Composant
```

- **Primitives** (`color.neutral.900`, `color.green.900`) : jamais dans un composant.
- **Sémantique** (`color.action.primary.bg`, `color.text.muted`) : 90 % du CSS.
- **Composant** : classes `.ds-button--*` / `.ds-input`. Elles ne référencent que du sémantique.

Règle : **aucun hex dans un fichier UI**. Si la marque change, on touche le JSON.

## Convention de nommage

```
[catégorie].[concept].[variante].[état]
```

CSS : `--ds-color-action-primary-bg-hover`  
Abréviation figée : **`bg`** (pas `background`).

## Couleur (sémantique)

| Token | Usage |
|---|---|
| `color.bg.default / .subtle / .inverse` | canvas, pierre, bande produit |
| `color.text.default / .muted / .inverse / .link / .danger` | texte |
| `color.border.default / .subtle / .focus / .input-focus` | traits + focus |
| `color.action.primary.*` | CTA |
| `color.feedback.error / .warning / .success / .info` | statut |
| `color.accent.editorial` | coral, chips seulement |

## Typo (rôle, pas emplacement)

Classes : `ds-display-xl|lg|md`, `ds-heading-xl|lg|md`, `ds-body-lg|md`, `ds-label-md|sm`, `ds-mono-sm`.

## Bouton

Axes séparés — la pill n’est **pas** une variante (`radius.action = 32px`).

| Axe | Valeurs |
|---|---|
| variant | `primary` `secondary` `tertiary` `ghost` `link` `danger` `success` |
| size | `sm` 32px · `md` 40px · `lg` 48px — sous 768px, `sm` et `md` passent à `size.touch.min` (44px) |
| tone | `default` · `inverse` (bande sombre) |
| state | `:hover` `:active` `:focus-visible` `:disabled` `[aria-busy]` |
| modifiers | `icon-only` `full-width` |

```jsx
<Button variant="primary" size="md" tone="inverse" loading={false}>
  Continuer
</Button>
```

```css
.ds-button.ds-button--primary.ds-button--md
```

Un seul `primary` par zone.

Pas de variant `outline` : le markup CSS `.button-pill-outline` reste un **alias de `secondary`**, pas une clé JS.

## Alias CSS legacy — critère de suppression

`buttonClassName` pose encore `button` + `button-primary` (ou l’équivalent variant) **en plus** des classes `ds-*`. Sans date de sortie, le double système devient permanent.

Les alias sont retirés de `buttonClassName` (et les sélecteurs `.button-primary` / `.button-pill-outline` de `buttons.css`) quand **plus aucune occurrence de `.button-primary` ne subsiste dans `frontend/src/`**, hors le helper lui-même et les sélecteurs d’alias dans `frontend/src/styles/app/buttons.css`.

Jusque-là : ne plus ajouter de markup `button-primary` ; passer par `<Button>` ou `buttonClassName()`.

## Input

```jsx
<Input invalid={Boolean(error)} />
{error ? <p className="ds-field-error">{error}</p> : null}
```

États : hover, focus (`border.input-focus` + outline `border.focus`), `aria-invalid`, disabled.

## Z-index

`z.dropdown` 100 · `z.sticky` 200 · `z.modal` 400 · `z.toast` 500.

## Hors v1

Motion fine au-delà de duration/easing, iconographie, gouvernance draft/beta/stable, Style Dictionary / Tailwind / Figma.

## Gouvernance

Statut v1 : **beta**. Contribuer en étendant `tokens.json` (sémantique d’abord), puis `npm run tokens`.
