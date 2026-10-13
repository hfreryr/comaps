// Où se placer dans la rame (métro, RER A et B) pour sortir ou changer de ligne au plus près.
// Données « Positionnement dans la rame », RATP / Île-de-France Mobilités, Licence Ouverte 2.0
// Sorties situées par le « Référentiel des arrêts : Accès » IDFM (Licence Ouverte 2.0).
// (scripts/build_rame.py → static/data/rame.json, ~215 Ko, chargé au premier trajet en transport).

let index = null;
const load = () => (index ??= fetch(new URL('data/rame.json', location.href))
  .then((r) => r.json())
  .catch(() => { index = null; return {}; }));


/** Identifiant IDFM d'un quai à partir de l'identifiant d'arrêt Transitous (…IDFM:22152). */
export const idfmId = (stopId) => /IDFM:(?:monomodalStopPlace:)?(\d+)$/.exec(stopId || '')?.[1] || null;

// Abréviations du référentiel IDFM (« r. de Rennes », « car. de l'Odéon ») écrites en entier
const ABBR = { 'r.': 'rue', 'av.': 'avenue', 'bd': 'boulevard', 'bd.': 'boulevard', 'pl.': 'place', 'car.': 'carrefour', 'q.': 'quai',
  'imp.': 'impasse', 'pass.': 'passage', 'sq.': 'square', 'all.': 'allée', 'ch.': 'chemin', 'crs': 'cours', 'fg': 'faubourg', 'fbg': 'faubourg' };
const full = (name) => name.replace(/^([a-zé]+\.?)\s/i, (m, w) => (ABBR[w.toLowerCase()] ? `${ABBR[w.toLowerCase()]} ` : m))
  .replace(/^./, (c) => c.toUpperCase());

const dist = (a, b) => Math.hypot((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 111320;

/**
 * Sortie conseillée à l'arrivée sur le quai `stopId` : celle, parmi les sorties renseignées par la RATP pour ce quai,
 * qui est la plus proche de `goal` ; avec la voiture où monter pour l'atteindre au plus vite.
 * @returns {Promise<{exit:{ref:string|null, name:string, lat:number, lon:number}, place:{pos:number, of:number, where:string}}|null>}
 */
export async function exitForQuay(stopId, goal) {
  const list = (await load())[idfmId(stopId)]?.x;
  if (!list?.length || !goal) return null;
  const [lon, lat, ref, name, pos, of, where] = list
    .map((e) => [e, dist({ lon: e[0], lat: e[1] }, goal)]).sort((a, b) => a[1] - b[1])[0][0];
  return { exit: { ref: ref || null, name: full(name), lat, lon }, place: { pos, of, where } };
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
