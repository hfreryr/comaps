// Liens vers les sites des lieux : seulement des adresses web, jamais de code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { href, host } from '#lib/links.js';

test('adresses web gardées, adresses sans schéma complétées', () => {
  assert.equal(href('https://exemple.fr/a'), 'https://exemple.fr/a');
  assert.equal(href('HTTP://exemple.fr'), 'HTTP://exemple.fr');
  assert.equal(href('www.exemple.fr'), 'https://www.exemple.fr');
});
test('schémas dangereux neutralisés', () => {
  assert.equal(href('javascript:alert(1)'), '#');
  assert.equal(href(' JaVa\tScRiPt:alert(1)'), '#');
  assert.equal(href('data:text/html,<script>'), '#');
});
test('nom de domaine affiché', () => {
  assert.equal(host('https://www.exemple.fr/menu'), 'exemple.fr');
});
