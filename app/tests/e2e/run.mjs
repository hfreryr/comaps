// Tests de bout en bout (Playwright + Chromium) sur le site construit (npm run build), servi en local.
// Ils appellent les vrais services (OpenFreeMap, Photon, Géoplateforme, Valhalla, Transitous) : à lancer à la main
// avant une publication, pas en intégration continue.   Usage : npm run e2e
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4199;
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
// on attend que le serveur réponde (au plus 30 s)
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* pas encore prêt */ }
  await new Promise((r) => setTimeout(r, 500));
}
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
const browser = await chromium.launch({ ...proxy, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris',
    geolocation: { latitude: 48.851, longitude: 2.339 }, permissions: ['geolocation'], ...opts });
  await ctx.addInitScript(() => localStorage.setItem('promesse-vue', '1'));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  return { p, ctx, errors };
}
const pick = (p) => p.dispatchEvent('.results li[role=option] button >> nth=0', 'mousedown');

const tests = {
  async 'fiche depuis les tuiles (sans Overpass)'() {
    const { p, ctx, errors } = await page();
    const hosts = new Set(); p.on('request', (r) => hosts.add(new URL(r.url()).host));
    await p.fill('#search', "Ed's rue Muller"); await p.waitForTimeout(4000); await pick(p); await p.waitForTimeout(3000);
    const txt = await p.$eval('.sheet', (e) => e.innerText);
    assert(/Horaires/.test(txt) && /Téléphone/.test(txt), 'horaires et téléphone absents');
    assert(![...hosts].some((h) => /overpass|api\.openstreetmap\.org/.test(h)), 'appel Overpass ou API OSM détecté');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'adresse via Géoplateforme'() {
    const { p, ctx } = await page();
    await p.fill('#search', '57 rue de rennes'); await p.waitForSelector('.results li[role=option]', { timeout: 15000 });
    const first = await p.$eval('.results li[role=option]', (e) => e.innerText);
    assert(/75006/.test(first), `première adresse hors Paris : ${first}`);
    await ctx.close();
  },
  async 'recherche « restaurant ce soir 8e »'() {
    const { p, ctx } = await page();
    await p.fill('#search', 'restaurant ce soir 8e'); await p.waitForTimeout(2500);
    assert(/8e arrondissement/.test(await p.$eval('.results li[role=option]', (e) => e.innerText)), 'suggestion sans le 8e');
    await pick(p); await p.waitForTimeout(6000);
    const kind = await p.$eval('.sheet .kind', (e) => e.textContent);
    assert(/ouverts? (ce soir|maintenant)/.test(kind), `filtre non appliqué : ${kind}`);
    assert((await p.locator('.nearby li').count()) > 3, 'liste vide');
    await ctx.close();
  },
  async 'devantures dans la liste et sur la carte'() {
    const { p, ctx } = await page();
    await p.click('.chip:has-text("Restaurants")'); await p.waitForTimeout(6000);
    assert((await p.locator('.nearby .n-thumb').count()) >= 3, 'moins de 3 vignettes');
    assert((await p.locator('.pin-photo').count()) >= 3, 'moins de 3 pastilles-photo');
    await ctx.close();
  },
  async 'transports : sortie conseillée et trajet à pied recalculé'() {
    const { p, ctx } = await page({ geolocation: { latitude: 48.8867, longitude: 2.3431 } });
    let valhalla = 0; p.on('request', (r) => { if (r.url().includes('valhalla')) valhalla++; });
    await p.fill('#search', 'Panthéon'); await p.waitForTimeout(3500); await pick(p); await p.waitForTimeout(2500);
    await p.click('.action.primary'); await p.waitForTimeout(2000);
    await p.click('.modes .mode >> nth=2'); await p.waitForTimeout(12000);
    assert((await p.locator('.leg').count()) > 2, 'aucun itinéraire en transports');
    // si une sortie est conseillée (métro ou RER), le trajet à pied qui suit a été recalculé depuis cette sortie
    if (await p.locator('.leg-exit').count()) assert(valhalla >= 4, `trajet à pied depuis la sortie non recalculé (${valhalla} appels Valhalla)`);
    await ctx.close();
  },
  async 'la liste se recharge quand on déplace la carte'() {
    const { p, ctx } = await page({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
    await p.click('.chip:has-text("Restaurants")'); await p.waitForTimeout(4000);
    const before = await p.$eval('.nearby .r-name', (e) => e.textContent);
    for (let i = 0; i < 2; i++) { await p.mouse.move(900, 400); await p.mouse.down(); await p.mouse.move(200, 440, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(3000); }
    await p.waitForTimeout(3000);
    assert(before !== await p.$eval('.nearby .r-name', (e) => e.textContent), 'liste inchangée après déplacement');
    await ctx.close();
  }
};

for (const [name, fn] of Object.entries(tests)) {
  try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', e.message); }
}
await browser.close();
try { process.kill(-preview.pid); } catch { preview.kill(); }
console.log(failed ? `${failed} test(s) en échec` : 'Tous les tests passent');
process.exit(failed ? 1 : 0);
