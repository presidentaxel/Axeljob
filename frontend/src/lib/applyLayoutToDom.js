/**
 * Reordonne les sections d un container DOM selon `sectionsOrder`.
 *
 * Strategie : on cherche tous les `[data-cv-section]` directement
 * enfants d un meme parent (parent qui les contient toutes). On
 * deplace ensuite chaque section a sa nouvelle position via
 * `insertBefore` sur ce parent. Les nodes non listees dans
 * `sectionsOrder` restent au-dessus / a leur position initiale.
 *
 * Garanties :
 *   - Idempotent : appeler plusieurs fois sur le meme DOM avec le
 *     meme `sectionsOrder` ne change rien apres la premiere application.
 *   - Defensif : si le container ou le sectionsOrder sont invalides,
 *     la fonction ne touche pas au DOM (no-op).
 *   - Pas de mutation REACT-incompatible : on deplace des nodes
 *     entiers existants (React ne se base pas sur la position du DOM
 *     pour ses reconciliation, il se base sur les keys / le rendu
 *     virtuel ; deplacer des nodes via insertBefore est sur).
 *
 * Pourquoi `data-cv-section` plutot que matcher par `<h2>` ou
 * classes ? Pour rester explicite et robuste aux changements
 * de marquage CSS / template-specifiques. On ajoute l attribut
 * uniquement sur les sections que le user peut reorganiser.
 *
 * @param {HTMLElement | null | undefined} container
 * @param {ReadonlyArray<string> | null | undefined} sectionsOrder
 * @returns {boolean} `true` si au moins un node a ete deplace.
 */
export function applyLayoutToDom(container, sectionsOrder) {
  if (!container || typeof container.querySelectorAll !== 'function') return false;
  if (!Array.isArray(sectionsOrder) || sectionsOrder.length === 0) return false;

  const nodes = container.querySelectorAll('[data-cv-section]');
  if (!nodes || nodes.length === 0) return false;

  // On regroupe les sections par parent. Dans la pratique elles sont
  // toutes enfants d un meme `.cv-body`, mais le code gere le cas
  // general (plusieurs parents) en reordonnant separement chaque groupe.
  const byParent = new Map();
  for (const node of nodes) {
    if (!node || !node.parentNode || !node.dataset) continue;
    const key = node.dataset.cvSection;
    if (!key) continue;
    const parent = node.parentNode;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push({ key, node });
  }

  let moved = false;

  for (const [parent, entries] of byParent) {
    // Ordre cible : d abord les cles connues dans `sectionsOrder`, dans
    // cet ordre, puis les cles non listees (pour ne pas perdre du contenu).
    const knownTargets = [];
    const seen = new Set();
    for (const key of sectionsOrder) {
      const entry = entries.find((e) => e.key === key);
      if (entry && !seen.has(key)) {
        knownTargets.push(entry);
        seen.add(key);
      }
    }
    const trailing = entries.filter((e) => !seen.has(e.key));
    const targetSequence = [...knownTargets, ...trailing];

    // On insere chaque node dans l ordre cible, immediatement apres son
    // predecesseur. On utilise un `marker` (le premier node) comme
    // ancre. On utilise insertBefore avec le bon nextSibling.
    let anchor = null;
    for (const { node } of targetSequence) {
      // anchor est le node precedent : on veut inserer `node` apres lui.
      // Si anchor = null (premier), on insere avant le premier node de
      // la liste d origine pour positionner notre sequence en tete.
      if (anchor === null) {
        const firstSection = entries[0].node;
        // Si node n est pas deja firstSection, on l insere avant.
        if (node !== firstSection) {
          parent.insertBefore(node, firstSection);
          moved = true;
        }
      } else if (anchor.nextSibling !== node) {
        parent.insertBefore(node, anchor.nextSibling);
        moved = true;
      }
      anchor = node;
    }
  }

  return moved;
}
