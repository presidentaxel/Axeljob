(function () {
  var scrollTopAnimToken = 0;
  var SCROLL_TOP_MAX_MS = 300;

  function getScrollParentFrom(el) {
    if (!el) return null;
    var node = el.parentElement;
    while (node && node !== document.documentElement) {
      var s = getComputedStyle(node);
      var oy = s.overflowY;
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

  function getWindowScrollY() {
    return Math.max(
      window.scrollY || 0,
      window.pageYOffset || 0,
      (document.documentElement && document.documentElement.scrollTop) || 0,
      (document.body && document.body.scrollTop) || 0
    );
  }

  function resolveScrollTarget() {
    var winY = getWindowScrollY();
    var contentRoot = document.querySelector('.content-page, .legal-page');
    var inner = contentRoot ? getScrollParentFrom(contentRoot) : null;
    if (winY > 2) return { kind: 'window' };
    if (inner && inner.scrollTop > 1) return { kind: 'element', el: inner };
    return { kind: 'window' };
  }

  function getScrollY(target) {
    if (target.kind === 'element') return target.el.scrollTop;
    return getWindowScrollY();
  }

  function setScrollY(target, y) {
    var top = Math.max(0, y);
    if (target.kind === 'element') {
      target.el.scrollTop = top;
      return;
    }
    window.scrollTo(0, top);
    if (document.documentElement) document.documentElement.scrollTop = top;
    if (document.body) document.body.scrollTop = top;
  }

  function getDiagnostics() {
    var contentRoot = document.querySelector('.content-page, .legal-page');
    var inner = contentRoot ? getScrollParentFrom(contentRoot) : null;
    var winY = getWindowScrollY();
    var target = resolveScrollTarget();
    var innerHint = null;
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
    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    return {
      reducedMotion: reduced,
      scrollAnimationNote: reduced
        ? 'Animation 500 ms max, linéaire (réduction des animations système).'
        : 'Animation 500 ms max, ease-out.',
      windowScrollY: window.scrollY,
      pageYOffset: window.pageYOffset,
      documentElementScrollTop: document.documentElement && document.documentElement.scrollTop,
      bodyScrollTop: document.body && document.body.scrollTop,
      maxWindowLikeScroll: winY,
      contentRootFound: !!contentRoot,
      innerScrollParent: innerHint,
      chosenTarget: target.kind,
      startYThatWouldBeUsed: getScrollY(target),
    };
  }

  window.__axelScrollDiag = function () {
    console.log('[AxeL Job - scroll retour haut]', getDiagnostics());
  };

  function scrollToTopSmooth(durationMs) {
    var resolvedDuration = Math.min(SCROLL_TOP_MAX_MS, Math.max(1, durationMs || SCROLL_TOP_MAX_MS));
    var target = resolveScrollTarget();
    var startY = getScrollY(target);
    if (startY <= 0) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var token = ++scrollTopAnimToken;
    var startTime = performance.now();
    function frame(now) {
      if (token !== scrollTopAnimToken) return;
      var elapsed = now - startTime;
      var t = Math.min(elapsed / resolvedDuration, 1);
      var eased = reduced ? t : 1 - Math.pow(1 - t, 4);
      var y = Math.round(startY * (1 - eased));
      setScrollY(target, y);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function mount() {
    if (!document.querySelector('.content-page, .legal-page')) return;
    if (document.querySelector('.content-scroll-top')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'content-scroll-top';
    btn.setAttribute('aria-label', 'Retour en haut de la page');
    btn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    btn.addEventListener('click', function () {
      scrollToTopSmooth();
    });
    document.body.appendChild(btn);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
