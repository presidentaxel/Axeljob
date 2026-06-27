/**
 * Store immutable pour undo / redo du layout v3 (P3.1).
 *
 * Objectif : permettre a l user de revenir en arriere apres N
 * modifications (drag, resize, ajout/suppression de bloc, edition de
 * style...). Le store maintient trois listes :
 *
 *   past    : [Layout] -- les etats successifs anterieurs au present
 *   present : Layout   -- l etat courant affiche
 *   future  : [Layout] -- les etats annules par un undo, redo-ables
 *
 * Chaque appel a `commit(store, newLayout)` :
 *   1. pousse `present` dans `past`,
 *   2. remplace `present` par `newLayout`,
 *   3. vide `future` (une nouvelle action invalide l historique de redo).
 *
 * Coalescing : pendant un drag, le caller commit potentiellement a
 * chaque mousemove (50-60/s). On ne veut PAS pousser 60 entrees dans
 * `past` en 1 seconde. Le caller passe un `groupKey` (ex. "drag:blkXYZ")
 * et tant que les commits arrivent dans la meme fenetre
 * `COALESCE_WINDOW_MS` avec le meme groupKey, ils remplacent le present
 * SANS toucher au past. Quand on lache la souris ou qu on change
 * d action, le prochain commit avec un nouveau groupKey (ou pas de
 * groupKey du tout) deviendra une entree distincte dans l historique.
 *
 * Limite : `HISTORY_LIMIT` controle la profondeur max de `past`. Au-dela,
 * les plus anciens etats sont droppes (fenetre glissante).
 *
 * Tout est PUR : aucune mutation des stores en entree, aucune
 * dependance React/DOM. Testable a 100% sous `node --test`.
 */

/** Profondeur max de l historique. 50 = ~suffisant pour un user humain
 *  sans exploser la memoire (50 layouts * ~5 KB = 250 KB max). */
export const HISTORY_LIMIT = 50;

/** Fenetre de coalescing par defaut : 2 commits du meme groupKey dans
 *  cette fenetre sont fusionnes en un seul. */
export const COALESCE_WINDOW_MS = 300;

/**
 * Cree un store frais initialise avec un layout. `present` est mis a
 * `initialLayout` ; `past` et `future` sont vides.
 */
export function createHistoryStore(initialLayout) {
  return {
    past: [],
    present: initialLayout,
    future: [],
    lastCommitAt: 0,
    lastGroupKey: null,
  };
}

/** Lit le layout courant. Helper pour ne pas exposer la forme interne. */
export function getPresent(store) {
  return store ? store.present : undefined;
}

/** Vrai si au moins un undo est possible. */
export function canUndo(store) {
  return Boolean(store && Array.isArray(store.past) && store.past.length > 0);
}

/** Vrai si au moins un redo est possible. */
export function canRedo(store) {
  return Boolean(store && Array.isArray(store.future) && store.future.length > 0);
}

/**
 * Pousse `newLayout` comme nouveau present.
 *
 * Options :
 *   - groupKey : string|null
 *       Identifiant logique de l action en cours (ex. "drag:blk_xyz").
 *       Si egal au `lastGroupKey` ET que le delai depuis `lastCommitAt`
 *       est < `COALESCE_WINDOW_MS`, le commit est COALESCE : on remplace
 *       le present sans toucher au past (pas de nouvelle entree
 *       d historique). Sinon, commit "dur" classique.
 *   - now : number, optionnel
 *       Injecte pour les tests. Defaut : `Date.now()`.
 *   - coalesceWindowMs : number, optionnel
 *       Surclasse `COALESCE_WINDOW_MS` (utile pour tests).
 *
 * Si `newLayout` est strictement egal a `present` (meme reference), on
 * renvoie le store inchange (pas de bruit dans l historique).
 */
export function commit(store, newLayout, options = {}) {
  if (!store) return createHistoryStore(newLayout);
  if (newLayout === store.present) return store;

  // `replace` : met à jour le présent SANS créer d'entrée d'historique. Utile
  // pour les changements dérivés / automatiques (recalcul de hauteur auto)
  // qui ne doivent pas être annulables séparément par l'utilisateur.
  if (options.replace === true) {
    return { ...store, present: newLayout };
  }

  const now = typeof options.now === 'number' ? options.now : Date.now();
  const groupKey = options.groupKey || null;
  const window = typeof options.coalesceWindowMs === 'number'
    ? options.coalesceWindowMs
    : COALESCE_WINDOW_MS;

  const canCoalesce = Boolean(
    groupKey
    && store.lastGroupKey === groupKey
    && (now - (store.lastCommitAt || 0)) < window
    && store.past.length > 0, // ne JAMAIS coalesce le tout premier commit
  );

  if (canCoalesce) {
    return {
      past: store.past,
      present: newLayout,
      future: [], // nouvelle action -> invalide future
      lastCommitAt: now,
      lastGroupKey: groupKey,
    };
  }

  // Commit "dur" : push present dans past + clear future
  const pushed = [...store.past, store.present];
  const past = pushed.length > HISTORY_LIMIT
    ? pushed.slice(pushed.length - HISTORY_LIMIT)
    : pushed;

  return {
    past,
    present: newLayout,
    future: [],
    lastCommitAt: now,
    lastGroupKey: groupKey,
  };
}

/**
 * Recule d un cran dans l historique. No-op si `past` est vide.
 * Le present courant est pousse dans `future` (LIFO).
 */
export function undo(store) {
  if (!canUndo(store)) return store;
  const prev = store.past[store.past.length - 1];
  return {
    past: store.past.slice(0, -1),
    present: prev,
    future: [store.present, ...store.future],
    lastCommitAt: 0,
    lastGroupKey: null,
  };
}

/**
 * Avance d un cran dans l historique (defait un undo). No-op si
 * `future` est vide.
 */
export function redo(store) {
  if (!canRedo(store)) return store;
  const next = store.future[0];
  return {
    past: [...store.past, store.present],
    present: next,
    future: store.future.slice(1),
    lastCommitAt: 0,
    lastGroupKey: null,
  };
}

/**
 * Reinitialise le store autour d un nouveau layout : `past` et `future`
 * vides, `present` = `newLayout`. Utile quand on change de profil
 * utilisateur, qu on importe un layout, ou qu on veut purger
 * l historique.
 */
export function reset(newLayout) {
  return createHistoryStore(newLayout);
}

/**
 * Profondeur courante du past + future. Utile pour la jauge UI
 * "X actions undo / Y actions redo" ou pour les tests.
 */
export function getHistoryDepth(store) {
  if (!store) return { past: 0, future: 0 };
  return {
    past: Array.isArray(store.past) ? store.past.length : 0,
    future: Array.isArray(store.future) ? store.future.length : 0,
  };
}
