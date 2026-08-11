/**
 * Planificateur d auto-save robuste pour l editeur de CV.
 *
 * Responsabilites :
 *
 *  - debounce les modifications (delai configurable) pour eviter de
 *    spammer l API a chaque keystroke ;
 *  - lance la sauvegarde via une `saveFn` injectee (par ex. `apiPut(...)`) ;
 *  - en cas d echec, retente avec un backoff exponentiel jusqu a
 *    `maxRetries` tentatives ;
 *  - expose l etat courant via un callback `onStateChange` (machine d
 *    etat explicite : idle / pending / saving / retrying / saved / error) ;
 *  - gere l ecrasement intelligent : si une nouvelle modif arrive pendant
 *    qu une sauvegarde tourne, on garde la modif en attente et on rejoue
 *    apres ;
 *  - permet de demander un `flush` immediat (utile au demontage / avant
 *    navigation hors editeur).
 *
 * Volontairement **module pur** : aucune dependance a React, au DOM ni
 * au reseau. Tous les effets de bord (timers, requetes, horloge) sont
 * injectes en parametre, ce qui rend l ensemble testable sous
 * `node --test` sans framework supplementaire.
 */

/**
 * @typedef {('idle' | 'pending' | 'saving' | 'retrying' | 'saved' | 'error' | 'disposed')} AutoSaveStateKind
 *
 * @typedef AutoSaveState
 * @property {AutoSaveStateKind} kind
 * @property {number | null} lastSavedAt  Timestamp ms de la derniere sauvegarde reussie.
 * @property {number} attempt             Nombre de tentatives effectuees pour le payload courant.
 * @property {*} error                    Derniere erreur observee (objet ou message).
 * @property {boolean} hasPending         True si une modification est en attente d etre sauvegardee.
 */

export const AUTO_SAVE_DEFAULTS = Object.freeze({
  delayMs: 1500,
  maxRetries: 3,
  baseRetryDelayMs: 1000,
});

/**
 * Construit un scheduler. Les dependances (timers, horloge) sont injectees
 * pour rester testable.
 *
 * @param {{
 *   saveFn: (payload: any) => Promise<any>,
 *   delayMs?: number,
 *   maxRetries?: number,
 *   baseRetryDelayMs?: number,
 *   now?: () => number,
 *   setTimeoutFn?: (cb: () => void, ms: number) => any,
 *   clearTimeoutFn?: (handle: any) => void,
 *   onStateChange?: (state: AutoSaveState) => void,
 * }} options
 */
export function createAutoSaveScheduler({
  saveFn,
  delayMs = AUTO_SAVE_DEFAULTS.delayMs,
  maxRetries = AUTO_SAVE_DEFAULTS.maxRetries,
  baseRetryDelayMs = AUTO_SAVE_DEFAULTS.baseRetryDelayMs,
  now = () => Date.now(),
  setTimeoutFn = (typeof globalThis !== 'undefined' ? globalThis.setTimeout : setTimeout),
  clearTimeoutFn = (typeof globalThis !== 'undefined' ? globalThis.clearTimeout : clearTimeout),
  onStateChange = () => {},
}) {
  if (typeof saveFn !== 'function') {
    throw new Error('createAutoSaveScheduler: saveFn must be a function');
  }

  /** @type {AutoSaveState & { pendingPayload: any }} */
  let state = {
    kind: 'idle',
    lastSavedAt: null,
    attempt: 0,
    error: null,
    hasPending: false,
    pendingPayload: undefined,
  };

  /** Handle de timer en cours (debounce ou retry). */
  let timerHandle = null;
  let disposed = false;

  function clearTimer() {
    if (timerHandle !== null) {
      clearTimeoutFn(timerHandle);
      timerHandle = null;
    }
  }

  /**
   * Construit un snapshot public (sans le payload, pour ne pas le fuiter
   * dans les logs ou l UI).
   */
  function snapshot() {
    return {
      kind: state.kind,
      lastSavedAt: state.lastSavedAt,
      attempt: state.attempt,
      error: state.error,
      hasPending: state.hasPending,
    };
  }

  function emit() {
    try {
      onStateChange(snapshot());
    } catch {
      // Un onStateChange qui throw ne doit pas casser la mecanique.
    }
  }

  function transition(patch) {
    state = { ...state, ...patch };
    emit();
  }

  /**
   * Lance la sauvegarde du `pendingPayload`. Si une sauvegarde tourne deja,
   * la fonction est no-op (le retry / re-flush s en chargera).
   *
   * @returns {Promise<void>}
   */
  async function flush() {
    if (disposed) return;
    if (state.kind === 'saving') return;
    if (!state.hasPending) return;

    clearTimer();
    const payload = state.pendingPayload;
    transition({ kind: 'saving' });

    let result;
    try {
      result = await saveFn(payload);
    } catch (err) {
      if (disposed) return;
      const nextAttempt = state.attempt + 1;
      if (nextAttempt < maxRetries) {
        const retryDelay = baseRetryDelayMs * Math.pow(2, state.attempt);
        transition({ kind: 'retrying', attempt: nextAttempt, error: err });
        timerHandle = setTimeoutFn(() => {
          timerHandle = null;
          // On peut soit reflusher exactement le meme payload, soit le payload
          // le plus recent si l utilisateur a continue a editer entre-temps.
          // Le `pendingPayload` reflete deja le plus recent.
          flush();
        }, retryDelay);
      } else {
        transition({ kind: 'error', error: err });
      }
      return;
    }

    if (disposed) return;
    // Pendant que la requete tournait, l utilisateur a peut-etre soumis
    // un nouveau payload. On garde alors `hasPending=true` pour replanifier.
    const pendingChangedDuringSave = state.pendingPayload !== payload;
    if (pendingChangedDuringSave) {
      transition({
        kind: 'pending',
        lastSavedAt: now(),
        attempt: 0,
        error: null,
        hasPending: true,
      });
      clearTimer();
      timerHandle = setTimeoutFn(() => {
        timerHandle = null;
        flush();
      }, delayMs);
    } else {
      transition({
        kind: 'saved',
        lastSavedAt: now(),
        attempt: 0,
        error: null,
        hasPending: false,
        pendingPayload: undefined,
      });
    }
    void result;
  }

  /**
   * Planifie la sauvegarde d un nouveau payload. Si un timer est deja en
   * cours, il est remplace (debounce). Si une sauvegarde tourne, la nouvelle
   * version est gardee et sera flushee a la fin.
   *
   * @param {any} payload
   */
  function schedule(payload) {
    if (disposed) return;
    state = { ...state, pendingPayload: payload, hasPending: true };

    if (state.kind === 'saving' || state.kind === 'retrying') {
      // On laisse la sauvegarde / le retry courant terminer. Le nouveau
      // payload sera pris en compte ensuite (boucle dans flush).
      emit();
      return;
    }
    transition({ kind: 'pending' });
    clearTimer();
    timerHandle = setTimeoutFn(() => {
      timerHandle = null;
      flush();
    }, delayMs);
  }

  /**
   * @returns {boolean} true s il reste des modifications en attente.
   */
  function hasPendingChanges() {
    return state.hasPending || state.kind === 'saving' || state.kind === 'retrying';
  }

  /**
   * Libere les ressources : arrete tout timer en cours et marque le
   * scheduler comme dispose. Apres dispose, toute interaction est no-op.
   */
  function dispose() {
    if (disposed) return;
    clearTimer();
    disposed = true;
    transition({ kind: 'disposed' });
  }

  // Etat initial emis immediatement pour que l UI puisse s aligner.
  emit();

  return {
    schedule,
    flush,
    hasPendingChanges,
    dispose,
    getState: snapshot,
  };
}
