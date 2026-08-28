import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eventsFromClick,
  hasAnalyticsConsent,
  resolveLinkUrl,
  sanitizeCtaText,
  isMarketingPath,
  CTA_LINK_URLS,
} from '../../public/track.js';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('cta React sans href : link_url depuis le catalogue, jamais unknown', () => {
  const events = eventsFromClick({
    dataAttr: 'home-hero-cta-signup',
    dataTrack: 'cta',
    dataZone: 'hero',
    dataLevel: 'primary',
    href: '',
    text: 'Essayer gratuitement',
    pageHost: 'job.axelproject.fr',
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'cta_click');
  assert.equal(events[0].params.cta_id, 'home-hero-cta-signup');
  assert.equal(events[0].params.cta_zone, 'hero');
  assert.equal(events[0].params.cta_level, 'primary');
  assert.equal(events[0].params.link_url, '/login');
  assert.equal(events[0].params.cta_text, 'Essayer gratuitement');
  assert.equal(events[0].params.cta_zone === 'unknown', false);
});

test('home-pricing-cta-pro → cta_click et select_plan pro', () => {
  const events = eventsFromClick({
    dataAttr: 'home-pricing-cta-pro',
    dataTrack: 'cta',
    dataZone: 'pricing',
    dataLevel: 'primary',
    href: '',
    text: 'Passer Pro',
    pageHost: 'job.axelproject.fr',
  });
  assert.deepEqual(
    events.map((e) => e.name),
    ['cta_click', 'select_plan'],
  );
  assert.deepEqual(events[1].params, { plan: 'pro', price: 10, zone: 'pricing' });
  assert.equal(events[0].params.link_url, '/login?plan=pro');
});

test('home-pricing-cta-free → cta_click et select_plan free', () => {
  const events = eventsFromClick({
    dataAttr: 'home-pricing-cta-free',
    dataTrack: 'cta',
    dataZone: 'pricing',
    dataLevel: 'secondary',
    href: '/login',
    text: 'Commencer gratuitement',
    pageHost: 'job.axelproject.fr',
  });
  assert.deepEqual(
    events.map((e) => e.name),
    ['cta_click', 'select_plan'],
  );
  assert.deepEqual(events[1].params, { plan: 'free', price: 0, zone: 'pricing' });
});

test('href réel gagne sur la map catalogue', () => {
  assert.equal(resolveLinkUrl('nav-cta-signup', '/login?plan=pro'), '/login?plan=pro');
  assert.equal(resolveLinkUrl('nav-cta-signup', ''), '/login');
  assert.equal(CTA_LINK_URLS['home-pricing-cta-pro'], '/login?plan=pro');
});

test('nav_click utilise nav_id + nav_type, pas cta_id', () => {
  const events = eventsFromClick({
    dataAttr: 'footer-link-faq',
    dataTrack: 'nav',
    dataZone: 'footer',
    dataLevel: 'tertiary',
    href: '/faq',
    text: 'FAQ',
    pageHost: 'job.axelproject.fr',
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'nav_click');
  assert.equal(events[0].params.nav_id, 'footer-link-faq');
  assert.equal(events[0].params.nav_type, 'footer');
  assert.equal(events[0].params.link_url, '/faq');
  assert.equal('cta_id' in events[0].params, false);
});

test('data-track=input : aucun event (jamais la valeur du champ)', () => {
  const events = eventsFromClick({
    dataAttr: 'login-input-email',
    dataTrack: 'input',
    dataZone: 'login',
    dataLevel: 'tertiary',
    href: '',
    text: 'user@example.com',
    pageHost: 'job.axelproject.fr',
  });
  assert.deepEqual(events, []);
});

test('h2 FAQ sans data-track : pas de nav_click', () => {
  const events = eventsFromClick({
    dataAttr: 'faq-question-cv-bonnes-competences',
    dataTrack: '',
    dataZone: 'faq',
    dataLevel: 'tertiary',
    href: '',
    text: 'Pourquoi mon CV ne passe pas',
    pageHost: 'job.axelproject.fr',
  });
  assert.deepEqual(events, []);
});

test('cta sans zone/level : pas d’event unknown', () => {
  const events = eventsFromClick({
    dataAttr: 'home-hero-cta-signup',
    dataTrack: 'cta',
    dataZone: '',
    dataLevel: '',
    href: '/login',
    text: 'Essayer',
    pageHost: 'job.axelproject.fr',
  });
  assert.deepEqual(events, []);
});

test('mailto → contact_click method email + nav si track=nav', () => {
  const events = eventsFromClick({
    dataAttr: 'footer-link-support',
    dataTrack: 'nav',
    dataZone: 'footer',
    dataLevel: 'tertiary',
    href: 'mailto:contact@example.com',
    text: 'Support',
    pageHost: 'job.axelproject.fr',
  });
  assert.deepEqual(
    events.map((e) => e.name),
    ['nav_click', 'contact_click'],
  );
  assert.equal(events[0].params.link_url, 'mailto:');
  assert.equal(events[1].params.method, 'email');
  assert.equal(JSON.stringify(events).includes('contact@example.com'), false);
});

test('lien externe → outbound_click', () => {
  const events = eventsFromClick({
    dataAttr: 'footer-link-axelproject',
    dataTrack: 'nav',
    dataZone: 'footer',
    dataLevel: 'tertiary',
    href: 'https://axelproject.fr/',
    text: 'Axel Project',
    pageHost: 'job.axelproject.fr',
  });
  assert.deepEqual(
    events.map((e) => e.name),
    ['nav_click', 'outbound_click'],
  );
  assert.equal(events[1].params.link_domain, 'axelproject.fr');
  assert.equal(events[1].params.link_url, 'https://axelproject.fr/');
});

test('sanitizeCtaText retire les emails et tronque', () => {
  assert.equal(sanitizeCtaText('  Bonjour  user@example.com  '), 'Bonjour');
  assert.equal(sanitizeCtaText('x'.repeat(100)).length, 80);
});

test('consentement analytics : seulement v1 + analytics true', () => {
  assert.equal(hasAnalyticsConsent(null), false);
  assert.equal(hasAnalyticsConsent('{"v":1,"analytics":false}'), false);
  assert.equal(hasAnalyticsConsent('{"v":1,"analytics":true}'), true);
  assert.equal(hasAnalyticsConsent('{'), false);
});

test('hors /app', () => {
  assert.equal(isMarketingPath('/'), true);
  assert.equal(isMarketingPath('/login'), true);
  assert.equal(isMarketingPath('/faq'), true);
  assert.equal(isMarketingPath('/app'), false);
  assert.equal(isMarketingPath('/app/postule'), false);
});

test('track.js chargé après la CMP sur index + pages publiques', async () => {
  const index = await readFile(path.join(FRONTEND_ROOT, 'index.html'), 'utf8');
  assert.ok(index.includes('src="/consent-gtm.js"'));
  assert.ok(index.includes('src="/track.js"'));
  assert.ok(index.indexOf('consent-gtm.js') < index.indexOf('track.js'));

  const htmlFiles = [
    'faq.html',
    'ats.html',
    'login.html',
    '404.html',
    '500.html',
    'home.html',
    'modeles-cv.html',
    'guide-cv.html',
    'erreurs-cv.html',
    'cv-par-metier.html',
    'cv-adapte-chaque-offre.html',
    'mentions-legales.html',
    'confidentialite.html',
    'cgu.html',
  ];
  for (const file of htmlFiles) {
    const html = await readFile(path.join(FRONTEND_ROOT, 'public', file), 'utf8');
    assert.ok(html.includes('src="/track.js"'), `${file} charge track.js`);
  }

  const consent = await readFile(path.join(FRONTEND_ROOT, 'public', 'consent-gtm.js'), 'utf8');
  assert.ok(consent.includes("CustomEvent('axel_consent_update'"));
});
