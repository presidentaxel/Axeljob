/**
 * Modele de mise en page CV v2 -- zone-aware.
 *
 * v1 (`cvLayoutModel.js`) avait `sectionsOrder` plat + `sidebarRatio` +
 * `theme`. Limite : pas de notion de zone -> impossible de dire qu une
 * section est dans la sidebar vs dans le main, ni de toggler une zone
 * complete (header on/off, sidebar on/off).
 *
 * v2 modelise explicitement les zones d un CV et l affectation des
 * sections a chaque zone. L UI mini-carte (P2.4b) consomme ce modele
 * directement, et le renderer layout-aware (P2.4c) rend le CV en
 * suivant litteralement la repartition zones -> sections.
 *
 * Forme canonique :
 * {
 *   version: 2,
 *   zones: {
 *     header:  { enabled: true,  sections: ['identity', 'resume'] },
 *     main:    { enabled: true,  sections: ['experiences', 'formations', 'projets'] },
 *     sidebar: { enabled: true,  sections: ['competences', 'certifications'] },
 *   },
 *   sidebarRatio: 35,        // % largeur sidebar (1..99), n a d effet que si sidebar.enabled
 *   sidebarSide: 'right',    // 'left' | 'right'
 *   theme: 'default',
 * }
 *
 * Conventions :
 *   - `identity` est une section virtuelle (photo + nom + titre + contact).
 *     Elle est UN bloc atomique mais reste deplacable entre zones.
 *   - `main.enabled` n existe pas : main est TOUJOURS actif (le CV doit
 *     contenir du contenu). Si l user retire toutes les sections du main,
 *     c est juste un main vide.
 *   - Quand on toggle off une zone, les sections qui y vivaient sont
 *     deplacees vers `main` (au bout) pour ne pas perdre de contenu.
 *
 * Pur : aucune dependance React/DOM. Tous les helpers retournent un
 * NOUVEAU layout (immuabilite, comme v1). Testable a 100%.
 */

/** Sections canoniques connues. `identity` est virtuelle, les autres
 *  correspondent a des cles du CV (resume, experiences[], ...). */
export const CANONICAL_SECTION_KEYS_V2 = Object.freeze([
  'identity',
  'resume',
  'experiences',
  'formations',
  'projets',
  'competences',
  'certifications',
]);

/** Zones canoniques. L ordre est l ordre visuel par defaut (haut -> bas). */
export const CANONICAL_ZONE_KEYS = Object.freeze(['header', 'main', 'sidebar']);

/** Cote sur lequel placer la sidebar quand activee. */
export const SIDEBAR_SIDES = Object.freeze(['left', 'right']);

/** Bornes du ratio sidebar (en %). On evite 0 et 100 pour eviter les cas
 *  degeneres (une colonne quasi vide). */
export const SIDEBAR_RATIO_MIN = 20;
export const SIDEBAR_RATIO_MAX = 50;
export const SIDEBAR_RATIO_DEFAULT = 35;

export const LAYOUT_V2_VERSION = 2;

/**
 * Repartition par defaut des sections dans les zones. Utilisee pour le
 * `createDefaultLayoutV2` ET pour la migration depuis v1 (les sections
 * non listees ailleurs retombent ici).
 */
const DEFAULT_ZONE_FOR_SECTION = Object.freeze({
  identity: 'header',
  resume: 'header',
  experiences: 'main',
  formations: 'main',
  projets: 'main',
  competences: 'sidebar',
  certifications: 'sidebar',
});

/**
 * Retourne un layout v2 par defaut. Toutes les zones sont actives, les
 * sections sont distribuees selon `DEFAULT_ZONE_FOR_SECTION`.
 */
export function createDefaultLayoutV2() {
  const zones = { header: { enabled: true, sections: [] }, main: { enabled: true, sections: [] }, sidebar: { enabled: true, sections: [] } };
  for (const section of CANONICAL_SECTION_KEYS_V2) {
    const zone = DEFAULT_ZONE_FOR_SECTION[section] || 'main';
    zones[zone].sections.push(section);
  }
  return {
    version: LAYOUT_V2_VERSION,
    zones,
    sidebarRatio: SIDEBAR_RATIO_DEFAULT,
    sidebarSide: 'right',
    theme: 'default',
  };
}

/** Helper purement defensif pour cloner une zone proprement. */
function safeZone(input, fallbackEnabled) {
  if (!input || typeof input !== 'object') {
    return { enabled: fallbackEnabled, sections: [] };
  }
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : fallbackEnabled,
    sections: Array.isArray(input.sections) ? input.sections.filter((s) => typeof s === 'string') : [],
  };
}

/**
 * Sanitise un input quelconque (potentiellement null, partiel, corrompu)
 * en un layout v2 valide. Garanties :
 *   - toutes les sections canoniques sont presentes EXACTEMENT UNE FOIS
 *     dans le layout (assignees a une zone ; on rajoute celles qui
 *     manquent dans leur zone par defaut).
 *   - les doublons sont supprimes (premiere occurrence gardee).
 *   - les sections inconnues sont rejetees.
 *   - `main.enabled` est FORCE a true (invariant).
 *   - `sidebarRatio` est clamp dans [SIDEBAR_RATIO_MIN, SIDEBAR_RATIO_MAX].
 *   - `sidebarSide` doit etre 'left' ou 'right' (fallback 'right').
 *   - `theme` doit etre string non vide (fallback 'default').
 *
 * @param {unknown} input
 * @returns {ReturnType<typeof createDefaultLayoutV2>}
 */
export function sanitizeLayoutV2(input) {
  if (!input || typeof input !== 'object') return createDefaultLayoutV2();

  const inZones = input.zones && typeof input.zones === 'object' ? input.zones : {};
  const zones = {
    header: safeZone(inZones.header, true),
    main: safeZone(inZones.main, true),
    sidebar: safeZone(inZones.sidebar, true),
  };
  zones.main.enabled = true; // invariant : main toujours actif.

  // Deduplication globale + filtre sur les sections canoniques. Premiere
  // occurrence gagne (priorite header -> main -> sidebar).
  const seen = new Set();
  for (const zone of CANONICAL_ZONE_KEYS) {
    zones[zone].sections = zones[zone].sections.filter((s) => {
      if (!CANONICAL_SECTION_KEYS_V2.includes(s)) return false;
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  }

  // Sections canoniques absentes -> on les rajoute dans leur zone par defaut.
  for (const section of CANONICAL_SECTION_KEYS_V2) {
    if (!seen.has(section)) {
      const zone = DEFAULT_ZONE_FOR_SECTION[section] || 'main';
      zones[zone].sections.push(section);
    }
  }

  const sidebarRatioRaw = Number(input.sidebarRatio);
  const sidebarRatio = Number.isFinite(sidebarRatioRaw)
    ? Math.max(SIDEBAR_RATIO_MIN, Math.min(SIDEBAR_RATIO_MAX, Math.round(sidebarRatioRaw)))
    : SIDEBAR_RATIO_DEFAULT;

  const sidebarSide = SIDEBAR_SIDES.includes(input.sidebarSide) ? input.sidebarSide : 'right';
  const theme = typeof input.theme === 'string' && input.theme.trim() ? input.theme : 'default';

  return { version: LAYOUT_V2_VERSION, zones, sidebarRatio, sidebarSide, theme };
}

/**
 * Indique si un layout est strictement equivalent au layout par defaut
 * (pour decider si on persiste `null` cote backend ou la valeur custom).
 */
export function isDefaultLayoutV2(layout) {
  const d = createDefaultLayoutV2();
  const safe = sanitizeLayoutV2(layout);
  if (safe.version !== d.version) return false;
  if (safe.sidebarRatio !== d.sidebarRatio) return false;
  if (safe.sidebarSide !== d.sidebarSide) return false;
  if (safe.theme !== d.theme) return false;
  for (const z of CANONICAL_ZONE_KEYS) {
    if (safe.zones[z].enabled !== d.zones[z].enabled) return false;
    if (safe.zones[z].sections.length !== d.zones[z].sections.length) return false;
    for (let i = 0; i < safe.zones[z].sections.length; i += 1) {
      if (safe.zones[z].sections[i] !== d.zones[z].sections[i]) return false;
    }
  }
  return true;
}

/**
 * Migre un layout v1 (`sectionsOrder` plat + sidebarRatio + theme) vers
 * la forme v2. Les sections de v1 sont distribuees dans les zones via
 * `DEFAULT_ZONE_FOR_SECTION` (le user n avait pas la notion de zone en
 * v1, on retombe sur la repartition canonique).
 *
 * L ordre interne de chaque zone respecte l ordre original de v1.
 *
 * `identity` n existait pas en v1 -> on l ajoute en tete du header.
 *
 * @param {unknown} v1Layout
 * @returns {ReturnType<typeof createDefaultLayoutV2>}
 */
export function migrateLayoutV1ToV2(v1Layout) {
  if (!v1Layout || typeof v1Layout !== 'object') return createDefaultLayoutV2();
  const order = Array.isArray(v1Layout.sectionsOrder) ? v1Layout.sectionsOrder : [];
  const zones = { header: { enabled: true, sections: ['identity'] }, main: { enabled: true, sections: [] }, sidebar: { enabled: true, sections: [] } };

  const placed = new Set(['identity']);
  for (const key of order) {
    if (typeof key !== 'string') continue;
    if (!CANONICAL_SECTION_KEYS_V2.includes(key)) continue;
    if (placed.has(key)) continue;
    const zone = DEFAULT_ZONE_FOR_SECTION[key] || 'main';
    zones[zone].sections.push(key);
    placed.add(key);
  }
  // Sections canoniques absentes de v1 -> zone par defaut.
  for (const key of CANONICAL_SECTION_KEYS_V2) {
    if (placed.has(key)) continue;
    const zone = DEFAULT_ZONE_FOR_SECTION[key] || 'main';
    zones[zone].sections.push(key);
  }

  const ratioRaw = Number(v1Layout.sidebarRatio);
  const sidebarRatio = Number.isFinite(ratioRaw)
    ? Math.max(SIDEBAR_RATIO_MIN, Math.min(SIDEBAR_RATIO_MAX, Math.round(ratioRaw)))
    : SIDEBAR_RATIO_DEFAULT;
  const theme = typeof v1Layout.theme === 'string' && v1Layout.theme.trim() ? v1Layout.theme : 'default';

  return { version: LAYOUT_V2_VERSION, zones, sidebarRatio, sidebarSide: 'right', theme };
}

/**
 * Retourne la zone d une section donnee ; null si la section n est pas
 * presente dans le layout (cas degener defensif uniquement).
 */
export function getZoneOfSection(layout, sectionKey) {
  const safe = sanitizeLayoutV2(layout);
  for (const zone of CANONICAL_ZONE_KEYS) {
    if (safe.zones[zone].sections.includes(sectionKey)) return zone;
  }
  return null;
}

/**
 * Deplace une section vers une zone cible, a un index donne (par defaut
 * append en fin). Si la section est deja dans la zone cible, c est
 * traite comme un reorder a l interieur de la zone.
 *
 * Idempotent : si fromZone===toZone et currentIndex===targetIndex, retourne
 * le layout tel quel.
 *
 * @param {object} layout
 * @param {string} sectionKey
 * @param {'header'|'main'|'sidebar'} targetZone
 * @param {number} [targetIndex] - position dans la zone cible (default: fin)
 */
export function moveSectionToZone(layout, sectionKey, targetZone, targetIndex) {
  const safe = sanitizeLayoutV2(layout);
  if (!CANONICAL_SECTION_KEYS_V2.includes(sectionKey)) return safe;
  if (!CANONICAL_ZONE_KEYS.includes(targetZone)) return safe;

  // On reconstruit toutes les zones en retirant la section partout, puis
  // en l inserant dans la zone cible.
  const nextZones = {};
  for (const z of CANONICAL_ZONE_KEYS) {
    nextZones[z] = { enabled: safe.zones[z].enabled, sections: safe.zones[z].sections.filter((s) => s !== sectionKey) };
  }
  const dst = nextZones[targetZone].sections;
  const idx = Number.isInteger(targetIndex) ? Math.max(0, Math.min(dst.length, targetIndex)) : dst.length;
  dst.splice(idx, 0, sectionKey);

  return { ...safe, zones: nextZones };
}

/**
 * Active / desactive une zone. `main` ne peut JAMAIS etre desactivee
 * (invariant). Quand on toggle off une zone, ses sections sont deplacees
 * vers `main` (append en fin) pour ne pas perdre de contenu.
 */
export function setZoneEnabled(layout, zoneKey, enabled) {
  const safe = sanitizeLayoutV2(layout);
  if (!CANONICAL_ZONE_KEYS.includes(zoneKey)) return safe;
  if (zoneKey === 'main') return safe; // invariant

  const nextZones = {};
  for (const z of CANONICAL_ZONE_KEYS) {
    nextZones[z] = { enabled: safe.zones[z].enabled, sections: [...safe.zones[z].sections] };
  }

  if (!enabled && nextZones[zoneKey].sections.length > 0) {
    // Sections migrees vers main, en fin pour preserver l ordre relatif.
    nextZones.main.sections.push(...nextZones[zoneKey].sections);
    nextZones[zoneKey].sections = [];
  }
  nextZones[zoneKey].enabled = !!enabled;

  return { ...safe, zones: nextZones };
}

/**
 * Fixe le ratio sidebar (clamp dans [SIDEBAR_RATIO_MIN, MAX]).
 */
export function setSidebarRatioV2(layout, ratio) {
  const safe = sanitizeLayoutV2(layout);
  const r = Number(ratio);
  const next = Number.isFinite(r)
    ? Math.max(SIDEBAR_RATIO_MIN, Math.min(SIDEBAR_RATIO_MAX, Math.round(r)))
    : SIDEBAR_RATIO_DEFAULT;
  return { ...safe, sidebarRatio: next };
}

/** Cote sur lequel placer la sidebar ('left' | 'right'). */
export function setSidebarSide(layout, side) {
  const safe = sanitizeLayoutV2(layout);
  if (!SIDEBAR_SIDES.includes(side)) return safe;
  return { ...safe, sidebarSide: side };
}

/** Retourne le layout aux valeurs par defaut. */
export function resetLayoutV2() {
  return createDefaultLayoutV2();
}

/**
 * Aplati les sections du layout en suivant l ordre visuel (header ->
 * main -> sidebar), pour fournir un `sectionsOrder` compatible avec les
 * consommateurs qui n ont pas la notion de zone (ex. ATS scoring,
 * `applyLayoutToDom`). Les zones desactivees sont sautees.
 */
export function flattenLayoutV2ToOrder(layout) {
  const safe = sanitizeLayoutV2(layout);
  const out = [];
  for (const z of CANONICAL_ZONE_KEYS) {
    if (!safe.zones[z].enabled) continue;
    for (const s of safe.zones[z].sections) out.push(s);
  }
  return out;
}
