// Itinéraires.
//  - À pied et à vélo : Valhalla (serveur public FOSSGIS, données OpenStreetMap).
//  - Transports en commun : Transitous (MOTIS 2, données ouvertes des réseaux de transport).
// Prototype : serveurs publics à usage léger. Transitous demande d'être prévenu avant un usage large.

const VALHALLA = 'https://valhalla1.openstreetmap.de/route';
const TRANSITOUS = 'https://api.transitous.org/api/v5/plan';

// ——— Lissage des tracés ———
// Les trottoirs de Paris sont cartographiés à part : un trajet brut fait des crochets à chaque
// traversée. On simplifie (Douglas-Peucker, en mètres) puis on arrondit les angles (Chaikin).
const M_PER_DEG_LAT = 111320;
function perpDist([x, y], [x1, y1], [x2, y2], k) {
  const ax = (x - x1) * k, ay = y - y1, bx = (x2 - x1) * k, by = y2 - y1;
  const len = Math.hypot(bx, by);
  if (!len) return Math.hypot(ax, ay) * M_PER_DEG_LAT;
  const t = Math.max(0, Math.min(1, (ax * bx + ay * by) / (len * len)));
  return Math.hypot(ax - t * bx, ay - t * by) * M_PER_DEG_LAT;
}
function simplify(coords, tolMeters) {
  if (coords.length < 3) return coords;
  const k = Math.cos((coords[0][1] * Math.PI) / 180);
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(coords[i], coords[a], coords[b], k);
      if (d > max) { max = d; idx = i; }
    }
    if (max > tolMeters) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return coords.filter((_, i) => keep[i]);
}
function chaikin(coords, iterations = 2) {
  for (let n = 0; n < iterations && coords.length > 2; n++) {
    const out = [coords[0]];
    for (let i = 0; i < coords.length - 1; i++) {
      const [x0, y0] = coords[i], [x1, y1] = coords[i + 1];
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    out.push(coords[coords.length - 1]);
    coords = out;
  }
  return coords;
}
export const smooth = (coords, tol = 7) => chaikin(simplify(coords, tol));

export function decodePolyline(str, precision = 6) {
  const factor = 10 ** precision;
  const coords = [];
  let lat = 0, lon = 0, i = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta; else lon += delta;
    }
    coords.push([lon / factor, lat / factor]);
  }
  return coords;
}

/** À pied ou à vélo. @returns {{duration:number, distance:number, coords:number[][], steps:{text:string, distance:number}[]}} */
export async function streetRoute(from, to, mode, signal) {
  const costing = mode === 'bike' ? 'bicycle' : 'pedestrian';
  const body = {
    locations: [{ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }],
    costing,
    costing_options: mode === 'bike' ? { bicycle: { bicycle_type: 'City', use_roads: 0.25 } } : {},
    language: 'fr-FR',
    units: 'km'
  };
  const url = `${VALHALLA}?json=${encodeURIComponent(JSON.stringify(body))}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(res.status === 400 ? 'no-route' : `valhalla-${res.status}`);
  const { trip } = await res.json();
  const leg = trip.legs[0];
  return {
    duration: trip.summary.time,
    distance: trip.summary.length * 1000,
    coords: smooth(decodePolyline(leg.shape, 6), mode === 'bike' ? 4 : 7),
    steps: simplifySteps(leg.maneuvers)
  };
}

// Des consignes à l'échelle de la rue, pas du trottoir : les petits tronçons sans nom
// (traversées, bouts de trottoir) sont fondus dans la consigne précédente.
function simplifySteps(maneuvers) {
  const steps = [];
  for (const m of maneuvers) {
    if (m.type === 4 || m.type === 5 || m.type === 6) continue; // « Vous êtes arrivé »
    const street = m.street_names?.[0];
    const named = street && !/^(allée|trottoir|chemin|passage piéton)$/i.test(street);
    const s = { text: tidy(m.instruction), distance: m.length * 1000, named };
    const last = steps[steps.length - 1];
    if (last && !named && s.distance < 80) { last.distance += s.distance; continue; }
    if (last && last.text === s.text) { last.distance += s.distance; continue; }
    steps.push(s);
  }
  return steps;
}

// Les trottoirs sans nom deviennent « l'allée » dans les consignes : on les retire.
// … et « Tournez à gauche dans Rue du Four » devient « Tournez à gauche rue du Four ».
function tidy(text) {
  return text
    .replace(/ (dans|sur|vers) (l'allée|le trottoir|le chemin|le passage piéton)/g, '')
    .replace(/ (dans|sur) (Rue|Avenue|Boulevard|Place|Quai|Passage|Impasse|Cours|Square|Pont|Villa|Cité|Allée) /g,
      (_, __, type) => ` ${type.toLowerCase()} `)
    .replace(/\s+\./g, '.');
}

/** Transports en commun : plusieurs propositions, triées par heure d'arrivée. */
export async function transitRoutes(from, to, signal, when = new Date()) {
  const url = new URL(TRANSITOUS);
  url.search = new URLSearchParams({
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${to.lat},${to.lon}`,
    time: when.toISOString(),
    numItineraries: '10'
  });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`transitous-${res.status}`);
  const data = await res.json();
  const groups = new Map();
  for (const raw of data.itineraries || []) {
    const it = {
      duration: raw.duration,
      start: new Date(raw.startTime),
      end: new Date(raw.endTime),
      legs: raw.legs.map((l) => ({
        mode: l.mode,
        line: l.routeShortName || '',
        color: l.routeColor ? `#${l.routeColor}` : '#5B6573',
        textColor: l.routeTextColor ? `#${l.routeTextColor}` : '#FFFFFF',
        headsign: l.headsign || '',
        from: l.from?.name === 'START' ? 'Départ' : l.from?.name,
        to: l.to?.name === 'END' ? 'Arrivée' : l.to?.name,
        start: new Date(l.startTime),
        end: new Date(l.endTime),
        duration: l.duration,
        distance: l.distance || 0,
        stops: (l.intermediateStops || []).length,
        realTime: l.realTime,
        coords: l.legGeometry
          ? smooth(decodePolyline(l.legGeometry.points, l.legGeometry.precision || 6), l.mode === 'WALK' ? 7 : 3)
          : []
      }))
    };
    it.board = it.legs.find((l) => l.mode !== 'WALK') || null; // premier véhicule : arrêt et heure de départ
    if (!it.board) continue; // trajet entièrement à pied : l'onglet « À pied » s'en charge
    // une même combinaison de lignes = une seule proposition, avec ses prochains départs
    const key = it.legs.filter((l) => l.mode !== 'WALK').map((l) => `${l.mode}:${l.line}`).join('>');
    const g = groups.get(key);
    if (!g) { it.next = []; groups.set(key, it); }
    else if (g.next.length < 3 && +it.board.start !== +g.board.start) g.next.push(it.board.start);
  }
  return [...groups.values()].sort((a, b) => a.end - b.end).slice(0, 4);
}

export const MODE_NAMES = {
  SUBWAY: 'Métro', METRO: 'Métro', BUS: 'Bus', TRAM: 'Tram', RAIL: 'Train', REGIONAL_RAIL: 'RER',
  SUBURBAN: 'RER', COACH: 'Car', FERRY: 'Bateau', FUNICULAR: 'Funiculaire', CABLE_CAR: 'Téléphérique',
  HIGHSPEED_RAIL: 'Train', LONG_DISTANCE: 'Train', NIGHT_RAIL: 'Train de nuit', REGIONAL_FAST_RAIL: 'Train'
};

export function fmtDuration(seconds) {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}

export function fmtTime(d) {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

export function fmtDistance(m) {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 9500 ? 1 : 0).replace('.', ',')} km`;
}
