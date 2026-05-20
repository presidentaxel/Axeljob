/**
 * Modele de mise en page CV v3 -- canvas libre (free canvas).
 *
 * v2 (`cvLayoutModelV2.js`) modelisait une mise en page zone-aware
 * (header / main / sidebar). C est confortable pour des templates fixes
 * mais impossible pour un Canva-like : on a besoin de **blocs libres**
 * positionnes en coordonnees absolues sur une page A4.
 *
 * v3 introduit donc :
 *  - une liste de **pages** (au moins 1, format A4),
 *  - chaque page contient une liste de **blocs** `{ id, type, x, y, w, h, z, style, bind | content }`,
 *  - unite : `mm` (alignee sur le rendu WeasyPrint cote backend).
 *
 * Types de blocs (cf. docs/editor-vision.md §7.3) :
 *  - "semantiques" : `identity`, `photo`, `contact`, `resume`,
 *    `experiences`, `formations`, `certifications`, `projets`,
 *    `skills`, `languages` -> contenu LIE au cv via `bind` (chemin
 *    dans le cv), le rendu pioche dans le cv au render.
 *  - "non semantiques" : `text`, `title`, `shape:line`, `shape:rect`,
 *    `icon`, `qrcode` -> contenu inline dans `content` (texte) ou
 *    `target_url` (qrcode), pas de bind.
 *
 * Forme canonique d un layout v3 :
 * {
 *   version: 3,
 *   format: "A4",
 *   grid: "free",
 *   unit: "mm",
 *   pages: [
 *     {
 *       id: "page_xxx",
 *       blocks: [
 *         { id, type, bind|content, x, y, w, h, z, style: {...} }
 *       ]
 *     }
 *   ],
 *   theme: { font_heading, color_accent, ... }
 * }
 *
 * Conventions :
 *  - Toutes les coordonnees sont en **mm**.
 *  - Origine : coin haut-gauche de la page.
 *  - Toutes les fonctions retournent un NOUVEAU layout (immuabilite).
 *  - Aucune dependance React/DOM -> 100% testable sous `node --test`.
 *
 * Migration depuis v1/v2 : on n essaie PAS de reproduire pixel-perfect
 * la mise en page d origine (impossible sans rendu reel). On retombe
 * sur un layout "starter" generique et on laisse l user repositionner
 * les blocs.
 */

import { generateItemId } from './cvSectionOps.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const LAYOUT_V3_VERSION = 3;

/** Dimensions A4 en mm (norme ISO 216). */
export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;

/** Marges par defaut (mm) -- inspires de la majorite des CVs ATS-friendly. */
export const PAGE_MARGIN_MM = 10;

/** Largeur utile par defaut (page - 2 * marges). */
export const PAGE_USABLE_WIDTH_MM = PAGE_WIDTH_MM - 2 * PAGE_MARGIN_MM;

/** Tailles minimales d un bloc pour rester selectionnable et editable. */
export const BLOCK_MIN_WIDTH_MM = 5;
export const BLOCK_MIN_HEIGHT_MM = 3;

/**
 * Marge sous la page 1 (mm) avant spill P3.10 : permet de placer un bloc
 * sous le pli A4 le temps du drag, puis pagination auto vers page 2.
 */
export const PAGE_OVERFLOW_HEADROOM_MM = 150;

/** Types de blocs SEMANTIQUES (lies au cv via `bind`). */
export const SEMANTIC_BLOCK_TYPES = Object.freeze([
  'identity',
  'photo',
  'contact',
  'resume',
  'experiences',
  'formations',
  'certifications',
  'projets',
  'skills',
  'languages',
]);

/** Types de blocs NON SEMANTIQUES (contenu inline). */
export const NON_SEMANTIC_BLOCK_TYPES = Object.freeze([
  'text',
  'title',
  'shape:line',
  'shape:rect',
  'icon',
  'qrcode',
]);

/** Tous les types autorises. */
export const ALL_BLOCK_TYPES = Object.freeze([
  ...SEMANTIC_BLOCK_TYPES,
  ...NON_SEMANTIC_BLOCK_TYPES,
]);

const SEMANTIC_SET = new Set(SEMANTIC_BLOCK_TYPES);
const NON_SEMANTIC_SET = new Set(NON_SEMANTIC_BLOCK_TYPES);
const ALL_TYPES_SET = new Set(ALL_BLOCK_TYPES);

/** Theme par defaut (place dans le layout, pas dans le cv). */
const DEFAULT_THEME = Object.freeze({
  font_heading: 'Inter',
  color_accent: '#1e2a3a',
});

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function clone(x) {
  if (x === null || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(clone);
  const out = {};
  for (const k of Object.keys(x)) out[k] = clone(x[k]);
  return out;
}

function clamp(v, min, max) {
  if (typeof v !== 'number' || Number.isNaN(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Determine si un type de bloc est semantique (lie au cv). */
export function isSemanticBlockType(type) {
  return SEMANTIC_SET.has(type);
}

/** Determine si un type de bloc est non semantique (contenu inline). */
export function isNonSemanticBlockType(type) {
  return NON_SEMANTIC_SET.has(type);
}

// ---------------------------------------------------------------------------
// Sanitize defensif d un bloc
// ---------------------------------------------------------------------------

/**
 * Clone et valide un bloc. Garantit que :
 *  - `id` est une string non vide (regenere si absent / invalide)
 *  - `type` est dans `ALL_BLOCK_TYPES` (sinon retourne null)
 *  - `x`, `y`, `w`, `h` sont des nombres finis, clampes aux limites de page
 *  - `z` est un entier >= 0
 *  - `style` est un objet (defaut : `{}`)
 *  - `bind` (semantique) ou `content` (non semantique) est preserve
 *
 * Retourne `null` si le bloc est irrecuperable (type inconnu).
 */
export function sanitizeBlock(input, { idHelpers, allowPageOverflow = false, pageIndex = 0 } = {}) {
  if (!input || typeof input !== 'object') return null;
  const type = typeof input.type === 'string' ? input.type : null;
  if (!type || !ALL_TYPES_SET.has(type)) return null;

  const id = typeof input.id === 'string' && input.id.length > 0
    ? input.id
    : generateItemId('blk', idHelpers || {});

  const w = clamp(
    isFiniteNumber(input.w) ? input.w : BLOCK_MIN_WIDTH_MM,
    BLOCK_MIN_WIDTH_MM,
    PAGE_WIDTH_MM,
  );
  const h = clamp(
    isFiniteNumber(input.h) ? input.h : BLOCK_MIN_HEIGHT_MM,
    BLOCK_MIN_HEIGHT_MM,
    PAGE_HEIGHT_MM,
  );
  const x = clamp(
    isFiniteNumber(input.x) ? input.x : PAGE_MARGIN_MM,
    0,
    PAGE_WIDTH_MM - w,
  );
  const yMax = allowPageOverflow && pageIndex === 0
    ? PAGE_HEIGHT_MM + PAGE_OVERFLOW_HEADROOM_MM - h
    : PAGE_HEIGHT_MM - h;
  const y = clamp(
    isFiniteNumber(input.y) ? input.y : PAGE_MARGIN_MM,
    0,
    Math.max(0, yMax),
  );
  const z = isFiniteNumber(input.z) && input.z >= 0
    ? Math.floor(input.z)
    : 1;

  const style = (input.style && typeof input.style === 'object') ? clone(input.style) : {};

  const out = { id, type, x, y, w, h, z, style };

  // Champs lies au TYPE
  if (isSemanticBlockType(type)) {
    if (typeof input.bind === 'string' || Array.isArray(input.bind)) {
      out.bind = clone(input.bind);
    }
    if (isFiniteNumber(input.limit) && input.limit > 0) {
      out.limit = Math.floor(input.limit);
    }
  } else {
    if (typeof input.content === 'string') out.content = input.content;
    if (type === 'icon' && typeof input.icon_name === 'string') {
      out.icon_name = input.icon_name;
    }
    if (type === 'qrcode' && typeof input.target_url === 'string') {
      out.target_url = input.target_url;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Layout : creation / sanitize
// ---------------------------------------------------------------------------

/**
 * Layout v3 vide : une seule page A4 sans aucun bloc. C est la base d un
 * canvas libre "page blanche".
 */
export function createBlankLayoutV3({ idHelpers } = {}) {
  return {
    version: LAYOUT_V3_VERSION,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    pages: [{
      id: generateItemId('page', idHelpers || {}),
      blocks: [],
    }],
    theme: { ...DEFAULT_THEME },
  };
}

/**
 * Layout v3 "starter" : une seule page A4 avec une mise en page basique
 * "1 colonne" pre-placee. Sert quand l user choisit "partir d un template"
 * au lieu de partir d une page blanche. La conversion fine depuis un
 * template (modern / executive / ...) viendra dans `migrateLayoutV2ToV3`.
 *
 * Tous les blocs ont une taille generique. L user pourra les bouger /
 * resizer librement ensuite.
 */
export function createStarterLayoutV3({ idHelpers } = {}) {
  const W = PAGE_USABLE_WIDTH_MM;
  const X = PAGE_MARGIN_MM;
  let y = PAGE_MARGIN_MM;

  const blocks = [];
  const push = (partial) => {
    blocks.push(sanitizeBlock(partial, { idHelpers }));
  };

  push({ type: 'identity', bind: ['prenom', 'nom', 'titre_professionnel'], x: X, y, w: W, h: 22, z: 1, style: { align: 'left' } });
  y += 22 + 4;
  push({ type: 'contact', bind: ['email', 'telephone', 'linkedin'], x: X, y, w: W, h: 8, z: 1 });
  y += 8 + 8;
  push({ type: 'resume', bind: 'resume', x: X, y, w: W, h: 20, z: 1 });
  y += 20 + 8;
  push({ type: 'experiences', bind: 'experiences', x: X, y, w: W, h: 100, z: 1, style: { format: 'compact' } });
  y += 100 + 8;
  push({ type: 'formations', bind: 'formations', x: X, y, w: W, h: 30, z: 1 });
  y += 30 + 6;
  push({ type: 'skills', bind: 'competences.techniques', x: X, y, w: W, h: 22, z: 1, style: { format: 'chips' } });

  return {
    version: LAYOUT_V3_VERSION,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    pages: [{
      id: generateItemId('page', idHelpers || {}),
      blocks,
    }],
    theme: { ...DEFAULT_THEME },
  };
}

/**
 * Detecte si une valeur quelconque ressemble a un layout v3 valide.
 * Tolere les valeurs partielles (sera complete par `sanitizeLayoutV3`).
 */
export function isLayoutV3Shape(input) {
  return Boolean(
    input
    && typeof input === 'object'
    && (input.version === LAYOUT_V3_VERSION || input.grid === 'free' || Array.isArray(input.pages)),
  );
}

/**
 * Nettoie et valide un layout v3. Retire les blocs invalides, garantit
 * au moins une page, complete les champs manquants par les defauts.
 */
export function sanitizeLayoutV3(input, { idHelpers } = {}) {
  const safe = (input && typeof input === 'object') ? input : {};
  const pages = Array.isArray(safe.pages) ? safe.pages : [];

  const cleanPages = pages
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: typeof p.id === 'string' && p.id ? p.id : generateItemId('page', idHelpers || {}),
      blocks: Array.isArray(p.blocks)
        ? p.blocks.map((b) => sanitizeBlock(b, { idHelpers })).filter(Boolean)
        : [],
    }));

  if (cleanPages.length === 0) {
    cleanPages.push({ id: generateItemId('page', idHelpers || {}), blocks: [] });
  }

  return {
    version: LAYOUT_V3_VERSION,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    pages: cleanPages,
    theme: (safe.theme && typeof safe.theme === 'object')
      ? { ...DEFAULT_THEME, ...safe.theme }
      : { ...DEFAULT_THEME },
  };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Retourne `{ pageIndex, blockIndex, block }` ou null si introuvable.
 * Pratique pour les operations qui doivent re-localiser un bloc apres
 * un re-render.
 */
export function findBlock(layout, blockId) {
  if (!layout || typeof layout !== 'object' || !Array.isArray(layout.pages)) return null;
  for (let i = 0; i < layout.pages.length; i++) {
    const blocks = layout.pages[i].blocks || [];
    for (let j = 0; j < blocks.length; j++) {
      if (blocks[j] && blocks[j].id === blockId) {
        return { pageIndex: i, blockIndex: j, block: blocks[j] };
      }
    }
  }
  return null;
}

/** Renvoie tous les blocs (toutes pages confondues), dans l ordre. */
export function listAllBlocks(layout) {
  if (!layout || !Array.isArray(layout.pages)) return [];
  const out = [];
  for (const page of layout.pages) {
    if (page && Array.isArray(page.blocks)) {
      for (const b of page.blocks) if (b) out.push(b);
    }
  }
  return out;
}

/**
 * Vrai si le layout est "vide" (juste une page sans blocs). Utile pour
 * decider si on doit pousser `null` cote backend (pas de payload) ou
 * stocker explicitement le layout.
 */
export function isEmptyLayoutV3(layout) {
  if (!layout || !Array.isArray(layout.pages)) return true;
  return layout.pages.every((p) => !p || !Array.isArray(p.blocks) || p.blocks.length === 0);
}

// ---------------------------------------------------------------------------
// Operations pures sur les blocs
// ---------------------------------------------------------------------------

function withPagesUpdate(layout, pageIndex, updater) {
  const pages = (layout.pages || []).map((p, i) => (i === pageIndex ? updater(p) : p));
  return { ...layout, pages };
}

/**
 * Ajoute un bloc a la fin d une page. Retourne un nouveau layout.
 * Le `partialBlock` est sanitize (un id est genere si absent).
 */
export function addBlockToPage(layout, pageIndex, partialBlock, { idHelpers } = {}) {
  if (!layout || !Array.isArray(layout.pages)) return layout;
  if (typeof pageIndex !== 'number' || pageIndex < 0 || pageIndex >= layout.pages.length) {
    return layout;
  }
  const block = sanitizeBlock(partialBlock, { idHelpers });
  if (!block) return layout;
  return withPagesUpdate(layout, pageIndex, (page) => ({
    ...page,
    blocks: [...(page.blocks || []), block],
  }));
}

/** Retire un bloc par id. No-op si introuvable. */
export function removeBlock(layout, blockId) {
  const found = findBlock(layout, blockId);
  if (!found) return layout;
  return withPagesUpdate(layout, found.pageIndex, (page) => ({
    ...page,
    blocks: (page.blocks || []).filter((b) => b.id !== blockId),
  }));
}

/**
 * Patch generique d un bloc : merge superficiel. Le caller fournit un
 * `patch` partiel ; on re-sanitize l ensemble pour conserver les
 * invariants (clamps, type valide, etc.).
 */
export function updateBlock(layout, blockId, patch) {
  const found = findBlock(layout, blockId);
  if (!found) return layout;
  const merged = { ...found.block, ...patch };
  // style merge profond (pour ne pas perdre les sous-cles non touchees)
  if (patch && patch.style && typeof patch.style === 'object') {
    merged.style = { ...(found.block.style || {}), ...patch.style };
  }
  const allowPageOverflow = layout?.grid === 'free' && found.pageIndex === 0;
  const cleaned = sanitizeBlock(merged, { allowPageOverflow, pageIndex: found.pageIndex });
  if (!cleaned) return layout;
  return withPagesUpdate(layout, found.pageIndex, (page) => ({
    ...page,
    blocks: page.blocks.map((b) => (b.id === blockId ? cleaned : b)),
  }));
}

/** Definit la position absolue (x, y) d un bloc. */
export function setBlockPosition(layout, blockId, { x, y }) {
  return updateBlock(layout, blockId, { x, y });
}

/** Definit la taille (w, h) d un bloc. */
export function setBlockSize(layout, blockId, { w, h }) {
  return updateBlock(layout, blockId, { w, h });
}

/** Deplacement relatif (en mm). Le sanitize clampe aux limites de page. */
export function moveBlockBy(layout, blockId, { dx = 0, dy = 0 }) {
  const found = findBlock(layout, blockId);
  if (!found) return layout;
  const x = (found.block.x || 0) + (Number(dx) || 0);
  const y = (found.block.y || 0) + (Number(dy) || 0);
  return setBlockPosition(layout, blockId, { x, y });
}

/**
 * Amene un bloc au premier plan : z = max(z) + 1. No-op si introuvable.
 */
export function bringToFront(layout, blockId) {
  const all = listAllBlocks(layout);
  if (all.length === 0) return layout;
  const maxZ = all.reduce((m, b) => Math.max(m, b.z || 0), 0);
  return updateBlock(layout, blockId, { z: maxZ + 1 });
}

/** Envoie un bloc a l arriere-plan : z = min(z) - 1 (clampe a 0). */
export function sendToBack(layout, blockId) {
  const all = listAllBlocks(layout);
  if (all.length === 0) return layout;
  const minZ = all.reduce((m, b) => Math.min(m, b.z || 0), Number.POSITIVE_INFINITY);
  const next = minZ <= 0 ? 0 : minZ - 1;
  return updateBlock(layout, blockId, { z: next });
}

/** Met a jour le style d un bloc (merge profond niveau 1). */
export function updateBlockStyle(layout, blockId, stylePatch) {
  if (!stylePatch || typeof stylePatch !== 'object') return layout;
  return updateBlock(layout, blockId, { style: stylePatch });
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** Ajoute une nouvelle page A4 vide a la fin. Retourne un nouveau layout. */
export function appendBlankPage(layout, { idHelpers } = {}) {
  if (!layout) return layout;
  const pages = Array.isArray(layout.pages) ? [...layout.pages] : [];
  pages.push({ id: generateItemId('page', idHelpers || {}), blocks: [] });
  return { ...layout, pages };
}

/** Retire la page d index donne SI plus d une page existe. Sinon no-op. */
export function removePage(layout, pageIndex) {
  if (!layout || !Array.isArray(layout.pages) || layout.pages.length <= 1) return layout;
  if (typeof pageIndex !== 'number' || pageIndex < 0 || pageIndex >= layout.pages.length) {
    return layout;
  }
  return { ...layout, pages: layout.pages.filter((_, i) => i !== pageIndex) };
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Patch du theme (font_heading, color_accent, ...). Merge superficiel. */
export function updateTheme(layout, patch) {
  if (!layout || !patch || typeof patch !== 'object') return layout;
  return { ...layout, theme: { ...(layout.theme || {}), ...patch } };
}

// ---------------------------------------------------------------------------
// Migration depuis v1 / v2
// ---------------------------------------------------------------------------

/**
 * Detecte la version d un layout d entree. Retourne 1, 2, 3 ou 0 si
 * inconnu. Indispensable pour brancher la bonne migration.
 */
export function detectLayoutVersion(input) {
  if (!input || typeof input !== 'object') return 0;
  if (input.version === LAYOUT_V3_VERSION || Array.isArray(input.pages)) return 3;
  if (input.version === 2 || (input.zones && typeof input.zones === 'object')) return 2;
  if (Array.isArray(input.sectionsOrder)) return 1;
  return 0;
}

/**
 * Migration v1 / v2 -> v3.
 *
 * Strategie : on n essaie PAS de placer pixel-perfect (impossible sans
 * rendu reel). On part du starter layout (1 colonne) et on conserve ce
 * qui peut etre traduit fidelement (theme principalement).
 *
 * Pour les utilisateurs qui veulent garder la mise en page de leur
 * template precedent, on prevoit en P3.1 un "Importer depuis le
 * template <id>" qui generera un layout starter SPECIFIQUE a ce
 * template (sidebar a gauche pour `modern`, etc.).
 */
export function migrateLayoutToV3(input, options = {}) {
  const version = detectLayoutVersion(input);
  if (version === 3) {
    return sanitizeLayoutV3(input, options);
  }
  // v0 / v1 / v2 : on repart du starter et on conserve uniquement le
  // theme (s il existe et est un objet). Le reste serait du devinement
  // dangereux (cf. retour utilisateur sur la mise en page modulaire P2).
  const starter = createStarterLayoutV3(options);
  if (input && typeof input === 'object' && input.theme && typeof input.theme === 'object') {
    starter.theme = { ...starter.theme, ...input.theme };
  }
  return starter;
}
