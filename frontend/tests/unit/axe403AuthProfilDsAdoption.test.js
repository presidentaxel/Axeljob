/**
 * AXE-403 : auth / onboarding / profil n’utilisent plus le markup
 * `button button-primary` — uniquement <Button> / <Input>.
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
  'components/AuthForm.jsx',
  'components/ReauthModal.jsx',
  'components/OnboardingWizard.jsx',
  'components/ProfileView.jsx',
];

function lineHasLegacyButtonClass(line) {
  return LEGACY_BUTTON_CLASS_RE.test(line);
}

test('AuthForm, Reauth, Onboarding et Profil n’ont plus de className button-*', async () => {
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

test('AuthForm / Reauth / Profil importent Input pour les champs texte', async () => {
  const auth = await readFile(path.join(SRC, 'components/AuthForm.jsx'), 'utf8');
  const reauth = await readFile(path.join(SRC, 'components/ReauthModal.jsx'), 'utf8');
  const profile = await readFile(path.join(SRC, 'components/ProfileView.jsx'), 'utf8');
  const app = await readFile(path.join(SRC, 'App.jsx'), 'utf8');
  assert.match(auth, /import Input from '\.\/ui\/Input\.jsx'/);
  assert.match(reauth, /import Input from '\.\/ui\/Input\.jsx'/);
  assert.match(profile, /import Input from '\.\/ui\/Input\.jsx'/);
  assert.match(app, /import Input from '\.\/components\/ui\/Input\.jsx'/);
  assert.match(auth, /<Input\s+type="email"/);
  assert.match(auth, /<Input\s+type="password"/);
  assert.match(profile, /<Input type="text"/);
  assert.doesNotMatch(app, /className="button button-primary auth-submit"/);
});

test('Recovery et Reauth exposent invalid + ds-field-error', async () => {
  const app = await readFile(path.join(SRC, 'App.jsx'), 'utf8');
  const reauth = await readFile(path.join(SRC, 'components/ReauthModal.jsx'), 'utf8');
  assert.match(app, /invalid=\{invalidField === 'password'\}/);
  assert.match(app, /invalid=\{invalidField === 'confirm'\}/);
  assert.match(app, /className="ds-field-error"/);
  assert.match(reauth, /invalid=\{Boolean\(error\)\}/);
  assert.match(reauth, /className="ds-field-error"/);
});

test('OnboardingWizard importe Button et n’a plus de markup button-primary', async () => {
  const text = await readFile(path.join(SRC, 'components/OnboardingWizard.jsx'), 'utf8');
  assert.match(text, /import Button from '\.\/ui\/Button\.jsx'/);
  assert.match(text, /variant="primary"/);
  assert.match(text, /variant="link"/);
  assert.doesNotMatch(text, /className="button button-primary/);
});
