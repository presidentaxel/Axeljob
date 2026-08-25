import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** IDs home-* + nav-* posés en miroir React / HTML (AXE-359). */
const SHARED_IDS = [
  'nav-link-how',
  'nav-link-pricing',
  'nav-link-features',
  'nav-link-ats',
  'nav-link-faq',
  'nav-link-modeles',
  'nav-link-guide',
  'nav-cta-signup',
  'nav-cta-start',
  'home-hero-title',
  'home-hero-cta-signup',
  'home-pricing-card-free',
  'home-pricing-cta-free',
  'home-pricing-card-pro',
  'home-pricing-badge-popular',
  'home-pricing-cta-pro',
  'home-why-link-ats',
  'home-final-cta-signup',
];

/** Burger + CTA drawer : markup React only (HTML statique sans menu JS). */
const REACT_ONLY_IDS = ['nav-burger', 'nav-cta-drawer'];

const SECTIONS = ['hero', 'how', 'pricing', 'features', 'why', 'final'];

function unique(ids) {
  const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
  return dups;
}

function idsFromHtml(text) {
  return [...text.matchAll(/\bdata-attr="([a-z0-9-]+)"/g)].map((m) => m[1]);
}

function idsFromJsx(text) {
  return [...text.matchAll(/analyticsAttrs\('([a-z0-9-]+)'/g)].map((m) => m[1]);
}

function sectionsFrom(text) {
  return [...text.matchAll(/\bdata-section="([a-z-]+)"/g)].map((m) => m[1]);
}

test('landing React et HTML statique portent les data-attr AXE-359 en miroir', async () => {
  const jsx = await readFile(path.join(FRONTEND_ROOT, 'src/components/LandingPage.jsx'), 'utf8');
  const html = await readFile(path.join(FRONTEND_ROOT, 'index.html'), 'utf8');
  const css = await readFile(path.join(FRONTEND_ROOT, 'src/components/LandingPage.css'), 'utf8');

  const jsxIds = idsFromJsx(jsx);
  const htmlIds = idsFromHtml(html);

  assert.deepEqual(unique(jsxIds), [], `doublons React: ${unique(jsxIds)}`);
  assert.deepEqual(unique(htmlIds), [], `doublons HTML: ${unique(htmlIds)}`);

  for (const id of SHARED_IDS) {
    assert.ok(jsxIds.includes(id), `manque React: ${id}`);
    assert.ok(htmlIds.includes(id), `manque HTML: ${id}`);
  }
  for (const id of REACT_ONLY_IDS) {
    assert.ok(jsxIds.includes(id), `manque React: ${id}`);
    assert.equal(htmlIds.includes(id), false, `ID React-only présent dans HTML: ${id}`);
  }

  assert.equal(jsxIds.includes('nav-logo'), false);
  assert.equal(jsxIds.includes('nav-link-back'), false);
  assert.ok(!jsxIds.some((id) => id.startsWith('footer-')), 'footer hors AXE-359');

  for (const section of SECTIONS) {
    assert.ok(sectionsFrom(jsx).includes(section), `data-section React: ${section}`);
    assert.ok(sectionsFrom(html).includes(section), `data-section HTML: ${section}`);
  }

  assert.equal(css.includes('data-attr'), false, 'pas de data-attr dans le CSS landing');
});
