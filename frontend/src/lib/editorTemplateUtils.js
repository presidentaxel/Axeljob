/**
 * Helpers purs autour de la liste de templates pour l editeur Beta.
 *
 * Volontairement separes des composants React pour rester testables sous
 * `node --test` (sans DOM ni React).
 *
 * Le concept "premium" et les templates personnalises (prefixe `custom_`)
 * ont ete retires : tous les utilisateurs accedent a l ensemble des
 * templates livres et personnalisent leur design via les options du
 * template (couleurs, police, sidebar, etc.) plutot que via un template
 * pre-existant marque comme custom.
 */

/**
 * Trie et filtre la liste de templates pour le selecteur de la topbar
 * editeur.
 *
 *  1. Ecarte les templates personnalises (id `custom_*` ou tag `custom`).
 *     Plus de notion de "templates persistes par utilisateur" depuis la
 *     refonte du profil : chacun adapte son design via les options.
 *  2. Place les templates ATS-safe / single-column en premier (heuristique
 *     produit : ils donnent un meilleur score de parsing).
 *  3. Trie ensuite alphabetiquement par `name` pour un ordre stable et
 *     previsible.
 *
 * L input n est jamais mute (retour d un nouveau tableau).
 */
export function sortTemplatesForEditor(templates) {
  if (!Array.isArray(templates)) return [];
  const items = templates.filter(isOfficialTemplate);
  return [...items].sort((a, b) => {
    const aSafe = isAtsSafe(a) ? 0 : 1;
    const bSafe = isAtsSafe(b) ? 0 : 1;
    if (aSafe !== bSafe) return aSafe - bSafe;
    return (a.name || a.id || '').localeCompare(b.name || b.id || '');
  });
}

/**
 * Un template "officiel" :
 *  - a un `id` non vide,
 *  - n est PAS un template personnalise (`custom_*` ou tag `custom`).
 *
 * Cette fonction est exportee pour pouvoir filtrer ailleurs (ex. badge
 * recommandation, redirection en cas de templateId obsolete).
 */
export function isOfficialTemplate(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.id !== 'string' || item.id.length === 0) return false;
  if (item.id.startsWith('custom_')) return false;
  if (Array.isArray(item.tags) && item.tags.includes('custom')) return false;
  return true;
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

/** Label affiche dans le `<option>` du selecteur. */
export function templateOptionLabel(template) {
  if (!template || typeof template !== 'object') return '';
  return template.name || template.id || '';
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
