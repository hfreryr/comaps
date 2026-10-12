// « Mes lieux » : listes de lieux, transfert vers un autre appareil et sauvegarde.
// Tout reste sur l'appareil. Aucun serveur : le transfert passe par un lien dont les données sont
// après le « # » (jamais envoyé au site), la sauvegarde par un fichier que l'on range où l'on veut.

export const DEFAULT_LISTS = [
  { id: 'fav', name: 'Favoris', icon: 'heart', color: '#D63A7A' },
  { id: 'todo', name: 'À tester', icon: 'flag', color: '#E0862F' }
];
// Pictogrammes et couleurs proposés pour une nouvelle liste
export const LIST_ICONS = ['heart', 'flag', 'star', 'utensils', 'cup', 'bed', 'tree', 'bag', 'ticket', 'book'];
export const LIST_COLORS = ['#D63A7A', '#E0862F', '#2A5BD7', '#1E8E3E', '#7A4FC4', '#0E8A94', '#C7972B', '#5F6B7A'];

/** Lieux enregistrés : chacun appartient à une ou plusieurs listes (anciens favoris → « Favoris »). */
export function migratePlaces(places) {
  return places.map((p) => (Array.isArray(p.lists) && p.lists.length ? p : { ...p, lists: ['fav'] }));
}

// ——— Encodage compact (lien) : JSON → deflate → base64url ———
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
export async function pack(obj) {
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('deflate-raw'));
  // (btoa sur de gros tableaux : par morceaux)
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function unpack(str) {
  const bytes = await pipe(unb64url(str), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Un lieu en tableau court : [nom, lat, lon, osm, listes, adresse, type]
const short = (p) => [p.name, +p.lat.toFixed(6), +p.lon.toFixed(6), p.osmType ? `${p.osmType[0]}${p.osmId}` : '', p.lists || [], p.address || '', p.type || ''];
const long = ([name, lat, lon, osm, lists, address, type]) => {
  const t = { n: 'node', w: 'way', r: 'relation' }[osm?.[0]];
  return { id: t ? `${t}${osm.slice(1)}` : `s${lat},${lon}`, name, lat, lon, lists: lists || ['fav'], address: address || '', type: type || '',
    ...(t ? { osmType: t, osmId: Number(osm.slice(1)) } : {}) };
};

/** Une liste à partager : nom, pictogramme, couleur et lieux. */
export const packList = (list, places) => pack({ v: 1, l: { n: list.name, i: list.icon, c: list.color }, p: places.map((p) => short({ ...p, lists: [] })) });
export async function unpackList(str) {
  const o = await unpack(str);
  return { list: { name: o.l.n, icon: o.l.i, color: o.l.c }, places: o.p.map(long) };
}

/** Tout « Mes lieux » (listes, lieux, Maison/Travail, épinglés, raccourcis). */
export function snapshot({ lists, places, shortcuts, pins, chips }) {
  return { v: 1, app: 'Untracked Maps', date: new Date().toISOString(), lists,
    p: places.map(short), s: Object.fromEntries(Object.entries(shortcuts || {}).filter(([, v]) => v).map(([k, v]) => [k, short(v)])),
    pins: pins || [], chips: chips || [] };
}
export function restore(o) {
  return { lists: o.lists || DEFAULT_LISTS, places: (o.p || []).map(long),
    shortcuts: Object.fromEntries(Object.entries(o.s || {}).map(([k, v]) => [k, long(v)])), pins: o.pins || [], chips: o.chips || [] };
}

// ——— Sauvegarde dans un fichier, protégée par un mot de passe si on le souhaite ———
async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function backupFile(data, password) {
  let body = { format: 'untracked-maps-sauvegarde', ...data };
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(password, salt), new TextEncoder().encode(JSON.stringify(data))));
    body = { format: 'untracked-maps-sauvegarde', chiffre: true, salt: b64url(salt), iv: b64url(iv), data: b64url(enc) };
  }
  const day = new Date().toISOString().slice(0, 10);
  return new File([JSON.stringify(body)], `untracked-maps-mes-lieux-${day}.json`, { type: 'application/json' });
}
/** @returns {Promise<{data?:object, needsPassword?:boolean}>} */
export async function readBackup(file, password) {
  const o = JSON.parse(await file.text());
  if (o.format !== 'untracked-maps-sauvegarde') throw new Error('format');
  if (!o.chiffre) return { data: o };
  if (!password) return { needsPassword: true };
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(o.iv) }, await keyFrom(password, unb64url(o.salt)), unb64url(o.data));
  return { data: JSON.parse(new TextDecoder().decode(plain)) };
}

/** Fusion : on ajoute ce qui manque, on réunit les listes d'un même lieu. */
export function mergeInto(cur, inc, same) {
  const lists = [...cur.lists];
  const idMap = {};
  for (const l of inc.lists) {
    const found = lists.find((x) => x.id === l.id || x.name.toLowerCase() === l.name.toLowerCase());
    if (found) idMap[l.id] = found.id;
    else { const id = lists.some((x) => x.id === l.id) ? `l${Date.now().toString(36)}${lists.length}` : l.id; lists.push({ ...l, id }); idMap[l.id] = id; }
  }
  const places = cur.places.map((p) => ({ ...p }));
  let added = 0;
  for (const p of inc.places) {
    const ls = (p.lists || ['fav']).map((x) => idMap[x] || x);
    const ex = places.find((q) => same(q, p));
    if (ex) ex.lists = [...new Set([...(ex.lists || []), ...ls])];
    else { places.push({ ...p, lists: ls }); added++; }
  }
  return { lists, places, added };
}
