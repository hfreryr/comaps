// Horaires d'ouverture : phrases affichées et filtre « ouvert à ».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hoursStatus, hoursTable, statusAt, momentLabel } from '#lib/hours.js';

const P = [48.85, 2.34];
const at = (s) => new Date(s); // heure de Paris (TZ fixé par npm test)

test('ouvert, ferme ce soir', () => {
  const r = hoursStatus('Mo-Su 09:00-19:00', ...P, at('2026-10-14T15:00'));
  assert.deepEqual(r, { open: true, label: 'Ouvert · ferme à 19 h' });
});
test('fermé, ouvre demain avec minutes', () => {
  const r = hoursStatus('Mo-Su 09:30-19:00', ...P, at('2026-10-14T20:00'));
  assert.deepEqual(r, { open: false, label: 'Fermé · ouvre demain à 9 h 30' });
});
test('fermé le dimanche : ouvre lundi', () => {
  const r = hoursStatus('Mo-Sa 10:00-18:00', ...P, at('2026-10-18T12:00')); // dimanche
  assert.equal(r.label, 'Fermé · ouvre demain à 10 h');
});
test('soirée après minuit : « cette nuit »', () => {
  const r = hoursStatus('Mo-Su 18:00-02:00', ...P, at('2026-10-14T23:00'));
  assert.equal(r.label, 'Ouvert · ferme cette nuit à 2 h');
});
test('24/7 et horaires illisibles', () => {
  assert.equal(hoursStatus('24/7', ...P, at('2026-10-14T03:00')).label, 'Ouvert 24 h/24');
  assert.deepEqual(hoursStatus('n importe quoi', ...P), { open: null, label: 'Horaires non lisibles' });
  assert.equal(hoursStatus('', ...P), null);
});
test('jour férié (PH off) : fermé le 1er novembre', () => {
  const r = hoursStatus('Mo-Su 09:00-19:00; PH off', ...P, at('2026-11-01T12:00'));
  assert.equal(r.open, false);
});
test('tableau de la semaine : la soirée après minuit reste sur la veille', () => {
  const rows = hoursTable('Fr-Sa 19:00-02:00', ...P, at('2026-10-14T12:00'));
  const by = Object.fromEntries(rows.map((r) => [r.day, r.text]));
  assert.equal(by.vendredi, '19 h – 2 h');
  assert.equal(by.samedi, '19 h – 2 h');
  assert.equal(by.dimanche, 'Fermé');
  assert.equal(rows.find((r) => r.today).day, 'mercredi');
});
test('ouvert à un moment donné', () => {
  assert.equal(statusAt('Mo-Su 12:00-14:30,19:00-23:00', ...P, at('2026-10-14T20:00')).open, true);
  assert.equal(statusAt('Mo-Su 12:00-14:30', ...P, at('2026-10-14T20:00')).open, false);
  assert.equal(statusAt('', ...P, at('2026-10-14T20:00')).open, null);
});
test('libellé d’un moment', () => {
  const now = at('2026-10-14T10:00');
  assert.equal(momentLabel(at('2026-10-14T20:00'), now), 'ce soir 20 h');
  assert.equal(momentLabel(at('2026-10-15T12:30'), now), 'demain 12 h 30');
  assert.equal(momentLabel(at('2026-10-18T15:00'), now), 'dimanche 15 h');
});
