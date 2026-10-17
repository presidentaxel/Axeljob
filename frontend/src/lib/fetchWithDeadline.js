/** Un reload local laisse sinon les fetch en pending et l'écran « Chargement… » ne part plus. */
export const API_REQUEST_TIMEOUT_MS = 12000;

export async function fetchWithDeadline(url, options = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) {
  const upstream = options.signal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onUpstreamAbort = () => controller.abort();
  if (upstream) {
    if (upstream.aborted) controller.abort();
    else upstream.addEventListener('abort', onUpstreamAbort, { once: true });
  }
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError' && !(upstream && upstream.aborted)) {
      const timeout = new Error('Le serveur ne répond pas. Réessaie dans un instant.');
      timeout.name = 'TimeoutError';
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (upstream) upstream.removeEventListener('abort', onUpstreamAbort);
  }
}
