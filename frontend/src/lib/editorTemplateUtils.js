/**
 * Helpers purs autour de la liste de templates pour l editeur Beta.
 *
 * Volontairement separes des composants React pour rester testables sous
 * `node --test` (sans DOM ni React).
 */

/**
 * Trie une liste de templates pour l affichage dans le selecteur de la
 * topbar editeur :
 *   1. les templates ATS-safe / single-column en premier (recommandes pour
 *      le parsing) ;
 *   2. les autres ensuite ;
 *   3. les templates premium en bas de chaque groupe (sans les exclure).
 *
 * L ordre est stable et determine par les tags. On evite de muter
 * l input (retour d un nouveau tableau).
 */
export function sortTemplatesForEditor(templates) {
  if (!Array.isArray(templates)) return [];
  const items = templates.filter(isTemplateLike);
  return [...items].sort((a, b) => {
    const aSafe = isAtsSafe(a) ? 0 : 1;
    const bSafe = isAtsSafe(b) ? 0 : 1;
    if (aSafe !== bSafe) return aSafe - bSafe;
    const aPremium = a.premium ? 1 : 0;
    const bPremium = b.premium ? 1 : 0;
    if (aPremium !== bPremium) return aPremium - bPremium;
    return (a.name || a.id || '').localeCompare(b.name || b.id || '');
  });
}

/** Un template doit avoir au minimum un `id` non vide. */
function isTemplateLike(item) {
  return Boolean(item && typeof item === 'object' && typeof item.id === 'string' && item.id.length > 0);
}

/**
 * Heuristique simple : on considere comme ATS-safe les templates qui ont
 * le tag explicite `ats-safe` OU `single-column`. Aligne avec la convention
 * des fichiers `templates/*\/meta.json`.
 */
export function isAtsSafe(template) {
  if (!template || !Array.isArray(template.tags)) return false;
  return template.tags.includes('ats-safe') || template.tags.includes('single-column');
}

/**
 * Label affiche dans le `<option>` du selecteur. On ajoute un suffixe
 * discret quand le template est marque premium (le backend gere le paywall
 * effectif, on signale juste a l UX que le template est de cette categorie).
 */
export function templateOptionLabel(template) {
  if (!template || typeof template !== 'object') return '';
  const name = template.name || template.id || '?';
  return template.premium ? `${name} (premium)` : name;
}

/**
 * Retourne le template correspondant a un id, ou null s il n est pas
 * dans la liste. Utile pour reconcilier le templateId courant avec
 * l etat du selecteur.
 */
export function findTemplateById(templates, id) {
  if (!Array.isArray(templates) || typeof id !== 'string') return null;
  return templates.find((t) => t && t.id === id) || null;
}
