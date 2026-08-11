/**
 * Hook React pour consommer / modifier le mode Beta depuis n'importe
 * quel composant. Reste synchronisé avec :
 *
 * - le `localStorage` (source de vérité persistante),
 * - les autres composants montés (via le CustomEvent émis par betaMode.js),
 * - les autres onglets ouverts (via l'event `storage` natif du navigateur).
 *
 * Le module pur `betaMode.js` reste testable sans React ; ce hook est juste
 * la couche d'adaptation pour React.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  BETA_MODE_STORAGE_KEY,
  isBetaModeEnabled,
  setBetaModeEnabled,
  subscribeBetaMode,
} from './betaMode.js';

/**
 * @returns {[boolean, (next: boolean) => boolean]} couple `[enabled, setEnabled]`
 *   où `setEnabled` retourne le résultat de la persistance (false si bloquée).
 */
export function useBetaMode() {
  const [enabled, setEnabled] = useState(() => isBetaModeEnabled());

  useEffect(() => {
    const unsubscribe = subscribeBetaMode((next) => setEnabled(next));

    const onStorage = (event) => {
      if (event && event.key === BETA_MODE_STORAGE_KEY) {
        setEnabled(isBetaModeEnabled());
      }
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', onStorage);
    }
    return () => {
      unsubscribe();
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('storage', onStorage);
      }
    };
  }, []);

  const updateBetaMode = useCallback((next) => {
    const ok = setBetaModeEnabled(Boolean(next));
    if (ok) setEnabled(Boolean(next));
    return ok;
  }, []);

  return [enabled, updateBetaMode];
}
