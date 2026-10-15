// Recherches par type de lieu (« pharmacie », « restaurant italien », « vegan ») : les lieux de ce type les plus proches,
// lus dans nos tuiles de lieux, au lieu de lieux dont le nom contient le mot (« Pharmacie des Musées » pour « musées »).
import { norm } from './searchindex.js';

const yes = (v) => v === 'yes' || v === 'only';
const veg = (t) => yes(t['diet:vegetarian']) || yes(t['diet:vegan']);
const food = (t) => ['restaurant', 'fast_food', 'cafe'].includes(t.amenity);
const CUISINES = {
  italien: 'italian', japonais: 'japanese', chinois: 'chinese', indien: 'indian', libanais: 'lebanese', vietnamien: 'vietnamese',
  thai: 'thai', thailandais: 'thai', coreen: 'korean', grec: 'greek', mexicain: 'mexican', marocain: 'moroccan', francais: 'french',
  africain: 'african', pizza: 'pizza', pizzeria: 'pizza', sushi: 'sushi', burger: 'burger', creperie: 'crepe', kebab: 'kebab'
};

// mot (au singulier, sans accent) → lieux qui conviennent
const SIMPLE = {
  pharmacie: (t) => t.amenity === 'pharmacy', boulangerie: (t) => t.shop === 'bakery', supermarche: (t) => t.shop === 'supermarket',
  toilette: (t) => t.amenity === 'toilets', wc: (t) => t.amenity === 'toilets', distributeur: (t) => t.amenity === 'atm', dab: (t) => t.amenity === 'atm',
  musee: (t) => t.tourism === 'museum', parc: (t) => t.leisure === 'park', jardin: (t) => t.leisure === 'park' || t.leisure === 'garden',
  cinema: (t) => t.amenity === 'cinema', hopital: (t) => t.amenity === 'hospital', hopitaux: (t) => t.amenity === 'hospital',
  piscine: (t) => t.leisure === 'swimming_pool' || (t.leisure === 'sports_centre' && /swimming/.test(t.sport || '')),
  restaurant: (t) => t.amenity === 'restaurant', cafe: (t) => t.amenity === 'cafe', bar: (t) => t.amenity === 'bar' || t.amenity === 'pub',
  bibliotheque: (t) => t.amenity === 'library', poste: (t) => t.amenity === 'post_office', banque: (t) => t.amenity === 'bank',
  medecin: (t) => t.amenity === 'doctors' || t.healthcare === 'doctor', dentiste: (t) => t.amenity === 'dentist',
  vegan: (t) => food(t) && yes(t['diet:vegan']), vegetalien: (t) => food(t) && yes(t['diet:vegan']), vegetarien: (t) => food(t) && veg(t),
  veggie: (t) => food(t) && veg(t)
};
const FILLER = new Set(['restaurant', 'restaurants', 'resto', 'restos', 'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'proche', 'pres', 'autour', 'ici', 'moi']);
const sing = (w) => (w.length > 3 && /[sx]$/.test(w) && !/^(wc|dab)$/.test(w) ? w.slice(0, -1) : w);

/** Le texte tapé désigne-t-il un type de lieu ? Renvoie un filtre sur les étiquettes OSM, ou null. */
export function intentOf(query) {
  const words = norm(query).split(' ').filter(Boolean).map(sing);
  if (!words.length || words.length > 4) return null;
  const kept = words.filter((w) => !FILLER.has(w) && !FILLER.has(w + 's'));
  // « restaurant italien », « italien »
  if (kept.length === 1 && CUISINES[kept[0]] && (words.length > 1 || kept[0].length > 4)) {
    const c = CUISINES[kept[0]];
    return (t) => food(t) && (t.cuisine || '').split(';').includes(c);
  }
  if (kept.length === 0 && words.includes('restaurant')) return SIMPLE.restaurant;
  if (kept.length === 1 && SIMPLE[kept[0]]) return SIMPLE[kept[0]];
  return null;
}

/** Les plus proches d'abord. @param {{lon,lat,tags,id}[]} places */
export function nearestOf(places, filter, at, limit = 7) {
  const k = Math.cos((at.lat * Math.PI) / 180);
  return places.filter((p) => filter(p.tags))
    .map((p) => ({ p, d: Math.hypot((p.lon - at.lon) * k, p.lat - at.lat) }))
    .sort((a, b) => a.d - b.d).slice(0, limit).map(({ p }) => p);
}
