// Guidage : reste du tracé à parcourir (le tronçon fait disparaît de la carte).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, remaining } from '#lib/nav.js';

// trajet droit vers l'est, 3 points espacés d'environ 76 m (0,001° de longitude à Paris)
const nav = prepare([[2.340, 48.85], [2.341, 48.85], [2.342, 48.85]], [], 120);

test('au départ : tout le tracé', () => assert.deepEqual(remaining(nav, 0), nav.coords));

test('à mi-chemin du 1er tronçon : commence au point interpolé', () => {
  const r = remaining(nav, nav.cum[1] / 2);
  assert.equal(r.length, 3);
  assert.ok(Math.abs(r[0][0] - 2.3405) < 1e-6 && r[0][1] === 48.85);
  assert.deepEqual(r.slice(1), nav.coords.slice(1));
});

test('dans le 2e tronçon, puis au bout', () => {
  const r = remaining(nav, nav.cum[1] + 10);
  assert.equal(r.length, 2);
  assert.ok(r[0][0] > 2.341 && r[0][0] < 2.342);
  assert.deepEqual(remaining(nav, nav.total + 50), [nav.coords[2], nav.coords[2]]);
});
