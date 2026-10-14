// Sorties de métro et de RER, tirées d'OpenStreetMap au moment de construire l'app
// (scripts/build_overlays.py → static/data/exits.json, ~60 Ko, chargé à la première station ouverte).
// Rien n'est demandé à un serveur extérieur.
//
// La place conseillée dans la rame (tête ou queue) n'existe dans aucune source ouverte connue
// à ce jour : on ne l'invente pas.
import { tx } from '#lib/i18n/index.js';

let index = null;
const load = () => (index ??= fetch(new URL('data/exits.json', location.href))
  .then((r) => r.json())
  .catch(() => { index = null; return []; }));

const dist = (a, b) => {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(x, b.lat - a.lat) * 111320;
};

/** Sorties à moins de `radius` m d'une station : [{ ref, name, lat, lon, wheelchair, escalator }] */
export async function stationExits(lat, lon, radius = 170) {
  const all = await load();
  const out = [];
  const seen = new Set();
  for (const [la, lo, ref, name, wc, esc] of all) {
    if (Math.abs(la - lat) > 0.004 || Math.abs(lo - lon) > 0.006) continue;
    const e = { lat: la, lon: lo, ref: ref || null, name: name || null, wheelchair: !!wc, escalator: !!esc };
    if (dist(e, { lat, lon }) > radius) continue;
    const k = `${ref}|${name}`;              // une sortie cartographiée deux fois (deux quais) : une seule ligne
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** La sortie la plus proche de l'endroit où l'on va ensuite (null si aucune n'est connue). */
export async function bestExit(station, next) {
  const exits = await stationExits(station.lat, station.lon);
  if (!exits.length) return null;
  return exits.map((e) => ({ ...e, d: dist(e, next) })).sort((a, b) => a.d - b.d)[0];
}

/** « Sortie 3 · Rue de Rennes » */
export const exitLabel = (e) => [e.ref && tx('fiche.sortie', { ref: e.ref }), e.name].filter(Boolean).join(' · ');

/** Tri des sorties pour la fiche d'une station : par numéro, puis par nom. */
export const sortExits = (list) => [...list].sort((a, b) =>
  (parseInt(a.ref) || 99) - (parseInt(b.ref) || 99) || String(a.name).localeCompare(String(b.name), 'fr'));
