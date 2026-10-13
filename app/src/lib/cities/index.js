// Ville active. Une seule pour l'instant ; demain, choisie d'après la position ou la zone regardée.
import paris from './paris.js';

export const CITIES = { paris };
export const city = paris;

/** Un point est-il dans une boîte { w, e, s, n } ? */
export const inBox = (box, pt) => !!box && pt.lon > box.w && pt.lon < box.e && pt.lat > box.s && pt.lat < box.n;
