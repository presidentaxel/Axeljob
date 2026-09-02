/**
 * AXE-404 : landing et pages contenu n’utilisent plus le markup
 * `button button-primary|secondary` — uniquement <Button> / <Button as={Link}>.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = path.join(FRONTEND_ROOT, 'src');

const LEGACY_BUTTON_CLASS_RE =
  /(?:className|class)\s*=\s*(?:["'`][^"'`]*|\{\s*["'`][^"'`]*)\b(?:button|btn)-(?:primary|secondary|tertiary|ghost|success)\b/;

const FILES = [
  'components/LandingPage.jsx',
  'components/FaqPage.jsx',
  'components/AtsPage.jsx',
  'components/ArticlesPages.jsx',
];

const CONTENT_PAGES = [
  'components/FaqPage.jsx',
  'components/AtsPage.jsx',
  'components/ArticlesPages.jsx',
];

function lineHasLegacyButtonClass(line) {
  return LEGACY_BUTTON_CLASS_RE.test(line);
}

test('Landing, FAQ, ATS et Articles n’ont plus de className button-*', async () => {
  const offenders = [];
  for (const rel of FILES) {
    const text = await readFile(path.join(SRC, rel), 'utf8');
    text.split('\n').forEach((line, idx) => {
      if (lineHasLegacyButtonClass(line)) {
        offenders.push(`${rel}:${idx + 1}:${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('Les 4 fichiers importent Button', async () => {
  for (const rel of FILES) {
    const text = await readFile(path.join(SRC, rel), 'utf8');
    assert.match(text, /import Button from '\.\/ui\/Button\.jsx'/, rel);
  }
});

test('FAQ, ATS et Articles rendent le CTA via Button as={Link}', async () => {
  for (const rel of CONTENT_PAGES) {
    const text = await readFile(path.join(SRC, rel), 'utf8');
    assert.match(text, /<Button as=\{Link\} to="\/login"/, rel);
    assert.doesNotMatch(text, /className="button button-primary/, rel);
    assert.doesNotMatch(text, /<Link to="\/login" className="button/, rel);
  }
});

test('Landing conserve type="button", goLogin et les data-attr CTA', async () => {
  const text = await readFile(path.join(SRC, 'components/LandingPage.jsx'), 'utf8');
  assert.match(text, /variant="primary"/);
  assert.match(text, /variant="secondary"/);
  assert.match(text, /className="landing-cta-nav"/);
  assert.match(text, /className="landing-mobile-cta"/);
  assert.match(text, /className="landing-cta-hero"/);
  assert.match(text, /className="pricing-cta"/);
  assert.match(text, /goLogin\('nav-cta-signup'/);
  assert.match(text, /goLogin\('nav-cta-start'/);
  assert.match(text, /goLogin\('nav-cta-drawer'/);
  assert.match(text, /goLogin\('home-hero-cta-signup'/);
  assert.match(text, /goLogin\('home-pricing-cta-free'/);
  assert.match(text, /goLogin\('home-pricing-cta-pro'/);
  assert.match(text, /goLogin\('home-final-cta-signup'/);
  assert.match(text, /analyticsAttrs\('nav-cta-signup', 'header', 'primary', 'cta'\)/);
  assert.match(text, /analyticsAttrs\('home-hero-cta-signup', 'hero', 'primary', 'cta'\)/);
  assert.doesNotMatch(text, /className="button button-primary/);
  assert.doesNotMatch(text, /className="button button-secondary/);
});

test('FAQ / ATS conservent persistLoginCta et analyticsAttrs', async () => {
  const faq = await readFile(path.join(SRC, 'components/FaqPage.jsx'), 'utf8');
  const ats = await readFile(path.join(SRC, 'components/AtsPage.jsx'), 'utf8');
  const articles = await readFile(path.join(SRC, 'components/ArticlesPages.jsx'), 'utf8');
  assert.match(faq, /persistLoginCta\('faq-cta-signup'\)/);
  assert.match(faq, /analyticsAttrs\('faq-cta-signup', 'content', 'primary', 'cta'\)/);
  assert.match(ats, /persistLoginCta\('ats-cta-signup'\)/);
  assert.match(ats, /analyticsAttrs\('ats-cta-signup', 'content', 'primary', 'cta'\)/);
  assert.match(articles, /persistLoginCta\(signupId\)/);
  assert.match(articles, /analyticsAttrs\(signupId, 'content', 'primary', 'cta'\)/);
});
