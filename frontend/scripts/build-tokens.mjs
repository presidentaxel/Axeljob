/**
 * Flatten DTCG-inspired tokens.json → CSS custom properties (--ds-*).
 *
 * Usage: node scripts/build-tokens.mjs
 * Importable for unit tests.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TOKENS_PATH = join(ROOT, 'src/design/tokens.json');
const OUT_PATH = join(ROOT, 'src/styles/ds-tokens.generated.css');

const REF_RE = /^\{([a-z0-9.-]+)\}$/i;

export function loadTokenTree(jsonText) {
  return JSON.parse(jsonText);
}

export function collectLeaves(node, path = []) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  if (Object.prototype.hasOwnProperty.call(node, '$value')) {
    return [{ path, value: node.$value, type: node.$type || null }];
  }
  const leaves = [];
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    leaves.push(...collectLeaves(child, [...path, key]));
  }
  return leaves;
}

function lookup(tree, dottedPath) {
  const parts = dottedPath.split('.');
  let cur = tree;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) {
      throw new Error(`Unknown token reference: {${dottedPath}}`);
    }
    cur = cur[part];
  }
  if (cur == null || typeof cur !== 'object' || !('$value' in cur)) {
    throw new Error(`Token {${dottedPath}} has no $value`);
  }
  return cur.$value;
}

export function resolveValue(tree, raw, seen = []) {
  if (typeof raw !== 'string') return String(raw);
  const match = raw.match(REF_RE);
  if (!match) return raw;
  const ref = match[1];
  if (seen.includes(ref)) {
    throw new Error(`Circular token reference: ${[...seen, ref].join(' → ')}`);
  }
  return resolveValue(tree, lookup(tree, ref), [...seen, ref]);
}

export function cssVarName(path) {
  return `--ds-${path.join('-')}`;
}

export function flattenResolved(tree) {
  return collectLeaves(tree).map((leaf) => ({
    path: leaf.path,
    cssName: cssVarName(leaf.path),
    value: resolveValue(tree, leaf.value),
  }));
}

export function renderCss(entries) {
  const lines = entries.map((entry) => `  ${entry.cssName}: ${entry.value};`);
  return `/**
 * GENERATED — ne pas éditer.
 * Source: src/design/tokens.json
 * Régénérer: npm run tokens
 */
:root {
${lines.join('\n')}
}
`;
}

export function buildTokensCss(jsonText) {
  const tree = loadTokenTree(jsonText);
  const entries = flattenResolved(tree);
  return { css: renderCss(entries), entries };
}

function main() {
  const jsonText = readFileSync(TOKENS_PATH, 'utf8');
  const { css, entries } = buildTokensCss(jsonText);
  writeFileSync(OUT_PATH, css);
  process.stdout.write(`Wrote ${entries.length} tokens → ${OUT_PATH}\n`);
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  main();
}
