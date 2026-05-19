/**
 * Inspecte un container DOM rendu (le wrapper de `CvEditablePreview`)
 * pour determiner, parmi les sections canoniques du layout :
 *   - lesquelles sont **rendues** (presentes via `data-cv-section="<key>"`)
 *   - dans quel **groupe** elles vivent (regroupement par parent DOM
 *     -> "main", "sidebar", ou "group-N" si parent atypique).
 *
 * Cette information sert au drawer Mise en page (P2.2.b) pour :
 *   - desactiver visuellement le drag des sections non rendues
 *     (cas typique : `resume` dans le header du template sidebar
 *     -> aucun `<section data-cv-section="resume">` -> drag inutile).
 *   - afficher un badge "Principal" / "Sidebar" qui explique pourquoi
 *     deplacer une section d une colonne a l autre n a pas d effet
 *     (le reorder DOM est strictement intra-parent).
 *
 * Pur : aucune dependance React/DOM en dehors des appels passes en
 * argument. Testable via un mock minimaliste (`tests/unit/`).
 */

/**
 * Heuristique de naming du groupe a partir du parent DOM. On utilise le
 * className (qui est stable et propre aux templates JSX) pour distinguer
 * "main" (colonne principale) de "sidebar" (colonne secondaire).
 *
 * Les regex matchent toutes les variantes connues :
 *   - `cv-body`, `main-column`, `main-section` -> main
 *   - `cv-sidebar`, `section-sidebar`, `sidebar` -> sidebar
 *   - sinon -> fallback `group-<i>` (numerotation stable par ordre
 *     d apparition).
 *
 * `tagName === 'ARTICLE'` est aussi traite comme main (le `<article
 * className="cv">` enveloppe tout dans les layouts mono-colonne).
 */
function classifyParent(parent, fallbackIndex) {
  if (!parent) return `group-${fallbackIndex}`;
  const className = typeof parent.className === 'string'
    ? parent.className
    : (parent.className && typeof parent.className.baseVal === 'string' ? parent.className.baseVal : '');
  if (/sidebar/i.test(className)) return 'sidebar';
  if (/cv-body|main-/i.test(className)) return 'main';
  if (parent.tagName && parent.tagName.toUpperCase() === 'ARTICLE') return 'main';
  return `group-${fallbackIndex}`;
}

/**
 * @param {HTMLElement | null | undefined} container
 * @returns {null | {
 *   groups: Array<{ groupId: string, keys: string[] }>,
 *   keyToGroup: Record<string, string>,
 *   availableKeys: string[],
 * }}
 */
export function readSectionsAvailability(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return null;
  const nodes = container.querySelectorAll('[data-cv-section]');
  if (!nodes || nodes.length === 0) return null;

  /** Map<parentNode, string[]> -> on garde une Map pour preserver l ordre d insertion. */
  const byParent = new Map();
  for (const node of nodes) {
    const key = node && node.dataset ? node.dataset.cvSection : null;
    if (!key || !node.parentNode) continue;
    if (!byParent.has(node.parentNode)) byParent.set(node.parentNode, []);
    byParent.get(node.parentNode).push(key);
  }

  const groups = [];
  const keyToGroup = {};
  const availableKeys = [];
  let i = 0;
  for (const [parent, keys] of byParent) {
    const groupId = classifyParent(parent, i);
    // Si deux parents partagent le meme groupId, on les fusionne en
    // appendant les cles (rarement utile mais defensif).
    let entry = groups.find((g) => g.groupId === groupId);
    if (!entry) {
      entry = { groupId, keys: [] };
      groups.push(entry);
    }
    for (const k of keys) {
      if (!entry.keys.includes(k)) entry.keys.push(k);
      keyToGroup[k] = groupId;
      availableKeys.push(k);
    }
    i += 1;
  }

  return { groups, keyToGroup, availableKeys };
}

/**
 * Libelle UI court pour un `groupId`. On garde la traduction ici pour
 * que le UI consomme directement un libelle pret a afficher.
 */
export function groupIdLabel(groupId) {
  if (groupId === 'main') return 'Principal';
  if (groupId === 'sidebar') return 'Sidebar';
  return null;
}
