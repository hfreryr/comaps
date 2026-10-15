// Heure de l'itinéraire : partir maintenant, partir à, arriver à (when.js) et classement « arriver à ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whenLabel, startOf, endOf, fromInput, toInput, dayLabel } from '#lib/when.js';
import { rankTransit } from '#lib/transitrank.js';

const now = new Date('2026-10-16T10:00:00+02:00');
const t = (s) => new Date(`2026-10-${s}+02:00`).getTime();

test('libellé du bouton', () => {
  assert.equal(whenLabel(null, now), 'Partir maintenant');
  assert.equal(whenLabel({ t: t('16T18:30'), arrive: false }, now), 'Départ aujourd\'hui à 18:30');
  assert.equal(whenLabel({ t: t('17T08:05'), arrive: true }, now), 'Arrivée demain à 08:05');
  assert.match(dayLabel(new Date(t('20T09:00')), now), /mar\.? 20 oct/);
});
test('départ et arrivée d’un trajet de 20 min', () => {
  const n = +now;
  assert.equal(endOf(null, 1200, n), n + 1200000);
  assert.equal(endOf({ t: t('16T18:30'), arrive: false }, 1200), t('16T18:50'));
  assert.equal(startOf({ t: t('16T18:30'), arrive: true }, 1200), t('16T18:10'));
});
test('champ date et heure : aller-retour, heure passée = maintenant', () => {
  const v = toInput(t('17T08:05'));
  assert.equal(fromInput(v, true, +now).t, new Date(v).getTime());
  assert.equal(fromInput(v, true, +now).arrive, true);
  assert.equal(fromInput('2026-10-15T09:00', false, +now), null);
  assert.equal(fromInput('', false, +now), null);
});
test('« arriver à » : le départ le plus tardif d’abord, une correspondance compte 5 min', () => {
  const leg = (line) => ({ mode: 'SUBWAY', line });
  const direct = { start: new Date(t('16T08:30')), end: new Date(t('16T08:58')), legs: [leg('10')] };
  const late2 = { start: new Date(t('16T08:33')), end: new Date(t('16T08:59')), legs: [leg('10'), leg('4')] };
  const early = { start: new Date(t('16T08:20')), end: new Date(t('16T08:50')), legs: [leg('12')] };
  assert.deepEqual(rankTransit([early, late2, direct], true), [direct, late2, early]);
});
