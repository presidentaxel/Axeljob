const DB_NAME = 'cv_bot_export';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'pdf_save_start_in_dir';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
  });
}

/**
 * Dossier mémorisé pour ouvrir le dialogue « Enregistrer » au bon endroit (Chrome, Edge, etc.)
 */
export async function getPdfSaveStartInDirectoryHandle() {
  let db;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const t = db.transaction(STORE, 'readonly');
    const g = t.objectStore(STORE).get(KEY);
    g.onsuccess = async () => {
      const h = g.result;
      if (!h || h.kind !== 'directory') {
        resolve(null);
        return;
      }
      try {
        const st = await h.queryPermission({ mode: 'read' });
        if (st === 'granted') {
          resolve(h);
          return;
        }
        const st2 = await h.requestPermission({ mode: 'read' });
        resolve(st2 === 'granted' ? h : null);
      } catch {
        resolve(null);
      }
    };
    g.onerror = () => resolve(null);
  });
}

export async function setPdfSaveStartInDirectoryHandle(dirHandle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(dirHandle, KEY);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function clearPdfSaveStartInDirectoryHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(KEY);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
