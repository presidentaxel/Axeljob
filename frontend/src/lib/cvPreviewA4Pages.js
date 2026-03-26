/**
 * Aperçu pages A4 : cadres « Page 1 / 2 » calés sur l’export PDF.
 * Hauteur page = 297 mm mesurée dans le document ; recalcul après fonts.ready.
 * (Les anciens « spacers » anti-coupe sont retirés : ils créaient des sauts visibles absents du PDF.)
 */

export const CV_PREVIEW_A4_LAYER_CLASS = 'cv-preview-a4-page-layer';
export const CV_PREVIEW_A4_SPACER_CLASS = 'cv-preview-a4-page-spacer';

const RESIZE_OBSERVER_KEY = '__cvPreviewA4ResizeObserver';

/**
 * Réserve bas de page (mm), même échelle que la largeur du .cv (210 mm).
 * 0 = aligné sur l’export PDF (@page { margin: 0 } et Chromium). Une réserve > 0 raccourcit la « page »
 * dans l’aperçu → moins de pages affichées que dans le PDF (ex. Classique : 1 vs 2).
 */
export const CV_PREVIEW_A4_BOTTOM_RESERVE_MM = 0;

export function removeA4PageSpacers(cv) {
  if (!cv?.querySelectorAll) return;
  cv.querySelectorAll(`.${CV_PREVIEW_A4_SPACER_CLASS}`).forEach((n) => n.remove());
}

/** Retire les styles imposés pour l’aperçu pages A4 (sans toucher au reste du CV). */
export function clearCvPreviewA4Layout(cv) {
  if (!cv?.style) return;
  cv.style.minHeight = '';
  cv.style.marginBottom = '';
}

/** Une fois l’iframe dimensionnée au document complet : pas de scroll interne (scroll = conteneur parent). */
export function suppressCvPreviewIframeInnerScroll(doc) {
  if (!doc?.documentElement) return;
  try {
    doc.documentElement.style.setProperty('overflow', 'hidden', 'important');
    if (doc.body) {
      doc.body.style.setProperty('overflow', 'hidden', 'important');
    }
  } catch (_) {
    /* ignore */
  }
}

/** Ajuste la hauteur de l’iframe au document (scroll = conteneur externe). À rappeler après chaque recalcul A4 (ResizeObserver). */
export function syncCvPreviewIframeHeight(iframe) {
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) return;
    const height = Math.max(
      doc.documentElement.scrollHeight,
      doc.documentElement.offsetHeight,
      doc.body?.scrollHeight ?? 0,
      doc.body?.offsetHeight ?? 0
    );
    if (height <= 0) return;
    const h = Math.ceil(height);
    const prev = iframe.getAttribute('data-cv-preview-sync-h');
    if (prev !== String(h)) {
      iframe.setAttribute('data-cv-preview-sync-h', String(h));
      iframe.style.height = `${h}px`;
    }
    suppressCvPreviewIframeInnerScroll(doc);
  } catch (_) {
    /* ignore */
  }
}

export function teardownA4PageFramesInHost(container) {
  if (!container) return;
  const obs = container[RESIZE_OBSERVER_KEY];
  if (obs && typeof obs.disconnect === 'function') {
    obs.disconnect();
    container[RESIZE_OBSERVER_KEY] = null;
  }
  const cv = container.querySelector('article.cv') || container.querySelector('.cv');
  if (cv) {
    removeA4PageSpacers(cv);
    clearCvPreviewA4Layout(cv);
  }
  removeA4PageFrames(container);
}

export function removeA4PageFrames(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll(`.${CV_PREVIEW_A4_LAYER_CLASS}`).forEach((el) => el.remove());
}

function disconnectDocObserver(doc) {
  const obs = doc?.[RESIZE_OBSERVER_KEY];
  if (obs && typeof obs.disconnect === 'function') {
    obs.disconnect();
    doc[RESIZE_OBSERVER_KEY] = null;
  }
}

/**
 * Convertit mm → px avec le moteur CSS du document (même référence que pour le rendu du CV / PDF Chromium).
 */
function cssMmToPx(doc, win, mm) {
  const fallback = Math.max(1, Math.round((mm * 96) / 25.4));
  if (!doc?.documentElement) return fallback;
  try {
    const p = doc.createElement('div');
    p.setAttribute('data-cv-mm-probe', '1');
    p.style.cssText = [
      'position:absolute',
      'left:-99999px',
      'top:0',
      'width:1px',
      'margin:0',
      'padding:0',
      'border:0',
      'visibility:hidden',
      'pointer-events:none',
      'box-sizing:border-box',
      'height:0',
    ].join(';');
    p.style.height = `${mm}mm`;
    doc.documentElement.appendChild(p);
    const h = Math.round(p.getBoundingClientRect().height);
    p.remove();
    return Math.max(1, h || fallback);
  } catch (_) {
    return fallback;
  }
}

function appendSheet(layer, doc, index, topPx, heightPx) {
  const sheet = doc.createElement('div');
  sheet.style.cssText = [
    'position:absolute',
    'left:0',
    `top:${topPx}px`,
    'width:100%',
    `height:${heightPx}px`,
    'box-sizing:border-box',
    'border:1.5px dashed rgba(99,102,241,0.48)',
    'border-radius:4px',
    'background:rgba(99,102,241,0.045)',
    'box-shadow:inset 0 0 0 1px rgba(255,255,255,0.2)',
  ].join(';');

  const badge = doc.createElement('span');
  badge.textContent = `Page ${index + 1}`;
  badge.style.cssText = [
    'position:absolute',
    'top:10px',
    'right:12px',
    'font:600 11px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    'color:rgba(67,56,202,0.95)',
    'letter-spacing:0.04em',
    'text-transform:uppercase',
    'text-shadow:0 0 8px #fff,0 0 4px #fff',
  ].join(';');

  sheet.appendChild(badge);
  layer.appendChild(sheet);
}

/**
 * @param {Document} doc - document pour createElement (iframe ou window.document)
 * @param {Window} win - pour getComputedStyle / ResizeObserver
 * @param {{ zIndex?: number }} [opts]
 */
function placeA4PageFrames(cv, scope, doc, win, opts = {}) {
  // Sous les modales (ex. choix de template z-index ~100), au-dessus du flux du CV.
  const zIndex = opts.zIndex ?? 8;
  if (!cv.isConnected || !scope.isConnected) return;
  removeA4PageFrames(scope);
  clearCvPreviewA4Layout(cv);
  removeA4PageSpacers(cv);

  const wMm = cssMmToPx(doc, win, 210);
  const w = Math.max(cv.scrollWidth, cv.offsetWidth, cv.getBoundingClientRect().width, wMm, 1);
  const reservePx =
    CV_PREVIEW_A4_BOTTOM_RESERVE_MM > 0 ? cssMmToPx(doc, win, CV_PREVIEW_A4_BOTTOM_RESERVE_MM) : 0;
  const pageH = Math.max(cssMmToPx(doc, win, 297) - reservePx, 48);
  if (pageH < 24) return;

  const hContent = Math.max(cv.scrollHeight, cv.offsetHeight, 1);
  /**
   * Nb de pages « utiles » : évite une 2e (ou 3e) page fantôme quand le flux ne dépasse
   * qu’à cause du min-height A4, des bordures ou du sous-pixel (Adapter le CV / iframe).
   */
  /* Tolérance sous-pixel uniquement : un slack trop large masquait une 2e page alors que le PDF en a une. */
  const PAGE_SLACK_PX = 4;
  let n = Math.max(1, Math.ceil(hContent / pageH - 1e-9));
  while (n > 1) {
    const hOnLast = hContent - (n - 1) * pageH;
    if (hOnLast > PAGE_SLACK_PX) break;
    n -= 1;
  }
  const totalH = Math.max(n * pageH, hContent);
  const tail = Math.max(0, totalH - hContent);
  if (tail > 0) cv.style.marginBottom = `${tail}px`;

  const brCv = cv.getBoundingClientRect();
  const brScope = scope.getBoundingClientRect();
  const topOff = scope.scrollTop + brCv.top - brScope.top;
  const leftOff = scope.scrollLeft + brCv.left - brScope.left;

  if (win.getComputedStyle(scope).position === 'static') {
    scope.style.position = 'relative';
  }

  const layer = doc.createElement('div');
  layer.className = CV_PREVIEW_A4_LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  layer.title =
    'Repère des pages A4 : une page si le contenu tient sur une feuille, pages suivantes seulement si nécessaire.';

  layer.style.cssText = [
    'position:absolute',
    `left:${leftOff}px`,
    `top:${topOff}px`,
    `width:${w}px`,
    `height:${totalH}px`,
    'pointer-events:none',
    `z-index:${zIndex}`,
    'box-sizing:border-box',
  ].join(';');

  for (let i = 0; i < n; i += 1) {
    appendSheet(layer, doc, i, i * pageH, pageH);
  }

  scope.appendChild(layer);
}

/**
 * @param {Document} doc - document de l’iframe srcdoc
 * @param {{ onLayout?: () => void }} [opts] - appelé après chaque `placeA4PageFrames` (ex. resync hauteur iframe quand le .cv change)
 */
export function applyA4PageFramesToDocument(doc, opts = {}) {
  if (!doc?.body || !doc.defaultView) return;
  const { onLayout } = opts;
  disconnectDocObserver(doc);
  removeA4PageFrames(doc.body);

  const cv = doc.querySelector('article.cv') || doc.querySelector('.cv');
  if (!cv) return;

  const scope = doc.body;
  const win = doc.defaultView;

  const run = () => {
    placeA4PageFrames(cv, scope, doc, win, { zIndex: 8 });
    try {
      onLayout?.();
    } catch (_) {
      /* ignore */
    }
  };

  const scheduleRun = () => {
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(run);
    });
  };

  const kickStable = () => {
    scheduleRun();
    win.setTimeout(scheduleRun, 280);
    win.setTimeout(scheduleRun, 750);
  };

  run();

  try {
    if (doc.fonts && typeof doc.fonts.ready?.then === 'function') {
      doc.fonts.ready.then(() => kickStable()).catch(() => kickStable());
    } else {
      kickStable();
    }
  } catch (_) {
    kickStable();
  }

  try {
    const ro = new win.ResizeObserver(() => {
      win.requestAnimationFrame(run);
    });
    ro.observe(cv);
    doc[RESIZE_OBSERVER_KEY] = ro;
    win.setTimeout(scheduleRun, 320);
  } catch (_) {
    win.setTimeout(scheduleRun, 400);
  }
}

/**
 * @param {HTMLElement} container - enfant direct ou ancêtre du .cv (ex. CvEditablePreview)
 */
export function applyA4PageFramesInHost(container) {
  if (!container?.querySelector) return;

  if (container[RESIZE_OBSERVER_KEY]) {
    container[RESIZE_OBSERVER_KEY].disconnect();
    container[RESIZE_OBSERVER_KEY] = null;
  }
  removeA4PageFrames(container);

  const cv = container.querySelector('article.cv') || container.querySelector('.cv');
  if (!cv) return;

  if (typeof window === 'undefined' || !window.getComputedStyle) return;

  if (window.getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const run = () => placeA4PageFrames(cv, container, document, window, { zIndex: 8 });

  const scheduleRun = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
  };

  const kickStable = () => {
    scheduleRun();
    window.setTimeout(scheduleRun, 280);
    window.setTimeout(scheduleRun, 750);
  };

  run();

  try {
    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      document.fonts.ready.then(() => kickStable()).catch(() => kickStable());
    } else {
      kickStable();
    }
  } catch (_) {
    kickStable();
  }

  try {
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(run);
    });
    ro.observe(cv);
    container[RESIZE_OBSERVER_KEY] = ro;
    window.setTimeout(scheduleRun, 320);
  } catch (_) {
    window.setTimeout(scheduleRun, 400);
  }
}
