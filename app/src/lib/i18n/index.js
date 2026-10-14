// Accès aux textes affichés par l'app. Tous les textes sont dans fr.js (une clé = un texte).
//   tx('fiche.itineraire')                → « Itinéraire »
//   tx('lieux.ajoutes', { n: 3 })         → « 3 lieux ajoutés » (entrée sous forme de fonction : accords, pluriels)
//   tx('fiche.photos_de', { nom: 'Café' }) → « Photos de Café » ({nom} remplacé)
// Une clé absente renvoie la clé elle-même (visible à l'écran, et signalée par les tests).
import fr from './fr.js';

const TEXTS = fr;

/** @param {string} key @param {Record<string, any>} [vars] @returns {string} */
export function tx(key, vars) {
  const v = TEXTS[key];
  if (v == null) return key;
  if (typeof v === 'function') return v(vars || {});
  if (!vars) return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
}

export { pluriel } from './plural.js';

/** Toutes les clés (pour les tests). */
export const keys = () => Object.keys(TEXTS);
