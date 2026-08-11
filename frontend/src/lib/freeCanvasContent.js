/**
 * Resolution du contenu des blocs semantiques du canvas libre (P3.2).
 *
 * Chaque bloc semantique reference le CV via `bind` (chemin ou tableau de
 * chemins). Ce module extrait le texte / les listes a afficher, sans
 * dependance React/DOM.
 */

/** Valeur dans l objet au chemin "a.b.0.c" (meme logique que CvEditablePreview). */
export function getByPath(obj, path) {
  if (!obj || typeof path !== 'string' || !path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;
    const i = parseInt(p, 10);
    cur = !Number.isNaN(i) && String(i) === p ? cur[i] : cur[p];
  }
  return cur;
}

/** Normalise `bind` en tableau de chemins. */
export function normalizeBind(bind) {
  if (typeof bind === 'string' && bind) return [bind];
  if (Array.isArray(bind)) return bind.filter((b) => typeof b === 'string' && b);
  return [];
}

/**
 * Concatene les champs lies (ex. prenom + nom) avec un separateur.
 */
export function resolveBoundText(cv, bind, { separator = ' ' } = {}) {
  const paths = normalizeBind(bind);
  if (!cv || paths.length === 0) return '';
  const parts = paths
    .map((p) => {
      const v = getByPath(cv, p);
      return typeof v === 'string' ? v.trim() : '';
    })
    .filter(Boolean);
  return parts.join(separator);
}

function coerceStringListItem(item) {
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'number' && Number.isFinite(item)) return String(item);
  if (item && typeof item === 'object') {
    return String(item.name || item.label || item.value || item.text || '').trim();
  }
  return '';
}

/** Liste de strings depuis un bind (ex. competences.techniques). */
export function resolveBoundStringList(cv, bind) {
  const paths = normalizeBind(bind);
  if (!cv || paths.length === 0) return [];
  const path = paths[0];
  const v = getByPath(cv, path);
  if (Array.isArray(v)) {
    return v.map(coerceStringListItem).filter(Boolean);
  }
  if (typeof v === 'string' && v.trim()) {
    return v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

const COMPETENCE_BIND_ALIASES = {
  'competences.logiciels': ['competences.informatiques'],
  'competences.techniques': ['competences.competences_techniques'],
  'competences.autres': ['loisirs'],
};

/** Compétences / logiciels / autres avec chemins alternatifs (comme les templates HTML). */
export function resolveCompetenceList(cv, bind) {
  const paths = normalizeBind(bind);
  const primary = paths[0] || 'competences.techniques';
  let items = resolveBoundStringList(cv, primary);
  if (items.length > 0) return items;
  const comp = cv?.competences;
  if (comp && typeof comp === 'object' && primary.startsWith('competences.')) {
    const key = primary.slice('competences.'.length);
    const legacy = comp[key] ?? comp[`competences_${key}`];
    if (Array.isArray(legacy)) {
      items = legacy.map(coerceStringListItem).filter(Boolean);
      if (items.length > 0) return items;
    }
  }
  for (const alt of COMPETENCE_BIND_ALIASES[primary] || []) {
    items = resolveBoundStringList(cv, alt);
    if (items.length > 0) return items;
  }
  return [];
}

/** Experiences avec contenu (poste, entreprise ou bullet non vide). */
export function resolveExperiences(cv, limit) {
  const all = Array.isArray(cv?.experiences) ? cv.experiences : [];
  const filtered = all.filter(
    (e) =>
      (e?.poste || '').trim()
      || (e?.entreprise || '').trim()
      || (e?.bullet_points || []).some((b) => (b || '').trim()),
  );
  const max = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : filtered.length;
  return filtered.slice(0, max);
}

export function resolveFormations(cv, limit) {
  const all = Array.isArray(cv?.formations) ? cv.formations : [];
  const filtered = all.filter(
    (f) =>
      (f?.diplome || '').trim()
      || (f?.etablissement || '').trim()
      || (f?.date || '').trim(),
  );
  const max = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : filtered.length;
  return filtered.slice(0, max);
}

export function resolveCertifications(cv, limit) {
  const all = Array.isArray(cv?.certifications) ? cv.certifications : [];
  const filtered = all.filter(
    (c) => (c?.nom || '').trim() || (c?.organisme || '').trim(),
  );
  const max = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : filtered.length;
  return filtered.slice(0, max);
}

export function resolveProjets(cv, limit) {
  const all = Array.isArray(cv?.projets) ? cv.projets : [];
  const filtered = all.filter((p) => (p?.nom || '').trim() || (p?.description || '').trim());
  const max = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : filtered.length;
  return filtered.slice(0, max);
}

export function resolveLangues(cv) {
  const all = Array.isArray(cv?.competences?.langues) ? cv.competences.langues : [];
  return all.filter((l) => (l?.langue || '').trim());
}

/** URL photo normalisee (relative assets/ -> prefixe a gerer cote composant). */
export function resolvePhotoUrl(cv) {
  const raw = (cv?.photo_url || '').trim();
  return raw || '';
}
