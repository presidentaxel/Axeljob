# Conventions de nomination analytics — AxeL Job (AXE-356)

Ticket : [AXE-356](https://linear.app/axel-project/issue/AXE-356).  
Vague landing → signup : [`docs/taggage-analytics.md`](taggage-analytics.md) (inventaire `data-attr` figé AXE-358).  
Recette GA4 : [`docs/ga4-recette.md`](ga4-recette.md).

> **Figé 2026-08-25.** Un nom posé en production **ne se renomme jamais**. On ajoute, on déprécie.  
> Ce document est le contrat de naming **site entier** (public + `/app`). Il ne pose pas de nouveaux events.

---

## 1. Deux stacks — ne pas les mélanger

| | Marketing (public) | Produit (app connectée) |
|---|---|---|
| Périmètre | `/`, `/login`, FAQ, ATS, articles, légales, 404/500 | `/app/*` une fois session OK |
| Transport | `track.js` + `signupAttribution.js` → `dataLayer` / `gtag` | `trackEvent()` → `POST /api/events/track` → `event_log` (JSONL + Supabase) |
| Outil | **GA4** `G-7524WTRGSY` via GTM (`VITE_AXEL_GTM_ID` au **build**) | First-party `event_log` — **pas** GA4, **pas** de SDK PostHog |
| Consentement | CMP `axel_job_consent_v1` `{v:1, analytics, marketing}`. Aucun event marketing si `analytics` false | Session authentifiée. **Pas** derrière la CMP (déjà connecté) |
| Identifiants DOM | `data-attr` / `data-track` / `data-zone` / `data-level` / `data-section` | Events explicites. `data-attr` C.9 (7) + C.10–C.16 (49) **non lus** par `track.js` (ignore `/app`). `data-analytics-section` → `page_engagement.sections` |

**PostHog :** no-go v1 ([AXE-363](https://linear.app/axel-project/issue/AXE-363), [AXE-364](https://linear.app/axel-project/issue/AXE-364) canceled). Si un go futur (A/B Cloud EU) : **réutiliser les mêmes noms** (exemples § 8), même case CMP « Mesure d’audience », pas d’autocapture sur `/app`.

---

## 2. Règles de naming

### 2.1 Events

Deux dialectes **déjà en prod** — on ne les unifie pas (rename = funnels cassés).

| Stack | Forme | Exemples figés |
|---|---|---|
| Marketing GA4 | `objet_verbe` (présent / infinitif court) | `cta_click`, `nav_click`, `section_view`, `sign_up` |
| Produit | `objet_action` snake_case, participe / état | `adaptation_started`, `pdf_generated`, `statut_changed` |

**Nouveaux events**

- snake_case ASCII, minuscules, pas d’accents.
- Marketing : rester dans le dialecte GA4 (`*_click`, `*_view`, `sign_up_*`).
- Produit : `objet_action` (`cv_imported` interdit si `cv_import` existe déjà — **on garde `cv_import`**).
- Un nom = une intention. Pas de variante `AdaptCtaClicked` / `ADAPT_CTA`.
- Pas de préfixe `job_` / `axel_` sur les noms d’events (les noms actuels n’en ont pas). Un préfixe éventuel se fait à l’ETL, pas dans le code.

### 2.2 Propriétés

- snake_case. Clés stables listées § 5. **Pas d’email, mot de passe, nom, texte d’offre, texte de CV.**
- Valeurs enum en minuscules (`free` / `pro`, `form` / `email` / `google` / `linkedin`).
- IDs DOM (`source_cta_id`, `cta_id`) = kebab du catalogue, pas un libellé bouton.
- `cta_text` : sanitizé (max 80, emails strippés) — déjà `sanitizeCtaText` dans `track.js`.
- Contexte produit : JSON ≤ 4000 caractères (`/api/events/track` tronque sinon).

### 2.3 Pages / screens

| Stack | Comment on nomme | Figé |
|---|---|---|
| Marketing | URL path réel (`/`, `/login`, `/faq`, …) — `page_view` GA4 auto | ne pas inventer un `page_home` parallèle |
| Produit | `page_view` + `{ view, path }` | `view` ∈ `cv` \| `candidatures` \| `profil` \| `settings` \| `support` \| `monitoring` (`getViewFromPathname`). `/app/linkedin` → `view=profil` |

`view` **est** le screen name. Ne pas ajouter `screen_name` / `page_title` tant que `view` + `path` suffisent.

### 2.4 Identifiants DOM

| Attribut | Forme | Où | Figé par |
|---|---|---|---|
| `data-attr` | kebab `page-zone-type-intention` ; globaux sans page (`nav-` / `footer-` public, `app-nav-` topbar `/app`) | 1 ID = 1 élément. Jamais dans une classe CSS | [AXE-358](https://linear.app/axel-project/issue/AXE-358) (55 public) + C.9 (7 candidatures) + [AXE-395](https://linear.app/axel-project/issue/AXE-395) C.10–C.16 (49 `/app` hors candidatures) |
| `data-track` | `cta` \| `nav` \| `input` | public | 358 |
| `data-zone` | kebab (`hero`, `header`, `pricing`, …) | public | 358 |
| `data-level` | `primary` \| `secondary` \| `tertiary` | public | 358 |
| `data-section` | kebab | marketing, observé 50 % → `section_view` | 358 C.7 |
| `data-analytics-section` | **snake_case** (déjà en prod : `cv_workspace`, `candidatures_board`) | `/app`, observé → `page_engagement.sections` | ce doc |

C.9–C.16 sont figés (C.10–C.16 = markup [AXE-396](https://linear.app/axel-project/issue/AXE-396)). Tout `data-attr` /app **ajouté ensuite** : même convention kebab. Nouveaux `data-analytics-section` : snake_case (aligné code actuel, pas kebab).

---

## 3. Inventaire des surfaces

### 3.1 Public (externe) — tagué vague 1

SPA bundle (`entry-conditional.js`) seulement sur `/`, `/login`, `/app/*`. Le reste = HTML statique `frontend/public/*.html`. Tagger les **deux** arbres quand les deux existent.

| Route | Surface | Funnel / CTA clés | État |
|---|---|---|---|
| `/` | Landing | hero / nav / pricing / final → `/login` | `data-attr` + tracker CMP |
| `/login` | Auth | submit, Google, LinkedIn, toggle, forgot | idem + `sign_up_start` / `sign_up` |
| `/faq` | FAQ | questions + CTA signup | idem |
| `/ats` | Article ATS | CTA signup | idem |
| `/modeles-cv` `/guide-cv` `/erreurs-cv` `/cv-par-metier` `/cv-adapte-chaque-offre` | Articles | CTA signup | idem |
| `/mentions-legales` `/confidentialite` `/cgu` | Légales | footer only (pas de CTA signup dédié) | footer `data-attr` |
| 404 / 500 | Erreurs | `error-cta-home` / `error-cta-login` | idem |

**Hors vague 1 (ne pas inventer d’IDs ici) :** cookie banner, `faq_open`, drawer tertiaires, sources outbound FAQ (C.8).

### 3.2 App (interne)

| Route | `view` | Sections `data-analytics-section` (déjà là) | Events métier déjà émis | `data-attr` |
|---|---|---|---|---|
| `/app/cv` | `cv` | `cv_workspace`, `chat`, `preview`, `export` | adaptation\*, `adapt_cta_clicked`, `job_description_pasted`, `template_changed`, `cv_manually_edited`, `ats_details_opened`, `adaptation_rated`, `base_cv_pdf_downloaded`, `first_offer_nudge_cta`, onboarding\* | **C.11 + C.12 posés** (8 + 11) — clics **non** relayés |
| `/app/postule` | `candidatures` | `candidatures_board`, `candidatures_stats`, `candidatures_list_mobile` | `new_candidature_workspace`, `adapt_cta_clicked`, backend statut / refus / source offre | **C.9 posé** (7 IDs) — clics **non** relayés |
| `/app/profil` `/app/linkedin` | `profil` | `profil_editor` | `base_cv_pdf_downloaded` (profil), backend `profile_saved` | **C.13 posé** (6) — `/app/linkedin` = `profil`, pas d’IDs `linkedin-*` |
| `/app/settings` | `settings` | `settings_page` | `promo_code_redeemed` (backend) | **C.14 posé** (5) |
| `/app/support` | `support` | `support_page` | — | **C.15 posé** (6) |
| `/app/monitoring` | `monitoring` | `monitoring_dashboard` | — | **C.16 posé** (1, compte support) |
| toutes `/app/*` | — | — | — | **C.10 topbar posé** (12 `app-nav-*`) |

`EVENT_LOGIN` (`login`) est émis 1× / onglet au `SIGNED_IN` (`maybeEmitProductLogin`, [AXE-397](https://linear.app/axel-project/issue/AXE-397)). Distinct de GA4 `sign_up`.

---

## 4. Catalogue events figé

### 4.1 Marketing → GA4 (ne pas renommer)

| Event | Params | Source |
|---|---|---|
| `cta_click` | `cta_id`, `cta_zone`, `cta_level`, `cta_text`, `link_url` | `track.js` `data-track=cta` |
| `nav_click` | `nav_id`, `nav_type`, `link_url` | `data-track=nav` |
| `select_plan` | `plan`, `price`, `zone` | CTA pricing only |
| `section_view` | `section_id` | `data-section` ≥ 50 %, 1× / session |
| `outbound_click` | `link_domain`, `link_url` | href http(s) hors host |
| `contact_click` | `method=email` | `mailto:` |
| `sign_up_start` | `method`, `source_cta_id` | arrivée `/login` (1×) |
| `sign_up` | `method`, `plan_intent`, `source_cta_id` | **nouveau** compte seulement |

`page_view` marketing = celui de GA4/GTM (URL). Ne pas en émettre un second depuis `track.js`.

### 4.2 Produit → event_log (ne pas renommer)

**Frontend whitelist** (`_ALLOWED_FRONTEND_EVENTS`) — reçus via `/api/events/track` :

| Event | Props typiques | Où |
|---|---|---|
| `onboarding_method_chosen` | `method` = `file_upload` \| `text_paste` \| `manual` | OnboardingWizard |
| `onboarding_completed` | `method` | idem |
| `onboarding_skipped` | — | idem |
| `page_view` | `view`, `path`, `attribution?` (1× / session auth) | `useViewAnalytics` |
| `page_engagement` | `view`, `path`, `duration_ms`, `scroll_pct_max`, `sections[]` | idem |
| `job_description_pasted` | `word_count`, `source` | App CV |
| `cv_manually_edited` | `adaptation_id` | preview |
| `ats_details_opened` | `score` | rapport ATS |
| `adaptation_rated` | `rating`, `adaptation_id`, `score_ats` | thumbs |
| `template_changed` | `template_id` | preview |
| `adapt_cta_clicked` | `source`, `desc_word_count` | chat / candidatures |
| `base_cv_pdf_downloaded` | `template_id`, `source` = `cv_tab` \| `profile` | App + ProfileView ([AXE-394](https://linear.app/axel-project/issue/AXE-394)) |
| `first_offer_nudge_cta` | `action` = `go_cv` \| `dismiss` | nudge 1ʳᵉ offre (AXE-394) |
| `new_candidature_workspace` | `had_adapted_cv` | nouvelle candidature (AXE-394) |
| `login` | `method` = `email` \| `google` \| `linkedin` | `SIGNED_IN` 1× / onglet ([AXE-397](https://linear.app/axel-project/issue/AXE-397)). **Pas** GA4 |

**Backend only** (pas via le POST front) :

| Event | Quand |
|---|---|
| `adaptation_started` / `adaptation_completed` / `adaptation_failed` | pipeline adapt |
| `pdf_generated` | export PDF adapté |
| `export_dossier` | export dossier |
| `statut_changed` | kanban |
| `refus_reason_submitted` | motif refus |
| `interview_feedback_submitted` | feedback entretien |
| `source_offre_submitted` | source de l’offre |
| `profile_saved` | profil |
| `cv_import` | import CV |
| `promo_code_redeemed` | code promo |

---

## 5. Propriétés communes (réutiliser, ne pas inventer de synonyme)

| Clé | Stack | Valeurs / notes |
|---|---|---|
| `cta_id` / `source_cta_id` | mkt | = `data-attr` kebab |
| `cta_zone` / `zone` | mkt | kebab |
| `cta_level` | mkt | `primary` \| `secondary` \| `tertiary` |
| `plan` / `plan_intent` | mkt | `free` \| `pro` |
| `method` | les deux | auth : `form` \| `email` \| `google` \| `linkedin` ; onboarding : `file_upload` \| `text_paste` \| `manual` |
| `view` | produit | screen § 2.3 |
| `path` | produit | pathname `/app/…` |
| `template_id` | produit | id template canvas |
| `adaptation_id` | produit | id adaptation |
| `source` | produit | origine d’un geste (`chat_send`, `cv_tab`, `profile`, …) |
| `session_id` | produit | header analytics, pas un event name |

Interdit dans les props : email, téléphone, nom, contenu d’offre, contenu de CV, token.

---

## 6. Consentement / opt-out

| Signal | Clé / comportement |
|---|---|
| CMP | `localStorage.axel_job_consent_v1` = `{v:1, analytics, marketing}` |
| Event interne | `axel_consent_update` (dataLayer) — pas un event GA4 métier |
| Marketing | `hasAnalyticsConsent` obligatoire avant tout `cta_click` / `sign_up*` |
| Produit | pas de gate CMP ; l’utilisateur est dans l’app. Pas de tracking marketing `track.js` sur `/app` |
| Opt-out marketing | refuser « Mesure d’audience » → zero event GA4 custom |
| PII | `compactParams` strippe les emails dans les params marketing |

Ne **pas** envoyer les events produit vers GA4 « pour simplifier » : ça mélangerait les stacks et le consentement.

---

## 7. Alignement cousin CRM (Axel Gestion)

Le workspace Linear `axel-project` héberge **Axel Gestion (CRM)** et **AxeL Job** dans la même team `AXE`, distingués par labels (`CRM` vs `AxelJob`) — [`docs/linear-github-workflow.md`](linear-github-workflow.md).

**Pas de document de tagging CRM dans ce repo**, ni de catalogue d’events partagé. Alignement retenu :

- Même hygiène : snake_case, pas de PII dans les props, pas de rename en prod.
- **Pas** de partage de noms d’events (`login`, `page_view` existent des deux côtés métier). Un entrepôt commun mapperait `source_app=axel_job` à l’ETL, sans préfixer le code Job.
- `data-attr` kebab est spécifique Job (funnel growth). Ne pas l’imposer au CRM.
- Label Linear `CRM` ne s’applique pas aux tickets Job.

Si un doc tagging Gestion apparaît plus tard : pointer depuis cette section, ne pas fusionner les catalogues.

---

## 8. Exemples PostHog (si go futur uniquement)

Mêmes noms, mêmes props. Pas d’autocapture `/app`. Pas de SDK tant que AXE-363 reste no-go.

```js
// Marketing (uniquement si consentement analytics)
posthog.capture('cta_click', {
  cta_id: 'home-hero-cta-signup',
  cta_zone: 'hero',
  cta_level: 'primary',
});
posthog.capture('sign_up', {
  method: 'google',
  plan_intent: 'pro',
  source_cta_id: 'home-pricing-cta-pro',
});

// Produit front (mêmes noms que /api/events/track — PH seulement si go + base légale)
posthog.capture('adapt_cta_clicked', { source: 'chat_send' });
posthog.capture('page_view', { view: 'cv', path: '/app/cv' });
// adaptation_completed reste backend-only (event_log) — ne pas le recapturer côté client
```

---

## 9. Tickets d’implémentation (filles AXE-356)

Créés dans le projet [Tagging interne & externe](https://linear.app/axel-project/project/axel-job-tagging-interne-and-externe-f932ba5559ef), parent [AXE-356](https://linear.app/axel-project/issue/AXE-356).

| # | Linear | Titre | Pourquoi |
|---|---|---|---|
| 1 | [AXE-394](https://linear.app/axel-project/issue/AXE-394) | Whitelist events orphelins produit | 3 `trackEvent` droppés (400) |
| 2 | [AXE-395](https://linear.app/axel-project/issue/AXE-395) | Inventaire figé `data-attr` /app hors candidatures | **49 IDs** C.10–C.16 dans [`taggage-analytics.md`](taggage-analytics.md) |
| 3 | [AXE-396](https://linear.app/axel-project/issue/AXE-396) | Balisage `data-attr` /app hors candidatures | pose les 49 IDs C.10–C.16 |
| 4 | [AXE-397](https://linear.app/axel-project/issue/AXE-397) | Émettre `login` produit | `SIGNED_IN` → event_log, pas GA4 |

AXE-396 est bloqué par AXE-395.

**Pas de ticket v1 :** relayer les `data-attr` /app vers GA4 ou un second `track.js`. Les clics produit restent des events métier explicites. C.9–C.16 servent la recette DOM + un tracker /app éventuel (v2).

**Déjà livré (ne pas recréer) :** AXE-358…365 (sauf 364 canceled).

---

## 10. Checklist auteur d’un nouvel event

1. Stack ? Marketing (CMP + GA4) vs produit (whitelist + `event_log`).
2. Un nom existant couvre-t-il déjà le geste ? Réutiliser.
3. Dialecte § 2.1 + props § 5. Aucune PII.
4. Produit front : ajouter la constante `EVENT_*` **et** `_ALLOWED_FRONTEND_EVENTS`.
5. Marketing : ajouter le déclencheur GTM (runbook [`ga4-recette.md`](ga4-recette.md)) — pas de filtre CSS.
6. Documenter dans ce fichier (ajouter une ligne, jamais un rename).
