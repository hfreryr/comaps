// Captures d'écran des parcours principaux, pour comparer avant/après un changement (voir README.md du dossier).
// Usage (depuis app/, après npm run build) :  node tests/visual/capture.mjs <dossier de sortie>
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const out = process.argv[2];
if (!out) { console.error('Usage : node tests/visual/capture.mjs <dossier>'); process.exit(1); }
(await import('node:fs')).mkdirSync(out, { recursive: true });
const build = fileURLToPath(new URL('../../build', import.meta.url));
const srv = spawn('python3', ['-m', 'http.server', '4183', '-d', build], { stdio: 'ignore', detached: true });
await new Promise(r=>setTimeout(r,1500));
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '<-loopback>,localhost,127.0.0.1' } } : {};
const b = await chromium.launch({ ...proxy, args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
async function ctx(dark, geo) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: dark ? 'dark' : 'light', geolocation: geo, permissions: ['geolocation'] });
  await c.addInitScript(() => { localStorage.setItem('promesse-vue', '1'); });
  const p = await c.newPage(); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:4183/', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  return { c, p };
}
const shot = async (p, name) => { const s = await p.$('section.sheet'); await (s ? s.screenshot({ path: `${out}/${name}.png` }) : p.screenshot({ path: `${out}/${name}.png` })); };
for (const dark of [false, true]) {
  const t = dark ? 'd' : 'l';
  let { c, p } = await ctx(dark, { latitude: 48.8867, longitude: 2.3431 });
  await p.fill('#search', 'Panthéon'); await p.waitForSelector('.results li.opt button', { timeout: 40000 });
  await p.screenshot({ path: `${out}/${t}-recherche.png` });
  await p.dispatchEvent('.results li.opt button >> nth=0', 'mousedown'); await p.waitForTimeout(3500);
  await shot(p, `${t}-fiche`);
  await p.click('.action.primary'); await p.waitForTimeout(12000);
  await shot(p, `${t}-transport`);
  await p.click('.route-sheet .grip'); await p.waitForTimeout(800); await shot(p, `${t}-transport-plein`);
  await p.click('.mode-tabs .mode-tab >> nth=3'); await p.waitForTimeout(6000); await shot(p, `${t}-voiture`);
  await p.screenshot({ path: `${out}/${t}-ecran-itin.png` });
  await p.click('.mode-tabs .mode-tab >> nth=0'); await p.waitForTimeout(5000); await p.click('.sum-actions .go'); await p.waitForTimeout(3000); await p.screenshot({ path: `${out}/${t}-guidage.png` });
  await c.close();
  ({ c, p } = await ctx(dark, { latitude: 48.8867, longitude: 2.3431 }));
  await p.click('.chip:has-text("Restaurants")'); await p.waitForTimeout(6000);
  await shot(p, `${t}-categorie`);
  await p.click('.nearby li button >> nth=0').catch(()=>{}); await p.waitForTimeout(3000);
  await shot(p, `${t}-fiche-resto`);
  await c.close();
}
// Grand écran : fiche lieu puis itinéraire
{
  const c = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', geolocation: { latitude: 48.8867, longitude: 2.3431 }, permissions: ['geolocation'] });
  await c.addInitScript(() => { localStorage.setItem('promesse-vue', '1'); });
  const p = await c.newPage();
  await p.goto('http://localhost:4183/', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  await p.fill('#search', 'Panthéon'); await p.waitForSelector('.results li.opt button', { timeout: 40000 });
  await p.dispatchEvent('.results li.opt button >> nth=0', 'mousedown'); await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/ordi-fiche.png` });
  await p.click('.action.primary'); await p.waitForTimeout(10000);
  await p.screenshot({ path: `${out}/ordi-itineraire.png` });
  await c.close();
}
await b.close(); try { process.kill(-srv.pid); } catch {}
console.log('ok');
