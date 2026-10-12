// Où se placer dans la rame (métro, RER A et B) pour sortir ou changer de ligne au plus près.
// Données « Positionnement dans la rame », RATP / Île-de-France Mobilités, Licence Ouverte 2.0
// (scripts/build_rame.py → static/data/rame.json, ~150 Ko, chargé au premier trajet en transport).

let index = null;
const load = () => (index ??= fetch(new URL('data/rame.json', location.href))
  .then((r) => r.json())
  .catch(() => { index = null; return {}; }));

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Mots qui ne distinguent pas une rue d'une autre
const STOP = new Set(['rue', 'avenue', 'av', 'boulevard', 'bd', 'place', 'pl', 'quai', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd',
  'et', 'sortie', 'acces', 'cote', 'face', 'au', 'aux', 'a', 'impasse', 'passage', 'square', 'cours', 'allee', 'pont', 'gare', 'station']);
const words = (s) => norm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));

/** Identifiant IDFM d'un quai à partir de l'identifiant d'arrêt Transitous (…IDFM:22152). */
export const idfmId = (stopId) => /IDFM:(?:monomodalStopPlace:)?(\d+)$/.exec(stopId || '')?.[1] || null;

/**
 * Position conseillée pour sortir par `exitName` (nom de la sortie OSM, ex. « Rue Custine ») à l'arrivée sur le quai `stopId`.
 * Si le nom ne correspond à aucune sortie connue, on ne conseille rien plutôt que de deviner.
 * @returns {Promise<{pos:number, of:number, where:'Avant'|'Milieu'|'Arrière'}|null>}
 */
export async function placeForExit(stopId, exitName) {
  const quai = (await load())[idfmId(stopId)];
  if (!quai || !exitName) return null;
  const want = new Set(words(exitName));
  if (!want.size) return null;
  let best = null, score = 0;
  for (const [k, v] of Object.entries(quai)) {
    if (!k.startsWith('a:')) continue;
    const w = words(k.slice(2));
    const s = w.filter((x) => want.has(x)).length / Math.max(want.size, 1);
    if (s > score) { score = s; best = v; }
  }
  return best && score >= 0.5 ? { pos: best[0], of: best[1], where: best[2] } : null;
}

/** Position conseillée pour une correspondance : arrivée sur le quai `stopId`, départ du quai `nextStopId`. */
export async function placeForTransfer(stopId, nextStopId) {
  const quai = (await load())[idfmId(stopId)];
  const v = quai?.[`s:${idfmId(nextStopId)}`];
  return v ? { pos: v[0], of: v[1], where: v[2] } : null;
}

/** « à l'avant du train (voiture 1 sur 6) » */
export function placeLabel(p) {
  const where = { Avant: "à l'avant", Milieu: 'au milieu', Arrière: "à l'arrière" }[p.where] || '';
  return `${where} du train (voiture ${p.pos} sur ${p.of})`;
}
