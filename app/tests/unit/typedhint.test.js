// Exemples animés dans la barre de recherche : durée bornée (WCAG 2.2.2), retour au texte habituel, arrêt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hintSteps, totalMs, playHint, MAX_MS } from '../../src/lib/typedhint.js';

const EX = ['restaurant ouvert demain dans le 8e', 'boulangerie ouverte dimanche'];

test('l\'animation dure 5 s au plus et finit sur le texte habituel', () => {
  const steps = hintSteps(EX, { rest: 'Rechercher' });
  assert.ok(totalMs(steps) <= MAX_MS, `${totalMs(steps)} ms`);
  assert.equal(steps.at(-1).text, 'Rechercher');
  for (const ex of EX) assert.ok(steps.some((s) => s.text === ex), `${ex} jamais écrit en entier`);
  assert.ok(steps.every((s, i) => i === 0 || Math.abs(s.text.length - steps[i - 1].text.length) <= 1 || s.text === 'Rechercher'), 'une lettre à la fois');
});

test('rien ne bouge si « réduire les animations »', () => {
  const shown = [];
  playHint(EX, (t) => shown.push(t), 'Rechercher', { reduce: true });
  assert.deepEqual(shown, []);
});

test('stop() arrête et remet le texte habituel', async () => {
  const shown = [];
  const stop = playHint(EX, (t) => shown.push(t), 'Rechercher', { delay: 0 });
  await new Promise((r) => setTimeout(r, 120));
  stop();
  const n = shown.length;
  assert.equal(shown.at(-1), 'Rechercher');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(shown.length, n, 'l\'animation continue après stop()');
});
