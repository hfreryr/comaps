// Icône de l'app : chaque image déclarée existe et a la taille annoncée (sinon l'installation sur téléphone échoue en silence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const dir = new URL('../../static/', import.meta.url).pathname;
const pngSize = (f) => { const b = readFileSync(dir + f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('manifeste : icônes présentes, aux bonnes tailles, une version « maskable » pour Android', () => {
  const m = JSON.parse(readFileSync(dir + 'manifest.webmanifest', 'utf8'));
  for (const i of m.icons) {
    assert.ok(existsSync(dir + i.src), `${i.src} absent`);
    if (i.type === 'image/png') { const [w, h] = pngSize(i.src); assert.equal(`${w}x${h}`, i.sizes, i.src); }
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'pas de version maskable');
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'), 'pas de 512 px');
});

test('iPhone et onglet : images liées depuis la page', () => {
  const html = readFileSync(new URL('../../src/app.html', import.meta.url), 'utf8');
  for (const [rel, f, size] of [['apple-touch-icon', 'apple-touch-icon.png', 180], ['icon', 'favicon-32.png', 32]]) {
    assert.match(html, new RegExp(`rel="${rel}" href="%sveltekit.assets%/${f}"`));
    assert.deepEqual(pngSize(f), [size, size]);
  }
});
