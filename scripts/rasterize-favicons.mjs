/**
 * Rasterize public/app-logo.svg to PNG favicons (same mark as loading screen).
 * Run after: python scripts/build_app_logo.py
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'app-logo.svg');
const svg = readFileSync(svgPath);

const targets = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['favicon-48.png', 48],
  ['apple-touch-icon.png', 180],
];

for (const [filename, size] of targets) {
  await sharp(svg, { density: 400 })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(join(root, 'public', filename));
  console.log('Wrote public/' + filename);
}
