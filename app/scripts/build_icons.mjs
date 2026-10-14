// Génère les images PNG de l'icône à partir de static/icon.svg et static/icon-maskable.svg.
// Usage (depuis app/) : node scripts/build_icons.mjs
// Tailles : 512 et 192 (installation Android et ordinateur), maskable 512 (Android), 180 (iPhone), 32 (onglet).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const dir = new URL('../static/', import.meta.url).pathname;
const jobs = [['icon.svg', 'icon-512.png', 512], ['icon.svg', 'icon-192.png', 192], ['icon.svg', 'apple-touch-icon.png', 180],
  ['icon.svg', 'favicon-32.png', 32], ['icon-maskable.svg', 'icon-maskable-512.png', 512]];
const b = await chromium.launch();
for (const [src, out, size] of jobs) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const svg = readFileSync(dir + src, 'utf8').replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
  await p.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await p.screenshot({ path: dir + out, clip: { x: 0, y: 0, width: size, height: size } });
  await p.close();
  console.log(out, size);
}
await b.close();
