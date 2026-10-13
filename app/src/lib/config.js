// Réglages de déploiement. Les données préparées à l'avance (lieux par tuile, sorties, horaires des
// transports…) peuvent être servies ailleurs que le site (stockage objet, CDN) : une seule URL à changer.
export function dataBase() {
  const env = import.meta.env?.VITE_DATA_BASE;
  if (env) return env.endsWith('/') ? env : `${env}/`;
  return new URL('data/', location.href).toString();
}

// Identification de l'app auprès des services tiers qui le demandent (Wikimedia).
export const APP_AGENT = 'UntrackedMaps/0.2 (https://untrackedmaps.app)';
