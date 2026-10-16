// Mise en forme des itinéraires, place dans la rame, tuiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badge, altTag, exitPhrase, streetOpts, inMinutes } from '#lib/routeview.js';
import { routeTags } from '#lib/maplayers.js';
import { tileXY } from '#lib/placestore.js';

test('pastilles de lignes', () => {
  assert.equal(badge({ mode: 'SUBWAY', line: '4' }), 'M 4');
  assert.equal(badge({ mode: 'REGIONAL_RAIL', line: 'B' }), 'RER B');
  assert.equal(badge({ mode: 'BUS', line: '84' }), 'Bus 84');
  assert.equal(badge({ mode: 'FERRY', line: 'X' }), 'X');
});
test('écart entre itinéraires', () => {
  const best = { duration: 600, distance: 1000 };
  assert.equal(altTag({ duration: 780, distance: 1100 }, best), '3 min de plus');
  assert.equal(altTag({ duration: 610, distance: 1300 }, best), 'Même durée · 300 m de plus');
  assert.equal(altTag({ duration: 610, distance: 1010 }, best), 'Autre itinéraire, même durée');
});
test('phrase de sortie de métro', () => {
  assert.equal(exitPhrase({ ref: '2', name: 'Rue de Rennes' }), 'prenez la sortie 2 · Rue de Rennes');
  assert.equal(exitPhrase({ ref: null, name: 'Rue de Rennes' }), 'prenez la sortie Rue de Rennes');
  assert.equal(exitPhrase({ ref: null, name: 'Entrée / Sortie' }), '');
});
test('variantes et départs', () => {
  assert.deepEqual(streetOpts(null), []);
  assert.equal(streetOpts({ alts: [{}, {}] }).length, 3);
  assert.equal(inMinutes(new Date(Date.now() - 1000)), 'maintenant');
  assert.equal(inMinutes(new Date(Date.now() + 5 * 60000)), 'dans 5 min');
});
test('étiquettes de tracés : durée sur le choisi, écart sur les autres', () => {
  const line = (dx) => Array.from({ length: 40 }, (_, i) => [2.33 + i * 0.001, 48.85 + dx * Math.sin(i / 6)]);
  const r = { duration: 600, distance: 1000, coords: line(0), alts: [{ duration: 780, distance: 1200, coords: line(0.003) }] };
  const f = routeTags(r, 0, 15).features;
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.properties.label).sort(), ['+3 min', '10 min']);
  assert.equal(routeTags(null, 0, 15).features.length, 0);
});
test('tuile de Paris au zoom 14', () => {
  assert.deepEqual(tileXY(2.3488, 48.8534, 14), [8298, 5636]);
});

test('transports : « Le plus rapide » et « Le plus simple »', async () => {
  const { transitTags } = await import('#lib/routeview.js');
  const ride = (line) => ({ mode: 'SUBWAY', line });
  const a = { end: new Date(1000), legs: [ride('10'), ride('4')] };
  const b = { end: new Date(1300), legs: [ride('10')] };
  const c = { end: new Date(1500), legs: [ride('12'), ride('4')] };
  assert.deepEqual(transitTags([a, b, c]), ['Le plus rapide', 'Le plus simple', '']);
  assert.deepEqual(transitTags([b, a]), ['Le plus simple', 'Le plus rapide']);
  assert.deepEqual(transitTags([{ end: new Date(1), legs: [ride('1')] }, { end: new Date(2), legs: [ride('2')] }]), ['Le plus rapide', '']);
});
