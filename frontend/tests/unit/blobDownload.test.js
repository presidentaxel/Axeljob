/**
 * Tests unitaires — téléchargement PDF / blobs (régression about:blank Safari).
 * Exécution : npm run test:unit
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  closePreopenedDownloadWindow,
  ensureBlobForDownload,
  isLikelyApplePlatform,
  isPreopenedWindowStillBlank,
  isSafariBrowser,
  prepareAppleDownloadWindow,
  saveBlobWithPreferredMethod,
  shouldPreopenAppleDownloadTab,
  triggerBlobDownload,
} from '../../src/lib/blobDownload.js';

const saved = {};
let globalsMocked = false;

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function stashGlobals() {
  saved.window = globalThis.window;
  saved.navigator = globalThis.navigator;
  saved.document = globalThis.document;
  globalsMocked = true;
}

function restoreGlobals() {
  if (!globalsMocked) return;
  defineGlobal('navigator', saved.navigator);
  defineGlobal('window', saved.window);
  defineGlobal('document', saved.document);
  globalsMocked = false;
}

function setNavigator({ ua, platform = '', uaDataPlatform = '' }) {
  defineGlobal('navigator', {
    userAgent: ua,
    platform,
    userAgentData: uaDataPlatform ? { platform: uaDataPlatform } : undefined,
  });
}

function installWindowMock(overrides = {}) {
  const openCalls = [];
  const timeouts = [];

  defineGlobal('window', {
    open: (...args) => {
      openCalls.push(args);
      return overrides.openResult ?? null;
    },
    setTimeout: (fn, ms) => {
      timeouts.push({ fn, ms });
      return timeouts.length;
    },
    showSaveFilePicker: overrides.showSaveFilePicker,
    ...overrides.windowExtras,
  });

  return { openCalls, timeouts, flushTimeouts: () => timeouts.forEach((t) => t.fn()) };
}

function installDocumentMock() {
  const anchorClicks = [];
  defineGlobal('document', {
    body: {
      appendChild(el) {
        return el;
      },
    },
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        href: '',
        download: '',
        rel: '',
        style: {},
        click() {
          anchorClicks.push(el);
        },
        remove() {},
      };
      return el;
    },
  });
  return anchorClicks;
}

afterEach(() => {
  restoreGlobals();
});

test('ensureBlobForDownload rejette un blob vide', () => {
  assert.throws(
    () => ensureBlobForDownload(new Blob([]), 'cv.pdf'),
    /vide/i,
  );
});

test('ensureBlobForDownload normalise le type PDF', () => {
  const raw = new Blob(['%PDF'], { type: 'application/octet-stream' });
  const out = ensureBlobForDownload(raw, 'CV-test.pdf');
  assert.equal(out.type, 'application/pdf');
  assert.ok(out.size > 0);
});

test('isSafariBrowser distingue Safari de Chrome sur Mac', () => {
  stashGlobals();
  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    platform: 'MacIntel',
  });
  assert.equal(isSafariBrowser(), true);
  assert.equal(isLikelyApplePlatform(), true);

  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    platform: 'MacIntel',
  });
  assert.equal(isSafariBrowser(), false);
  assert.equal(isLikelyApplePlatform(), true);
});

test('shouldPreopenAppleDownloadTab: Safari oui, Chrome Mac avec picker non', () => {
  stashGlobals();

  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    platform: 'MacIntel',
  });
  installWindowMock();
  assert.equal(shouldPreopenAppleDownloadTab(), true);

  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    platform: 'MacIntel',
  });
  defineGlobal('window', { ...globalThis.window, showSaveFilePicker: async () => ({}) });
  assert.equal(shouldPreopenAppleDownloadTab(), false);

  setNavigator({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' });
  assert.equal(shouldPreopenAppleDownloadTab(), false);
});

test('prepareAppleDownloadWindow: pas de noopener (régression about:blank)', () => {
  stashGlobals();
  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    platform: 'MacIntel',
  });

  const fakeWin = {
    closed: false,
    document: { title: '' },
    location: { href: 'about:blank' },
    close() {
      this.closed = true;
    },
  };
  const { openCalls } = installWindowMock({ openResult: fakeWin });

  const w = prepareAppleDownloadWindow();
  assert.equal(w, fakeWin);
  assert.equal(openCalls.length, 1);
  assert.equal(openCalls[0][0], 'about:blank');
  assert.equal(openCalls[0][1], '_blank');
  const features = openCalls[0][2] || '';
  assert.ok(!/noopener/i.test(features), `noopener interdit, reçu: ${features}`);
  assert.match(features, /noreferrer/);
});

test('prepareAppleDownloadWindow retourne null si showSaveFilePicker disponible', () => {
  stashGlobals();
  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120 Safari/537.36',
    platform: 'MacIntel',
  });
  const { openCalls } = installWindowMock();
  defineGlobal('window', { showSaveFilePicker: async () => ({}) });

  assert.equal(prepareAppleDownloadWindow(), null);
  assert.equal(openCalls.length, 0);
});

test('isPreopenedWindowStillBlank détecte about:blank', () => {
  assert.equal(isPreopenedWindowStillBlank({ location: { href: 'about:blank' } }), true);
  assert.equal(isPreopenedWindowStillBlank({ location: { href: 'blob:https://x/y' } }), false);
  assert.equal(isPreopenedWindowStillBlank({ location: { href: '' } }), true);
});

test('closePreopenedDownloadWindow ferme un onglet ouvert', () => {
  let closed = false;
  closePreopenedDownloadWindow({
    closed: false,
    close() {
      closed = true;
      this.closed = true;
    },
  });
  assert.equal(closed, true);
});

test('triggerBlobDownload sur desktop Windows utilise un lien <a download>', () => {
  stashGlobals();
  setNavigator({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' });
  installWindowMock();
  const clicks = installDocumentMock();

  triggerBlobDownload(new Blob(['%PDF'], { type: 'application/pdf' }), 'cv.pdf');
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].download, 'cv.pdf');
  assert.match(clicks[0].href, /^blob:/);
});

test('triggerBlobDownload Safari: navigation vers blob URL sur onglet pré-ouvert', () => {
  stashGlobals();
  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    platform: 'MacIntel',
  });
  const { timeouts } = installWindowMock();
  installDocumentMock();

  const pre = {
    closed: false,
    location: { href: 'about:blank' },
    close() {
      this.closed = true;
    },
  };

  triggerBlobDownload(new Blob(['%PDF'], { type: 'application/pdf' }), 'cv.pdf', {
    preopenedWindow: pre,
  });

  assert.match(pre.location.href, /^blob:/);
  const blankCheck = timeouts.find((t) => t.ms === 500);
  assert.ok(blankCheck, 'timeout de repli about:blank attendu');
});

test('triggerBlobDownload Safari: repli anchor si navigation impossible', () => {
  stashGlobals();
  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    platform: 'MacIntel',
  });
  installWindowMock();
  const clicks = installDocumentMock();

  const location = { href: 'about:blank' };
  Object.defineProperty(location, 'href', {
    get() {
      return 'about:blank';
    },
    set() {
      throw new Error('blocked');
    },
    configurable: true,
  });
  const pre = {
    closed: false,
    location,
    close() {
      this.closed = true;
    },
  };

  triggerBlobDownload(new Blob(['x'], { type: 'application/pdf' }), 'cv.pdf', {
    preopenedWindow: pre,
  });

  assert.equal(pre.closed, true);
  assert.equal(clicks.length, 1);
});

test('triggerBlobDownload Safari: repli si onglet reste about:blank après délai', () => {
  stashGlobals();
  setNavigator({
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    platform: 'MacIntel',
  });
  const { flushTimeouts } = installWindowMock();
  const clicks = installDocumentMock();

  const pre = {
    closed: false,
    location: { href: 'about:blank' },
    close() {
      this.closed = true;
    },
  };

  triggerBlobDownload(new Blob(['%PDF'], { type: 'application/pdf' }), 'cv.pdf', {
    preopenedWindow: pre,
  });
  pre.location.href = 'about:blank';
  flushTimeouts();

  assert.equal(pre.closed, true);
  assert.equal(clicks.length, 1);
});

test('saveBlobWithPreferredMethod: picker natif et fermeture onglet pré-ouvert', async () => {
  stashGlobals();
  setNavigator({ ua: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' });

  let written = null;
  let pickerClosed = false;
  const pre = {
    closed: false,
    close() {
      pickerClosed = true;
      this.closed = true;
    },
  };

  defineGlobal('window', {
    showSaveFilePicker: async () => ({
      createWritable: async () => ({
        write: async (data) => {
          written = data;
        },
        close: async () => {},
      }),
    }),
  });

  await saveBlobWithPreferredMethod(
    new Blob(['%PDF'], { type: 'application/pdf' }),
    'cv.pdf',
    { preopenedWindow: pre },
  );

  assert.ok(written);
  assert.equal(pickerClosed, true);
});

test('saveBlobWithPreferredMethod: AbortError ferme l’onglet pré-ouvert', async () => {
  stashGlobals();
  setNavigator({ ua: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' });

  let closed = false;
  const pre = {
    closed: false,
    close() {
      closed = true;
      this.closed = true;
    },
  };

  defineGlobal('window', {
    showSaveFilePicker: async () => {
      const err = new Error('abort');
      err.name = 'AbortError';
      throw err;
    },
  });

  await saveBlobWithPreferredMethod(new Blob(['x'], { type: 'application/pdf' }), 'cv.pdf', {
    preopenedWindow: pre,
  });

  assert.equal(closed, true);
});
