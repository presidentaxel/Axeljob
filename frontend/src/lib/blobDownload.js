/**
 * Téléchargement de blobs (PDF, ZIP) — compatibilité Safari / pop-ups / save picker.
 */

export function isLikelyApplePlatform() {
  try {
    const uaDataPlatform = navigator?.userAgentData?.platform || '';
    const platform = navigator?.platform || '';
    const ua = navigator?.userAgent || '';
    return /mac|iphone|ipad|ipod/i.test(`${uaDataPlatform} ${platform} ${ua}`);
  } catch {
    return false;
  }
}

/** Safari (pas Chrome/Firefox iOS) : seul cas où l’onglet pré-ouvert est vraiment utile. */
export function isSafariBrowser() {
  try {
    const ua = navigator?.userAgent || '';
    return /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edgios|edg\//i.test(ua);
  } catch {
    return false;
  }
}

export function hasNativeSaveFilePicker() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

export function closePreopenedDownloadWindow(preopenedWindow) {
  if (!preopenedWindow || preopenedWindow.closed) return;
  try {
    preopenedWindow.close();
  } catch {
    /* ignore */
  }
}

export function ensureBlobForDownload(blob, filename) {
  if (!blob || blob.size === 0) {
    throw new Error('Le fichier reçu est vide. Réessaie ou contacte le support.');
  }
  const lower = (filename || '').toLowerCase();
  const isPdf = lower.endsWith('.pdf') || (blob.type || '').includes('pdf');
  if (isPdf && blob.type !== 'application/pdf') {
    return new Blob([blob], { type: 'application/pdf' });
  }
  return blob;
}

function triggerAnchorBlobDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function shouldPreopenAppleDownloadTab() {
  if (!isLikelyApplePlatform()) return false;
  if (hasNativeSaveFilePicker()) return false;
  return isSafariBrowser();
}

export function prepareAppleDownloadWindow() {
  if (!shouldPreopenAppleDownloadTab()) return null;
  try {
    // Sans noopener : sinon le navigateur ouvre l’onglet mais renvoie null (reste sur about:blank).
    const w = window.open('about:blank', '_blank', 'noreferrer');
    if (!w) return null;
    try {
      w.document.title = 'Téléchargement…';
    } catch {
      /* ignore until navigation */
    }
    return w;
  } catch {
    return null;
  }
}

export function getDownloadPermissionHint() {
  if (!isLikelyApplePlatform()) return '';
  return ' Sur Apple/Safari, autorisez les pop-ups et téléchargements automatiques pour ce site.';
}

export function isPreopenedWindowStillBlank(preopenedWindow) {
  try {
    const href = preopenedWindow?.location?.href || '';
    return !href || href === 'about:blank' || href.endsWith('about:blank');
  } catch {
    return true;
  }
}

function triggerAppleBlobDownload(url, safeFilename, preopenedWindow) {
  if (preopenedWindow && !preopenedWindow.closed) {
    let navigated = false;
    try {
      preopenedWindow.location.href = url;
      navigated = true;
    } catch {
      /* cross-origin or blocked */
    }
    if (!navigated) {
      closePreopenedDownloadWindow(preopenedWindow);
      triggerAnchorBlobDownload(url, safeFilename);
      return;
    }
    window.setTimeout(() => {
      try {
        if (!preopenedWindow.closed && isPreopenedWindowStillBlank(preopenedWindow)) {
          closePreopenedDownloadWindow(preopenedWindow);
          triggerAnchorBlobDownload(url, safeFilename);
        }
      } catch {
        /* ignore */
      }
    }, 500);
    return;
  }

  triggerAnchorBlobDownload(url, safeFilename);
}

export function triggerBlobDownload(blob, filename, options = {}) {
  const { preopenedWindow = null } = options;
  const safeFilename = filename || 'download';
  const blobOk = ensureBlobForDownload(blob, safeFilename);
  const url = URL.createObjectURL(blobOk);

  try {
    if (isLikelyApplePlatform()) {
      triggerAppleBlobDownload(url, safeFilename, preopenedWindow);
      return;
    }

    triggerAnchorBlobDownload(url, safeFilename);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
}

function getPickerTypesFromBlob(blob, filename) {
  const lower = (filename || '').toLowerCase();
  if ((blob?.type || '').includes('pdf') || lower.endsWith('.pdf')) {
    return [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }];
  }
  if ((blob?.type || '').includes('zip') || lower.endsWith('.zip')) {
    return [{ description: 'Archive ZIP', accept: { 'application/zip': ['.zip'] } }];
  }
  return undefined;
}

export async function saveBlobWithPreferredMethod(blob, filename, options = {}) {
  const { preopenedWindow = null, startIn = null } = options;
  const safeFilename = filename || 'download';
  const blobOk = ensureBlobForDownload(blob, safeFilename);

  try {
    if (hasNativeSaveFilePicker()) {
      try {
        const pickerOpts = {
          suggestedName: safeFilename,
          types: getPickerTypesFromBlob(blobOk, safeFilename),
        };
        if (startIn && typeof startIn === 'object' && startIn.kind) {
          pickerOpts.startIn = startIn;
        }
        const handle = await window.showSaveFilePicker(pickerOpts);
        const writable = await handle.createWritable();
        await writable.write(blobOk);
        await writable.close();
        closePreopenedDownloadWindow(preopenedWindow);
        return;
      } catch (e) {
        if (e?.name === 'AbortError') {
          closePreopenedDownloadWindow(preopenedWindow);
          return;
        }
      }
    }

    triggerBlobDownload(blobOk, safeFilename, { preopenedWindow });
  } catch (e) {
    closePreopenedDownloadWindow(preopenedWindow);
    throw e;
  }
}
