/**
 * Génère les assets brand depuis public/favicon.svg :
 * - axel_og_image.png (1200×630, Open Graph / WhatsApp / etc.)
 * - favicon-48.png (Google recommande ≥48px ; certains crawlers ignorent le SVG seul)
 * - apple-touch-icon.png (180×180)
 *
 * Usage : npm run build:brand-assets
 * Appelé automatiquement avant vite build.
 */
import { readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'favicon.svg');
const svg = readFileSync(svgPath);

const OG_W = 1200;
const OG_H = 630;
const LOGO_PX = 220;

async function writeOgImage() {
  const bgSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4f46e5"/>
          <stop offset="55%" stop-color="#4338ca"/>
          <stop offset="100%" stop-color="#1e1b4b"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <text x="400" y="278" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="64" font-weight="800" fill="#ffffff">AxeL Job</text>
      <text x="400" y="348" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="28" fill="rgba(255,255,255,.9)">CV adapté à chaque offre · IA &amp; ATS</text>
    </svg>`
  );

  const logoPng = await sharp(svg).resize(LOGO_PX, LOGO_PX).png().toBuffer();
  const top = Math.round((OG_H - LOGO_PX) / 2);
  const outPath = join(root, 'public', 'axel_og_image.png');

  await sharp(bgSvg)
    .composite([{ input: logoPng, left: 96, top }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const kb = (statSync(outPath).size / 1024).toFixed(1);
  console.log(`Écrit: public/axel_og_image.png (${kb} KiB)`);
}

async function writeFavicon48() {
  const outPath = join(root, 'public', 'favicon-48.png');
  await sharp(svg).resize(48, 48).png({ compressionLevel: 9 }).toFile(outPath);
  console.log('Écrit: public/favicon-48.png');
}

async function writeAppleTouch() {
  const outPath = join(root, 'public', 'apple-touch-icon.png');
  await sharp(svg).resize(180, 180).png({ compressionLevel: 9 }).toFile(outPath);
  console.log('Écrit: public/apple-touch-icon.png');
}

await writeOgImage();
await writeFavicon48();
await writeAppleTouch();
