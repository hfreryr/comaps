// Mise en forme des itinéraires, partagée par la page, la fiche itinéraire et le guidage.
import { tx } from '#lib/i18n/index.js';
import { fmtTime, fmtDistance } from './routing.js';
import { exitLabel } from './exits.js';

export const MODES = [
  { id: 'walk', label: tx('itin.a_pied_2') },
  { id: 'bike', label: tx('itin.velo') },
  { id: 'transit', label: tx('carte.transports') },
  { id: 'car', label: tx('itin.voiture') }
];
export const arrival = (seconds) => fmtTime(new Date(Date.now() + seconds * 1000));
export const inMinutes = (d) => {
  const m = Math.round((d - Date.now()) / 60000);
  return m <= 0 ? tx('horaires.maintenant') : m < 60 ? tx('itin.dans_min', { m }) : tx('itin.a', { fmtTime: fmtTime(d) });
};
const PREFIX = { SUBWAY: 'M', METRO: 'M', TRAM: 'T', BUS: tx('itin.bus'), REGIONAL_RAIL: 'RER', SUBURBAN: 'RER' };
export const badge = (leg) => `${PREFIX[leg.mode] ? PREFIX[leg.mode] + ' ' : ''}${leg.line}`.trim();
export const streetOpts = (r) => (r ? [r, ...(r.alts || [])] : []);
// « 3 min de plus » ; à durée affichée égale : la différence de distance (sinon « 1 min de plus » sous deux « 22 min »)
export function altTag(r, best) {
  const dm = Math.round(r.duration / 60) - Math.round(best.duration / 60);
  if (dm > 0) return tx('itin.min_de_plus', { dm });
  const dd = r.distance - best.distance;
  return dd > 50 ? tx('itin.meme_duree_de_plus', { fmtDistance: fmtDistance(dd) }) : tx('itin.autre_itineraire_meme_duree');
}
// « prenez la sortie 2 · Rue de Rennes » ; sans numéro : « prenez la sortie rue de Rennes » ; nom générique (« Entrée / Sortie ») : « prenez la sortie »
export const exitPhrase = (e) => {
  if (e.ref) return tx('itin.prenez_la', { sortie: exitLabel(e).replace(/^Sortie/, 'sortie') });
  return e.name && !/^(entr[ée]e|sortie|acc[èe]s)\b/i.test(e.name) ? tx('itin.prenez_la_sortie', { name: e.name }) : '';
};
