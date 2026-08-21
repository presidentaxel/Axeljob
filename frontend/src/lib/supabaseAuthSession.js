/**
 * Résolution de session Auth avec timeout (AXE-372).
 * Sans ça, `/login` reste sur « Chargement… » si `getSession()` ne se résout pas
 * (réseau, iframe, preview hors localhost).
 */

export const AUTH_SESSION_TIMEOUT_MS = 8000;

/**
 * @param {{ auth?: { getSession?: () => Promise<{ data?: { session?: object | null } }> } } | null} client
 * @param {number} [timeoutMs]
 * @returns {Promise<object | null>}
 */
export function fetchAuthSessionWithTimeout(client, timeoutMs = AUTH_SESSION_TIMEOUT_MS) {
  if (!client?.auth?.getSession) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (session) => {
      if (done) return;
      done = true;
      resolve(session ?? null);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    Promise.resolve()
      .then(() => client.auth.getSession())
      .then((result) => {
        clearTimeout(timer);
        finish(result?.data?.session ?? null);
      })
      .catch(() => {
        clearTimeout(timer);
        finish(null);
      });
  });
}
