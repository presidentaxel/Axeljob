/**
 * Operations pures sur les listes du CV (experiences, formations,
 * certifications, projets) : ajout, suppression, deplacement.
 *
 * Volontairement hors React et hors DOM : tout est testable sous
 * `node --test`. Aucune mutation de l input ; chaque fonction retourne
 * un nouveau CV (clone superficiel + array clone).
 *
 * Le drawer inspecteur (panneau "Contenu") et toute autre UI peuvent
 * consommer ce module pour eviter de dupliquer la logique de cle / d id /
 * de defaut d item.
 */

/**
 * Genere un id court mais quasi-unique pour un nouvel item. Format
 * `<prefix>_<base36 epoch>_<base36 random>` -> 16 caracteres environ.
 * Ne depend pas de `crypto.randomUUID` pour rester compatible Node + JSDOM
 * et tester de maniere deterministe (on peut injecter `nowFn` / `randFn`).
 */
export function generateItemId(prefix, { nowFn = Date.now, randFn = Math.random } = {}) {
  const safePrefix = typeof prefix === 'string' && prefix.length > 0 ? prefix : 'item';
  const ts = Math.floor(nowFn()).toString(36);
  const rand = Math.floor(randFn() * 36 ** 5).toString(36).padStart(5, '0');
  return `${safePrefix}_${ts}${rand}`;
}

/**
 * Schemas des sections editables par le drawer "Contenu".
 *
 *  - `key`         : nom du tableau dans le CV
 *  - `label`       : libelle UI
 *  - `singular`    : "ajouter une <singular>" pour le bouton +
 *  - `idPrefix`    : prefixe d id quand on cree un nouvel item
 *  - `createItem` : fabrique un item vide (toutes les cles necessaires
 *                   pour que les inputs contentEditable se branchent)
 *  - `displayLabel(item)` : libelle a afficher pour l item dans la liste
 *                          (par defaut : ce qui semble le plus parlant)
 */
export const EDITABLE_SECTIONS = [
  {
    key: 'experiences',
    label: 'Expériences',
    singular: 'expérience',
    idPrefix: 'exp',
    createItem: (id) => ({
      id,
      poste: '',
      entreprise: '',
      secteur: '',
      date_debut: '',
      date_fin: '',
      lieu: '',
      contexte: '',
      bullet_points: ['', ''],
      mots_cles: [],
      clients: '',
    }),
    displayLabel: (item) => {
      if (!item) return '(vide)';
      const poste = (item.poste || '').trim();
      const entreprise = (item.entreprise || '').trim();
      if (poste && entreprise) return `${poste} - ${entreprise}`;
      if (poste) return poste;
      if (entreprise) return entreprise;
      return '(nouvelle expérience)';
    },
  },
  {
    key: 'formations',
    label: 'Formations',
    singular: 'formation',
    idPrefix: 'form',
    createItem: (id) => ({ id, diplome: '', etablissement: '', date: '', mention: '' }),
    displayLabel: (item) => {
      if (!item) return '(vide)';
      const dip = (item.diplome || '').trim();
      const eta = (item.etablissement || '').trim();
      if (dip && eta) return `${dip} - ${eta}`;
      return dip || eta || '(nouvelle formation)';
    },
  },
  {
    key: 'certifications',
    label: 'Certifications',
    singular: 'certification',
    idPrefix: 'cert',
    createItem: (id) => ({ id, nom: '', organisme: '', date: '' }),
    displayLabel: (item) => {
      if (!item) return '(vide)';
      const nom = (item.nom || '').trim();
      const org = (item.organisme || '').trim();
      if (nom && org) return `${nom} - ${org}`;
      return nom || org || '(nouvelle certification)';
    },
  },
  {
    key: 'projets',
    label: 'Projets',
    singular: 'projet',
    idPrefix: 'proj',
    createItem: (id) => ({ id, nom: '', description: '', mots_cles: [] }),
    displayLabel: (item) => {
      if (!item) return '(vide)';
      const nom = (item.nom || '').trim();
      return nom || '(nouveau projet)';
    },
  },
];

export function findSectionSchema(sectionKey) {
  return EDITABLE_SECTIONS.find((s) => s.key === sectionKey) || null;
}

/**
 * Retourne un array sur (pour ne jamais throw si la cle n est pas dans
 * le CV). Clone superficiellement pour ne pas exposer l interne.
 */
export function getSectionItems(cv, sectionKey) {
  if (!cv || typeof cv !== 'object') return [];
  const arr = cv[sectionKey];
  return Array.isArray(arr) ? arr.slice() : [];
}

/**
 * Ajoute un item vide en fin de section et retourne le nouveau CV.
 * L item est genere via `createItem(id)` du schema.
 * `idGen` et `idHelpers` permettent l injection pour les tests.
 */
export function addItemToSection(cv, sectionKey, { idGen, idHelpers } = {}) {
  const schema = findSectionSchema(sectionKey);
  if (!schema) return cv;
  const generated = typeof idGen === 'function'
    ? idGen(schema.idPrefix)
    : generateItemId(schema.idPrefix, idHelpers);
  const newItem = schema.createItem(generated);
  const items = getSectionItems(cv, sectionKey);
  return { ...(cv || {}), [sectionKey]: [...items, newItem] };
}

/**
 * Supprime l item a `index` et retourne le nouveau CV.
 * `index` hors bornes -> CV inchange.
 */
export function removeItemFromSection(cv, sectionKey, index) {
  const schema = findSectionSchema(sectionKey);
  if (!schema) return cv;
  const items = getSectionItems(cv, sectionKey);
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return cv;
  const next = items.slice();
  next.splice(index, 1);
  return { ...(cv || {}), [sectionKey]: next };
}

/**
 * Deplace un item de `fromIndex` a `toIndex`.
 * Indices hors bornes -> CV inchange.
 * fromIndex == toIndex -> CV inchange (pas de churn).
 */
export function moveItemInSection(cv, sectionKey, fromIndex, toIndex) {
  const schema = findSectionSchema(sectionKey);
  if (!schema) return cv;
  const items = getSectionItems(cv, sectionKey);
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= items.length) return cv;
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= items.length) return cv;
  if (fromIndex === toIndex) return cv;
  const next = items.slice();
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return { ...(cv || {}), [sectionKey]: next };
}

/**
 * Calcule l index cible quand l utilisateur deplace un item de
 * `fromIndex` vers la zone de drop d index `dropIndex`. La logique
 * suit la convention courante : si l on drop apres un item vers le bas,
 * on cible le slot apres lui ; vers le haut, le slot avant.
 *
 * Cette fonction est testee isolement car la logique d off-by-one est
 * la principale source de bugs des reorders manuels.
 */
export function computeReorderTargetIndex(fromIndex, dropIndex, length) {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(dropIndex) || !Number.isInteger(length)) {
    return -1;
  }
  if (fromIndex < 0 || fromIndex >= length) return -1;
  if (dropIndex < 0) return 0;
  if (dropIndex >= length) return length - 1;
  return dropIndex;
}
