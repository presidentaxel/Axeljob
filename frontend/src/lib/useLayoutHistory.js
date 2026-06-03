/**
 * Hook React qui expose un `layoutHistoryStore` (undo/redo) avec, en
 * option, les raccourcis clavier `Cmd+Z` / `Ctrl+Z` (undo) et
 * `Cmd+Shift+Z` / `Ctrl+Y` (redo).
 *
 * Le store est PUR (cf. `layoutHistoryStore.js`) ; ce hook se contente
 * d encapsuler son etat dans un `useState` React et de fournir des
 * callbacks stables.
 *
 * Usage minimal :
 *
 *   const { layout, commit, undo, redo, canUndo, canRedo } = useLayoutHistory(
 *     () => createBlankLayoutV3(),
 *   );
 *   commit(setBlockPosition(layout, 'blk_xxx', { x: 100, y: 50 }));
 *   commit(moveBlockBy(layout, 'blk_xxx', { dx: 1, dy: 0 }), { groupKey: 'drag:blk_xxx' });
 *
 * Options :
 *   - `keyboardShortcuts` (defaut `true`) : attache Cmd+Z / Cmd+Shift+Z
 *     / Ctrl+Y a `window`. Desactive automatiquement si on est en train
 *     d ecrire dans un champ editable (input, textarea, contenteditable)
 *     pour ne pas voler le Cmd+Z de l user dans son texte.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canRedo as storeCanRedo,
  canUndo as storeCanUndo,
  commit as storeCommit,
  createHistoryStore,
  getHistoryDepth as storeGetHistoryDepth,
  redo as storeRedo,
  reset as storeReset,
  undo as storeUndo,
} from './layoutHistoryStore.js';

/**
 * Vrai si l element cible d un keydown est un champ texte editable. On
 * ne veut PAS intercepter Cmd+Z dans un input / textarea / contenteditable :
 * le browser gere deja l undo natif du texte, et le voler frustrerait
 * l user.
 */
function isEditableElement(el) {
  if (!el || typeof el !== 'object') return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (typeof el.isContentEditable === 'boolean' && el.isContentEditable) return true;
  return false;
}

/**
 * @param {Function|object} initialLayoutOrFactory Layout initial OU
 *   factory `() => layout` (preferable pour eviter de recreer le layout
 *   a chaque render).
 * @param {{ keyboardShortcuts?: boolean, onHistoryChange?: (layout: object, action: string) => void }} [options]
 */
export function useLayoutHistory(initialLayoutOrFactory, options = {}) {
  const { keyboardShortcuts = true, onHistoryChange } = options;
  const pendingHistoryActionRef = useRef(null);

  // useState avec fonction d initialisation : on accepte
  // soit un layout, soit une factory pour ne pas recalculer a chaque render.
  const [store, setStore] = useState(() => {
    const initial = typeof initialLayoutOrFactory === 'function'
      ? initialLayoutOrFactory()
      : initialLayoutOrFactory;
    return createHistoryStore(initial);
  });

  const commit = useCallback((newLayout, commitOptions) => {
    setStore((prev) => storeCommit(prev, newLayout, commitOptions));
  }, []);

  const undo = useCallback(() => {
    setStore((prev) => {
      const next = storeUndo(prev);
      pendingHistoryActionRef.current = next !== prev ? 'undo' : null;
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setStore((prev) => {
      const next = storeRedo(prev);
      pendingHistoryActionRef.current = next !== prev ? 'redo' : null;
      return next;
    });
  }, []);

  const reset = useCallback((newLayout) => {
    setStore(() => storeReset(newLayout));
  }, []);

  /**
   * Keybindings globaux. On ecoute sur `window` pour ne pas dependre
   * du focus d un container precis. On laisse passer si on est dans
   * un champ editable (cf. `isEditableElement`).
   */
  useEffect(() => {
    if (!keyboardShortcuts) return undefined;
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (isEditableElement(event.target)) return;
      const k = (event.key || '').toLowerCase();
      const isUndo = k === 'z' && !event.shiftKey;
      const isRedoZ = k === 'z' && event.shiftKey;
      const isRedoY = k === 'y';
      if (isUndo) {
        event.preventDefault();
        setStore((prev) => {
          const next = storeUndo(prev);
          pendingHistoryActionRef.current = next !== prev ? 'undo' : null;
          return next;
        });
      } else if (isRedoZ || isRedoY) {
        event.preventDefault();
        setStore((prev) => {
          const next = storeRedo(prev);
          pendingHistoryActionRef.current = next !== prev ? 'redo' : null;
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [keyboardShortcuts, onHistoryChange]);

  useEffect(() => {
    const action = pendingHistoryActionRef.current;
    if (!action) return;
    pendingHistoryActionRef.current = null;
    if (typeof onHistoryChange === 'function') {
      onHistoryChange(store.present, action);
    }
  }, [store, onHistoryChange]);

  // Memoize la valeur de retour : `layout` change a chaque commit/undo/redo,
  // les callbacks restent stables, `canUndo/canRedo` derivent du store.
  return useMemo(() => ({
    layout: store.present,
    commit,
    undo,
    redo,
    reset,
    canUndo: storeCanUndo(store),
    canRedo: storeCanRedo(store),
    historyDepth: storeGetHistoryDepth(store),
  }), [store, commit, undo, redo, reset]);
}
