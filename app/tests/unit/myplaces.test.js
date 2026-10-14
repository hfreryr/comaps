// Mes lieux : liens de partage, sauvegardes (chiffrées ou non), fusion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack, packList, unpackList, snapshot, restore, backupFile, readBackup, mergeInto, migratePlaces, DEFAULT_LISTS } from '#lib/myplaces.js';

const cafe = { id: 'node42', name: 'Café « Test » & Cie', lat: 48.8512345, lon: 2.3398765, osmType: 'node', osmId: 42, lists: ['fav', 'todo'], address: '1 rue X', type: 'Café' };
const libre = { id: 's48.86,2.35', name: 'Point choisi', lat: 48.86, lon: 2.35, lists: ['fav'], address: '', type: '' };

test('pack / unpack : aller-retour, caractères spéciaux', async () => {
  const o = { a: 'éàü « » 😀', n: [1, 2, 3] };
  assert.deepEqual(await unpack(await pack(o)), o);
  assert.match(await pack(o), /^[A-Za-z0-9_-]+$/); // utilisable dans une adresse
});
test('liste partagée : aller-retour sans les autres listes du lieu', async () => {
  const { list, places } = await unpackList(await packList({ name: 'Brunch', icon: 'cup', color: '#2A5BD7' }, [cafe, libre]));
  assert.deepEqual(list, { name: 'Brunch', icon: 'cup', color: '#2A5BD7' });
  assert.equal(places[0].name, cafe.name);
  assert.equal(places[0].osmType, 'node');
  assert.equal(places[0].osmId, 42);
  assert.deepEqual(places[1].lists, []);
  assert.equal(places[1].id, 's48.86,2.35');
});
test('lien abîmé : erreur, pas de plantage silencieux', async () => {
  await assert.rejects(() => unpackList('pas-un-vrai-lien'));
});
test('instantané et restauration de Mes lieux', () => {
  const snap = snapshot({ lists: DEFAULT_LISTS, places: [cafe], shortcuts: { home: libre, work: null }, pins: ['x'], chips: [{ key: 'resto' }] });
  const back = restore(JSON.parse(JSON.stringify(snap)));
  assert.equal(back.places[0].name, cafe.name);
  assert.deepEqual(back.places[0].lists, ['fav', 'todo']);
  assert.equal(back.shortcuts.home.name, 'Point choisi');
  assert.equal(back.shortcuts.work, undefined);
  assert.deepEqual(back.pins, ['x']);
});
test('sauvegarde sans mot de passe', async () => {
  const data = snapshot({ lists: DEFAULT_LISTS, places: [cafe] });
  const r = await readBackup(await backupFile(data));
  assert.equal(r.data.p[0][0], cafe.name);
});
test('sauvegarde chiffrée : mot de passe demandé, bon et mauvais mot de passe', async () => {
  const file = await backupFile(snapshot({ lists: DEFAULT_LISTS, places: [cafe] }), 'secret');
  const raw = JSON.parse(await file.text());
  assert.equal(raw.chiffre, true);
  assert.ok(!JSON.stringify(raw).includes('Test'));          // rien de lisible en clair
  assert.deepEqual(await readBackup(file), { needsPassword: true });
  assert.equal((await readBackup(file, 'secret')).data.p[0][0], cafe.name);
  await assert.rejects(() => readBackup(file, 'faux'));
});
test('fichier qui n’est pas une sauvegarde : refusé', async () => {
  await assert.rejects(() => readBackup(new File(['{"format":"autre"}'], 'x.json')));
  await assert.rejects(() => readBackup(new File(['pas du json'], 'x.json')));
});
test('fusion : ajoute ce qui manque, réunit les listes, garde les noms de listes', () => {
  const same = (a, b) => a.id === b.id;
  const cur = { lists: DEFAULT_LISTS, places: [{ ...cafe, lists: ['fav'] }] };
  const inc = { lists: [...DEFAULT_LISTS, { id: 'brunch', name: 'Brunch' }], places: [{ ...cafe, lists: ['brunch'] }, libre] };
  const r = mergeInto(cur, inc, same);
  assert.equal(r.added, 1);
  assert.deepEqual(r.places[0].lists.sort(), ['brunch', 'fav']);
  assert.ok(r.lists.some((l) => l.name === 'Brunch'));
  assert.equal(r.lists.length, 3);
});
test('anciens favoris sans liste : rangés dans Favoris', () => {
  assert.deepEqual(migratePlaces([{ name: 'a' }])[0].lists, ['fav']);
});
