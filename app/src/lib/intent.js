// Comprendre une recherche en langage courant : « restaurant ce soir 8e », « boulangerie ouverte dimanche »,
// « bar vers 23 h montmartre ». Tout est analysé sur le téléphone.
//
// Renvoie le moment voulu (when), la zone (area) et les mots restants (pour reconnaître la catégorie).

import { city } from './cities/index.js';

const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9:]+/g, ' ').trim();
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
// heure par défaut d'un moment de la journée
const PARTS = { matin: [9, 0], midi: [12, 30], soir: [20, 0], nuit: [23, 0], tard: [23, 0], aprem: [15, 0] };
const OPEN_WORDS = new Set(['ouvert', 'ouverte', 'ouverts', 'ouvertes', 'open']);
const FILL = new Set(['ce', 'cet', 'cette', 'a', 'vers', 'pour', 'dans', 'le', 'la', 'les', 'l', 'au', 'aux', 'en', 'du', 'de', 'des', 'd', 'h',
  'arrondissement', 'arr', 'arrdt', city.name.toLowerCase(), 'quartier', 'pres', 'proche', 'autour', 'qui', 'est', 'sont', 'encore']);

/**
 * @returns {{ words: string[], when: null | { now: true } | { at: Date }, area: null | { arr: number } | { text: string }, any: boolean }}
 *   words : mots non reconnus (catégorie et éventuel nom de quartier) ; any : la phrase contenait un moment ou une zone
 */
export function parseIntent(q, now = new Date()) {
  let t = ` ${norm(q)} `;
  let day = null;            // décalage en jours
  let hm = null;             // [h, m]
  let open = false;

  // « 21h », « 21 h 30 », « 21:30 », « 21h30 »
  t = t.replace(/ (?:a |vers )?([01]?\d|2[0-3]) ?(?:h|:) ?([0-5]\d)? /g, (_, h, m) => { hm = [Number(h), Number(m || 0)]; return ' '; });
  t = t.replace(/ apres ?midi /g, () => { hm ??= PARTS.aprem; return ' '; });
  t = t.replace(/ aprem /g, () => { hm ??= PARTS.aprem; return ' '; });
  t = t.replace(/ (?:ce |cet |cette )?(matin|midi|soir|soiree|nuit|tard) /g, (_, w) => { hm ??= PARTS[w === 'soiree' ? 'soir' : w]; return ' '; });
  t = t.replace(/ (aujourd ?hui|demain|apres demain) /g, (_, w) => { day = w.startsWith('apres') ? 2 : w === 'demain' ? 1 : 0; return ' '; });
  t = t.replace(new RegExp(` (${DAYS.join('|')}) `, 'g'), (_, w) => { day = (DAYS.indexOf(w) - now.getDay() + 7) % 7; return ' '; });
  t = t.replace(/ (maintenant|now) /g, () => { open = true; return ' '; });

  // zone : « 8e », « 8eme », « 1er », « 75008 »
  let area = null;
  const D = city.districts;
  if (D) {
    t = t.replace(new RegExp(` ${D.pattern.source} `, 'g'), (_, n) => { area = { arr: Number(n) }; return ' '; });
    t = t.replace(new RegExp(` ${D.postcode.source} `, 'g'), (_, n) => { if (+n >= 1 && +n <= D.count) area = { arr: Number(n) }; return ' '; });
  }

  const words = t.split(' ').filter(Boolean).filter((w) => {
    if (OPEN_WORDS.has(w)) { open = true; return false; }
    return !FILL.has(w);
  });

  let when = null;
  if (hm || day != null) {
    const at = new Date(now);
    at.setSeconds(0, 0);
    at.setDate(at.getDate() + (day ?? 0));
    const [h, m] = hm || PARTS.midi;
    at.setHours(h, m);
    // « ce soir » demandé à 21 h : c'est maintenant ; une heure déjà passée sans jour précisé : demain
    if (day == null && at < now) {
      if (now - at < 3 * 3600e3 && hm !== PARTS.matin) when = { now: true };
      else at.setDate(at.getDate() + 1);
    }
    when ??= { at };
  } else if (open) when = { now: true };

  return { words, when, area, any: !!(when || area) };
}

/** Centre d'une sous-zone (arrondissement) de la ville active, et son libellé. */
export const ARR_CENTERS = city.districts?.centers || {};
export const arrName = (n) => (city.districts ? city.districts.label(n) : String(n));
