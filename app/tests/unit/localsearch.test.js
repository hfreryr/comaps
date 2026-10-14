// Recherche de secours dans nos données de lieux (quand Photon ne répond pas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchPlaces } from '#lib/localsearch.js';

const at = { lat: 48.854, lon: 2.333 };
const places = [
  { id: 1234561, lon: 2.3325, lat: 48.8541, tags: { name: 'Café de Flore', amenity: 'cafe', 'addr:housenumber': '172', 'addr:street': 'Boulevard Saint-Germain', 'addr:postcode': '75006' } },
  { id: 7777772, lon: 2.40, lat: 48.86, tags: { name: 'Flore Pâtisserie', shop: 'pastry' } },
  { id: 164074652, lon: 2.346, lat: 48.8462, tags: { name: 'Panthéon', tourism: 'attraction' } },
  { id: 999, lon: 2.333, lat: 48.854, tags: { amenity: 'bench' } },
];

test('accents et majuscules ignorés, tous les mots requis', () => {
  assert.deepEqual(matchPlaces(places, 'cafe de flore', at).map((r) => r.name), ['Café de Flore']);
  assert.deepEqual(matchPlaces(places, 'PANTHEON', at).map((r) => r.name), ['Panthéon']);
  assert.deepEqual(matchPlaces(places, 'flore', at).map((r) => r.name), ['Café de Flore', 'Flore Pâtisserie']);
  assert.deepEqual(matchPlaces(places, '', at), []);
});

test('même forme que les résultats de Photon : identifiant OSM décodé, type, adresse', () => {
  const [r] = matchPlaces(places, 'flore', at);
  assert.equal(r.osmType, 'node'); assert.equal(r.osmId, 123456); assert.equal(r.id, 'N123456');
  assert.equal(r.type, 'Café');
  assert.equal(r.address, '172 Boulevard Saint-Germain, 75006');
  const [p] = matchPlaces(places, 'panthéon', at);
  assert.equal(p.osmType, 'way'); assert.equal(p.osmId, 16407465);
});
