# Recette GA4 — AxeL Job (AXE-365)

Ticket Linear : [AXE-365](https://linear.app/axel-project/issue/AXE-365).  
Tracker code : `frontend/public/track.js` (AXE-361). **PostHog hors v1.**

Le tracker pousse deux choses dans `dataLayer` :

1. la commande gtag (`event`, nom, params) — file d’attente Consent Mode ;
2. un objet `{ event: '<nom>', …params }` — **c’est celui-ci** que GTM écoute le plus simplement (déclencheur « Événement personnalisé »).

Sans balises GTM qui **relayaient** ces events vers GA4, DebugView ne montrera que les `page_view` de la balise Google tag.

## 0. Prérequis prod

Sur [job.axelproject.fr](https://job.axelproject.fr) (après deploy de AXE-361), console :

```js
window.__AXEL_GTM_ID__   // doit être GTM-… réel, pas '' ni GTM-XXXXXXX
document.querySelector('script[src*="/track.js"]')
JSON.parse(localStorage.getItem('axel_job_consent_v1') || 'null')
```

- `__AXEL_GTM_ID__` vide → le conteneur ne charge pas. Variable Docker `VITE_AXEL_GTM_ID` au **build** (`docker compose build`), pas seulement au runtime.
- ID de mesure déjà documenté : `G-7524WTRGSY` (`frontend/public/analytics-config.js`).

Consentement : **Mesure d’audience** ON, sinon le tracker n’émet rien.

## 1. GTM — ne pas cibler de classe CSS

Interdit : déclencheur « Clic — tous les éléments » filtré sur `.button` / `.btn`.  
Les clics sont déjà captés par `track.js` via `data-attr`.

### 1.1 Variables couche de données (portée événement)

| Nom GTM | Nom de la clé dataLayer |
|---|---|
| `dlv - cta_id` | `cta_id` |
| `dlv - cta_zone` | `cta_zone` |
| `dlv - cta_level` | `cta_level` |
| `dlv - cta_text` | `cta_text` |
| `dlv - link_url` | `link_url` |
| `dlv - nav_id` | `nav_id` |
| `dlv - nav_type` | `nav_type` |
| `dlv - plan` | `plan` |
| `dlv - price` | `price` |
| `dlv - zone` | `zone` |
| `dlv - section_id` | `section_id` |
| `dlv - link_domain` | `link_domain` |
| `dlv - method` | `method` |
| `dlv - source_cta_id` | `source_cta_id` *(après AXE-362)* |
| `dlv - plan_intent` | `plan_intent` *(après AXE-362)* |

### 1.2 Déclencheurs (événement personnalisé)

Un déclencheur par nom, **nom d’événement = nom GA4** :

| Nom du déclencheur | Event name |
|---|---|
| `CE - cta_click` | `cta_click` |
| `CE - nav_click` | `nav_click` |
| `CE - select_plan` | `select_plan` |
| `CE - section_view` | `section_view` |
| `CE - outbound_click` | `outbound_click` |
| `CE - contact_click` | `contact_click` |
| `CE - sign_up_start` | `sign_up_start` *(après AXE-362)* |
| `CE - sign_up` | `sign_up` *(après AXE-362)* |

Consentement : `consent-gtm.js` pose Consent Mode v2 avec `analytics_storage` **denied** par défaut, puis `update` selon le bandeau (`granted` / `denied`). Les balises Google (GA4 Event) ont déjà un contrôle intégré — **ne pas** ajouter un « additional consent check » GTM sur `analytics_storage`, ça peut entrer en conflit. Le tracker n’émet rien tant que la mesure d’audience n’est pas ON. Recetter les deux états (refusé : aucun event marketing ; accordé : events ci-dessous).

### 1.3 Balises GA4 Event

Pour chaque déclencheur : balise **Google Analytics : événement GA4** (ou Event du Google tag).

- Configuration / ID de mesure : `G-7524WTRGSY` (ou variable de la balise Google tag déjà posée).
- Nom de l’événement : le même que le déclencheur (`cta_click`, etc.).
- Paramètres (seulement ceux utiles) :

| Event | Paramètres |
|---|---|
| `cta_click` | `cta_id`, `cta_zone`, `cta_level`, `cta_text`, `link_url` |
| `nav_click` | `nav_id`, `nav_type`, `link_url` |
| `select_plan` | `plan`, `price`, `zone` |
| `section_view` | `section_id` |
| `outbound_click` | `link_domain`, `link_url` |
| `contact_click` | `method` |
| `sign_up_start` | `method`, `source_cta_id` *(362)* |
| `sign_up` | `method`, `plan_intent`, `source_cta_id` *(362)* |

Publier le conteneur.

## 2. GA4 — dimensions et conversions

Admin → Propriété `G-7524WTRGSY` (ou la propriété liée au GTM prod).

### Dimensions personnalisées (portée **événement**)

Créer (noms d’affichage libres, **paramètre d’événement** = clé exacte) :

`cta_id` · `cta_zone` · `cta_level` · `plan` · `section_id` · `nav_id` · `source_cta_id` · `plan_intent`

Les rapports standards peuvent mettre 24–48 h ; **DebugView est immédiat**.

### Conversions (événements clés)

Marquer comme conversion / événement clé :

- `select_plan` — **maintenant** (déjà émis par AXE-361)
- `sign_up` — **déclarer maintenant**, volume 0 jusqu’à AXE-362

Ne pas marquer `cta_click` en conversion (trop bruité).

### Funnel de référence (Exploration)

Tant que 362 n’est pas mergé, un funnel **partiel** suffit :

`page_view` → `section_view` (filtrer `section_id` = `pricing`) → `cta_click` (filtrer `cta_level` = `primary`) → `select_plan` (`plan` = `pro`)

Funnel cible après 362 :

`page_view` → `section_view` (pricing) → `cta_click` (primary) → `sign_up_start` → `sign_up` → `select_plan` (pro)

## 3. DebugView — parcours (toi, sans créer de compte)

1. GA4 → Admin → DebugView (ou extension [GA Debugger](https://chrome.google.com/webstore) / `debug_mode`).
2. Site prod, consentement audience ON.
3. Parcours :

| Action | Event DebugView | Checks |
|---|---|---|
| CTA hero | `cta_click` | `cta_id=home-hero-cta-signup`, zone/level **pas** `unknown` |
| Passer Pro | `cta_click` **et** `select_plan` | `plan=pro`, `price=10`, `zone=pricing` |
| Commencer gratuitement | `cta_click` + `select_plan` | `plan=free`, `price=0` |
| Lien footer FAQ | `nav_click` | `nav_id=footer-link-faq` |
| Lien Axel Project (footer) | `nav_click` **et** `outbound_click` | host `axelproject.fr` ≠ `job.axelproject.fr` |
| Support (`mailto:`, footer React) | `nav_click` **et** `contact_click` | `method=email` ; `link_url` = `mailto:` (pas l’adresse) |
| Scroll tarifs ≥ 50 % | `section_view` | `section_id=pricing`, **une fois** par onglet |
| Audience **refusée** | — | **aucun** event marketing (tracker silencieux) |
| `/app` connecté | — | **aucun** de ces events marketing |

Hors DebugView, console :

```js
window.dataLayer.filter(e => e && typeof e === 'object' && e.event &&
  ['cta_click','nav_click','select_plan','section_view','outbound_click','contact_click'].includes(e.event))
```

## 4. Découpage vs AXE-362

| Critère AXE-365 | Statut sans 362 |
|---|---|
| GTM prod ID réel | À vérifier (toi, console + Docker) |
| DebugView `cta_click` / `nav_click` / `select_plan` / `section_view` / `outbound_click` / `contact_click` | Recettable **maintenant** |
| DebugView `sign_up_start` / `sign_up` | **Après AXE-362** |
| Dimensions perso | Créer maintenant |
| Conversion `select_plan` | Maintenant |
| Conversion `sign_up` | Déclarer maintenant, tester après 362 |
| Funnel complet + test Pro → **nouveau** compte | Après 362 (recette signup = quelqu’un d’autre si besoin) |

## 5. Rollback

GTM : restaurer la version précédente du conteneur.  
Aucun rollback code nécessaire pour cette recette ops (le tracker reste AXE-361).
