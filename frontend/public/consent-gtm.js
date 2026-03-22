/**
 * Consent Mode v2 (RGPD / EEE) + chargement Google Tag Manager.
 * Stockage : localStorage clé axel_job_consent_v1
 */
(function () {
  var STORAGE_KEY = 'axel_job_consent_v1';
  var GTM_ID = (window.__AXEL_GTM_ID__ || '').trim();

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500,
  });

  function validGtmId(id) {
    return typeof id === 'string' && /^GTM-[A-Z0-9]+$/i.test(id);
  }

  if (validGtmId(GTM_ID)) {
    (function (w, d, s, l, i) {
      w[l] = w[l] || [];
      w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var f = d.getElementsByTagName(s)[0];
      var j = d.createElement(s);
      var dl = l !== 'dataLayer' ? '&l=' + l : '';
      j.async = true;
      j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
      f.parentNode.insertBefore(j, f);
    })(window, document, 'script', 'dataLayer', GTM_ID);
  }

  function readConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      if (o.v !== 1) return null;
      return o;
    } catch (_) {
      return null;
    }
  }

  function writeConsent(obj) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  function pushConsentUpdate(analytics, marketing) {
    gtag('consent', 'update', {
      analytics_storage: analytics ? 'granted' : 'denied',
      ad_storage: marketing ? 'granted' : 'denied',
      ad_user_data: marketing ? 'granted' : 'denied',
      ad_personalization: marketing ? 'granted' : 'denied',
      personalization_storage: marketing ? 'granted' : 'denied',
    });
    window.dataLayer.push({
      event: 'axel_consent_update',
      axel_analytics: analytics,
      axel_marketing: marketing,
    });
  }

  function applySaved(c) {
    pushConsentUpdate(!!c.analytics, !!c.marketing);
  }

  var saved = readConsent();
  if (saved) applySaved(saved);

  function privacyHref() {
    var p = (window.location && window.location.pathname) || '';
    if (p.indexOf('/app') === 0 || p === '/login') return '/confidentialite';
    return '/confidentialite';
  }

  var bannerEl;
  var prefsEl;
  var analyticsCb;
  var marketingCb;

  function hideBanner() {
    if (bannerEl) bannerEl.setAttribute('hidden', '');
  }

  function showBanner() {
    if (bannerEl) bannerEl.removeAttribute('hidden');
  }

  function showSettingsBtn() {
    var b = document.getElementById('axel-cookie-settings');
    if (b) b.removeAttribute('hidden');
  }

  function hideSettingsBtn() {
    var b = document.getElementById('axel-cookie-settings');
    if (b) b.setAttribute('hidden', '');
  }

  /** Workspace connecté /app/* : pas de bouton flottant (accès via menu compte). */
  function isAppWorkspacePath() {
    var p = window.location.pathname || '';
    return p === '/app' || p.indexOf('/app/') === 0;
  }

  function refreshFloatingSettingsVisibility() {
    if (isAppWorkspacePath()) hideSettingsBtn();
    else if (readConsent()) showSettingsBtn();
    else hideSettingsBtn();
  }

  function setPrefsOpen(open) {
    if (!prefsEl) return;
    if (open) prefsEl.classList.add('axel-cookie-banner__prefs--open');
    else prefsEl.classList.remove('axel-cookie-banner__prefs--open');
  }

  function commitConsent(analytics, marketing) {
    writeConsent({ v: 1, analytics: !!analytics, marketing: !!marketing, t: Date.now() });
    pushConsentUpdate(!!analytics, !!marketing);
    var saveBtn = document.getElementById('axel-cookie-save');
    if (saveBtn) saveBtn.hidden = true;
    setPrefsOpen(false);
    hideBanner();
    refreshFloatingSettingsVisibility();
  }

  function openPreferences() {
    var c = readConsent();
    if (analyticsCb) analyticsCb.checked = c ? !!c.analytics : false;
    if (marketingCb) marketingCb.checked = c ? !!c.marketing : false;
    setPrefsOpen(true);
    var saveBtn = document.getElementById('axel-cookie-save');
    if (saveBtn) saveBtn.hidden = false;
    showBanner();
  }

  function buildUi() {
    if (document.getElementById('axel-cookie-banner')) return;

    var wrap = document.createElement('div');
    wrap.id = 'axel-cookie-banner';
    wrap.className = 'axel-cookie-banner';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-labelledby', 'axel-cookie-title');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('data-nosnippet', '');
    wrap.innerHTML =
      '<div class="axel-cookie-banner__panel">' +
      '<h2 id="axel-cookie-title" class="axel-cookie-banner__title">Cookies et données personnelles</h2>' +
      '<p class="axel-cookie-banner__text">Nous utilisons des cookies strictement nécessaires au service. ' +
      'Avec votre accord, nous mesurons l’audience (Google Analytics via Tag Manager) et, le cas échéant, la publicité. ' +
      'Vous pouvez accepter, refuser ou personnaliser. ' +
      '<a href="' +
      privacyHref() +
      '">Politique de confidentialité</a></p>' +
      '<div id="axel-cookie-prefs" class="axel-cookie-banner__prefs">' +
      '<div class="axel-cookie-banner__row">' +
      '<input type="checkbox" id="axel-cookie-analytics" />' +
      '<label for="axel-cookie-analytics"><strong>Mesure d’audience</strong>' +
      '<span>Statistiques de fréquentation (anonymisées lorsque possible), amélioration du site.</span></label></div>' +
      '<div class="axel-cookie-banner__row">' +
      '<input type="checkbox" id="axel-cookie-marketing" />' +
      '<label for="axel-cookie-marketing"><strong>Publicité et personnalisation</strong>' +
      '<span>Publicité pertinente et mesure des campagnes (si activé dans Tag Manager).</span></label></div></div>' +
      '<div class="axel-cookie-banner__actions">' +
      '<button type="button" class="axel-cookie-banner__btn axel-cookie-banner__btn--primary" id="axel-cookie-accept-all">Tout accepter</button>' +
      '<button type="button" class="axel-cookie-banner__btn axel-cookie-banner__btn--ghost" id="axel-cookie-reject">Tout refuser</button>' +
      '<button type="button" class="axel-cookie-banner__btn axel-cookie-banner__btn--link" id="axel-cookie-customize">Personnaliser</button>' +
      '<button type="button" class="axel-cookie-banner__btn axel-cookie-banner__btn--primary" id="axel-cookie-save" hidden>Enregistrer mes choix</button>' +
      '</div></div>';
    document.body.appendChild(wrap);

    var settings = document.createElement('div');
    settings.id = 'axel-cookie-settings';
    settings.className = 'axel-cookie-settings';
    settings.setAttribute('hidden', '');
    settings.innerHTML = '<button type="button" id="axel-cookie-reopen">Paramètres cookies</button>';
    document.body.appendChild(settings);

    bannerEl = wrap;
    prefsEl = document.getElementById('axel-cookie-prefs');
    analyticsCb = document.getElementById('axel-cookie-analytics');
    marketingCb = document.getElementById('axel-cookie-marketing');
    var btnAccept = document.getElementById('axel-cookie-accept-all');
    var btnReject = document.getElementById('axel-cookie-reject');
    var btnCustomize = document.getElementById('axel-cookie-customize');
    var btnSave = document.getElementById('axel-cookie-save');
    var btnReopen = document.getElementById('axel-cookie-reopen');

    btnAccept.addEventListener('click', function () {
      commitConsent(true, true);
    });
    btnReject.addEventListener('click', function () {
      commitConsent(false, false);
    });
    btnCustomize.addEventListener('click', function () {
      var open = !prefsEl.classList.contains('axel-cookie-banner__prefs--open');
      setPrefsOpen(open);
      btnSave.hidden = !open;
    });
    btnSave.addEventListener('click', function () {
      commitConsent(analyticsCb.checked, marketingCb.checked);
    });
    btnReopen.addEventListener('click', openPreferences);
  }

  window.axelOpenCookieSettings = openPreferences;

  function init() {
    buildUi();
    if (!saved) {
      showBanner();
      hideSettingsBtn();
    } else {
      hideBanner();
      refreshFloatingSettingsVisibility();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
