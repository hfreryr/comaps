// Heure de l'itinéraire : partir maintenant, partir à une heure donnée, ou arriver avant une heure donnée
// (demandé par deux participants des tests du 15/10/2026, comme dans Google Maps et Citymapper).
// when = null (maintenant) ou { t: millisecondes, arrive: booléen }.
import { tx } from '#lib/i18n/index.js';

const TZ = 'Europe/Paris';
const dayKey = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hm = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

/** « aujourd'hui », « demain » ou « ven. 17 oct. » */
export function dayLabel(d, now = new Date()) {
  if (dayKey(d) === dayKey(now)) return tx('quand.aujourdhui');
  if (dayKey(d) === dayKey(new Date(+now + 864e5))) return tx('quand.demain');
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

/** Texte du bouton : « Partir maintenant », « Départ demain à 08:30 », « Arrivée aujourd'hui à 18:00 ». */
export function whenLabel(when, now = new Date()) {
  if (!when) return tx('quand.partir_maintenant');
  const d = new Date(when.t);
  const jour = dayLabel(d, now), heure = hm(d);
  return when.arrive ? tx('quand.arrivee_le', { jour, heure }) : tx('quand.depart_le', { jour, heure });
}

/** Heure de départ d'un trajet qui dure « seconds » (à pied, à vélo, en voiture). */
export const startOf = (when, seconds, now = Date.now()) => (!when ? now : when.arrive ? when.t - seconds * 1000 : when.t);

/** Heure d'arrivée d'un trajet qui dure « seconds ». */
export const endOf = (when, seconds, now = Date.now()) => startOf(when, seconds, now) + seconds * 1000;

/** Valeur d'un champ <input type="datetime-local"> (heure du téléphone). */
export function toInput(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Lecture du champ ; une heure passée (ou illisible) revient à « maintenant ». */
export function fromInput(value, arrive, now = Date.now()) {
  const t = new Date(value).getTime();
  if (!value || Number.isNaN(t) || t < now - 60000) return null;
  return { t, arrive: !!arrive };
}
