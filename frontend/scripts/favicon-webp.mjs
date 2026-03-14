/**
 * Génère favicon.webp à partir de favicon.svg (optionnel : og:image, fallback).
 * Usage : npm run build:favicon-webp
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'favicon.svg');
const outPath = join(root, 'public', 'favicon.webp');
const size = 256; // 256px pour 2x (affichage typique ~128px)

const svg = readFileSync(svgPath);
const buffer = await sharp(svg)
  .resize(size, size)
  .webp({ quality: 90 })
  .toBuffer();
writeFileSync(outPath, buffer);
console.log(`Écrit: public/favicon.webp (${(buffer.length / 1024).toFixed(1)} KiB)`);
