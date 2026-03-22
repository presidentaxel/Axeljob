/** Annule les frames d’une animation précédente si on reclique. */
let scrollTopAnimToken = 0;

/** Premier ancêtre avec overflow scrollable (pour cas sans scroll fenêtre). */
function getScrollParentFrom(el) {
  if (!el) return null;
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const s = getComputedStyle(node);
    const oy = s.overflowY;
    if (
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Scroll « page » réel (fenêtre / document), la plupart du temps. */
function getWindowScrollY() {
  return Math.max(
    window.scrollY || 0,
    window.pageYOffset || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0
  );
}

/**
 * Cible à animer : si la fenêtre est scrollée, TOUJOURS la fenêtre.
 * Sinon seulement un conteneur interne qui a scrollTop > 0 (évite d’animer un div
 * overflow:auto alors que tout le scroll est sur document - startY restait 0).
 */
function resolveScrollTarget() {
  const winY = getWindowScrollY();
  const contentRoot = document.querySelector('.content-page, .legal-page');
  const inner = contentRoot ? getScrollParentFrom(contentRoot) : null;

  if (winY > 2) {
    return { kind: 'window' };
  }
  if (inner && inner.scrollTop > 1) {
    return { kind: 'element', el: inner };
  }
  return { kind: 'window' };
}

function getScrollY(target) {
  if (target.kind === 'element') return target.el.scrollTop;
  return getWindowScrollY();
}

function setScrollY(target, y) {
  const top = Math.max(0, y);
  if (target.kind === 'element') {
    target.el.scrollTop = top;
    return;
  }
  window.scrollTo(0, top);
  if (document.documentElement) document.documentElement.scrollTop = top;
  if (document.body) document.body.scrollTop = top;
}

/** Pour la console : coller __axelScrollDiag() après import, ou utiliser la version globale en dev. */
export function getScrollToTopDiagnostics() {
  const contentRoot = document.querySelector('.content-page, .legal-page');
  const inner = contentRoot ? getScrollParentFrom(contentRoot) : null;
  const winY = getWindowScrollY();
  const target = resolveScrollTarget();
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let innerHint = null;
  if (inner) {
    innerHint = {
      tag: inner.tagName,
      id: inner.id || null,
      className: inner.className || null,
      scrollTop: inner.scrollTop,
      clientHeight: inner.clientHeight,
      scrollHeight: inner.scrollHeight,
    };
  }

  return {
    reducedMotion: !!reduced,
    scrollAnimationNote: reduced
      ? 'Animation 300 ms max, linéaire (réduction des animations système).'
      : 'Animation 300 ms max, ease-out.',
    windowScrollY: window.scrollY,
    pageYOffset: window.pageYOffset,
    documentElementScrollTop: document.documentElement?.scrollTop,
    bodyScrollTop: document.body?.scrollTop,
    maxWindowLikeScroll: winY,
    contentRootFound: !!contentRoot,
    innerScrollParent: innerHint,
    chosenTarget: target.kind,
    startYThatWouldBeUsed: getScrollY(target),
  };
}

const SCROLL_TOP_MAX_MS = 300;

/**
 * Remonte en haut avec une animation manuelle (300 ms max).
 * prefers-reduced-motion : même durée plafonnée, courbe linéaire.
 */
export function scrollToTopSmooth(durationMs = SCROLL_TOP_MAX_MS) {
  if (typeof window === 'undefined') return;

  const target = resolveScrollTarget();
  const startY = getScrollY(target);
  if (startY <= 0) return;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const resolvedDuration = Math.min(SCROLL_TOP_MAX_MS, Math.max(1, durationMs));
  const ease = reduced ? (u) => u : (u) => 1 - (1 - u) ** 4;

  const token = ++scrollTopAnimToken;
  const startTime = performance.now();

  function frame(now) {
    if (token !== scrollTopAnimToken) return;
    const elapsed = now - startTime;
    const t = Math.min(elapsed / resolvedDuration, 1);
    const y = Math.round(startY * (1 - ease(t)));
    setScrollY(target, y);
    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__axelScrollDiag = () => {
    console.log('[AxeL Job - scroll retour haut]', getScrollToTopDiagnostics());
  };
}
