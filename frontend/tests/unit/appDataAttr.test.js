import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** C.10–C.16 figés AXE-395, posés AXE-396. */
const FROZEN_IDS = [
  'app-nav-link-cv',
  'app-nav-link-candidatures',
  'app-nav-link-profil',
  'app-nav-link-settings',
  'app-nav-link-support',
  'app-nav-link-monitoring',
  'app-nav-cta-upgrade',
  'app-nav-cta-pro',
  'app-nav-cta-account',
  'app-nav-cta-cookies',
  'app-nav-cta-signout',
  'app-nav-input-promo',
  'onboarding-methods-cta-import',
  'onboarding-methods-cta-manual',
  'onboarding-paste-input-text',
  'onboarding-paste-cta-parse',
  'onboarding-review-cta-confirm',
  'onboarding-done-cta-launch',
  'onboarding-done-cta-profil',
  'onboarding-cta-skip',
  'cv-header-cta-new',
  'cv-banner-cta-upgrade',
  'cv-chat-input-offer',
  'cv-chat-cta-send',
  'cv-todo-cta-run',
  'cv-preview-cta-base-pdf',
  'cv-export-cta-pdf',
  'cv-export-cta-dossier',
  'cv-export-cta-ats',
  'cv-nudge-cta-go',
  'cv-nudge-cta-dismiss',
  'profil-header-cta-import',
  'profil-header-cta-save',
  'profil-footer-cta-save',
  'profil-preview-cta-pdf',
  'profil-billing-cta-cancel',
  'profil-billing-cta-portal',
  'settings-account-cta-password',
  'settings-account-cta-upgrade',
  'settings-account-cta-billing',
  'settings-export-cta-save',
  'settings-privacy-cta-cookies',
  'support-topic-adapter-cv',
  'support-topic-exporter-pdf',
  'support-topic-suivre-candidatures',
  'support-topic-modifier-texte-cv',
  'support-topic-personnaliser-couleurs',
  'support-ticket-cta-submit',
  'monitoring-header-cta-refresh',
];

const SUPPORT_TOPIC_IDS = [
  'adapter-cv',
  'exporter-pdf',
  'suivre-candidatures',
  'modifier-texte-cv',
  'personnaliser-couleurs',
];

const SOURCE_FILES = [
  'src/components/AppTopbar.jsx',
  'src/components/TopbarPartnerCode.jsx',
  'src/components/OnboardingWizard.jsx',
  'src/App.jsx',
  'src/components/ProfileView.jsx',
  'src/components/SettingsView.jsx',
  'src/components/MonitoringDashboard.jsx',
];

function idsFromSource(text) {
  const fromHelper = [...text.matchAll(/analyticsAttrs\('([a-z0-9-]+)'/g)].map((m) => m[1]);
  const fromAttr = [...text.matchAll(/\bdata-attr="([a-z0-9-]+)"/g)].map((m) => m[1]);
  return [...fromHelper, ...fromAttr];
}

test('AXE-396 : 49 data-attr C.10–C.16 posés une fois via analyticsAttrs', async () => {
  assert.equal(FROZEN_IDS.length, 49);

  const texts = {};
  for (const rel of SOURCE_FILES) {
    texts[rel] = await readFile(path.join(FRONTEND_ROOT, rel), 'utf8');
  }
  const blob = Object.values(texts).join('\n');
  const collected = Object.values(texts).flatMap(idsFromSource);

  assert.ok(
    texts['src/App.jsx'].includes("analyticsAttrs(`support-topic-${topic.id}`"),
    'support topics : template analyticsAttrs',
  );
  for (const topicId of SUPPORT_TOPIC_IDS) {
    assert.ok(
      texts['src/App.jsx'].includes(`id: '${topicId}'`),
      `SUPPORT_TOPICS id ${topicId}`,
    );
    collected.push(`support-topic-${topicId}`);
  }

  const counts = Object.create(null);
  for (const id of collected) {
    counts[id] = (counts[id] || 0) + 1;
  }

  for (const id of FROZEN_IDS) {
    const n = counts[id] || 0;
    if (id === 'profil-billing-cta-portal') {
      assert.ok(n >= 1 && n <= 2, `${id} attendu 1–2 (états Stripe), got ${n}`);
      continue;
    }
    assert.equal(n, 1, `${id} attendu 1 fois, got ${n}`);
  }

  for (const id of FROZEN_IDS) {
    assert.equal(blob.includes(`[data-attr="${id}"]`), false, `pas de sélecteur CSS pour ${id}`);
  }
});
