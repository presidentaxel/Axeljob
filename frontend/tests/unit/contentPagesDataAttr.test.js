import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

function idsFromHtml(text) {
  return [...text.matchAll(/\bdata-attr="([a-z0-9-]+)"/g)].map((m) => m[1]);
}

function idsFromJsx(text) {
  const fromHelper = [...text.matchAll(/analyticsAttrs\('([a-z0-9-]+)'/g)].map((m) => m[1]);
  const fromTemplate = [...text.matchAll(/analyticsAttrs\(`faq-question-\$\{item\.slug\}`/g)];
  const fromSignupMap = [...text.matchAll(/'([a-z-]+-cta-signup)'/g)].map((m) => m[1]);
  return [...fromHelper, ...(fromTemplate.length ? [
    'faq-question-cv-bonnes-competences',
    'faq-question-format-pdf-problematique',
    'faq-question-adapter-cv-chaque-offre',
    'faq-question-ia-rediger-cv',
    'faq-question-nombre-pages-cv',
    'faq-question-fautes-orthographe',
  ] : []), ...fromSignupMap];
}

function unique(ids) {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

async function readRel(rel) {
  return readFile(path.join(FRONTEND_ROOT, rel), 'utf8');
}

const FAQ_QUESTION_IDS = [
  'faq-question-cv-bonnes-competences',
  'faq-question-format-pdf-problematique',
  'faq-question-adapter-cv-chaque-offre',
  'faq-question-ia-rediger-cv',
  'faq-question-nombre-pages-cv',
  'faq-question-fautes-orthographe',
];

const LOGIN_REACT_IDS = [
  'login-cta-google',
  'login-cta-linkedin',
  'login-cta-submit',
  'login-link-forgot',
  'login-link-toggle',
  'login-input-email',
];

const ARTICLE_PAIRS = [
  ['modeles-cv.html', 'src/components/ArticlesPages.jsx', 'modeles-cta-signup'],
  ['guide-cv.html', 'src/components/ArticlesPages.jsx', 'guide-cta-signup'],
  ['erreurs-cv.html', 'src/components/ArticlesPages.jsx', 'erreurs-cta-signup'],
  ['cv-par-metier.html', 'src/components/ArticlesPages.jsx', 'metier-cta-signup'],
  ['cv-adapte-chaque-offre.html', 'src/components/ArticlesPages.jsx', 'adapte-cta-signup'],
];

test('AXE-360 : FAQ, login, 404 et CTA contenu en miroir, sans doublon par fichier', async () => {
  const faqJsx = await readRel('src/components/FaqPage.jsx');
  const faqHtml = await readRel('public/faq.html');
  const authJsx = await readRel('src/components/AuthForm.jsx');
  const appJsx = await readRel('src/App.jsx');
  const errorJsx = await readRel('src/components/ErrorPages.jsx');
  const errorHtml = await readRel('public/404.html');
  const articlesJsx = await readRel('src/components/ArticlesPages.jsx');
  const atsJsx = await readRel('src/components/AtsPage.jsx');
  const atsHtml = await readRel('public/ats.html');
  const loginHtml = await readRel('public/login.html');

  for (const id of FAQ_QUESTION_IDS) {
    assert.ok(faqHtml.includes(`data-attr="${id}"`), `FAQ HTML: ${id}`);
  }
  assert.ok(faqJsx.includes('faq-question-${item.slug}') || faqJsx.includes('faq-question-'));
  assert.ok(faqJsx.includes("'faq-cta-signup'") || faqJsx.includes('faq-cta-signup'));
  assert.ok(faqHtml.includes('data-attr="faq-cta-signup"'));
  assert.ok(faqHtml.includes('data-section="faq"'));
  assert.ok(faqJsx.includes('data-section="faq"'));

  const authIds = idsFromJsx(authJsx);
  for (const id of LOGIN_REACT_IDS) {
    assert.ok(authIds.includes(id), `AuthForm: ${id}`);
  }
  assert.ok(appJsx.includes("'nav-link-back'"));
  assert.ok(loginHtml.includes('data-attr="nav-link-back"'));
  assert.equal(loginHtml.includes('login-cta-google'), false, 'login HTML statique sans faux boutons OAuth');

  assert.ok(errorJsx.includes("'error-cta-home'"));
  assert.ok(errorJsx.includes("'error-cta-login'"));
  assert.ok(errorJsx.includes("navigate('/login')"));
  assert.equal(errorJsx.includes('navigate(-1)'), false);
  assert.ok(errorHtml.includes('data-attr="error-cta-home"'));
  assert.ok(errorHtml.includes('data-attr="error-cta-login"'));

  assert.ok(atsJsx.includes("'ats-cta-signup'"));
  assert.ok(atsHtml.includes('data-attr="ats-cta-signup"'));

  for (const [htmlFile, , signupId] of ARTICLE_PAIRS) {
    const html = await readRel(`public/${htmlFile}`);
    assert.ok(html.includes(`data-attr="${signupId}"`), `${htmlFile}: ${signupId}`);
    assert.ok(articlesJsx.includes(`'${signupId}'`), `ArticlesPages: ${signupId}`);
    assert.deepEqual(unique(idsFromHtml(html)), [], `doublons ${htmlFile}`);
  }

  for (const rel of ['public/faq.html', 'public/404.html', 'public/ats.html', 'index.html']) {
    const ids = idsFromHtml(await readRel(rel));
    assert.deepEqual(unique(ids), [], `doublons ${rel}: ${unique(ids)}`);
  }

  const authText = authJsx + appJsx;
  assert.equal(/\bdata-attr="[^"]*@/.test(authText), false, 'pas d’email dans data-attr');
});
