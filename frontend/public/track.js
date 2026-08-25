/**
 * AXE-361 — tracker marketing unique (CTA / nav / plan / section).
 * Chargé en <script type="module"> à côté de la CMP. Aucun event avant
 * consentement analytics (`axel_job_consent_v1` / `axel_consent_update`).
 * Hors `/app/*`. Ne cible jamais une classe CSS.
 */
export const CONSENT_STORAGE_KEY = 'axel_job_consent_v1';
export const SECTION_VIEWED_KEY = 'axel_section_viewed_v1';

/** Destinations des CTA React sans href (catalogue AXE-358). */
export const CTA_LINK_URLS = {
  'nav-cta-signup': '/login',
  'nav-cta-start': '/login',
  'nav-cta-drawer': '/login',
  'home-hero-cta-signup': '/login',
  'home-pricing-cta-free': '/login',
  'home-pricing-cta-pro': '/login?plan=pro',
  'home-final-cta-signup': '/login',
  'faq-cta-signup': '/login',
  'ats-cta-signup': '/login',
  'modeles-cta-signup': '/login',
  'guide-cta-signup': '/login',
  'erreurs-cta-signup': '/login',
  'metier-cta-signup': '/login',
  'adapte-cta-signup': '/login',
  'error-cta-home': '/',
  'error-cta-login': '/login',
  'login-cta-google': '/login',
  'login-cta-linkedin': '/login',
  'login-cta-submit': '/login',
};

export const PLAN_BY_CTA = {
  'home-pricing-cta-pro': { plan: 'pro', price: 10, zone: 'pricing' },
  'home-pricing-cta-free': { plan: 'free', price: 0, zone: 'pricing' },
};

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export function sanitizeCtaText(text) {
  if (!text) return '';
  let s = String(text).replace(/\s+/g, ' ').trim();
  s = s.replace(EMAIL_RE, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 80) s = s.slice(0, 80);
  return s;
}

export function hasAnalyticsConsent(raw) {
  if (!raw) return false;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return !!(o && o.v === 1 && o.analytics);
  } catch {
    return false;
  }
}

export function resolveLinkUrl(dataAttr, href) {
  const h = (href || '').trim();
  if (/^\s*javascript:/i.test(h)) return CTA_LINK_URLS[dataAttr] || '';
  if (/^mailto:/i.test(h)) return 'mailto:';
  if (h) return h;
  return CTA_LINK_URLS[dataAttr] || '';
}

function hostFromHref(href) {
  if (!href || !/^https?:\/\//i.test(href)) return '';
  try {
    return new URL(href).hostname;
  } catch {
    return '';
  }
}

/**
 * Parseur d’événement (testable sans DOM).
 * @returns {{ name: string, params: Record<string, string|number> }[]}
 */
export function eventsFromClick({
  dataAttr,
  dataTrack,
  dataZone,
  dataLevel,
  href,
  text,
  pageHost,
}) {
  const events = [];
  if (!dataAttr) return events;
  if (dataTrack === 'input') return events;

  const linkUrl = resolveLinkUrl(dataAttr, href);

  if (dataTrack === 'cta') {
    if (!dataZone || !dataLevel) return events;
    events.push({
      name: 'cta_click',
      params: {
        cta_id: dataAttr,
        cta_zone: dataZone,
        cta_level: dataLevel,
        cta_text: sanitizeCtaText(text),
        link_url: linkUrl,
      },
    });
    const plan = PLAN_BY_CTA[dataAttr];
    if (plan) {
      events.push({
        name: 'select_plan',
        params: { plan: plan.plan, price: plan.price, zone: plan.zone },
      });
    }
  } else if (dataTrack === 'nav') {
    events.push({
      name: 'nav_click',
      params: {
        nav_id: dataAttr,
        nav_type: dataZone || 'nav',
        link_url: linkUrl,
      },
    });
  }

  const h = (href || '').trim();
  if (/^mailto:/i.test(h)) {
    events.push({ name: 'contact_click', params: { method: 'email' } });
  } else if (h) {
    const linkHost = hostFromHref(h);
    if (linkHost && pageHost && linkHost !== pageHost) {
      events.push({
        name: 'outbound_click',
        params: { link_domain: linkHost, link_url: h },
      });
    }
  }

  return events;
}

export function isMarketingPath(pathname) {
  const p = pathname || '';
  return p !== '/app' && p.indexOf('/app/') !== 0;
}

function readStoredConsent() {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function emit(name, params) {
  if (!hasAnalyticsConsent(readStoredConsent())) return;
  const payload = { event: name, ...params };
  if (typeof window.gtag === 'function') {
    window.gtag('event', name, params);
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

function attrsFromEl(el) {
  if (!el || !el.getAttribute) return null;
  const dataAttr = el.getAttribute('data-attr');
  if (!dataAttr) return null;
  const href = el.getAttribute('href') || '';
  return {
    dataAttr,
    dataTrack: el.getAttribute('data-track') || '',
    dataZone: el.getAttribute('data-zone') || '',
    dataLevel: el.getAttribute('data-level') || '',
    href,
    text: el.textContent || '',
    pageHost: (window.location && window.location.hostname) || '',
  };
}

function onDocumentClick(e) {
  if (!isMarketingPath(window.location.pathname)) return;
  const t = e.target;
  if (!t || !t.closest) return;
  const el = t.closest('[data-attr]');
  if (!el) return;
  const input = attrsFromEl(el);
  if (!input) return;
  const events = eventsFromClick(input);
  for (const ev of events) emit(ev.name, ev.params);
}

function loadSeenSections() {
  try {
    const raw = sessionStorage.getItem(SECTION_VIEWED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistSeen(seen) {
  try {
    sessionStorage.setItem(SECTION_VIEWED_KEY, JSON.stringify([...seen]));
  } catch {
    /* private mode */
  }
}

let sectionObserver = null;
const observedEls = new WeakSet();
let seenSections = loadSeenSections();
let mutationObs = null;
let clickBound = false;

function ensureObserver() {
  if (sectionObserver || typeof IntersectionObserver === 'undefined') return;
  sectionObserver = new IntersectionObserver(
    (entries) => {
      if (!hasAnalyticsConsent(readStoredConsent())) return;
      for (const entry of entries) {
        if (entry.intersectionRatio < 0.5) continue;
        const id = entry.target.getAttribute('data-section');
        if (!id || seenSections.has(id)) continue;
        seenSections.add(id);
        persistSeen(seenSections);
        sectionObserver.unobserve(entry.target);
        emit('section_view', { section_id: id });
      }
    },
    { threshold: 0.5 },
  );
}

function observeNewSections() {
  if (!isMarketingPath(window.location.pathname)) return;
  if (!hasAnalyticsConsent(readStoredConsent())) return;
  ensureObserver();
  if (!sectionObserver) return;
  const nodes = document.querySelectorAll('[data-section]');
  for (const el of nodes) {
    const id = el.getAttribute('data-section');
    if (!id || seenSections.has(id) || observedEls.has(el)) continue;
    observedEls.add(el);
    sectionObserver.observe(el);
  }
}

function startMutationWatch() {
  if (mutationObs || typeof MutationObserver === 'undefined') return;
  mutationObs = new MutationObserver(() => {
    observeNewSections();
  });
  mutationObs.observe(document.documentElement, { childList: true, subtree: true });
}

function onConsent(analyticsGranted) {
  if (!analyticsGranted) return;
  observeNewSections();
}

function boot() {
  if (clickBound) return;
  clickBound = true;
  document.addEventListener('click', onDocumentClick, true);
  window.addEventListener('axel_consent_update', (ev) => {
    const granted = !!(ev && ev.detail && ev.detail.analytics);
    onConsent(granted);
  });
  startMutationWatch();
  if (hasAnalyticsConsent(readStoredConsent())) observeNewSections();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
