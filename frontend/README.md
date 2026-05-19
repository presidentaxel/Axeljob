# Frontend - React + Vite

Guide rapide pour developper et livrer la partie frontend de `cv-bot`.

## Sommaire

1. Scripts npm
2. Setup local
3. Variables d'environnement
4. Exigences qualite

## 1) Scripts npm

- `npm run dev` : demarre le serveur local Vite.
- `npm run build` : build production (inclut `build:brand-assets`).
- `npm run preview` : previsualise le build en local.
- `npm run lint` : execute ESLint.
- `npm run test:e2e` : lance les tests Playwright.
- `npm run test:e2e:ui` : interface Playwright pour debug E2E.

## 2) Setup local

```bash
cd frontend
npm ci
npm run dev
```

## 3) Variables d'environnement

Creer `frontend/.env` depuis `frontend/.env.example`, puis definir :

- `VITE_API_URL` (principalement pour dev local) ;
- `VITE_SUPABASE_URL` ;
- `VITE_SUPABASE_ANON_KEY`.

Regle cle : seules les variables prefixees `VITE_` sont exposees au navigateur.

> [!WARNING]
> Ne jamais placer de secrets (service role, Stripe secret, tokens backend) dans des variables `VITE_*`.

## 4) Exigences qualite

- Le lint doit passer avant merge.
- Les parcours critiques doivent rester couverts par des E2E.
- Conserver des composants et hooks modulaires, testables et sans effets de bord caches.
