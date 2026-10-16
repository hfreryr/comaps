// Règles d'interface (docs/regles-interface.md) : placement des menus, toujours entiers à l'écran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeNear } from '#lib/popover.js';

const view = { w: 375, h: 667 };
test('au-dessus du bouton quand il y a la place, aligné à droite', () => {
  const p = placeNear({ top: 600, bottom: 640, left: 320, right: 360 }, { w: 220, h: 250 }, view, 'above', 'end');
  assert.equal(p.side, 'above'); assert.equal(p.left, 140); assert.equal(p.top, 600 - 8 - 250);
});
test('bouton en haut d’écran : le menu passe en dessous', () => {
  const p = placeNear({ top: 40, bottom: 80, left: 300, right: 340 }, { w: 220, h: 250 }, view, 'above', 'end');
  assert.equal(p.side, 'below'); assert.equal(p.top, 88);
});
test('menu plus haut que la place : il défile, jamais hors de l’écran', () => {
  const p = placeNear({ top: 300, bottom: 340, left: 300, right: 340 }, { w: 220, h: 900 }, view, 'above', 'end');
  assert.ok(p.top >= 8 && p.top + p.maxHeight <= view.h - 8 + 0.01);
});
test('jamais coupé à gauche ni à droite', () => {
  const p = placeNear({ top: 600, bottom: 640, left: 4, right: 44 }, { w: 300, h: 100 }, view, 'above', 'end');
  assert.equal(p.left, 8);
});
