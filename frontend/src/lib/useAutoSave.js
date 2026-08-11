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
 * fermer la fenetre tant qu il reste des modifications en attente, et un
 * flush sur `pagehide` / onglet cache / `isActive=false` (AXE-29).
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
 * Handlers de cycle de vie (testables hors React).
 * @param {() => { flush: () => Promise<any>, hasPendingChanges: () => boolean, dispose: () => void } | null} getScheduler
 */
export function createAutoSaveLifecycleHandlers(getScheduler) {
  const flushIfAny = () => {
    const sch = typeof getScheduler === 'function' ? getScheduler() : null;
    if (!sch) return Promise.resolve();
    return sch.flush();
  };

  return {
    /** Vue Profil quittée (display:none) ou isActive false. */
    onInactive: flushIfAny,
    /** Fermeture / navigation navigateur (pagehide). */
    onPageHide: flushIfAny,
    /** Onglet passé en arrière-plan. */
    onVisibilityHidden: () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
        return Promise.resolve();
      }
      return flushIfAny();
    },
    /** Cleanup React : flush pending puis dispose. */
    onUnmount: (scheduler) => {
      if (!scheduler) return Promise.resolve();
      const flushPromise = scheduler.hasPendingChanges()
        ? scheduler.flush()
        : Promise.resolve();
      return flushPromise.finally(() => scheduler.dispose());
    },
  };
}

/**
 * @param {{
 *   saveFn: (payload: any) => Promise<any>,
 *   delayMs?: number,
 *   maxRetries?: number,
 *   baseRetryDelayMs?: number,
 *   saveFnKey?: any,
 *   isActive?: boolean,
 * }} options
 */
export function useAutoSave({
  saveFn,
  delayMs = AUTO_SAVE_DEFAULTS.delayMs,
  maxRetries = AUTO_SAVE_DEFAULTS.maxRetries,
  baseRetryDelayMs = AUTO_SAVE_DEFAULTS.baseRetryDelayMs,
  saveFnKey,
  isActive = true,
} = {}) {
  const [state, setState] = useState(AUTO_SAVE_INITIAL_STATE);
  const schedulerRef = useRef(null);
  const saveFnRef = useRef(saveFn);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    let active = true;
    const scheduler = createAutoSaveScheduler({
      saveFn: (payload) => saveFnRef.current(payload),
      delayMs,
      maxRetries,
      baseRetryDelayMs,
      onStateChange: (nextState) => {
        if (active) setState(nextState);
      },
    });
    schedulerRef.current = scheduler;
    const life = createAutoSaveLifecycleHandlers(() => schedulerRef.current);
    return () => {
      active = false;
      void life.onUnmount(scheduler);
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
    };
  }, [delayMs, maxRetries, baseRetryDelayMs, saveFnKey]);

  // AXE-29 : flush quand la vue Profil devient inactive (App garde le panel monté).
  useEffect(() => {
    const life = createAutoSaveLifecycleHandlers(() => schedulerRef.current);
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (wasActive && !isActive) {
      void life.onInactive();
    }
  }, [isActive]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const life = createAutoSaveLifecycleHandlers(() => schedulerRef.current);

    const onBeforeUnload = (event) => {
      const sch = schedulerRef.current;
      if (!sch || !sch.hasPendingChanges()) return undefined;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    const onPageHide = () => {
      void life.onPageHide();
    };
    const onVisibility = () => {
      void life.onVisibilityHidden();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return {
    state,
    schedule: (payload) => schedulerRef.current && schedulerRef.current.schedule(payload),
    flush: () => (schedulerRef.current ? schedulerRef.current.flush() : Promise.resolve()),
    hasPendingChanges: () => Boolean(schedulerRef.current && schedulerRef.current.hasPendingChanges()),
  };
}
