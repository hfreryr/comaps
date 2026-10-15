// Classement des trajets en transports proposés par Transitous.
// Transitous renvoie le trajet qui arrive le plus tôt, même s'il gagne 1 minute au prix d'une correspondance
// (Ségur → Odéon : ligne 10 puis ligne 4 au lieu de la ligne 10 directe, signalé le 15/10/2026), ou s'il fait
// remonter une station en sens inverse pour reprendre la même ligne. Comme Google Maps et Citymapper, on préfère
// le trajet le plus simple tant qu'il n'est pas nettement plus long.

/** Minutes qu'une correspondance doit faire gagner pour passer devant un trajet plus simple. */
export const TRANSFER_PENALTY_MIN = 5;

const rides = (it) => it.legs.filter((l) => l.mode !== 'WALK' && l.mode !== 'STOP');

/** Nombre de correspondances (véhicules pris moins un). */
export const transfers = (it) => Math.max(0, rides(it).length - 1);

/** Le trajet reprend une ligne déjà prise (aller-retour d'une station pour retomber sur la même ligne). */
export const usesLineTwice = (it) => {
  const lines = rides(it).map((l) => `${l.mode}:${l.line}`);
  return new Set(lines).size < lines.length;
};

/** Heure d'arrivée « ressentie » : chaque correspondance compte pour TRANSFER_PENALTY_MIN minutes. */
export const score = (it) => +it.end + transfers(it) * TRANSFER_PENALTY_MIN * 60000;

/** Trie les propositions (une par combinaison de lignes) et écarte les allers-retours s'il existe autre chose. */
export function rankTransit(options) {
  const sane = options.filter((it) => !usesLineTwice(it));
  return (sane.length ? sane : options).slice().sort((a, b) => score(a) - score(b) || a.end - b.end);
}
