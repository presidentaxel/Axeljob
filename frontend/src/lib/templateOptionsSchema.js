/**
 * Helpers purs autour du schema `options` des templates de CV.
 *
 * Chaque template livre (cf. `templates/<id>/meta.json`) declare une liste
 * d options sous la forme :
 *
 *   { key: 'header_color', type: 'color', default: '#1e2a3a', label: '...' }
 *   { key: 'font', type: 'select', choices: ['Inter', 'Georgia'], default: 'Inter', label: '...' }
 *   { key: 'show_photo', type: 'boolean', default: true, label: '...' }
 *
 * Ces helpers permettent de :
 *  - extraire le schema d un template,
 *  - completer un dictionnaire `templateOptions` partiel avec les defauts,
 *  - sanitiser une valeur d input avant de la stocker (color au format hex,
 *    select dans les choices, boolean coerced).
 *
 * Volontairement separe des composants React pour rester testable sous
 * `node --test` (aucun DOM, aucun browser API requise).
 */

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

const ALLOWED_TYPES = new Set(['color', 'select', 'boolean']);

/**
 * Retourne la liste des `options` d un template, ou `[]` si absente.
 * Filtre les entrees mal formees (sans key / sans type) pour eviter qu une
 * erreur de meta.json fasse crasher l UI.
 *
 * @param {{ options?: Array<object> } | null | undefined} template
 * @returns {Array<{key: string, type: string, default: any, label?: string, choices?: string[]}>}
 */
export function getTemplateOptionsSchema(template) {
  if (!template || !Array.isArray(template.options)) return [];
  return template.options.filter((opt) => (
    opt
    && typeof opt === 'object'
    && typeof opt.key === 'string'
    && opt.key.length > 0
    && typeof opt.type === 'string'
    && ALLOWED_TYPES.has(opt.type)
  ));
}

/**
 * Complete un dictionnaire d options avec les defauts du template pour
 * tout champ manquant. Ne supprime PAS les cles inconnues : elles peuvent
 * provenir d un template precedent (ex. l utilisateur change de template
 * mais on garde les couleurs deja choisies).
 *
 * @param {object} template
 * @param {object} currentOptions
 * @returns {object} merge {...defaults, ...currentOptions} avec coercion type
 */
export function applyTemplateOptionsDefaults(template, currentOptions) {
  const schema = getTemplateOptionsSchema(template);
  const out = currentOptions && typeof currentOptions === 'object' ? { ...currentOptions } : {};
  for (const field of schema) {
    if (out[field.key] === undefined || out[field.key] === null) {
      out[field.key] = field.default;
    }
  }
  return out;
}

/**
 * Sanitise une valeur d input pour un champ donne.
 * Retourne `undefined` si la valeur est invalide / refusee (l appelant
 * decide alors de garder l ancienne valeur).
 *
 * @param {{type: string, choices?: string[]}} field
 * @param {*} value
 * @returns {*}
 */
export function sanitizeTemplateOptionValue(field, value) {
  if (!field || typeof field !== 'object') return undefined;
  if (field.type === 'color') {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return HEX_COLOR_RE.test(trimmed) ? trimmed : undefined;
  }
  if (field.type === 'select') {
    if (typeof value !== 'string') return undefined;
    if (!Array.isArray(field.choices) || field.choices.length === 0) return undefined;
    return field.choices.includes(value) ? value : undefined;
  }
  if (field.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 1) return true;
    if (value === 'false' || value === 0) return false;
    return undefined;
  }
  return undefined;
}

/**
 * Regroupe les options d un template par categorie pour l affichage dans
 * l inspecteur. L ordre des groupes est stable et determine par la
 * convention produit (couleurs en premier, typo, puis booleens).
 *
 * @param {object} template
 * @returns {Array<{ id: string, label: string, fields: Array }>}
 */
export function groupTemplateOptions(template) {
  const schema = getTemplateOptionsSchema(template);
  const groups = {
    color: { id: 'color', label: 'Couleurs', fields: [] },
    select: { id: 'typo', label: 'Typographie', fields: [] },
    boolean: { id: 'display', label: 'Affichage', fields: [] },
  };
  for (const field of schema) {
    if (groups[field.type]) groups[field.type].fields.push(field);
  }
  return Object.values(groups).filter((g) => g.fields.length > 0);
}

/**
 * Retourne un dictionnaire d options reset aux valeurs par defaut du
 * template. Utile pour le bouton "Reinitialiser" du drawer inspecteur.
 *
 * @param {object} template
 * @returns {object}
 */
export function resetTemplateOptionsToDefaults(template) {
  const schema = getTemplateOptionsSchema(template);
  const out = {};
  for (const field of schema) {
    out[field.key] = field.default;
  }
  return out;
}
