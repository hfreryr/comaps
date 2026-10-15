// La page « Qui voit quoi » doit dire vrai : si le guidage renvoie la position à un service, la page le dit.
// (Écart trouvé grâce à une question de P5, 15/10/2026 : la page affirmait que le guidage tournait entièrement sur l'appareil.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fr from '../../src/lib/i18n/fr.js';

test('recalcul pendant le guidage : la page Qui voit quoi le mentionne', () => {
  const nav = fs.readFileSync(new URL('../../src/lib/navflow.js', import.meta.url), 'utf8');
  const sendsPosition = /async function reroute\(\)[\s\S]*?streetRoute\(\{ lat: app\.me\.lat/.test(nav);
  assert.ok(sendsPosition, 'le recalcul a changé : relire la page Qui voit quoi et ce test');
  const page = Object.entries(fr).filter(([k]) => k.startsWith('confidentialite.')).map(([, v]) => v).join(' ');
  assert.match(page, /recalcul/, 'la page doit dire que la position est renvoyée en cas de recalcul');
  assert.doesNotMatch(page, /guidage, qui tourne entièrement sur l’appareil/);
});
