// Tests de bout en bout (Playwright + Chromium) sur le site construit (npm run build), servi en local.
// Ils appellent les vrais services (OpenFreeMap, Photon, Géoplateforme, Valhalla, Transitous) : à lancer à la main
// avant une publication, pas en intégration continue.   Usage : npm run e2e
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
import { packList, pack, snapshot, DEFAULT_LISTS } from '../../src/lib/myplaces.js';

const PORT = 4199;
// le site construit (build/), servi tel quel, comme sur GitHub Pages (vite preview dépend de fichiers que svelte-check efface)
const preview = spawn('python3', ['-m', 'http.server', String(PORT), '-d', new URL('../../build', import.meta.url).pathname], { stdio: 'ignore', detached: true });
// on attend que le serveur réponde (au plus 30 s)
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* pas encore prêt */ }
  await new Promise((r) => setTimeout(r, 500));
}
const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '<-loopback>,localhost,127.0.0.1' } } : {};
const browser = await chromium.launch({ ...proxy, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;
const cspSeen = [];   // violations de la politique de sécurité, vérifiées après chaque test
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function page(opts = {}, hash = '') {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris',
    geolocation: { latitude: 48.851, longitude: 2.339 }, permissions: ['geolocation'], ...opts });
  await ctx.addInitScript(() => localStorage.setItem('promesse-vue', '1'));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  // toute violation de la politique de sécurité (CSP) compte comme une erreur : un fournisseur oublié serait bloqué
  p.on('console', (m) => { if (/Content Security Policy|Refused to (connect|load|execute)/i.test(m.text())) { errors.push(`CSP : ${m.text().slice(0, 160)}`); cspSeen.push(m.text().slice(0, 200)); } });
  await p.goto(`http://localhost:${PORT}/${hash}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  return { p, ctx, errors };
}
const pick = (p) => p.dispatchEvent('.results li.opt button >> nth=0', 'mousedown');

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
  async 'vue de la rue : vignette puis visionneuse plein écran'() {
    // lieu des tuiles locales avec une photo de devanture (Panoramax)
    const { p, ctx, errors } = await page();
    await p.fill('#search', 'Etam rue de Rennes'); await p.waitForSelector('.results li.opt button', { timeout: 20000 }); await pick(p);
    await p.waitForSelector('.street-thumb', { timeout: 20000 });
    await p.click('.street-thumb'); await p.waitForSelector('.viewer .pano', { timeout: 10000 });
    await p.click('.viewer-close'); await p.waitForTimeout(500);
    assert(!(await p.$('.viewer')), 'la visionneuse ne se ferme pas');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'accessibilité (WCAG 2.1 AA, axe-core) : 7 écrans, clair et sombre'() {
    // Audit automatique : ne voit qu'une partie des problèmes (pas le clavier ni VoiceOver), mais bloque les régressions.
    const resto = async (p) => { await p.click('.chip:has-text("Restaurants")'); await p.waitForTimeout(6000); await p.click('.nearby li button >> nth=0'); await p.waitForTimeout(4000); };
    const screens = {
      accueil: async () => {},
      recherche: async (p) => { await p.fill('#search', '57 rue de rennes'); await p.waitForSelector('.results li.opt', { timeout: 30000 }); },
      catégorie: async (p) => { await p.click('.chip:has-text("Restaurants")'); await p.waitForTimeout(6000); },
      fiche: resto,
      itinéraire: async (p) => { await resto(p); await p.click('.action.primary'); await p.waitForTimeout(10000); },
      'Mes lieux': async (p) => { await p.click('.chip:has-text("Mes lieux")'); await p.waitForTimeout(1500); },
      'Qui voit quoi': async (p) => { await p.evaluate(() => { const a = document.createElement('a'); a.href = 'confidentialite'; document.body.appendChild(a); a.click(); a.remove(); }); await p.waitForSelector('main h1'); },
    };
    const bad = [];
    for (const dark of [false, true]) for (const [name, go] of Object.entries(screens)) {
      const { p, ctx } = await page({ bypassCSP: true, colorScheme: dark ? 'dark' : 'light' });
      await go(p);
      await p.addScriptTag({ content: AXE });
      const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations
        .map((x) => `${x.id} (${x.nodes.length}) : ${x.nodes[0].target.join(' ')}`));
      bad.push(...v.map((x) => `${name}${dark ? ' (sombre)' : ''} — ${x}`));
      await ctx.close();
    }
    assert(!bad.length, bad.join(' | '));
  },
  async 'lien partagé vers un lieu : fiche complète ; lieu inexistant : message « introuvable »'() {
    // Panthéon : way 16407465 dans nos tuiles. Le lien porte le vrai numéro OSM (pas le numéro codé des tuiles).
    let { p, ctx, errors } = await page({}, '#carte=18/48.846219/2.346008&lieu=way/16407465');
    await p.waitForSelector('.sheet h1', { timeout: 15000 }); await p.waitForTimeout(2000);
    let txt = await p.$eval('.sheet', (e) => e.innerText);
    assert(/Panthéon/.test(txt), `nom absent : ${txt.slice(0, 120)}`);
    assert(!/hors de la zone|introuvable/.test(txt), 'message d\'erreur affiché pour un lieu existant');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
    ({ p, ctx } = await page({}, '#carte=18/48.846219/2.346008&lieu=node/1'));
    await p.waitForSelector('.sheet', { timeout: 15000 }); await p.waitForTimeout(2500);
    txt = await p.$eval('.sheet', (e) => e.innerText);
    assert(/introuvable/.test(txt) && !/hors de la zone/.test(txt), `message attendu « introuvable » : ${txt.slice(0, 200)}`);
    await ctx.close();
  },
  async 'Photon en panne : la recherche par nom passe par nos données'() {
    const { p, ctx, errors } = await page();
    await p.route('**/photon.komoot.io/**', (r) => r.abort());
    await p.fill('#search', 'Café de Flore'); await p.waitForSelector('.results li.opt button', { timeout: 15000 });
    const first = await p.$eval('.results li.opt', (e) => e.innerText);
    assert(/Café de Flore/.test(first), `résultat inattendu : ${first}`);
    await pick(p); await p.waitForSelector('.sheet h1', { timeout: 10000 }); await p.waitForTimeout(2000);
    assert(/Horaires|Ouvert|Fermé/.test(await p.$eval('.sheet', (e) => e.innerText)), 'fiche incomplète');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'choisir « Paris 8e » cadre la zone et garde les raccourcis'() {
    const { p, ctx, errors } = await page();
    await p.fill('#search', 'paris 8e'); await p.waitForSelector('.results li.opt button', { timeout: 30000 });
    assert(/Arrondissement/.test(await p.$eval('.results li.opt', (e) => e.innerText)), 'arrondissement absent des résultats');
    await pick(p); await p.waitForTimeout(2500);
    assert((await p.locator('section.sheet').count()) === 0, 'une fiche s\'ouvre pour une zone');
    assert((await p.locator('.chip:has-text("Restaurants")').count()) === 1, 'raccourcis masqués');
    const c = await p.evaluate(() => window.__map.getCenter());
    assert(Math.abs(c.lat - 48.873) < 0.01 && Math.abs(c.lng - 2.312) < 0.015, `carte mal cadrée : ${c.lat}, ${c.lng}`);
    await p.click('.chip:has-text("Restaurants")'); await p.waitForTimeout(6000);
    assert((await p.locator('.nearby li').count()) > 3, 'pas de restaurants dans la zone');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'adresse via Géoplateforme'() {
    const { p, ctx } = await page();
    await p.fill('#search', '57 rue de rennes'); await p.waitForSelector('.results li.opt', { timeout: 30000 });
    const first = await p.$eval('.results li.opt', (e) => e.innerText);
    assert(/75006/.test(first), `première adresse hors Paris : ${first}`);
    await ctx.close();
  },
  async 'recherche « restaurant ce soir 8e »'() {
    const { p, ctx } = await page();
    await p.fill('#search', 'restaurant ce soir 8e'); await p.waitForTimeout(2500);
    assert(/8e arrondissement/.test(await p.$eval('.results li.opt', (e) => e.innerText)), 'suggestion sans le 8e');
    await pick(p); await p.waitForTimeout(6000);
    const kind = await p.$eval('.sheet .kind', (e) => e.textContent);
    assert(/ouverts? (ce soir|maintenant)/.test(kind), `filtre non appliqué : ${kind}`);
    assert((await p.locator('.nearby li').count()) > 3, 'liste vide');
    await ctx.close();
  },
  async 'catégorie : liste en aperçu, glisser ne la ferme pas'() {
    const { p, ctx } = await page();
    await p.click('.chip:has-text("Restaurants")'); await p.waitForTimeout(6000);
    const h = await p.$eval('.sheet', (e) => e.getBoundingClientRect().height);
    assert(h < 300, `la liste s'ouvre trop grande (${h}px) : attendu un aperçu`);
    assert((await p.locator('.chip.on').count()) === 1, 'catégorie non marquée active');
    await ctx.close();
  },
  async 'retirer un lieu d\'une liste depuis le menu « ⋯ » de sa fiche'() {
    const { p, ctx, errors } = await page();
    await p.click('.chip:has-text("Restaurants")'); await p.waitForTimeout(6000);
    await p.click('.nearby li button >> nth=0'); await p.waitForTimeout(3000);
    await p.click('.fab button >> nth=0'); await p.waitForTimeout(500);              // cœur : ajouté aux Favoris
    await p.click('.fab button >> nth=2');                                           // ⋯
    await p.click('.pmenu button:has-text("Enregistré dans")');
    await p.waitForSelector('.pick-lists'); await p.uncheck('.pick-lists li:has-text("Favoris") input'); await p.waitForTimeout(400);
    await p.click('.done'); await p.waitForTimeout(500);
    assert((await p.locator('.fab button.on').count()) === 0, 'toujours enregistré');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'chercher « fleuriste » propose de l\'ajouter aux raccourcis'() {
    const { p, ctx, errors } = await page();
    assert((await p.locator('.chip:has-text("Fleuristes")').count()) === 0, 'déjà en raccourci');
    await p.fill('#search', 'fleuriste'); await p.waitForTimeout(1500); await p.press('#search', 'Enter');
    await p.waitForSelector('.add-chip', { timeout: 10000 }); await p.click('.add-chip'); await p.waitForTimeout(500);
    assert((await p.locator('.chip:has-text("Fleuristes")').count()) === 1, 'raccourci non ajouté');
    assert((await p.locator('.add-chip').count()) === 0, 'le bouton reste affiché');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'Mes lieux : favori, nouvelle liste, renommer, supprimer'() {
    const { p, ctx, errors } = await page();
    await p.fill('#search', "Ed's rue Muller"); await p.waitForSelector('.results li.opt button', { timeout: 20000 }); await pick(p); await p.waitForTimeout(3000);
    await p.click('.fab button >> nth=0');                       // cœur : ajouté aux Favoris
    await p.waitForSelector('.toast'); assert(/Favoris/.test(await p.textContent('.toast')), 'pas de confirmation du favori');
    await p.click('.close'); await p.waitForTimeout(500);
    await p.click('.chip:has-text("Mes lieux")'); await p.waitForTimeout(1200);
    await p.fill('.hub-lists .new-list input', 'Brunch'); await p.press('.hub-lists .new-list input', 'Enter'); await p.waitForTimeout(500);
    assert(await p.locator('.hub-lists li:has-text("Brunch")').count() === 1, 'liste non créée');
    assert(/1/.test(await p.textContent('.hub-lists li:has-text("Favoris") .pl-count')), 'favori absent de la liste');
    await p.click('.hub-lists li:has-text("Brunch") button'); await p.waitForTimeout(500);
    p.once('dialog', (d) => d.accept('Brunch du dimanche'));
    await p.click('.list-actions button:has-text("Renommer")'); await p.waitForTimeout(500);
    assert(/Brunch du dimanche/.test(await p.textContent('.list-title')), 'liste non renommée');
    p.once('dialog', (d) => d.accept());
    await p.click('.list-actions button:has-text("Supprimer")'); await p.waitForTimeout(800);
    assert(await p.locator('.hub-lists li:has-text("Brunch")').count() === 0, 'liste non supprimée');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'Maison et raccourcis personnalisés'() {
    const { p, ctx, errors } = await page();
    await p.fill('#search', "Ed's rue Muller"); await p.waitForSelector('.results li.opt button', { timeout: 20000 }); await pick(p); await p.waitForTimeout(3000);
    await p.click('.fab button[aria-label="Plus d\'options"]');
    await p.click('.pmenu button:has-text("Définir comme Maison")'); await p.waitForTimeout(500);
    assert(/Maison enregistré/.test(await p.textContent('.toast')), 'Maison non enregistrée');
    await p.click('.close'); await p.waitForTimeout(500);
    await p.click('.chip.edit'); await p.waitForTimeout(800);
    await p.click('.ce-toggle[aria-label="Afficher Cafés"]');
    await p.fill('input[aria-label="Nom du raccourci Restaurants"]', 'Restos'); await p.press('input[aria-label="Nom du raccourci Restaurants"]', 'Tab');
    await p.click('section[aria-label="Personnaliser les raccourcis"] .close'); await p.waitForTimeout(500);
    const chips = await p.$$eval('.chips .chip', (els) => els.map((e) => e.textContent.trim()));
    assert(chips.includes('Restos') && !chips.includes('Cafés'), `raccourcis non appliqués : ${chips.join(', ')}`);
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
    assert((await p.$$eval('.chips .chip', (els) => els.map((e) => e.textContent.trim()))).includes('Restos'), 'raccourcis non gardés après rechargement');
    await p.click('#search'); await p.waitForTimeout(800);
    assert(/Itinéraire/.test(await p.textContent('.pinned')), 'Maison absente des raccourcis de recherche');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'sauvegarde puis restauration (avec mot de passe)'() {
    let { p, ctx } = await page();
    await p.evaluate(() => localStorage.setItem('lieux-favoris', JSON.stringify([{ id: 'node1', name: 'Lieu sauvegardé', lat: 48.85, lon: 2.34, lists: ['fav'] }])));
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
    await p.click('.chip:has-text("Mes lieux")'); await p.waitForTimeout(1000);
    await p.click('.row-btn:has-text("Sauvegarder")');
    await p.fill('label.pw input', 'secret');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Créer la sauvegarde")')]);
    const file = `/tmp/untracked-e2e-sauvegarde-${Date.now()}.json`;
    await dl.saveAs(file);
    assert(!readFileSync(file, 'utf8').includes('Lieu sauvegardé'), 'sauvegarde chiffrée lisible en clair');
    await ctx.close();
    ({ p, ctx } = await page());
    await p.click('.chip:has-text("Mes lieux")'); await p.waitForTimeout(1000);
    await p.click('.row-btn:has-text("Restaurer")');
    await p.setInputFiles('label.import-btn input[type=file]', file); await p.waitForTimeout(1500);
    await p.fill('label.pw input', 'faux'); await p.click('button:has-text("Restaurer")'); await p.waitForTimeout(2500);
    assert(/incorrect/.test(await p.textContent('.toast')), 'mauvais mot de passe non signalé');
    await p.fill('label.pw input', 'secret'); await p.click('button:has-text("Restaurer")'); await p.waitForTimeout(2500);
    assert(/1 lieu restauré/.test(await p.textContent('.toast')), 'restauration non confirmée');
    await ctx.close();
  },
  async 'lien de liste partagée et lien de transfert'() {
    const lien = await packList({ name: 'Sorties', icon: 'star', color: '#2A5BD7' }, [{ name: 'Le Comptoir', lat: 48.8515, lon: 2.3387, osmType: 'node', osmId: 1 }]);
    let { p, ctx } = await page({}, `#liste=${lien}`);
    await p.waitForSelector('.list-title', { timeout: 8000 });
    assert(/Sorties/.test(await p.textContent('.list-title')) && /Liste partagée/.test(await p.textContent('.sheet .kind')), 'liste partagée non affichée');
    await p.click('button:has-text("Ajouter à Mes lieux")'); await p.waitForTimeout(800);
    assert(/Sorties/.test(await p.evaluate(() => localStorage.getItem('mes-listes') || '')), 'liste non enregistrée');
    await ctx.close();
    const t = await pack(snapshot({ lists: DEFAULT_LISTS, places: [{ name: 'Chez moi', lat: 48.86, lon: 2.35, lists: ['fav'] }], shortcuts: { home: { name: 'Chez moi', lat: 48.86, lon: 2.35 } } }));
    ({ p, ctx } = await page({}, `#transfert=${t}`));
    await p.waitForSelector('section[aria-label="Récupérer vos lieux"]', { timeout: 8000 });
    assert(/Maison/.test(await p.textContent('section[aria-label="Récupérer vos lieux"]')), 'Maison absente du transfert');
    await ctx.close();
    ({ p, ctx } = await page({}, '#liste=lien-abime'));
    await p.waitForSelector('.toast', { timeout: 8000 });
    assert(/incomplet/.test(await p.textContent('.toast')), 'lien abîmé non signalé');
    await ctx.close();
  },
  async 'station de métro : prochains passages et sorties'() {
    const { p, ctx } = await page();
    await p.fill('#search', 'Odéon métro'); await p.waitForSelector('.results li.opt button', { timeout: 20000 });
    await p.dispatchEvent('.results li.opt:has-text("Station") button >> nth=0', 'mousedown').catch(() => pick(p));
    await p.waitForTimeout(6000);
    const txt = await p.$eval('section.sheet', (e) => e.innerText);
    assert(/Sorties/.test(txt), 'sorties absentes');
    assert((await p.locator('.deps li').count()) > 0 || /passage/i.test(txt), 'prochains passages absents');
    await ctx.close();
  },
  async 'guidage à pied : démarrer puis terminer'() {
    const { p, ctx, errors } = await page({ geolocation: { latitude: 48.853, longitude: 2.34 } });
    await p.fill('#search', 'Panthéon'); await p.waitForSelector('.results li.opt button', { timeout: 20000 }); await pick(p); await p.waitForTimeout(2500);
    await p.click('.action.primary'); await p.waitForTimeout(6000);
    await p.click('.mode-tabs .mode-tab >> nth=0'); await p.waitForTimeout(3000);
    await p.click('.sum-actions .go'); await p.waitForSelector('.nav-top', { timeout: 8000 });
    await p.click('.nav-end'); await p.waitForTimeout(800);
    assert((await p.locator('.nav-top').count()) === 0, 'guidage non terminé');
    assert(!errors.length, errors.join(' | '));
    await ctx.close();
  },
  async 'page « Qui voit quoi » : on peut la faire défiler'() {
    const { p, ctx } = await page();
    await p.evaluate(() => { const a = document.createElement('a'); a.href = 'confidentialite'; a.id = 'qvq'; document.body.appendChild(a); a.click(); });
    await p.waitForSelector('.scroller'); await p.mouse.move(200, 400); await p.mouse.wheel(0, 1200); await p.waitForTimeout(600);
    assert((await p.$eval('.scroller', (e) => e.scrollTop)) > 300, 'la page ne défile pas');
    await ctx.close();
  },
  async 'transports : sortie conseillée et trajet à pied recalculé'() {
    const { p, ctx } = await page({ geolocation: { latitude: 48.8867, longitude: 2.3431 } });
    let valhalla = 0; p.on('request', (r) => { if (r.url().includes('valhalla')) valhalla++; });
    await p.fill('#search', 'Panthéon'); await p.waitForTimeout(3500); await pick(p); await p.waitForTimeout(2500);
    await p.click('.action.primary'); await p.waitForTimeout(2000);
    await p.click('.mode-tabs .mode-tab >> nth=2'); await p.waitForTimeout(12000);
    assert((await p.locator('.leg').count()) > 2, 'aucun itinéraire en transports');
    // si une sortie est conseillée (métro ou RER), le trajet à pied qui suit a été recalculé depuis cette sortie
    if (await p.locator('.leg-exit').count()) assert((await p.locator('.leg-tip').count()) >= 1, 'sortie conseillée sans place dans la rame');
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

// E2E_ONLY=mot : ne lancer que les tests dont le nom contient ce mot
for (const [name, fn] of Object.entries(tests).filter(([n]) => !process.env.E2E_ONLY || n.includes(process.env.E2E_ONLY))) {
  const before = cspSeen.length;
  try { await fn(); if (cspSeen.length > before) throw new Error(`bloqué par la politique de sécurité : ${cspSeen.slice(before).join(' | ')}`); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '—', e.message); }
}
await browser.close();
try { process.kill(-preview.pid); } catch { preview.kill(); }
console.log(failed ? `${failed} test(s) en échec` : 'Tous les tests passent');
process.exit(failed ? 1 : 0);
