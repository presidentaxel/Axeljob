/**
 * Refuse les hex dans frontend/src CSS.
 *
 * Exception permanente : styles/ds-tokens.generated.css (sortie de tokens.json).
 * Allowlist transitoire : scripts/css-hex-allowlist.json (vidée par AXE-355).
 *
 * Usage: node scripts/lint-css-hex.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const SRC_ROOT = join(FRONTEND_ROOT, 'src');
const ALLOWLIST_PATH = join(__dirname, 'css-hex-allowlist.json');

export const GENERATED_TOKENS_CSS = 'styles/ds-tokens.generated.css';

/** #rgb #rgba #rrggbb #rrggbbaa — attrape aussi var(--token, #hex). */
export const CSS_HEX_RE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

export function findHexMatches(cssText) {
  return [...cssText.matchAll(CSS_HEX_RE)].map((m) => m[0]);
}

export function loadAllowlist(jsonText) {
  const data = JSON.parse(jsonText);
  if (!Array.isArray(data.files)) {
    throw new Error('css-hex-allowlist.json: missing "files" array');
  }
  return data.files;
}

export async function listCssFiles(dir = SRC_ROOT) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listCssFiles(full));
    } else if (entry.name.endsWith('.css')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * @returns {{
 *   offenders: { file: string, matches: string[] }[],
 *   cleanAllowlist: string[],
 *   missingAllowlist: string[],
 *   generatedOnAllowlist: boolean,
 * }}
 */
export function evaluateHexLint({ files, allowlist, generatedRel = GENERATED_TOKENS_CSS }) {
  const allow = new Set(allowlist);
  const present = new Set(files.map((f) => f.rel));
  const offenders = [];
  const cleanAllowlist = [];

  for (const { rel, text } of files) {
    if (rel === generatedRel) {
      continue;
    }
    const matches = findHexMatches(text);
    if (allow.has(rel)) {
      if (matches.length === 0) {
        cleanAllowlist.push(rel);
      }
      continue;
    }
    if (matches.length > 0) {
      offenders.push({ file: rel, matches: [...new Set(matches)] });
    }
  }

  const missingAllowlist = allowlist.filter(
    (rel) => rel !== generatedRel && !present.has(rel),
  );

  return {
    offenders,
    cleanAllowlist,
    missingAllowlist,
    generatedOnAllowlist: allow.has(generatedRel),
  };
}

async function main() {
  const allowlist = loadAllowlist(await readFile(ALLOWLIST_PATH, 'utf8'));
  const cssPaths = await listCssFiles();
  const files = [];
  for (const full of cssPaths) {
    const rel = relative(SRC_ROOT, full).split('\\').join('/');
    files.push({ rel, text: await readFile(full, 'utf8') });
  }

  const { offenders, cleanAllowlist, missingAllowlist, generatedOnAllowlist } = evaluateHexLint({
    files,
    allowlist,
  });

  const errors = [];
  if (generatedOnAllowlist) {
    errors.push(
      `${GENERATED_TOKENS_CSS} est une exception permanente — le retirer de css-hex-allowlist.json`,
    );
  }
  for (const item of offenders) {
    errors.push(
      `${item.file}: hex interdit (${item.matches.join(', ')}). Ajouter un token sémantique, pas un fallback #hex.`,
    );
  }
  if (cleanAllowlist.length > 0) {
    errors.push(
      `Allowlist périmée (plus de hex, à retirer pour AXE-355) : ${cleanAllowlist.join(', ')}`,
    );
  }
  if (missingAllowlist.length > 0) {
    errors.push(`Allowlist : fichier introuvable : ${missingAllowlist.join(', ')}`);
  }

  if (errors.length > 0) {
    process.stderr.write(`lint-css-hex: ${errors.length} problème(s)\n${errors.join('\n')}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `lint-css-hex: OK (${files.length} css, allowlist ${allowlist.length}, skip ${GENERATED_TOKENS_CSS})\n`,
  );
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  main().catch((err) => {
    process.stderr.write(`${err.stack || err}\n`);
    process.exit(1);
  });
}
