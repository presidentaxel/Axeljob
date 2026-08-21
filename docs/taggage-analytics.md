# Axel Job — Taggage analytics (landing → signup)

> **Usage Linear :** coller le bloc « Projet » puis chaque ticket (titre + labels + description).  
> **Ne pas coder** tant que le ticket 1 (inventaire) n’est pas figé.  
> **Linear MCP** n’était pas authentifié dans l’environnement agent au moment de la rédaction — créer le projet / les issues à la main (team `AXE`, label projet `Axel Job`).  
> **Workflow :** [`docs/linear-github-workflow.md`](linear-github-workflow.md) · 1 issue Linear = 1 branche = 1 PR.

État du code (août 2026) : **aucun `data-attr`**, pas de PostHog, pas de tracker CTA. Infra déjà là : CMP + GTM/GA4 (si `VITE_AXEL_GTM_ID` en prod) + analytics **produit** interne (`/api/events/track`) limitée à l’app connectée.

---

## Comment coller dans Linear

1. Team **Axel Project** (`AXE`).
2. Nouveau **projet** : copier § A (nom, icon `Chart`, couleur `#26B5CE`, label `Axel Job`).
3. Créer **8 issues** dans ce projet : copier § B un par un.
4. Labels issue : `AxelJob` + `Feature` | `Improvement` | `Spike` (Linear n’a pas toujours `Spike` — utiliser `Improvement` si besoin).
5. État initial : **Todo**. Assignee : toi (ou le lead growth/front).
6. Après création : noter chaque `AXE-XX` + `gitBranchName` dans le tableau § B.
7. Issues GitHub miroir + branches + PR : **plus tard**, au moment de coder (pas maintenant).

Ordre de livraison (dépendances) :

```
1 inventaire  →  2 landing + 3 pages contenu
              →  4 tracker CMP
              →  5 attribution signup
              →  8 recette GA4

6 spike PostHog  →  7 PostHog (si go)
```

Tickets 2 et 3 peuvent partir en parallèle une fois 1 figé.  
Ticket 4 **après** 2 (sinon le listener n’a rien à lire).  
Ticket 5 peut chevaucher 4.  
Ticket 8 est ops (GA4 UI), pas forcément une PR code.

---

## A. Projet Linear

| Champ | Valeur |
|---|---|
| Nom | `Axel Job — Taggage analytics (landing → signup)` |
| Icon | `Chart` |
| Couleur | `#26B5CE` |
| Label projet | `Axel Job` |
| Team | Axel Project (`AXE`) |
| Priorité | High |
| Dates | à poser (sprint growth) |

### Description (coller telle quelle)

```markdown
## Contexte

Les CTA marketing qui mènent à `/login` sont indiscernables dans GA4 : header desktop, header mobile, hero, tarifs Gratuit, tarifs Pro, bandeau final, pages FAQ/ATS/guides. Impossible de savoir quel bouton produit un compte, ni si `?plan=pro` survit à l’inscription (surtout OAuth).

Objectif : poser des identifiants stables `data-attr` + un tracker unique derrière la CMP, pour le funnel

`page_view → section_view (pricing) → cta_click (primary) → sign_up_start → sign_up → select_plan (pro)`

## Hors scope

- Refonte visuelle / tokens CSS du brief Claude (`#5B4CFF`, radius 10px) — le design system `--ds-*` fait foi (`docs/design-system.md`).
- Analytics produit app (`page_engagement`, `adapt_cta_clicked`, etc.) sauf si un ticket le dit explicitement.
- Renommer un `data-attr` déjà posé en production.

## Source de vérité

`docs/taggage-analytics.md` (ce fichier). Convention : `page-zone-type-intention`. Un ID = un élément. Jamais de doublon. Composants globaux (`nav-`, `footer-`) sans préfixe de page. L’ID vit dans `data-attr`, jamais dans une classe CSS.

## Double DOM (contrainte d’implémentation)

| URL | Visite directe | Navigation SPA depuis `/` |
|---|---|---|
| `/` | HTML statique `index.html` puis **remplacé** par `LandingPage.jsx` (`<button>` sans `href`) | React |
| `/login` | `login.html` puis `AuthForm` | React |
| `/faq`, `/ats`, articles | `public/*.html` (pas de bundle) | Composants React |

Tagger les **deux** arbres. Un tracker qui lit `href` uniquement rate tous les CTA React.

## Déjà en place (ne pas recréer)

- CMP Consent Mode v2 : `frontend/public/consent-gtm.js`
- GTM injecté au build : `VITE_AXEL_GTM_ID` → `analytics-config.js`
- `/confidentialite` : GTM/GA4 derrière consentement (**PostHog absent**)
- First-touch UTM : `frontend/src/analyticsSession.js`
- Events app connectée : `POST /api/events/track` (whitelist) — **inactif** sur landing/login

## Décision ouverte

PostHog : go/no-go RGPD (ticket 6) avant tout SDK.
```

---

## B. Issues Linear

Remplir la colonne `AXE-XX` après création.

| # | Titre Linear | Labels | Bloqué par | AXE-XX | gitBranchName |
|---|---|---|---|---|---|
| 1 | `Spike: Inventaire figé des identifiants data-attr` | AxelJob, Improvement | — | | |
| 2 | `Feat: Balisage data-attr de la landing (React + HTML statique)` | AxelJob, Feature | 1 | | |
| 3 | `Feat: Balisage globaux, login et pages contenu` | AxelJob, Feature | 1 | | |
| 4 | `Feat: Tracker unique CTA/nav/plan/section derrière la CMP` | AxelJob, Feature | 2 | | |
| 5 | `Feat: Attribution source_cta_id et plan_intent jusqu’au compte créé` | AxelJob, Feature | 2 | | |
| 6 | `Spike: PostHog — go/no-go RGPD` | AxelJob, Improvement | — | | |
| 7 | `Feat: Brancher PostHog (événements + autocapture data-attr)` | AxelJob, Feature | 4 + 6 (go) | | |
| 8 | `Chore: Recette GA4 — conversions, dimensions, DebugView` | AxelJob, Improvement | 4 + 5 | | |

Backlog hors vague 1 (créer plus tard si besoin) :

- `Improve: Un seul bouton primary visible par écran sur la landing`
- `Fix: Whitelist /api/events/track — events orphelins (base_cv_pdf_downloaded, first_offer_nudge_cta, …)`

---

### Ticket 1 — Spike: Inventaire figé des identifiants data-attr

**Labels :** `AxelJob` + `Improvement`  
**Priorité :** Urgent (bloque tout le chantier)

```markdown
## Problème

Le brief growth parle de 55 identifiants. Ils n’existent nulle part dans le repo. Poser le premier `data-attr` sans catalogue figé = doublons, renommages (interdits en prod) et funnels cassés.

## État actuel

- 0 occurrence de `data-attr` / `data-zone` / `data-level` / `data-track`
- Sections landing : ancres `#comment` `#tarifs` `#features` seulement, pas de `data-section`
- Convention proposée dans `docs/taggage-analytics.md` § C

## Critères d’acceptation

- [ ] Le tableau § C de `docs/taggage-analytics.md` est relu et **figé** (55 IDs, aucun doublon)
- [ ] Burger : conserver les 3 IDs distincts `nav-cta-signup` / `nav-cta-start` / `nav-cta-drawer`
- [ ] FAQ : poser `faq-question-*` sur les `<h2>` ; `faq_open` reporté en v2 (pas d’accordéon)
- [ ] Login back = `nav-link-back` (pas de `login-link-back`)
- [ ] Liste v2 (drawer links tertiaires, sources outbound FAQ) **exclue** de la vague 1
- [ ] Commentaire Linear : « inventaire figé, on peut coder le ticket 2 »

## Zones

- `docs/taggage-analytics.md` uniquement (pas de code produit)

## Notes

Un identifiant posé en production ne se renomme jamais. On ajoute, on déprécie.
```

---

### Ticket 2 — Feat: Balisage data-attr de la landing (React + HTML statique)

**Labels :** `AxelJob` + `Feature`  
**Priorité :** High

```markdown
## Problème

Sur `/`, 6+ CTA mènent à `/login` (ou `/login?plan=pro`) sans identité. En React ce sont des `<button onClick>` sans `href` : un tracker « href only » ne verra rien. Le HTML statique de `index.html` a les `href` mais est masqué dès que le JS tourne.

## État actuel (code)

Fichiers à taguer **en miroir** :

- `frontend/src/components/LandingPage.jsx`
- `frontend/index.html` (bloc `.static-crawlable`)

CTA aujourd’hui (tous `onCtaClick` → `/login`, sauf Pro → `?plan=pro`) :

| Zone | Texte | Classe | ID cible |
|---|---|---|---|
| Header desktop | Essayer gratuitement | `landing-cta-nav` primary | `nav-cta-signup` |
| Header mobile | Commencer | `landing-mobile-cta` primary | `nav-cta-start` |
| Drawer burger | Essayer gratuitement | primary | `nav-cta-drawer` |
| Hero | Essayer gratuitement | `landing-cta-hero` | `home-hero-cta-signup` |
| Tarifs Gratuit | Commencer gratuitement | secondary | `home-pricing-cta-free` |
| Tarifs Pro | Passer Pro | primary | `home-pricing-cta-pro` |
| Final | Essayer gratuitement | `landing-cta-hero` | `home-final-cta-signup` |

## Critères d’acceptation

- [ ] Tous les IDs **home-*** + **nav-*** de la landing (tableau § C) sont posés dans React **et** dans le HTML statique
- [ ] Attributs : `data-attr`, `data-track`, `data-zone`, `data-level` (pas de classe CSS comme déclencheur)
- [ ] Sections : `data-section="hero|how|pricing|features|why|final"`
- [ ] Les `<button>` React ont quand même `data-attr` (pas besoin d’`href` pour l’ID)
- [ ] Badge « Populaire » : `home-pricing-badge-popular` (cible A/B, pas un CTA)
- [ ] Aucun `data-attr` dans une feuille de style
- [ ] Pas de nouvel ID hors catalogue ticket 1

## Zones

- `frontend/src/components/LandingPage.jsx`
- `frontend/index.html`
```

---

### Ticket 3 — Feat: Balisage globaux, login et pages contenu

**Labels :** `AxelJob` + `Feature`  
**Priorité :** High

```markdown
## Problème

FAQ, ATS, guides, login : mêmes CTA « Essayer gratuitement » vers `/login`, plus lien retour et footer. Visite directe = HTML `public/*.html`. Navigation depuis la landing = composants React. Il faut les deux.

## État actuel

- `AuthForm.jsx` : Google / LinkedIn / submit / forgot / toggle — aucun tracking
- `login-screen-back` : retour accueil, pas de `data-attr`
- Pages : `FaqPage.jsx`, `AtsPage.jsx`, `ArticlesPages.jsx` + `frontend/public/{faq,ats,modeles-cv,guide-cv,erreurs-cv,cv-par-metier,cv-adapte-chaque-offre,login,404}.html`
- Footer / `content-back` : composants répétés, **un seul ID global** (pas de préfixe de page)

## Critères d’acceptation

- [ ] IDs globaux `nav-link-back`, `footer-link-*` posés (un ID, toutes les pages)
- [ ] Login : `login-cta-google`, `login-cta-linkedin`, `login-cta-submit`, `login-link-forgot`, `login-link-toggle`, `login-input-email`, `login-input-email` (jamais la valeur) ; retour accueil = `nav-link-back`
- [ ] CTA signup de chaque page contenu : `faq-cta-signup`, `ats-cta-signup`, `modeles-cta-signup`, `guide-cta-signup`, `erreurs-cta-signup`, `metier-cta-signup`, `adapte-cta-signup`
- [ ] FAQ : `faq-question-*` sur les 6 questions (même si pas d’accordéon en v1)
- [ ] 404 : `error-cta-home`, `error-cta-login`
- [ ] Miroir HTML statique `public/*.html` **et** JSX
- [ ] Pas de PII dans un attribut (pas d’email, pas de contenu de champ)

## Zones

- `frontend/src/components/{AuthForm,FaqPage,AtsPage,ArticlesPages,LegalPages}.jsx`
- `frontend/src/App.jsx` (écran `/login`)
- `frontend/public/*.html`
```

---

### Ticket 4 — Feat: Tracker unique CTA/nav/plan/section derrière la CMP

**Labels :** `AxelJob` + `Feature`  
**Priorité :** High

```markdown
## Problème

Aucun listener délégué. GTM peut envoyer des page_view si le conteneur prod est branché ; aucun `cta_click` / `nav_click` / `select_plan` / `section_view`.

## Règles

- Un seul fichier, un seul listener `click` sur `document` + un `IntersectionObserver` pour `[data-section]`
- Chargé **après** consentement analytics (s’abonner à `axel_consent_update` / lire `axel_job_consent_v1`) — ne rien pousser vers gtag/PostHog avant
- Ne **jamais** cibler une classe CSS
- Ne **jamais** envoyer : contenu CV, texte d’annonce, valeur de champ, email en clair
- Les CTA React n’ont pas d’`href` : `link_url` = `href` **ou** destination connue (`/login`, `/login?plan=pro`) via data, sinon `''`
- Table événements vs payload : nav → `nav_id` + `nav_type` (pas seulement `cta_id`) ; `select_plan` inclut `plan` + `zone` (+ `price` si connu, 0 / 10)

## Événements (GA4 snake_case, ≤ 40 car.)

| Déclencheur | GA4 | PostHog (si ticket 7) | Params |
|---|---|---|---|
| CTA | `cta_click` | `cta_clicked` | `cta_id`, `cta_zone`, `cta_level`, `cta_text`, `link_url` |
| Nav / footer | `nav_click` | `nav_clicked` | `nav_id`, `nav_type`, `link_url` |
| Offre | `select_plan` | `plan_selected` | `plan`, `price`, `zone` |
| Zone ≥ 50 % | `section_view` | `section_viewed` | `section_id` |
| Externe | `outbound_click` | `outbound_clicked` | `link_domain`, `link_url` |
| mailto | `contact_click` | `contact_clicked` | `method` |

`sign_up*` = ticket 5. `faq_open` = v2 (FAQ non accordéon).

## Critères d’acceptation

- [ ] Tracker unique, pages marketing + login (pas forcément toute l’app `/app`)
- [ ] Aucun event avant consentement analytics
- [ ] Clic `home-pricing-cta-pro` → `cta_click` **et** `select_plan` `{ plan: 'pro', zone: 'pricing' }`
- [ ] Clic `home-pricing-cta-free` → `select_plan` `{ plan: 'free', … }`
- [ ] `section_view` une fois par session et par `section_id` (unobserve)
- [ ] `cta_zone` / `cta_level` jamais `unknown` sur les éléments du catalogue
- [ ] Compatible boutons sans `href`
- [ ] Tests unitaires du parseur d’événement (pas besoin du DOM navigateur réel pour la logique plan/outbound)

## Zones

- Nouveau module du type `frontend/public/track.js` **ou** `frontend/src/lib/marketingTracker.js` chargé avec la CMP
- `frontend/public/consent-gtm.js` (hook consentement)
- `frontend/index.html` + `public/*.html` (script)

## Piège

`entry-conditional.js` ne charge le SPA que sur `/`, `/login`, `/app/*`. Le tracker doit aussi vivre sur les HTML statiques FAQ/ATS.
```

---

### Ticket 5 — Feat: Attribution source_cta_id et plan_intent jusqu’au compte créé

**Labels :** `AxelJob` + `Feature`  
**Priorité :** High

```markdown
## Problème

Sans ça, impossible de relier un abonnement au bouton cliqué. `?plan=pro` se perd surtout à l’OAuth : `redirectTo` est `origin + '/login'` **sans query**.

`EVENT_LOGIN` est déclaré dans `backend/event_log.py` et **jamais émis**. AuthForm n’envoie ni `sign_up_start` ni `sign_up`. Un « Créer un compte » sur email déjà connu peut connecter sans être un vrai signup.

## À faire

1. Au clic CTA vers login : `sessionStorage.source_cta_id` + `sessionStorage.plan_intent` (`pro` | `free`)
2. Préserver `?plan=pro` (et les UTM déjà gérés) dans `redirectTo` OAuth Google/LinkedIn
3. Arrivée `/login` : `sign_up_start` / `signup_started` avec `method` + `source_cta_id`
4. Compte **réellement créé** (pas le clic, pas le faux signup « déjà un compte ») : `sign_up` / `signup_completed` avec `method`, `plan_intent`, `source_cta_id`
5. Si session déjà auth + `plan=pro` : garder le checkout existant (`App.jsx` ~1225)

## Critères d’acceptation

- [ ] Clic `home-pricing-cta-pro` → signup email : events portent `source_cta_id=home-pricing-cta-pro` et `plan_intent=pro`
- [ ] Clic Pro puis Google/LinkedIn : `?plan=pro` **ou** `plan_intent` survit au retour OAuth
- [ ] Clic hero `home-hero-cta-signup` : `plan_intent=free` (défaut)
- [ ] Utilisateur déjà inscrit qui « crée un compte » : **pas** de `sign_up` (popup « vous aviez déjà un compte »)
- [ ] Toujours derrière consentement analytics pour gtag/PostHog
- [ ] Aucun email dans les payloads

## Zones

- `frontend/src/components/LandingPage.jsx` (ou le tracker ticket 4)
- `frontend/src/components/AuthForm.jsx` (`redirectTo`)
- `frontend/src/App.jsx` (écran login, `plan=pro` post-auth)
```

---

### Ticket 6 — Spike: PostHog — go/no-go RGPD

**Labels :** `AxelJob` + `Improvement`  
**Priorité :** Medium  
**Pas de code produit** (décision + doc).

```markdown
## Problème

Le brief suppose PostHog en parallèle de GA4 (autocapture, toolbar `data-attr`, feature flags, A/B). Le site est FR, audience FR. GA4 est déjà déclaré dans `/confidentialite`. PostHog n’y est pas. Brancher un SDK sans décision = non-conformité.

## Questions à trancher

- [ ] PostHog EU cloud vs self-host vs **on ne le met pas** (GA4 + tracker custom suffisent en v1)
- [ ] Finalités / base légale / sous-traitant à ajouter dans `/confidentialite`
- [ ] Même CMP : analytics_storage granted ⇒ PostHog **ou** consentement distinct
- [ ] Autocapture : OK si on ne capture pas champs formulaire / CV / annonce (masking)
- [ ] Qui paie / quel projet PostHog / qui gère les feature flags

## Critères d’acceptation

- [ ] Commentaire Linear : **go** ou **no-go** + 3 lignes de justification
- [ ] Si go : liste des mentions à ajouter dans `confidentialite` (ticket 7)
- [ ] Si no-go : ticket 7 **annulé**, recette = GA4 seul

## Zones

- `frontend/public/confidentialite.html` (lecture)
- `frontend/public/consent-gtm.js` (lecture)
```

---

### Ticket 7 — Feat: Brancher PostHog (événements + autocapture data-attr)

**Labels :** `AxelJob` + `Feature`  
**Priorité :** Medium  
**Bloqué par** ticket 6 = go **et** ticket 4.

```markdown
## Problème

Sans PostHog (si go), pas d’autocapture toolbar, pas de cible `data-attr` pour flags / A/B (`home-hero-title`, `home-pricing-badge-popular`).

## Critères d’acceptation

- [ ] SDK chargé seulement après consentement
- [ ] Mêmes events que le tracker (`cta_clicked`, `nav_clicked`, `plan_selected`, `section_viewed`, `signup_*`, outbound, contact)
- [ ] Autocapture ON + `data-attr` lisible dans la toolbar
- [ ] Masking : inputs, CV, annonce
- [ ] `/confidentialite` mis à jour (sous-traitant + finalité)
- [ ] Variable d’env documentée (ex. `VITE_PUBLIC_POSTHOG_KEY`, host EU)

## Zones

- nouveau init PostHog à côté de la CMP
- `frontend/public/confidentialite.html` + `LegalPages` si miroir React
- `.env.example` / `docs/deploy.md`
```

---

### Ticket 8 — Chore: Recette GA4 — conversions, dimensions, DebugView

**Labels :** `AxelJob` + `Improvement`  
**Priorité :** Medium  
**Majoritairement ops** (interface GA4/GTM), pas une PR code.

```markdown
## Problème

Même avec le tracker, GA4 n’affichera pas les funnels tant que les events custom et dimensions ne sont pas déclarés. `sign_up` et `select_plan` doivent être des conversions.

## Critères d’acceptation

- [ ] GTM prod : ID réel (pas `window.__AXEL_GTM_ID__ = ''` en source — vérifier le build Docker)
- [ ] DebugView : `cta_click`, `nav_click`, `select_plan`, `section_view`, `sign_up_start`, `sign_up`
- [ ] Params `cta_id`, `cta_zone`, `cta_level` renseignés (jamais `unknown` sur le catalogue)
- [ ] Dimensions perso : `cta_id`, `cta_zone`, `cta_level`, `plan`, `section_id`
- [ ] Conversions : `sign_up`, `select_plan`
- [ ] Funnel de référence créé (GA4) ; PostHog si ticket 7
- [ ] Test manuel : clic Pro → compte test → `plan_intent=pro` visible sur `sign_up`

## Funnel de référence

`page_view` → `section_view` (pricing) → `cta_click` (primary) → `sign_up_start` → `sign_up` → `select_plan` (pro)
```

---

## C. Inventaire figé (55 identifiants) — ticket 1 à valider

Convention : `page-zone-type-intention` · minuscules, tirets, sans accent.  
Globaux : **pas** de préfixe de page (`nav-`, `footer-`).

Attributs HTML types :

```html
<a href="/login"
   class="button button-primary"
   data-attr="home-hero-cta-signup"
   data-track="cta"
   data-zone="hero"
   data-level="primary">
  Essayer gratuitement
</a>

<section id="tarifs" data-section="pricing">…</section>
```

`data-level` : `primary` | `secondary` | `tertiary`.  
`data-track` : `cta` | `nav` | `input` (rare).

### C.1 Globaux — header / nav (13)

| data-attr | type | level | Où | Intention |
|---|---|---|---|---|
| `nav-logo` | logo | tertiary | landing header | Accueil (poser si le logo devient un lien ; aujourd’hui `<img>` non cliquable) |
| `nav-link-how` | link | tertiary | `#comment` | Ancre comment |
| `nav-link-pricing` | link | tertiary | `#tarifs` | Ancre tarifs |
| `nav-link-features` | link | tertiary | `#features` | Ancre features |
| `nav-link-ats` | link | tertiary | `/ats` | ATS |
| `nav-link-faq` | link | tertiary | `/faq` | FAQ |
| `nav-link-modeles` | link | tertiary | `/modeles-cv` | Modèles |
| `nav-link-guide` | link | tertiary | `/guide-cv` | Guide |
| `nav-cta-signup` | cta | primary | header desktop | Essayer gratuitement |
| `nav-cta-start` | cta | primary | header mobile « Commencer » | Même destination, **ID distinct** (les deux se concurrencent) |
| `nav-cta-drawer` | cta | primary | CTA du menu burger | Distinct des deux ci-dessus |
| `nav-burger` | link | tertiary | bouton menu | Ouverture drawer |
| `nav-link-back` | link | tertiary | `content-back` / `login-screen-back` | Retour accueil (toutes pages contenu + login) |

### C.2 Globaux — footer (12)

| data-attr | type | level | Destination |
|---|---|---|---|
| `footer-link-support` | link | tertiary | `mailto:contact@…` → event `contact_click` aussi |
| `footer-link-ats` | link | tertiary | `/ats` |
| `footer-link-faq` | link | tertiary | `/faq` |
| `footer-link-modeles` | link | tertiary | `/modeles-cv` |
| `footer-link-guide` | link | tertiary | `/guide-cv` |
| `footer-link-erreurs` | link | tertiary | `/erreurs-cv` |
| `footer-link-metier` | link | tertiary | `/cv-par-metier` |
| `footer-link-adapte` | link | tertiary | `/cv-adapte-chaque-offre` |
| `footer-link-mentions` | link | tertiary | `/mentions-legales` |
| `footer-link-confidentialite` | link | tertiary | `/confidentialite` |
| `footer-link-cgu` | link | tertiary | `/cgu` |
| `footer-link-axelproject` | link | tertiary | `https://axelproject.fr` → `outbound_click` aussi |

Un seul ID footer même si le markup est dupliqué React / HTML / pages contenu.

### C.3 Home (9)

| data-attr | type | level | Notes |
|---|---|---|---|
| `home-hero-title` | badge | tertiary | Cible A/B du H1, pas un clic obligatoire |
| `home-hero-cta-signup` | cta | primary | Essayer gratuitement |
| `home-pricing-card-free` | card | tertiary | Carte (A/B / autocapture) |
| `home-pricing-cta-free` | cta | secondary | Commencer gratuitement → `plan=free` |
| `home-pricing-card-pro` | card | tertiary | Carte Pro |
| `home-pricing-badge-popular` | badge | tertiary | Chip « Populaire », cible A/B |
| `home-pricing-cta-pro` | cta | primary | Passer Pro → `?plan=pro` |
| `home-why-link-ats` | link | tertiary | Lien ATS dans « Pourquoi » |
| `home-final-cta-signup` | cta | primary | Bandeau final |

### C.4 Login (6)

| data-attr | type | level | Notes |
|---|---|---|---|
| `login-cta-google` | cta | secondary | Continuer avec Google |
| `login-cta-linkedin` | cta | secondary | Continuer avec LinkedIn |
| `login-cta-submit` | cta | primary | Se connecter / Créer un compte |
| `login-link-forgot` | link | tertiary | Mot de passe oublié |
| `login-link-toggle` | link | tertiary | Pas de compte / Déjà un compte |
| `login-input-email` | input | tertiary | Champ email. **Ne jamais** envoyer la valeur dans un event. |

Le bouton « Retour à l’accueil » de `/login` réutilise `nav-link-back` (composant global, un seul ID).

### C.5 FAQ (7)

| data-attr | type | level | Cible |
|---|---|---|---|
| `faq-cta-signup` | cta | primary | CTA bas de page |
| `faq-question-cv-bonnes-competences` | link | tertiary | `#cv-bonnes-competences` |
| `faq-question-format-pdf-problematique` | link | tertiary | `#format-pdf-problematique` |
| `faq-question-adapter-cv-chaque-offre` | link | tertiary | `#adapter-cv-chaque-offre` |
| `faq-question-ia-rediger-cv` | link | tertiary | `#ia-rediger-cv` |
| `faq-question-nombre-pages-cv` | link | tertiary | `#nombre-pages-cv` |
| `faq-question-fautes-orthographe` | link | tertiary | `#fautes-orthographe` |

Pas d’event `faq_open` tant qu’il n’y a pas d’accordéon (v2).

### C.6 ATS + articles + 404 (8)

| data-attr | type | level | Page |
|---|---|---|---|
| `ats-cta-signup` | cta | primary | `/ats` |
| `modeles-cta-signup` | cta | primary | `/modeles-cv` |
| `guide-cta-signup` | cta | primary | `/guide-cv` |
| `erreurs-cta-signup` | cta | primary | `/erreurs-cv` |
| `metier-cta-signup` | cta | primary | `/cv-par-metier` |
| `adapte-cta-signup` | cta | primary | `/cv-adapte-chaque-offre` |
| `error-cta-home` | cta | primary | 404 → `/` |
| `error-cta-login` | cta | secondary | 404 → `/login` |

**Total vague 1 = 55** : 13 nav + 12 footer + 9 home + 6 login + 7 FAQ + 8 ATS/articles/404.

### C.7 `data-section` (hors compte des 55)

Pas des `data-attr`. Observer à 50 %, une fois par session.

| data-section | Page / zone |
|---|---|
| `hero` | landing hero |
| `how` | `#comment` |
| `pricing` | `#tarifs` |
| `features` | `#features` |
| `why` | Pourquoi AxeL Job |
| `final` | bandeau CTA bas |
| `login` | écran `/login` |
| `faq` | liste questions |
| `content-cta` | bandeau signup pages contenu |

### C.8 V2 (ne pas poser en vague 1)

- Liens tertiaires du drawer déjà couverts en desktop (`nav-drawer-link-*`) — utile seulement si on veut séparer mobile
- Liens sources outbound FAQ/ATS (`content-source`) — le tracker `outbound_click` suffit sans ID unique
- Pages légales : pas de CTA signup dédié
- `faq_open` si on passe en `<details>`
- Cookie banner (consentement ≠ funnel growth)

### C.9 App connectée — Mes candidatures (`/app/postule`) — **figé 2026-08-21**

Extension hors vague 1 (landing → signup). Même convention `page-zone-type-intention`.  
Un ID posé en prod ne se renomme jamais. Tracker app = `/api/events/track` + futurs outils (GA4/PostHog) derrière CMP.

| data-attr | type | level | Où | Intention |
|---|---|---|---|---|
| `candidatures-header-cta-new` | cta | primary | Header page | Nouvelle candidature (setup modal) |
| `candidatures-header-cta-manual` | cta | secondary | Header page | Ajouter une candidature hors app |
| `candidatures-empty-cta-start` | cta | primary | Empty state board | Lancer ma première candidature |
| `candidatures-banner-cta-adapt` | cta | secondary | Banner zéro adaptation | Aller à Adapter un CV (`/app/cv`) |
| `candidatures-search-empty-cta-clear` | cta | secondary | Empty recherche | Effacer la recherche |
| `candidatures-controls-input-search` | input | tertiary | Barre de filtres | Champ recherche. **Ne jamais** envoyer la valeur dans un event. |

`data-section` (hors compte) :

| data-section | Zone |
|---|---|
| `candidatures` | Board kanban `/app/postule` |
| `candidatures-stats` | Bandeau métriques |

V2 candidatures (ne pas poser maintenant) : ouverture carte, archive, drag colonne, métriques cliquables.

---

## D. Recette (après tickets 4–5–8)

**Intégration**

- [ ] 55 identifiants posés, uniques (grep `data-attr=` + table)
- [ ] Aucun `data-attr` dans une feuille de style
- [ ] Aucune classe CSS dans un déclencheur GTM
- [ ] Attributs présents au clic (React **et** HTML statique)
- [ ] CTA ≥ 44 px + focus visible (déjà `--ds-size-touch-min` sur `.ds-button` ; vérifier les `.button` landing)
- [ ] Un seul primary visible par écran = **hors vague** (aujourd’hui nav + hero sont deux primaires)

**Mesure**

- [ ] DebugView GA4 : chaque event du tableau ticket 4 + 5
- [ ] `cta_id` / `cta_zone` / `cta_level` renseignés
- [ ] `sign_up` et `select_plan` en conversions
- [ ] `?plan=pro` survit à l’inscription (email **et** OAuth)
- [ ] PostHog toolbar : `data-attr` (si go)
- [ ] Funnel créé dans le(s) outil(s) retenus

---

## E. Ce qu’il ne faut **pas** copier du brief Claude

| Brief | Repo AxeL Job |
|---|---|
| Tokens `#5B4CFF`, `.btn--primary`, radius 10px | Design system `--ds-*` / `Button.jsx` |
| Tracker qui lit uniquement `el.href` | Landing = `<button>` sans href |
| `faq_open` immédiat | FAQ = articles ouverts |
| PostHog « juste le brancher » | Ticket 6 d’abord |
| Un listener posé en JS après hydratation **sans** attributs SSR/JSX | Attributs dans le markup au render |
| Cibler `.btn` dans GTM | Interdit |

---

## F. Commentaire type (après création des issues)

À poster en **project update** Linear (`onTrack`) :

```markdown
Chantier taggage analytics ouvert. 8 tickets. Rien à coder avant validation de l’inventaire (ticket 1).
Infra CMP/GTM déjà là ; il manque data-attr + tracker + attribution signup.
PostHog = décision RGPD séparée (ticket 6).
Doc : docs/taggage-analytics.md
```
