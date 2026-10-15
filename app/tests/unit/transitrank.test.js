// Classement des trajets en transports : le plus simple d'abord, sauf gain net (cas Ségur → Odéon, 15/10/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankTransit, transfers, usesLineTwice, TRANSFER_PENALTY_MIN } from '../../src/lib/transitrank.js';

const t = (hhmm) => new Date(`2026-10-16T${hhmm}:00+02:00`);
const trip = (end, ...lines) => ({ end: t(end), legs: [{ mode: 'WALK' }, ...lines.flatMap((l) => [{ mode: 'SUBWAY', line: l }, { mode: 'WALK' }])] });

test('Ségur → Odéon : la ligne 10 directe passe devant « 10 puis 4 » qui gagne 1 min', () => {
  const direct = trip('12:38', '10'), change = trip('12:37', '10', '4');
  assert.deepEqual(rankTransit([change, direct]), [direct, change]);
});

test('une correspondance qui fait gagner nettement du temps reste en tête', () => {
  const direct = trip('12:50', '10'), change = trip('12:40', '10', '4');
  assert.equal(rankTransit([direct, change])[0], change);
  assert.equal(TRANSFER_PENALTY_MIN, 5);
});

test('aller-retour sur la même ligne écarté (Château Rouge → Marcadet puis retour sur la 4)', () => {
  const back = trip('10:40', '4', '4'), direct = trip('10:46', '4');
  assert.ok(usesLineTwice(back) && !usesLineTwice(direct));
  assert.deepEqual(rankTransit([back, direct]), [direct]);
  // s'il n'y a que lui, on le garde plutôt que rien
  assert.deepEqual(rankTransit([back]), [back]);
});

test('correspondances comptées sans la marche ni les arrêts', () => {
  assert.equal(transfers(trip('10:00', '6')), 0);
  assert.equal(transfers(trip('10:00', '4', '6')), 1);
  assert.equal(transfers({ end: t('10:00'), legs: [{ mode: 'SUBWAY', line: '1' }, { mode: 'STOP' }, { mode: 'BUS', line: '96' }] }), 1);
});
