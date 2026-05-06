import { useRef, useEffect, useCallback } from 'react';
import { trackEvent } from './api';
import { getStoredAttribution } from './analyticsSession';

const ATTRIB_SENT_KEY = 'cv_bot_attrib_sent_auth_session';

function scrollPctMax() {
  const doc = document.documentElement;
  const sh = doc.scrollHeight - doc.clientHeight;
  if (sh <= 0) return 100;
  return Math.min(100, Math.round((doc.scrollTop / sh) * 100));
}

/**
 * Parcours : page_view enrichi (1× attribution), page_engagement groupé (durée + scroll + sections vues).
 */
export function useViewAnalytics({ view, pathname, session }) {
  const enabled = !!session && !!view;
  const engagementRef = useRef({
    view: null,
    path: null,
    t0: 0,
    scrollMax: 0,
    sections: new Set(),
  });

  const flushEngagement = useCallback(() => {
    const e = engagementRef.current;
    if (!e.view) return;
    const duration_ms = Date.now() - e.t0;
    if (duration_ms < 400) return;
    trackEvent('page_engagement', {
      view: e.view,
      path: e.path,
      duration_ms,
      scroll_pct_max: e.scrollMax,
      sections: [...e.sections].sort(),
    });
  }, []);

  // page_view + rotation engagement quand la vue change
  useEffect(() => {
    if (!enabled) {
      flushEngagement();
      engagementRef.current = {
        view: null,
        path: null,
        t0: 0,
        scrollMax: 0,
        sections: new Set(),
      };
      return;
    }
    flushEngagement();
    engagementRef.current = {
      view,
      path: pathname,
      t0: Date.now(),
      scrollMax: scrollPctMax(),
      sections: new Set(),
    };

    const payload = { view, path: pathname || '' };
    try {
      if (sessionStorage.getItem(ATTRIB_SENT_KEY) !== '1') {
        const attr = getStoredAttribution();
        if (attr && Object.keys(attr).length > 0) {
          payload.attribution = attr;
          sessionStorage.setItem(ATTRIB_SENT_KEY, '1');
        }
      }
    } catch {
      /* sessionStorage unavailable */
    }

    trackEvent('page_view', payload);
  }, [enabled, view, pathname, flushEngagement]);

  // visibilité / fermeture onglet
  useEffect(() => {
    if (!enabled) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushEngagement();
    };
    const onPageHide = () => flushEngagement();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enabled, flushEngagement]);

  // scroll (agrégé : max %)
  useEffect(() => {
    if (!enabled) return;
    let raf = null;
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const pct = scrollPctMax();
        engagementRef.current.scrollMax = Math.max(engagementRef.current.scrollMax, pct);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled, view]);

  // sections avec data-analytics-section (une fois par vue ; rAF pour le DOM monté)
  useEffect(() => {
    if (!enabled) return;
    let io = null;
    const raf = requestAnimationFrame(() => {
      const els = document.querySelectorAll('[data-analytics-section]');
      if (!els.length) return;
      io = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (en.isIntersecting && en.intersectionRatio >= 0.12) {
              const id = en.target.getAttribute('data-analytics-section');
              if (id) engagementRef.current.sections.add(id);
            }
          }
        },
        { threshold: [0.12, 0.25] },
      );
      els.forEach((el) => io.observe(el));
    });
    return () => {
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
    };
  }, [enabled, view, pathname]);
}
