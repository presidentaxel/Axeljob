/**
 * Comportement enrichi des champs `contentEditable` du CV (L1 polish).
 *
 * Objectif : que l edition inline ressemble a un Word, sans framework
 * lourd. Trois axes :
 *  1. **Placeholders** : quand un champ est vide, on affiche un hint
 *     gris discret via `::before` + `attr(data-cv-placeholder)`.
 *  2. **Single-line vs multi-line** : sur les champs single-line
 *     (nom, dates, email...), Enter ne doit PAS inserer de saut de
 *     ligne -> il blur et passe au champ suivant. Sur les multi-line
 *     (resume, bullet_points), Enter insere normalement un saut.
 *  3. **Escape annule** l edition courante en restaurant la valeur
 *     qu avait le champ au focus.
 *
 * Le module est PUR : pas d import React/DOM ; les fonctions prennent
 * un element DOM en argument et renvoient un cleanup. Tout
 * l attachement reel se fait dans un `useEffect` cote consommateur.
 *
 * Mapping `path -> config` : le `data-cv-field` est de la forme
 * `cle[.index.souscle]` (ex. `experiences.0.entreprise`). On normalise
 * les index numeriques en `*` pour matcher un seul motif par type de
 * champ. Defensive : un path inconnu retombe sur la config par defaut.
 */

/** Config par defaut quand un path n est pas reconnu. */
const DEFAULT_FIELD_CONFIG = Object.freeze({ placeholder: '', multiline: false });

/**
 * Table de configuration par motif (apres normalisation des index).
 * Doit rester en sync avec les `data-cv-field` du JSX de
 * `CvEditablePreview.jsx`. Si un motif manque, le champ marche tout
 * de meme (juste sans placeholder).
 */
const FIELD_CONFIG_BY_PATTERN = Object.freeze({
  // Identite
  prenom: { placeholder: 'Prénom', multiline: false },
  nom: { placeholder: 'Nom', multiline: false },
  titre_professionnel: { placeholder: 'Titre professionnel (ex. Chef de projet digital)', multiline: false },
  resume: { placeholder: 'Court résumé professionnel (2-3 lignes)', multiline: true },
  telephone: { placeholder: 'Téléphone', multiline: false },
  email: { placeholder: 'Adresse email', multiline: false },
  linkedin: { placeholder: 'linkedin.com/in/votreprofil', multiline: false },

  // Experiences
  'experiences.*.entreprise': { placeholder: 'Organisation', multiline: false },
  'experiences.*.date_debut': { placeholder: 'Début (ex. 2020)', multiline: false },
  'experiences.*.date_fin': { placeholder: "Fin (ou Aujourd'hui)", multiline: false },
  'experiences.*.lieu': { placeholder: 'Lieu (optionnel)', multiline: false },
  'experiences.*.poste': { placeholder: 'Poste / fonction', multiline: false },
  'experiences.*.secteur': { placeholder: 'Secteur', multiline: false },
  'experiences.*.bullet_points.*': { placeholder: 'Action ou résultat clé', multiline: true },
  'experiences.*.clients': { placeholder: 'Clients (optionnel)', multiline: false },

  // Formations
  'formations.*.etablissement': { placeholder: 'Établissement', multiline: false },
  'formations.*.diplome': { placeholder: 'Diplôme', multiline: false },
  'formations.*.date': { placeholder: 'Année', multiline: false },
  'formations.*.mention': { placeholder: 'Mention (optionnel)', multiline: false },

  // Certifications
  'certifications.*.nom': { placeholder: 'Nom de la certification', multiline: false },
  'certifications.*.organisme': { placeholder: 'Organisme', multiline: false },
  'certifications.*.date': { placeholder: 'Date', multiline: false },

  // Projets
  'projets.*.nom': { placeholder: 'Nom du projet', multiline: false },
  'projets.*.description': { placeholder: 'Description du projet', multiline: true },

  // Competences
  'competences.techniques.*': { placeholder: 'Compétence', multiline: false },
  'competences.logiciels.*': { placeholder: 'Logiciel / outil', multiline: false },
  'competences.langues.*': { placeholder: 'Langue', multiline: false },
});

/**
 * Normalise un chemin pour le matching :
 *   "experiences.0.bullet_points.2" -> "experiences.*.bullet_points.*"
 * On remplace les segments NUMERIQUES par "*". Les segments non
 * numeriques (noms de champ) restent.
 */
export function normalizeFieldPath(path) {
  if (typeof path !== 'string' || !path) return '';
  return path
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? '*' : seg))
    .join('.');
}

/**
 * Retourne la config (placeholder + multiline) d un champ donne via son
 * `data-cv-field`. Tolere null / chemin inconnu (defaut).
 */
export function getEditableFieldConfig(path) {
  const norm = normalizeFieldPath(path);
  return FIELD_CONFIG_BY_PATTERN[norm] || DEFAULT_FIELD_CONFIG;
}

/**
 * Helper : trouve le prochain `[data-cv-field]` dans le meme container
 * (DFS document order). Saute les champs `_noop`. Retourne null si on
 * est deja sur le dernier.
 */
export function findNextEditableField(currentField) {
  if (!currentField || typeof currentField !== 'object') return null;
  // closest('.cv-editable-preview') OU body si pas trouve.
  const root = (typeof currentField.closest === 'function'
    && currentField.closest('.cv-editable-preview')) || null;
  const scope = root || (currentField.ownerDocument && currentField.ownerDocument.body);
  if (!scope || typeof scope.querySelectorAll !== 'function') return null;
  const all = Array.from(scope.querySelectorAll('[data-cv-field]'))
    .filter((el) => el.getAttribute('data-cv-field') !== '_noop');
  const idx = all.indexOf(currentField);
  if (idx < 0) return null;
  return all[idx + 1] || null;
}

/**
 * Attache la behavior d edition enrichie sur un element DOM. Retourne
 * une fonction de cleanup qui retire tous les listeners et attributs
 * ajoutes.
 *
 * Idempotent : si on rappelle sans cleanup, on dedouble les listeners.
 * Le consommateur (`useEffect`) doit donc bien appeler le cleanup.
 *
 * @param {HTMLElement} field
 * @param {{ placeholder: string, multiline: boolean }} config
 * @returns {() => void} cleanup
 */
export function attachEditableFieldBehavior(field, config) {
  if (!field || typeof field !== 'object' || typeof field.addEventListener !== 'function') {
    return () => {};
  }

  const cfg = config && typeof config === 'object' ? config : DEFAULT_FIELD_CONFIG;

  /** Snapshot pris au focus, restore au Escape pour annuler l edition. */
  let snapshotAtFocus = field.textContent || '';

  const setEmptyState = () => {
    const empty = !(field.textContent && field.textContent.trim());
    if (empty) field.setAttribute('data-cv-empty', '');
    else field.removeAttribute('data-cv-empty');
  };

  if (cfg.placeholder) field.setAttribute('data-cv-placeholder', cfg.placeholder);
  field.setAttribute('data-cv-multiline', cfg.multiline ? 'true' : 'false');
  setEmptyState();

  const onFocus = () => {
    snapshotAtFocus = field.textContent || '';
  };

  const onInput = () => {
    setEmptyState();
  };

  /**
   * Pour les champs single-line : on intercepte Enter + tout retour
   * a la ligne. Tab et Shift-Tab sont laisses au browser (navigation
   * naturelle entre contentEditable).
   *
   * Pour les multi-line : Enter normal -> le browser insere un <br>
   * ou <div>. Quand l user blur, `handleBlur` cote consommateur lit
   * `textContent` qui contient le \n, et React re-render avec le bon
   * formatage. Pour qu un saut visuel apparaisse PENDANT l edition,
   * on accepte ce comportement natif.
   */
  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      field.textContent = snapshotAtFocus;
      setEmptyState();
      // blur pour confirmer le retour a l ancienne valeur
      if (typeof field.blur === 'function') field.blur();
      return;
    }
    if (event.key === 'Enter' && !cfg.multiline) {
      // Single-line : Enter = valider + passer au champ suivant.
      // Shift+Enter sur single-line = idem (pas de saut force).
      event.preventDefault();
      const next = findNextEditableField(field);
      if (typeof field.blur === 'function') field.blur();
      if (next && typeof next.focus === 'function') next.focus();
    }
  };

  /**
   * Sur single-line : si l user colle du multi-line, on aplati le
   * texte en remplacant les sauts par un espace. Sur multi-line, on
   * laisse passer.
   */
  const onPaste = (event) => {
    if (cfg.multiline) return;
    try {
      const text = (event.clipboardData && event.clipboardData.getData('text/plain')) || '';
      const cleaned = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      event.preventDefault();
      // Insere le texte nettoye via la Selection API (compat large).
      const sel = field.ownerDocument && field.ownerDocument.getSelection
        ? field.ownerDocument.getSelection()
        : null;
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(field.ownerDocument.createTextNode(cleaned));
        // Repositionne le curseur en fin du texte insere.
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        field.textContent = (field.textContent || '') + cleaned;
      }
      setEmptyState();
    } catch (_) { /* ignore */ }
  };

  field.addEventListener('focus', onFocus);
  field.addEventListener('input', onInput);
  field.addEventListener('keydown', onKeydown);
  field.addEventListener('paste', onPaste);

  return function cleanup() {
    field.removeEventListener('focus', onFocus);
    field.removeEventListener('input', onInput);
    field.removeEventListener('keydown', onKeydown);
    field.removeEventListener('paste', onPaste);
    field.removeAttribute('data-cv-placeholder');
    field.removeAttribute('data-cv-empty');
    field.removeAttribute('data-cv-multiline');
  };
}
