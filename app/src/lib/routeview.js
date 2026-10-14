// Mise en forme des itinéraires, partagée par la page, la fiche itinéraire et le guidage.
import { fmtTime, fmtDistance } from './routing.js';
import { exitLabel } from './exits.js';

export const MODES = [
  { id: 'walk', label: 'À pied' },
  { id: 'bike', label: 'Vélo' },
  { id: 'transit', label: 'Transports' },
  { id: 'car', label: 'Voiture' }
];
export const arrival = (seconds) => fmtTime(new Date(Date.now() + seconds * 1000));
export const inMinutes = (d) => {
  const m = Math.round((d - Date.now()) / 60000);
  return m <= 0 ? 'maintenant' : m < 60 ? `dans ${m} min` : `à ${fmtTime(d)}`;
};
const PREFIX = { SUBWAY: 'M', METRO: 'M', TRAM: 'T', BUS: 'Bus', REGIONAL_RAIL: 'RER', SUBURBAN: 'RER' };
export const badge = (leg) => `${PREFIX[leg.mode] ? PREFIX[leg.mode] + ' ' : ''}${leg.line}`.trim();
export const streetOpts = (r) => (r ? [r, ...(r.alts || [])] : []);
// « 3 min de plus » ; à durée affichée égale : la différence de distance (sinon « 1 min de plus » sous deux « 22 min »)
export function altTag(r, best) {
  const dm = Math.round(r.duration / 60) - Math.round(best.duration / 60);
  if (dm > 0) return `${dm} min de plus`;
  const dd = r.distance - best.distance;
  return dd > 50 ? `Même durée · ${fmtDistance(dd)} de plus` : 'Autre itinéraire, même durée';
}
// « prenez la sortie 2 · Rue de Rennes » ; sans numéro : « prenez la sortie rue de Rennes » ; nom générique (« Entrée / Sortie ») : « prenez la sortie »
export const exitPhrase = (e) => {
  if (e.ref) return `prenez la ${exitLabel(e).replace(/^Sortie/, 'sortie')}`;
  return e.name && !/^(entr[ée]e|sortie|acc[èe]s)\b/i.test(e.name) ? `prenez la sortie ${e.name}` : '';
};
