// Itinéraires.
//  - À pied et à vélo : Valhalla (serveur public FOSSGIS, données OpenStreetMap).
//  - Transports en commun : Transitous (MOTIS 2, données ouvertes des réseaux de transport).
// Prototype : serveurs publics à usage léger. Transitous demande d'être prévenu avant un usage large.

const VALHALLA = 'https://valhalla1.openstreetmap.de/route';
const TRANSITOUS = 'https://api.transitous.org/api/v5/plan';

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
    coords: decodePolyline(leg.shape, 6),
    steps: leg.maneuvers
      .filter((m) => m.type !== 4 && m.type !== 5 && m.type !== 6) // on retire « Vous êtes arrivé »
      .map((m) => ({ text: tidy(m.instruction), distance: m.length * 1000 }))
      // fusionne les consignes identiques qui se suivent (« Tournez à droite. » × 2)
      .reduce((acc, s) => {
        const last = acc[acc.length - 1];
        if (last && last.text === s.text && s.distance < 40) last.distance += s.distance;
        else acc.push(s);
        return acc;
      }, [])
  };
}

// Les trottoirs sans nom deviennent « l'allée » dans les consignes : on les retire.
function tidy(text) {
  return text
    .replace(/ (dans|sur|vers) (l'allée|le trottoir|le chemin|le passage piéton)/g, '')
    .replace(/\s+\./g, '.');
}

/** Transports en commun : plusieurs propositions, triées par heure d'arrivée. */
export async function transitRoutes(from, to, signal, when = new Date()) {
  const url = new URL(TRANSITOUS);
  url.search = new URLSearchParams({
    fromPlace: `${from.lat},${from.lon}`,
    toPlace: `${to.lat},${to.lon}`,
    time: when.toISOString(),
    numItineraries: '5'
  });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`transitous-${res.status}`);
  const data = await res.json();
  const seen = new Set();
  return (data.itineraries || [])
    .map((it) => ({
      duration: it.duration,
      start: new Date(it.startTime),
      end: new Date(it.endTime),
      legs: it.legs.map((l) => ({
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
        coords: l.legGeometry ? decodePolyline(l.legGeometry.points, l.legGeometry.precision || 6) : []
      }))
    }))
    // une même combinaison de lignes n'apparaît qu'une fois (la plus tôt)
    .filter((it) => {
      const key = it.legs.filter((l) => l.mode !== 'WALK').map((l) => l.line).join('>') + it.legs.length;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
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
