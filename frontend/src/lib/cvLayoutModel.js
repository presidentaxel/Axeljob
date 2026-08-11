/**
 * Modele `layout` : ordre des sections, ratio de sidebar et theme.
 *
 * Ce module est volontairement separe du schema `cv` (cf. defaultCv) :
 *  - `cv`     -> contenu semantique (l IA lit ça)
 *  - `layout` -> presentation (ce module)
 *
 * Pur, testable, sans React ni DOM. Toutes les fonctions retournent un
 * nouveau layout (clone) et ne mutent jamais leurs arguments.
 *
 * Cf. docs/editor-vision.md sections 6 et 8.
 */

/**
 * Liste canonique des sections que l editeur sait gerer. L ordre dans
 * `CANONICAL_SECTION_KEYS` represente la presentation par defaut (alignee
 * sur ce que les templates HTML existants rendent : resume en tete,
 * experiences ensuite, etc.).
 *
 * Quand on supportera de nouvelles sections (centres d interet,
 * publications...), on les ajoute ICI -- pas en dur dans les composants.
 */
export const CANONICAL_SECTION_KEYS = Object.freeze([
  'resume',
  'experiences',
  'formations',
  'certifications',
  'projets',
  'competences',
]);

/**
 * Libelles UI canoniques pour chaque section. Stables, traduisibles plus
 * tard si besoin. On garde au feminin singulier pour rester homogene avec
 * EDITABLE_SECTIONS (lib/cvSectionOps.js).
 */
export const SECTION_LABELS = Object.freeze({
  resume: 'Résumé',
  experiences: 'Expériences',
  formations: 'Formations',
  certifications: 'Certifications',
  projets: 'Projets',
  competences: 'Compétences',
});

/**
 * Sidebar ratio supportes (en pourcentage). 0 = pas de sidebar (mono
 * colonne). Les autres valeurs sont calees sur les ratios courants des
 * templates ATS-safe : 30 et 33 correspondent a peu pres aux 1/3.
 * Une valeur < 25 ou > 40 penalise fortement le score ATS.
 */
export const SIDEBAR_RATIOS = Object.freeze([0, 25, 30, 33, 35, 40]);

/**
 * Themes de layout pre-definis. Pour P2 minimal, on n expose que le
 * theme "neutre" (defaut). Les autres themes (sombres, couleurs vives)
 * viendront en P2.x ou P4 (calibration).
 */
export const LAYOUT_THEMES = Object.freeze(['neutral']);

/**
 * Construit le layout par defaut (mono-colonne, ordre canonique).
 * Toujours utilise comme point de depart quand l utilisateur n a jamais
 * personalise sa mise en page.
 */
export function createDefaultLayout() {
  return {
    sectionsOrder: CANONICAL_SECTION_KEYS.slice(),
    sidebarRatio: 0,
    theme: 'neutral',
  };
}

/**
 * Sanitise un layout potentiellement corrompu (vient du backend, d un
 * import JSON, d un user qui a manipule localStorage...).
 *
 * Garanties post-sanitisation :
 *  - `sectionsOrder` est un array, chaque cle est dans CANONICAL_SECTION_KEYS,
 *    pas de doublons. Si une cle canonique manque, on l ajoute en fin.
 *  - `sidebarRatio` est un nombre dans SIDEBAR_RATIOS (sinon 0).
 *  - `theme` est dans LAYOUT_THEMES (sinon 'neutral').
 *
 * Cette fonction est la SEULE porte d entree d un layout externe : tout
 * le reste du code peut considerer le layout comme bien forme.
 */
export function sanitizeLayout(input) {
  const base = createDefaultLayout();
  const out = { ...base };

  if (input && typeof input === 'object') {
    if (Array.isArray(input.sectionsOrder)) {
      const seen = new Set();
      const ordered = [];
      for (const key of input.sectionsOrder) {
        if (typeof key !== 'string') continue;
        if (!CANONICAL_SECTION_KEYS.includes(key)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(key);
      }
      for (const key of CANONICAL_SECTION_KEYS) {
        if (!seen.has(key)) ordered.push(key);
      }
      out.sectionsOrder = ordered;
    }

    if (typeof input.sidebarRatio === 'number' && SIDEBAR_RATIOS.includes(input.sidebarRatio)) {
      out.sidebarRatio = input.sidebarRatio;
    }

    if (typeof input.theme === 'string' && LAYOUT_THEMES.includes(input.theme)) {
      out.theme = input.theme;
    }
  }
  return out;
}

/**
 * Indique si le layout est strictement equivalent au layout par defaut.
 * Utile pour proposer un bouton "Reinitialiser" desactive si pas de
 * diff, et pour decider de ne pas envoyer le layout au backend (gain
 * de bande passante minimal).
 */
export function isDefaultLayout(layout) {
  const def = createDefaultLayout();
  const cur = sanitizeLayout(layout);
  if (cur.sidebarRatio !== def.sidebarRatio) return false;
  if (cur.theme !== def.theme) return false;
  if (cur.sectionsOrder.length !== def.sectionsOrder.length) return false;
  for (let i = 0; i < cur.sectionsOrder.length; i += 1) {
    if (cur.sectionsOrder[i] !== def.sectionsOrder[i]) return false;
  }
  return true;
}

/**
 * Deplace une section a une nouvelle position. Indices hors bornes ->
 * layout inchange. fromIndex == toIndex -> layout inchange (no churn).
 */
export function moveSectionInLayout(layout, fromIndex, toIndex) {
  const cur = sanitizeLayout(layout);
  const order = cur.sectionsOrder;
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= order.length) return cur;
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= order.length) return cur;
  if (fromIndex === toIndex) return cur;
  const next = order.slice();
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return { ...cur, sectionsOrder: next };
}

/**
 * Definit la sidebar ratio. Si invalide -> layout inchange.
 */
export function setSidebarRatio(layout, ratio) {
  if (!SIDEBAR_RATIOS.includes(ratio)) return sanitizeLayout(layout);
  return { ...sanitizeLayout(layout), sidebarRatio: ratio };
}

/**
 * Reinitialise au layout par defaut. Utile pour le bouton "Reinitialiser"
 * du drawer.
 */
export function resetLayout() {
  return createDefaultLayout();
}

/**
 * Convertit l ordre du layout en liste d entrees `{ key, label }` pretes
 * a etre rendues par le drawer.
 */
export function getOrderedSectionEntries(layout) {
  const safe = sanitizeLayout(layout);
  return safe.sectionsOrder.map((key) => ({ key, label: SECTION_LABELS[key] || key }));
}

/**
 * Convertit le layout FRONTEND (forme minimaliste) en payload SCORING
 * tel qu attendu par le backend ATS (cf. backend/services/ats_score +
 * docs/editor-vision.md sec 16.2).
 *
 * Differences a recouvrir :
 *  - `sectionsOrder` (camelCase) -> `sections_order` (snake_case)
 *  - `sidebarRatio` percent (0-100) -> `sidebar_ratio` float (0.0-1.0)
 *  - on inclut une enveloppe minimale `{ version, format, grid, theme }`
 *
 * Volontairement pur : aucun fetch, pas d acces a `cv` (le scoring ATS
 * de base est sur le layout). Si on veut envoyer `cv` aussi, on le passe
 * separement au client (cf. lib/atsScoreClient.js).
 *
 * @param {object} layout - layout frontend (camelCase)
 * @param {object} [opts]
 * @param {string} [opts.templateId] - id du template pour traçabilite
 * @returns {object} payload pret a etre envoye a POST /api/ats/score-parsing
 */
export function frontendLayoutToScoringLayout(layout, { templateId } = {}) {
  const safe = sanitizeLayout(layout);
  // Le backend stocke un ratio dans [0.0, 1.0]. On garde 2 decimales
  // significatives pour rester aligne sur DEFAULT_SIDEBAR_RATIO = 0.33.
  const sidebarRatioFloat = Math.round((safe.sidebarRatio / 100) * 100) / 100;
  return {
    version: '2026.05',
    template_id: templateId || null,
    format: 'A4',
    grid: safe.sidebarRatio > 0 ? 'single-or-sidebar' : 'single-column',
    sidebar_position: 'right',
    sidebar_ratio: sidebarRatioFloat,
    sections_order: safe.sectionsOrder.slice(),
    theme: {
      name: safe.theme,
    },
    metadata: {
      source: 'editor_beta_layout',
      scoring_version: '2026.05',
    },
  };
}
