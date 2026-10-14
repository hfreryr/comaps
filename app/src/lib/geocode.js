// Recherche par texte et adresse d'un point : une seule interface, plusieurs fournisseurs selon le pays.
//
//  - Adresses en France : géocodeur de l'État (Géoplateforme / Base Adresse Nationale), service public,
//    accès ouvert, 50 requêtes/s par adresse IP. Rapide (≈ 0,4 s mesuré).
//  - Noms de lieux (commerces, monuments) : Photon (instance publique de komoot, « usage raisonnable »),
//    à remplacer par notre propre instance avant tout lancement public.
//
// Ce qui est envoyé : le texte tapé et un point de référence (centre de la carte ou position), rien d'autre.
import { tx } from '#lib/i18n/index.js';
import { city } from './cities/index.js';
import { typeLabel } from './places.js';

const PHOTON = 'https://photon.komoot.io';
const GEOPF = 'https://data.geopf.fr/geocodage';

const looksLikeAddress = (q) => /\d/.test(q) && !/\b(ligne|bus|rer|tram|m\d{1,2})\b/i.test(q);

function fromPhoton(f) {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const isAddress = !p.name;
  const line = [p.housenumber, p.street].filter(Boolean).join(' ');
  const where = p.postcode ? `${p.postcode} ${p.city || ''}`.trim() : p.district || p.city;
  const addr = [line, where].filter(Boolean).join(', ');
  return {
    id: `${p.osm_type}${p.osm_id}`,
    osmType: { N: 'node', W: 'way', R: 'relation' }[p.osm_type],
    osmId: p.osm_id,
    name: p.name || addr,
    type: isAddress ? tx('fiche.adresse') : typeLabel(p.osm_key, p.osm_value),
    subclass: isAddress ? null : p.osm_value,
    address: isAddress ? [p.postcode, p.city].filter(Boolean).join(' ') : addr,
    lat, lon
  };
}

function fromGeopf(f) {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const street = p.type === 'street' || p.type === 'locality';
  return {
    id: `ban:${p.id}`,
    name: street ? `${p.name}, ${p.postcode} ${p.city}` : `${p.name}, ${p.postcode} ${p.city}`,
    type: street ? tx('resultats.rue') : tx('fiche.adresse'),
    subclass: null,
    address: `${p.postcode} ${p.city}`,
    lat, lon,
    score: p.score
  };
}

async function photon(query, near, signal, limit = 7) {
  const url = new URL(`${PHOTON}/api/`);
  url.search = new URLSearchParams({
    q: query, lang: 'fr', limit: String(limit), lat: String(near.lat), lon: String(near.lon),
    location_bias_scale: '0.4', bbox: city.searchBbox.join(',')
  });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const seen = new Set();
  return (await res.json()).features
    .filter((f) => { const id = `${f.properties.osm_type}${f.properties.osm_id}`; return !seen.has(id) && seen.add(id); })
    .map(fromPhoton);
}

async function geopf(query, near, signal, limit = 5) {
  const url = new URL(`${GEOPF}/search`);
  url.search = new URLSearchParams({ q: query, index: 'address', limit: String(limit), lat: String(near.lat), lon: String(near.lon) });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Géoplateforme ${res.status}`);
  const all = (await res.json()).features.map(fromGeopf).filter((r) => r.score == null || r.score > 0.4);
  // la zone de la ville d'abord (le géocodeur est national) ; ailleurs seulement si rien ici
  const [w, s, e, n] = city.searchBbox;
  const here = all.filter((r) => r.lon > w && r.lon < e && r.lat > s && r.lat < n);
  return here.length ? here : all;
}

const near = (a, b) => Math.hypot((a.lon - b.lon) * 0.66, a.lat - b.lat) * 111320 < 40;

/**
 * Lieux et adresses correspondant au texte, les plus pertinents d'abord.
 * Une adresse (texte avec un numéro) part d'abord au géocodeur de l'État ; les noms vont à Photon.
 */
export async function search(query, at = city.center, signal) {
  const q = query.trim();
  if (!q) return [];
  if (city.country === 'FR' && looksLikeAddress(q)) {
    // l'adresse d'abord (rapide) ; Photon n'est consulté que si l'adresse n'est pas nette (un nom de commerce avec un chiffre…)
    const a = await geopf(q, at, signal).catch(() => []);
    if (a[0]?.type === 'Adresse' && a[0].score > 0.8) return a.slice(0, 5);
    const p = await photon(q, at, signal, 5).catch(() => []);
    const places = p.filter((r) => r.type !== 'Adresse' && !a.some((x) => near(x, r)));
    return [...a.slice(0, 1), ...places.slice(0, 3), ...a.slice(1)].slice(0, 7);
  }
  return photon(q, at, signal);
}

/** Adresse la plus proche d'un point (nom de rue ou lieu). */
export async function reverse(lat, lon) {
  if (city.country === 'FR') {
    const r = await fetch(`${GEOPF}/reverse?lon=${lon}&lat=${lat}&index=address&limit=1`).catch(() => null);
    const p = r?.ok ? (await r.json()).features?.[0]?.properties : null;
    if (p) return p.name;
  }
  const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=fr&limit=1`).catch(() => null);
  const p = res?.ok ? (await res.json()).features?.[0]?.properties : null;
  if (!p) return null;
  const line = [p.housenumber, p.street].filter(Boolean).join(' ');
  return p.name && !p.housenumber ? p.name : line || p.name || null;
}

/** Adresse postale complète d'un point : « 57 Rue de Rennes, 75006 Paris ». */
export async function reverseAddress(lat, lon) {
  if (city.country === 'FR') {
    const r = await fetch(`${GEOPF}/reverse?lon=${lon}&lat=${lat}&index=address&limit=1`).catch(() => null);
    const p = r?.ok ? (await r.json()).features?.[0]?.properties : null;
    if (p) return `${p.name}, ${p.postcode} ${p.city}`;
  }
  const res = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=fr&limit=1&layer=house&layer=street`).catch(() => null);
  const p = res?.ok ? (await res.json()).features?.[0]?.properties : null;
  if (!p) return null;
  const line = p.housenumber ? [p.housenumber, p.street].filter(Boolean).join(' ') : p.street || p.name;
  const where = [p.postcode, p.city].filter(Boolean).join(' ');
  return line ? [line, where].filter(Boolean).join(', ') : null;
}
