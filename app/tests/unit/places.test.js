// Type lisible d'un lieu d'après ses étiquettes OSM (fiche ouverte depuis un lien partagé).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeOfTags } from '#lib/places.js';

test('type d\'un lieu d\'après ses étiquettes', () => {
  assert.equal(typeOfTags({ shop: 'clothes', name: 'Etam' }), 'Vêtements');
  assert.equal(typeOfTags({ amenity: 'restaurant' }), 'Restaurant');
  assert.equal(typeOfTags({ amenity: 'inconnu_xyz', shop: 'bakery' }), 'Boulangerie');   // première étiquette reconnue
  assert.equal(typeOfTags({ name: 'Sans type' }), null);
});
