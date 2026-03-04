/**
 * Base URL de l'API backend (FastAPI). En dev : http://localhost:8000
 */
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
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
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
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  const ct = r.headers.get('content-type');
  if (ct && ct.includes('application/json')) return r.json();
  return r.text();
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
  const r = await fetch(apiUrl(path), {
    method: 'POST',
    headers: getHeaders(),
    body: form,
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
  return r.blob();
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
  const blob = await r.blob();
  const disposition = r.headers.get('Content-Disposition');
  let filename = null;
  if (disposition) {
    const m = disposition.match(/filename="?([^";\n]+)"?/);
    if (m) filename = m[1].trim();
  }
  return { blob, filename };
}
