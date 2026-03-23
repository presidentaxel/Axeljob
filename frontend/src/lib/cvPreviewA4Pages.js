/**
 * Aperçu pages A4 : espacements anti-coupe de blocs + cadres (hauteur page − réserve pied).
 * Nombre de pages : 1 si le contenu tient (hors artefacts min-height / sous-pixel),
 * pages suivantes seulement si le flux dépasse vraiment (ex. Adapter le CV).
 */

export const CV_PREVIEW_A4_LAYER_CLASS = 'cv-preview-a4-page-layer';
export const CV_PREVIEW_A4_SPACER_CLASS = 'cv-preview-a4-page-spacer';

const RESIZE_OBSERVER_KEY = '__cvPreviewA4ResizeObserver';

/**
 * Réserve bas de page (mm), même échelle que la largeur du .cv (210 mm).
 * À garder cohérent avec une future @page { margin-bottom } PDF (generator.py) ou pied généré.
 */
export const CV_PREVIEW_A4_BOTTOM_RESERVE_MM = 5;

/** Blocs à ne pas couper (cohérent avec le PDF : items + section.cv-section élégant, etc.). */
const SECTION_SELECTOR = [
  '.experience-item',
  '.formation-header',
  '.formation-mention',
  '.projet-nom',
  '.projet-description',
  '.sidebar-section',
  '.section-sidebar',
  '.sidebar-contact',
  '.sidebar-identity',
  '.sidebar-photo',
  '.section-mots-cles-ats',
  '.cert-item',
  '.lang-item',
  '.cv-header',
  'header.cv-header',
  'section.main-section',
  'section.section',
  'section.cv-section',
].join(',');

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

function topRelativeToAncestor(el, ancestor) {
  const ra = ancestor.getBoundingClientRect();
  const re = el.getBoundingClientRect();
  return re.top - ra.top;
}

/** Éléments « atomiques », ordre document (querySelectorAll). */
function getAtomicSectionElements(cv) {
  let nodes = Array.from(cv.querySelectorAll(SECTION_SELECTOR));
  nodes = nodes.filter((el) => (el.offsetHeight || 0) >= 6);
  nodes = nodes.filter((el) => !nodes.some((o) => o !== el && o.contains(el)));
  return nodes;
}

/**
 * Grille 2 colonnes sur .cv (ex. créatif/moderne) : ne pas insérer de spacers (sinon une colonne bouge seule).
 */
function shouldApplyPageSpacers(cv, win) {
  try {
    const s = win.getComputedStyle(cv);
    if (s.display !== 'grid') return true;
    const cols = (s.gridTemplateColumns || '').trim();
    if (!cols) return true;
    const parts = cols.split(/\s+/).filter(Boolean);
    return parts.length < 2;
  } catch (_) {
    return true;
  }
}

/**
 * Insère des blocs vides avant les sections qui seraient coupées par y = k×pageH.
 */
function applyA4PageSpacers(cv, doc, pageH, win) {
  removeA4PageSpacers(cv);
  if (pageH < 40 || !shouldApplyPageSpacers(cv, win)) return;

  const EPS = 3;
  let iterations = 0;
  let changed = true;

  while (changed && iterations < 40) {
    iterations += 1;
    changed = false;
    const elements = getAtomicSectionElements(cv);

    for (const el of elements) {
      if (!el.isConnected || !el.parentNode) continue;
      const top = topRelativeToAncestor(el, cv);
      const eh = el.offsetHeight;

      for (let k = 1; k * pageH < top + eh + pageH; k += 1) {
        const B = k * pageH;
        if (top < B - EPS && top + eh > B + EPS) {
          const pad = B - top;
          if (pad <= EPS) break;
          const spacer = doc.createElement('div');
          spacer.className = CV_PREVIEW_A4_SPACER_CLASS;
          spacer.setAttribute('aria-hidden', 'true');
          spacer.style.cssText = [
            'width:100%',
            'flex-shrink:0',
            'flex-grow:0',
            'pointer-events:none',
            `height:${pad}px`,
            'margin:0',
            'padding:0',
            'border:0',
            'box-sizing:border-box',
          ].join(';');
          el.parentNode.insertBefore(spacer, el);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
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
 * @param {Document} doc — document pour createElement (iframe ou window.document)
 * @param {Window} win — pour getComputedStyle / ResizeObserver
 * @param {{ zIndex?: number }} [opts]
 */
function placeA4PageFrames(cv, scope, doc, win, opts = {}) {
  // Sous les modales plein écran (App.css ~6000), au-dessus du flux du CV.
  const zIndex = opts.zIndex ?? 400;
  if (!cv.isConnected || !scope.isConnected) return;
  removeA4PageFrames(scope);
  clearCvPreviewA4Layout(cv);

  const w = Math.max(cv.scrollWidth, cv.getBoundingClientRect().width, 1);
  const reservePx = (w * CV_PREVIEW_A4_BOTTOM_RESERVE_MM) / 210;
  const pageH = Math.max((w * 297) / 210 - reservePx, 48);
  if (pageH < 24) return;

  applyA4PageSpacers(cv, doc, pageH, win);

  const hContent = Math.max(cv.scrollHeight, cv.offsetHeight, 1);
  /**
   * Nb de pages « utiles » : évite une 2e (ou 3e) page fantôme quand le flux ne dépasse
   * qu’à cause du min-height A4, des bordures ou du sous-pixel (Adapter le CV / iframe).
   */
  const PAGE_SLACK_PX = 28;
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
 * @param {Document} doc — document de l’iframe srcdoc
 */
export function applyA4PageFramesToDocument(doc) {
  if (!doc?.body || !doc.defaultView) return;
  disconnectDocObserver(doc);
  removeA4PageFrames(doc.body);

  const cv = doc.querySelector('article.cv') || doc.querySelector('.cv');
  if (!cv) return;

  const scope = doc.body;
  const win = doc.defaultView;

  const run = () => placeA4PageFrames(cv, scope, doc, win, { zIndex: 400 });

  run();

  try {
    const ro = new win.ResizeObserver(() => {
      win.requestAnimationFrame(run);
    });
    ro.observe(cv);
    doc[RESIZE_OBSERVER_KEY] = ro;
    win.setTimeout(() => win.requestAnimationFrame(run), 350);
  } catch (_) {
    win.setTimeout(() => win.requestAnimationFrame(run), 400);
  }
}

/**
 * @param {HTMLElement} container — enfant direct ou ancêtre du .cv (ex. CvEditablePreview)
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

  const run = () => placeA4PageFrames(cv, container, document, window, { zIndex: 400 });

  run();

  try {
    const ro = new ResizeObserver(() => {
      window.requestAnimationFrame(run);
    });
    ro.observe(cv);
    container[RESIZE_OBSERVER_KEY] = ro;
    window.setTimeout(() => window.requestAnimationFrame(run), 350);
  } catch (_) {
    window.setTimeout(() => window.requestAnimationFrame(run), 400);
  }
}
