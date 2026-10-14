// Place dans la rame : sortie RATP la plus proche de la suite du trajet, voiture conseillée, correspondances.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Données de test (forme de static/data/rame.json) : quai d'Odéon, ligne 4
const RAME = { '462995': {
  's:21978': [6, 6, 'Arrière'],
  x: [[2.339185, 48.852201, '1', "r. de l'École de Médecine", 6, 6, 'Arrière'], [2.338884, 48.85228, '2', "car. de l'Odéon", 1, 6, 'Avant']]
} };
globalThis.location = { href: 'http://localhost/' };
globalThis.fetch = async () => ({ json: async () => RAME });
const { exitForQuay, placeForTransfer, placeLabel, idfmId } = await import('#lib/rame.js');

test('identifiant de quai depuis Transitous', () => {
  assert.equal(idfmId('fr-reseau-urbain-et-interurbain-dile-de-france-mobilites_IDFM:462995'), '462995');
  assert.equal(idfmId('autre:123'), null);
});
test('sortie la plus proche de la destination, abréviation écrite en entier', async () => {
  const r = await exitForQuay('x_IDFM:462995', { lat: 48.8524, lon: 2.3384 });
  assert.equal(r.exit.ref, '2');
  assert.equal(r.exit.name, "Carrefour de l'Odéon");
  assert.equal(placeLabel(r.place), "à l'avant du train (voiture 1 sur 6)");
});
test('correspondance : voiture conseillée', async () => {
  assert.deepEqual(await placeForTransfer('x_IDFM:462995', 'x_IDFM:21978'), { pos: 6, of: 6, where: 'Arrière' });
  assert.equal(await placeForTransfer('x_IDFM:462995', 'x_IDFM:999'), null);
});
test('quai inconnu : aucun conseil plutôt qu’un conseil faux', async () => {
  assert.equal(await exitForQuay('x_IDFM:1', { lat: 48.85, lon: 2.34 }), null);
});
