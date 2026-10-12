// Transforme le champ OSM opening_hours en une phrase lisible :
// « Ouvert · ferme à 19 h », « Fermé · ouvre demain à 9 h 30 ».
import opening_hours from 'opening_hours';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function time(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

function when(d, now) {
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
      new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  if (days === 0) return `à ${time(d)}`;
  if (days === 1 && d.getHours() < 6) return `cette nuit à ${time(d)}`;
  if (days === 1) return `demain à ${time(d)}`;
  if (days < 7) return `${DAYS[d.getDay()]} à ${time(d)}`;
  return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

/** @returns {{open: boolean|null, label: string} | null} */
export function hoursStatus(value, lat, lon, now = new Date()) {
  if (!value) return null;
  try {
    const oh = new opening_hours(value, {
      lat, lon, address: { country_code: 'fr', state: 'Île-de-France' }
    });
    const open = oh.getState(now);
    const unknown = oh.getUnknown(now);
    const next = oh.getNextChange(now);
    if (unknown) return { open: null, label: 'Horaires incertains' };
    if (open) {
      return { open: true, label: next ? `Ouvert · ferme ${when(next, now)}` : 'Ouvert 24 h/24' };
    }
    return { open: false, label: next ? `Fermé · ouvre ${when(next, now)}` : 'Fermé' };
  } catch {
    return { open: null, label: 'Horaires non lisibles' };
  }
}

// Vrai si le lieu était déjà ouvert juste avant minuit (soirée commencée la veille).
function isContinuation(oh, midnight) {
  return oh.getState(new Date(midnight.getTime() - 60000));
}

export function hoursTable(value, lat, lon, now = new Date()) {
  try {
    const oh = new opening_hours(value, {
      lat, lon, address: { country_code: 'fr', state: 'Île-de-France' }
    });
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const from = new Date(monday); from.setDate(monday.getDate() + i);
      const nextDay = new Date(from); nextDay.setDate(from.getDate() + 1);
      const to = new Date(nextDay); to.setHours(6); // une soirée peut finir après minuit
      const all = oh.getOpenIntervals(from, to);
      const allDay = all.some(([a, b]) => a <= from && b >= nextDay);
      const continued = isContinuation(oh, from);
      const intervals = all
        // la fin de soirée commencée la veille appartient à la veille
        .filter(([a]) => !(continued && a.getTime() === from.getTime()))
        // ce qui commence le lendemain appartient au lendemain
        .filter(([a]) => a < nextDay);
      const text = allDay
        ? '24 h/24'
        : intervals.length
          ? intervals.map(([a, b]) => `${time(a)} – ${time(b)}`).join(', ')
          : 'Fermé';
      rows.push({ day: DAYS[from.getDay()], today: from.toDateString() === now.toDateString(), text });
    }
    return rows;
  } catch {
    return null;
  }
}
