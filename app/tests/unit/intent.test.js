// Recherche en langage courant : moment, arrondissement, catégorie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '#lib/intent.js';
import { categoryFor } from '#lib/categories.js';

const now = new Date('2026-10-14T15:00'); // mercredi 15 h, heure de Paris

test('« restaurant ce soir 8e »', () => {
  const r = parseIntent('restaurant ce soir 8e', now);
  assert.deepEqual(r.words, ['restaurant']);
  assert.deepEqual(r.area, { arr: 8 });
  assert.equal(r.when.at.getHours(), 20);
  assert.equal(r.when.at.getDate(), 14);
  assert.equal(categoryFor(r.words.join(' ')).key, 'resto');
});
test('« boulangerie ouverte dimanche » et « bar vers 23h30 »', () => {
  const a = parseIntent('boulangerie ouverte dimanche', now);
  assert.equal(a.when.at.getDay(), 0);
  const b = parseIntent('bar vers 23h30', now);
  assert.equal(b.when.at.getHours(), 23);
  assert.equal(b.when.at.getMinutes(), 30);
});
test('« pharmacie ouverte maintenant 75011 »', () => {
  const r = parseIntent('pharmacie ouverte maintenant 75011', now);
  assert.deepEqual(r.when, { now: true });
  assert.deepEqual(r.area, { arr: 11 });
});
test('heure déjà passée de plus de 3 h, sans jour : demain', () => {
  const r = parseIntent('café 9h', now);
  assert.equal(r.when.at.getDate(), 15);
});
test('« 1er » et « 20e » arrondissement', () => {
  assert.deepEqual(parseIntent('musée 1er', now).area, { arr: 1 });
  assert.deepEqual(parseIntent('bar 20eme', now).area, { arr: 20 });
});
test('un nom de lieu sans intention n’est pas transformé', () => {
  const r = parseIntent('Panthéon', now);
  assert.equal(r.any, false);
  assert.deepEqual(r.words, ['pantheon']);
});
test('catégories : mots courants, mots de remplissage, refus', () => {
  assert.equal(categoryFor('resto près de moi')?.key, 'resto');
  assert.equal(categoryFor('pharmacie')?.key, 'pharmacie');
  assert.equal(categoryFor('Café de Flore'), null);  // nom propre : pas une catégorie
  assert.equal(categoryFor(''), null);
});

test('régime : « restaurant végétarien 11e », « vegan paris 11 » (P6, P7)', async () => {
  const { parseIntent, fitsDiet, dietHit } = await import('#lib/intent.js');
  const a = parseIntent('restaurant végétarien 11e');
  assert.deepEqual([a.words, a.area, a.diet], [['restaurant'], { arr: 11 }, 'veg']);
  const b = parseIntent('vegan paris 11');
  assert.deepEqual([b.words, b.area, b.diet], [[], { arr: 11 }, 'vegan']);
  assert.equal(parseIntent('ligne 11').area, null);
  assert.equal(fitsDiet('veg', { 'diet:vegan': 'only' }), true);
  assert.equal(fitsDiet('vegan', { 'diet:vegetarian': 'yes' }), false);
  assert.equal(dietHit({ label: 'Restaurants' }, 'veg').label, 'Restaurants végétariens');
});
