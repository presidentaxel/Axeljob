import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchAtsScoreParsing } from './atsScoreClient.js';
import { layoutFingerprintForScoring } from './atsScoreLayoutFingerprint.js';

const DEFAULT_DEBOUNCE_MS = 550;
const RETRY_DELAYS_MS = [0, 400, 1200];

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithRetry(input) {
  let lastErr;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i += 1) {
    if (RETRY_DELAYS_MS[i] > 0) await delay(RETRY_DELAYS_MS[i]);
    try {
      return await fetchAtsScoreParsing(input);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Erreur ATS');
}

/**
 * Fetch ATS avec debounce, retry et conservation du dernier score valide.
 */
export function useAtsScoreFetching({
  templateId,
  layout,
  cv,
  paused = false,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onScoreChange,
}) {
  const [state, setState] = useState({
    status: 'idle',
    data: null,
    error: null,
    stale: false,
  });

  const requestGenRef = useRef(0);
  const lastSuccessRef = useRef(null);
  const wasPausedRef = useRef(paused);

  const scorable = Boolean(templateId || layout);

  const fingerprint = useMemo(() => {
    const layoutFp = layout ? layoutFingerprintForScoring(layout) : '';
    const cvFp = cv ? 'cv' : '';
    return `${templateId || ''}::${layoutFp}::${cvFp}`;
  }, [templateId, layout, cv]);

  const executeFetch = useCallback((gen) => {
    fetchWithRetry({ templateId, layout, cv })
      .then((data) => {
        if (gen !== requestGenRef.current) return;
        lastSuccessRef.current = data;
        setState({ status: 'ok', data, error: null, stale: false });
        if (typeof onScoreChange === 'function') onScoreChange(data.score);
      })
      .catch((err) => {
        if (gen !== requestGenRef.current) return;
        setState({
          status: 'error',
          data: lastSuccessRef.current,
          error: err?.message || 'Erreur ATS',
          stale: Boolean(lastSuccessRef.current),
        });
      });
  }, [templateId, layout, cv, onScoreChange]);

  const refreshNow = useCallback(() => {
    if (!scorable) return;
    const gen = requestGenRef.current + 1;
    requestGenRef.current = gen;
    setState((prev) => ({
      status: 'loading',
      data: prev.data ?? lastSuccessRef.current,
      error: null,
      stale: Boolean(prev.data ?? lastSuccessRef.current),
    }));
    executeFetch(gen);
  }, [scorable, executeFetch]);

  useEffect(() => {
    if (!scorable) {
      requestGenRef.current += 1;
      setState({ status: 'idle', data: null, error: null, stale: false });
      return undefined;
    }
    if (paused) return undefined;

    const gen = requestGenRef.current + 1;
    requestGenRef.current = gen;

    const timer = setTimeout(() => {
      setState((prev) => ({
        status: 'loading',
        data: prev.data ?? lastSuccessRef.current,
        error: null,
        stale: Boolean(prev.data ?? lastSuccessRef.current),
      }));
      executeFetch(gen);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [fingerprint, paused, debounceMs, scorable, executeFetch]);

  useEffect(() => {
    const wasPaused = wasPausedRef.current;
    wasPausedRef.current = paused;
    if (wasPaused && !paused && scorable) {
      const timer = setTimeout(() => refreshNow(), 200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [paused, scorable, refreshNow]);

  return { ...state, refreshNow };
}
