// Guidage pas à pas : tout est calculé sur le téléphone, à partir du trajet déjà reçu.
// La position n'est envoyée à personne, sauf si l'on s'écarte du trajet : le nouveau calcul
// d'itinéraire part alors de la position actuelle (comme au premier calcul).
import { tx } from '#lib/i18n/index.js';

const R = 111320;

function meters(a, b) {
  const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * R;
}

/** Cap (0 = nord, 90 = est) d'un point à l'autre. */
export function bearing(a, b) {
  const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180 / Math.PI + 360) % 360;
}

/**
 * Prépare un trajet pour le guidage.
 * @param coords tracé [[lon, lat], …]  @param steps [{ text, speak, idx, type }] (idx : point du tracé où commence l'étape)
 */
export function prepare(coords, steps, duration) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + meters(coords[i - 1], coords[i]));
  const total = cum.at(-1) || 1;
  return {
    coords, cum, total, duration,
    steps: steps.map((s) => ({ ...s, s: cum[Math.min(s.idx ?? 0, cum.length - 1)] ?? 0 }))
  };
}

/** Où en est-on : distance parcourue le long du trajet (s), écart au trajet (off), cap du tronçon, étape en cours (k). */
export function progress(nav, lonlat, hint = 0) {
  const { coords, cum } = nav;
  let best = { off: Infinity, s: hint, seg: 0 };
  // on cherche autour de la dernière position connue d'abord, puis partout si l'on s'est perdu
  const scan = (from, to) => {
    for (let i = Math.max(0, from); i < Math.min(coords.length - 1, to); i++) {
      const a = coords[i], b = coords[i + 1];
      const k = Math.cos((a[1] * Math.PI) / 180);
      const ax = (lonlat[0] - a[0]) * k, ay = lonlat[1] - a[1];
      const bx = (b[0] - a[0]) * k, by = b[1] - a[1];
      const len2 = bx * bx + by * by;
      const t = len2 ? Math.max(0, Math.min(1, (ax * bx + ay * by) / len2)) : 0;
      const off = Math.hypot(ax - t * bx, ay - t * by) * R;
      if (off < best.off - 0.5) best = { off, s: cum[i] + t * (cum[i + 1] - cum[i]), seg: i };
    }
  };
  const start = cum.findIndex((c) => c >= hint - 60);
  scan(Math.max(0, start - 2), start + 400);
  if (best.off > 40) scan(0, coords.length);
  let k = 0;
  for (let i = 0; i < nav.steps.length; i++) if (nav.steps[i].s <= best.s + 3) k = i;
  const seg = coords[best.seg + 1] ? bearing(coords[best.seg], coords[best.seg + 1]) : 0;
  return { s: best.s, off: best.off, k, heading: seg };
}

/** Angle de la flèche d'une manœuvre Valhalla (0 = tout droit, 90 = à droite, -90 = à gauche). */
export function arrowAngle(type) {
  return ({
    9: 45, 10: 90, 11: 135, 12: 180, 13: -180, 14: -135, 15: -90, 16: -45,
    18: 45, 19: -45, 20: 45, 21: -45, 23: 30, 24: -30, 37: 30, 38: -30
  })[type] ?? 0;
}
export const isRoundabout = (type) => type === 26 || type === 27;

/** « 350 m », « 1,2 km », arrondis comme les GPS (pas de « 347 m »). */
export function navDistance(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  if (m >= 200) return `${Math.round(m / 50) * 50} m`;
  if (m >= 30) return `${Math.round(m / 10) * 10} m`;
  return tx('guidage.maintenant');
}
/** La même chose, à voix haute. */
export function spokenDistance(m) {
  if (m >= 1000) return tx('guidage.dans_kilometre', { km: (m / 1000).toFixed(1).replace('.', ','), n: m / 1000 });
  if (m >= 30) return tx('guidage.dans_metres', { m: m >= 200 ? Math.round(m / 50) * 50 : Math.round(m / 10) * 10 });
  return '';
}
