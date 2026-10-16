// Thème au choix et vue satellite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDark } from '#lib/theme.js';
import { ORTHO, setSatellite } from '#lib/satellite.js';

test('thème : clair et sombre forcés, auto suit le téléphone', () => {
  assert.equal(isDark('dark'), true);
  assert.equal(isDark('light'), false);
});
test('satellite : photos IGN sous la première couche d’étiquettes, retirées au retour au plan', () => {
  const layers = [{ id: 'eau', type: 'fill' }, { id: 'rues', type: 'line' }, { id: 'noms', type: 'symbol' }];
  const added = [];
  const map = { sources: {}, getSource(id) { return this.sources[id]; }, addSource(id, s) { this.sources[id] = s; },
    getLayer: (id) => layers.find((l) => l.id === id), getStyle: () => ({ layers }),
    addLayer(l, before) { added.push(before); layers.splice(layers.findIndex((x) => x.id === before), 0, l); }, removeLayer(id) { layers.splice(layers.findIndex((l) => l.id === id), 1); } };
  setSatellite(map, true);
  assert.deepEqual(added, ['noms']);
  assert.match(map.sources.satellite.tiles[0], /data\.geopf\.fr.*ORTHOIMAGERY\.ORTHOPHOTOS/);
  assert.equal(ORTHO.startsWith('https://data.geopf.fr/'), true);
  setSatellite(map, false);
  assert.equal(layers.some((l) => l.id === 'satellite'), false);
});
