// Lieux OpenStreetMap lus dans des tuiles préparées à l'avance (scripts/build_places.py).
// Aucune requête lieu par lieu à un service tiers : l'app charge la tuile (≈ 2,4 km de côté) et y lit tout.
// Tout reste sur l'appareil ; seules les tuiles consultées sont téléchargées, depuis notre hébergement.
import { dataBase } from './config.js';

let index = null;          // { zoom, tiles: Set('x/y'), built }
const tiles = new Map();   // 'x/y' → Promise<[{ id, lon, lat, tags }]>

async function loadIndex() {
  if (index) return index;
  try {
    const r = await fetch(`${dataBase()}places/index.json`);
    const j = r.ok ? await r.json() : null;
    index = j ? { zoom: j.zoom, built: j.built, tiles: new Set(j.tiles) } : { zoom: 14, built: null, tiles: new Set() };
  } catch {
    index = { zoom: 14, built: null, tiles: new Set() };
  }
  return index;
}

export function tileXY(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [x, y];
}

function loadTile(x, y) {
  const key = `${x}/${y}`;
  if (!tiles.has(key)) {
    tiles.set(key, (async () => {
      const idx = await loadIndex();
      if (!idx.tiles.has(key)) return [];
      const r = await fetch(`${dataBase()}places/${idx.zoom}/${x}/${y}.json`).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      return (j?.t || []).map(([id, lon, lat, tags, f]) => ({ id, lon, lat, tags, facade: f ? facadeOf(f) : null }));
    })());
  }
  return tiles.get(key);
}

/** Les lieux d'une zone (au plus `maxTiles` tuiles, les plus proches du centre d'abord). */
export async function placesInBounds({ west, south, east, north }, maxTiles = 6) {
  const idx = await loadIndex();
  const [x0, y0] = tileXY(west, north, idx.zoom);
  const [x1, y1] = tileXY(east, south, idx.zoom);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const keys = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (idx.tiles.has(`${x}/${y}`)) keys.push([x, y]);
  keys.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
  const lists = await Promise.all(keys.slice(0, maxTiles).map(([x, y]) => loadTile(x, y)));
  return lists.flat();
}

/** Un lieu par son identifiant OSM, cherché dans la tuile de sa position (et les voisines si besoin). */
export async function placeById(osmType, osmId, lat, lon) {
  const idx = await loadIndex();
  const id = Number(osmId) * 10 + { node: 1, way: 2, relation: 3 }[osmType];
  const [x, y] = tileXY(lon, lat, idx.zoom);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const hit = (await loadTile(x + dx, y + dy)).find((p) => p.id === id);
    if (hit) return hit;
  }
  return null;
}

/** La zone couverte par les données ? */
export async function covers(lat, lon) {
  const idx = await loadIndex();
  const [x, y] = tileXY(lon, lat, idx.zoom);
  return idx.tiles.has(`${x}/${y}`);
}

/** Date de l'extrait OSM dont viennent les lieux (affichée dans l'app). */
export async function dataDate() {
  return (await loadIndex()).built;
}

/**
 * Photo de devanture (Panoramax, 360°) : de quoi la charger et la recadrer vers le lieu.
 * [idPhoto, hôte, azimut de la photo, cap vers le lieu, distance, licence, auteur, date]
 */
function facadeOf([id, host, az, bearing, d, lic, by, date]) {
  // l'image complète (2048 × 1024, équirectangulaire) ; le recadrage se fait à l'affichage
  const src = `https://${host}/api/pictures/${id}/sd.jpg`;
  // tuiles haute définition (16 × 8 de 768 px) pour le plein écran
  const tile = (col, row) => `https://${host}/api/pictures/${id}/tiled/${col}_${row}.jpg`;
  const rel = ((bearing - az + 540) % 360) - 180;     // où regarder, en degrés depuis le centre de la photo
  const credit = lic.startsWith('etalab') ? 'Ville de Paris / IGN, Panoramax' : `${by || 'contributeur'}, Panoramax (${lic})`;
  return { id, src, tile, rel, d, credit, lic, date, page: `https://api.panoramax.xyz/#focus=pic&pic=${id}` };
}
