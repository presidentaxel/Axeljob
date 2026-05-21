/**
 * Base URL de l'API backend (FastAPI). En dev : http://localhost:8000
 */
import { getOrCreateAnalyticsSessionId, ANALYTICS_SESSION_HEADER } from './analyticsSession';

export {
  closePreopenedDownloadWindow,
  getDownloadPermissionHint,
  prepareAppleDownloadWindow,
  saveBlobWithPreferredMethod,
  triggerBlobDownload,
} from './lib/blobDownload.js';

const getApiUrl = () => import.meta.env.VITE_API_URL || '';

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token || null;
}

/** En mode full Supabase : quand l'API renvoie 401, on déconnecte et l'app affiche le login */
export function setUnauthorizedCallback(fn) {
  onUnauthorized = fn;
}

function getHeaders(extra = {}) {
  const h = { ...extra };
  if (authToken) h.Authorization = `Bearer ${authToken}`;
  try {
    const sid = getOrCreateAnalyticsSessionId();
    if (sid) h[ANALYTICS_SESSION_HEADER] = sid;
  } catch {}
  return h;
}

function checkUnauthorized(r) {
  if (r.status === 401 && onUnauthorized) onUnauthorized();
}

export function apiUrl(path) {
  const base = getApiUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base.replace(/\/$/, '')}${p}` : p;
}

export async function apiGet(path) {
  const r = await fetch(apiUrl(path), { headers: getHeaders() });
  const ct = r.headers.get('content-type');
  const isJson = ct && ct.includes('application/json');
  const text = await r.text();
  if (!r.ok) {
    checkUnauthorized(r);
    let msg = r.statusText;
    try {
      const data = JSON.parse(text);
      msg = data.detail || data.error || msg;
    } catch {}
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = r.status;
    throw err;
  }
  return isJson ? JSON.parse(text) : text;
}

export async function apiPost(path, body) {
  const r = await fetch(apiUrl(path), {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    checkUnauthorized(r);
    const data = await r.json().catch(() => ({}));
    const detail = data.detail;
    const msg = Array.isArray(detail) ? (detail[0]?.msg || JSON.stringify(detail)) : (detail || data.error || r.statusText);
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = r.status;
    throw err;
  }
  const ct = r.headers.get('content-type');
  if (ct && ct.includes('application/json')) return r.json();
  return r.text();
}

/** Laisse React peindre entre les événements utiles du flux NDJSON (sinon tout est traité en un seul tick). */
function _streamMessageNeedsUiYield(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const t = parsed.type;
  if (t === 'started' || t === 'step_started' || t === 'step_done' || t === 'preview_begin') return true;
  if (t === 'preview_chunk' && parsed.done) return true;
  if (t === 'result' || t === 'done' || t === 'error') return true;
  return false;
}

async function _yieldForStreamUi(parsed) {
  if (!_streamMessageNeedsUiYield(parsed)) return;
  const t = parsed?.type;
  /* Après chaque HTML d’étape complet : laisser l’œil « lire » avant la suite (évite tout–rien). */
  if (t === 'preview_chunk' && parsed.done) {
    await new Promise((resolve) => setTimeout(resolve, 220));
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function apiPostStream(path, body, { onMessage, signal } = {}) {
  let r;
  try {
    r = await fetch(apiUrl(path), {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }
    throw e;
  }
  if (!r.ok) {
    checkUnauthorized(r);
    const data = await r.json().catch(() => ({}));
    const detail = data.detail;
    const msg = Array.isArray(detail) ? (detail[0]?.msg || JSON.stringify(detail)) : (detail || data.error || r.statusText);
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = r.status;
    throw err;
  }
  if (!r.body) return;
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        if (onMessage) {
          onMessage(parsed);
          await _yieldForStreamUi(parsed);
        }
      } catch {
        // ignore malformed stream line
      }
    }
  }
  const tail = (buffer || '').trim();
  if (tail) {
    try {
      const parsed = JSON.parse(tail);
      if (onMessage) {
        onMessage(parsed);
        await _yieldForStreamUi(parsed);
      }
    } catch {
      // ignore malformed trailing line
    }
  }
}

export async function apiPatch(path, body) {
  const r = await fetch(apiUrl(path), {
    method: 'PATCH',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    checkUnauthorized(r);
    const data = await r.json().catch(() => ({}));
    const detail = data.detail;
    const msg = Array.isArray(detail) ? (detail[0]?.msg || JSON.stringify(detail)) : (detail || data.error || r.statusText);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return r.json();
}

export async function apiPut(path, body) {
  const r = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    checkUnauthorized(r);
    const data = await r.json().catch(() => ({}));
    const detail = data.detail;
    const msg = Array.isArray(detail) ? (detail[0]?.msg || JSON.stringify(detail)) : (detail || data.error || r.statusText);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  const ct = r.headers.get('content-type');
  if (ct && ct.includes('application/json')) return r.json();
  return r.text();
}

/** POST multipart/form-data avec un fichier (ex. upload photo). Ne pas passer Content-Type pour laisser le navigateur définir le boundary. */
export async function apiPostFile(path, file, fieldName = 'file') {
  const form = new FormData();
  form.append(fieldName, file);
  return apiPostFormData(path, form);
}

/** POST FormData (ex. type + file pour upload-doc). */
export async function apiPostFormData(path, formData) {
  const r = await fetch(apiUrl(path), {
    method: 'POST',
    headers: getHeaders(),
    body: formData,
  });
  if (!r.ok) {
    checkUnauthorized(r);
    const text = await r.text();
    let msg = r.statusText;
    try {
      const data = JSON.parse(text);
      msg = data.detail || data.error || msg;
    } catch {}
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  const ct = r.headers.get('content-type');
  if (ct && ct.includes('application/json')) return r.json();
  return r.text();
}

export async function apiPostBlob(path, body) {
  const r = await fetch(apiUrl(path), {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    checkUnauthorized(r);
    const data = await r.json().catch(() => ({}));
    const detail = data.detail;
    const msg = Array.isArray(detail) ? (detail[0]?.msg || JSON.stringify(detail)) : (detail || data.error || r.statusText);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  const engine = r.headers.get('X-CV-PDF-Engine');
  if (path.includes('pdf')) {
    if (engine) {
      // console.warn : visible avec les filtres par défaut (souvent pas le cas de console.info)
      console.warn('[cv-bot] Export PDF — moteur serveur:', engine, '(CV_BOT_PDF_ENGINE)');
    } else {
      console.warn(
        '[cv-bot] Export PDF — en-tête X-CV-PDF-Engine absente. Rebuild backend+frontend, ou onglet Réseau > réponse POST /api/pdf.',
      );
    }
  }
  const blob = await r.blob();
  const disposition = r.headers.get('Content-Disposition');
  let filename = null;
  if (disposition) {
    const m = disposition.match(/filename="?([^";\n]+)"?/);
    if (m) filename = m[1].trim();
  }
  return { blob, filename };
}

/** GET request that returns blob + optional filename from Content-Disposition (for PDF downloads). */
export async function apiGetBlob(path) {
  const r = await fetch(apiUrl(path), { headers: getHeaders() });
  if (!r.ok) {
    checkUnauthorized(r);
    const text = await r.text();
    let msg = r.statusText;
    try {
      const data = JSON.parse(text);
      msg = data.detail || msg;
    } catch {}
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  const engine = r.headers.get('X-CV-PDF-Engine');
  if (path.includes('pdf') || path.includes('download/cv')) {
    if (engine) {
      console.warn('[cv-bot] Export PDF — moteur serveur:', engine, '(CV_BOT_PDF_ENGINE)');
    } else {
      console.warn('[cv-bot] Export PDF — en-tête X-CV-PDF-Engine absente (rebuild backend ?).');
    }
  }
  const blob = await r.blob();
  const disposition = r.headers.get('Content-Disposition');
  let filename = null;
  if (disposition) {
    const m = disposition.match(/filename="?([^";\n]+)"?/);
    if (m) filename = m[1].trim();
  }
  return { blob, filename };
}

/**
 * Fire-and-forget event tracking for analytics / mémoire.
 * Never throws - silently drops on error.
 */
export function trackEvent(eventType, context = {}) {
  try {
    let session_id = null;
    try {
      session_id = getOrCreateAnalyticsSessionId();
    } catch {}
    fetch(apiUrl('/api/events/track'), {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ event_type: eventType, context, session_id }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

/** Télécharge un fichier via GET (ex. export CSV pour mémoire). */
export async function apiDownload(path, defaultFilename = 'download') {
  const r = await fetch(apiUrl(path), { headers: getHeaders() });
  if (!r.ok) {
    checkUnauthorized(r);
    const text = await r.text();
    let msg = r.statusText;
    try {
      const data = JSON.parse(text);
      msg = data.detail || data.error || msg;
    } catch {}
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  const blob = await r.blob();
  const disposition = r.headers.get('Content-Disposition');
  let filename = defaultFilename;
  if (disposition) {
    const m = disposition.match(/filename="?([^";\n]+)"?/);
    if (m) filename = m[1].trim();
  }
  await saveBlobWithPreferredMethod(blob, filename);
}
