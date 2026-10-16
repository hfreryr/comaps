// Fiche lieu : extrait Wikipédia et photos Wikimedia (appels réseau simulés).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wikiInfo, goodToKnow, kindOf } from '#lib/placeinfo.js';

test('extrait et photo : Wikidata sans en-tête, Commons avec l’en-tête Api-User-Agent', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), headers: opts.headers || {} });
    const json = (o) => ({ ok: true, json: async () => o });
    if (url.includes('wikidata.org')) return json({ entities: { Q1: { sitelinks: { frwiki: { title: 'Panthéon (Paris)' } }, claims: { P18: [{ mainsnak: { datavalue: { value: 'Pantheon.jpg' } } }] } } } });
    if (url.includes('wikipedia.org')) return json({ type: 'standard', extract: 'Monument.', content_urls: { mobile: { page: 'https://fr.m.wikipedia.org/wiki/P' } } });
    return json({ query: { pages: { 1: { title: 'File:Pantheon.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/p.jpg', descriptionurl: 'https://commons/p', extmetadata: { Artist: { value: '<a>Moi</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } });
  };
  const r = await wikiInfo({ wikidata: 'Q1' });
  assert.equal(r.extract, 'Monument.');
  assert.equal(r.photo.credit, 'Moi · CC BY-SA 4.0');
  assert.equal(calls.find((c) => c.url.includes('wikidata')).headers['Api-User-Agent'], undefined);
  assert.match(calls.find((c) => c.url.includes('commons')).headers['Api-User-Agent'], /UntrackedMaps/);
});
test('bon à savoir et type précis', () => {
  const g = goodToKnow({ outdoor_seating: 'yes', 'payment:cash': 'no', 'diet:vegan': 'only' }).map((x) => x.text);
  assert.deepEqual(g, ['Terrasse', 'Espèces refusées', '100 % végétalien'].sort((a, b) => g.indexOf(a) - g.indexOf(b)));
  assert.equal(kindOf({ amenity: 'place_of_worship', religion: 'christian' }), 'Église');
});

test('ancienne église devenue lieu de visite (Panthéon, P5) : Monument ; église en service : Église', () => {
  assert.equal(kindOf({ building: 'church', tourism: 'attraction', religion: 'christian' }), 'Monument');
  assert.equal(kindOf({ building: 'church', amenity: 'place_of_worship', religion: 'christian' }), 'Église');
});
