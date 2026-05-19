/**
 * Hook React qui encapsule `createAutoSaveScheduler` pour le brancher
 * facilement dans un composant editeur.
 *
 * Garde une instance stable du scheduler entre les rerenders et expose :
 *  - `schedule(payload)` : debounce le save d un nouveau payload ;
 *  - `flush()` : force la sauvegarde immediate (utile au demontage / avant
 *    une navigation hors editeur) ;
 *  - `state` : machine d etat courante (kind, lastSavedAt, attempt, error,
 *    hasPending) -- utilise par `AutoSaveIndicator`.
 *
 * Installe egalement un garde `beforeunload` qui empeche l utilisateur de
 * fermer la fenetre tant qu il reste des modifications en attente.
 *
 * IMPORTANT : `saveFn` est capture **par reference**. Pour qu un changement
 * de `saveFn` soit pris en compte (par exemple si templateId change), il
 * faut wrapper `saveFn` dans un `useCallback` stable et fournir un
 * `saveFnKey` distinct pour forcer un re-init du scheduler.
 */

import { useEffect, useRef, useState } from 'react';

import { AUTO_SAVE_DEFAULTS, createAutoSaveScheduler } from './autoSaveScheduler.js';

export const AUTO_SAVE_INITIAL_STATE = Object.freeze({
  kind: 'idle',
  lastSavedAt: null,
  attempt: 0,
  error: null,
  hasPending: false,
});

/**
 * @param {{
 *   saveFn: (payload: any) => Promise<any>,
 *   delayMs?: number,
 *   maxRetries?: number,
 *   baseRetryDelayMs?: number,
 *   saveFnKey?: any,    // change cette cle pour forcer un re-init du scheduler.
 * }} options
 */
export function useAutoSave({
  saveFn,
  delayMs = AUTO_SAVE_DEFAULTS.delayMs,
  maxRetries = AUTO_SAVE_DEFAULTS.maxRetries,
  baseRetryDelayMs = AUTO_SAVE_DEFAULTS.baseRetryDelayMs,
  saveFnKey,
} = {}) {
  const [state, setState] = useState(AUTO_SAVE_INITIAL_STATE);
  const schedulerRef = useRef(null);
  const saveFnRef = useRef(saveFn);

  // Synchronise la ref a chaque rerender (en effet pour ne pas violer la
  // regle React 19 "no ref updates during render"). Le scheduler appelle
  // toujours `saveFnRef.current(...)`, donc il prend la version la plus
  // recente sans avoir besoin d etre recree a chaque changement de `saveFn`.
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    const scheduler = createAutoSaveScheduler({
      saveFn: (payload) => saveFnRef.current(payload),
      delayMs,
      maxRetries,
      baseRetryDelayMs,
      onStateChange: setState,
    });
    schedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
    // saveFnKey permet de re-init le scheduler quand la cible de sauvegarde
    // change (changement de session, de profil, etc.).
  }, [delayMs, maxRetries, baseRetryDelayMs, saveFnKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      const sch = schedulerRef.current;
      if (!sch || !sch.hasPendingChanges()) return undefined;
      // Specification : pour qu un navigateur affiche le dialog
      // "Voulez-vous quitter ?", il faut soit setter returnValue, soit
      // preventDefault. Chrome ignore le message custom mais affiche son
      // propre dialog generique.
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return {
    state,
    schedule: (payload) => schedulerRef.current && schedulerRef.current.schedule(payload),
    flush: () => (schedulerRef.current ? schedulerRef.current.flush() : Promise.resolve()),
    hasPendingChanges: () => Boolean(schedulerRef.current && schedulerRef.current.hasPendingChanges()),
  };
}
