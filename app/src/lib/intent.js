// Comprendre une recherche en langage courant : « restaurant ce soir 8e », « boulangerie ouverte dimanche »,
// « bar vers 23 h montmartre ». Tout est analysé sur le téléphone.
//
// Renvoie le moment voulu (when), la zone (area) et les mots restants (pour reconnaître la catégorie).

const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9:]+/g, ' ').trim();
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
// heure par défaut d'un moment de la journée
const PARTS = { matin: [9, 0], midi: [12, 30], soir: [20, 0], nuit: [23, 0], tard: [23, 0], aprem: [15, 0] };
const OPEN_WORDS = new Set(['ouvert', 'ouverte', 'ouverts', 'ouvertes', 'open']);
const FILL = new Set(['ce', 'cet', 'cette', 'a', 'vers', 'pour', 'dans', 'le', 'la', 'les', 'l', 'au', 'aux', 'en', 'du', 'de', 'des', 'd', 'h',
  'arrondissement', 'arr', 'arrdt', 'paris', 'quartier', 'pres', 'proche', 'autour', 'qui', 'est', 'sont', 'encore']);

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
  t = t.replace(/ (?:75 ?0?)?([1-9]|1\d|20)(?:e|eme|ieme|er|ere) /g, (_, n) => { area = { arr: Number(n) }; return ' '; });
  t = t.replace(/ 750([0-2]\d) /g, (_, n) => { if (+n >= 1 && +n <= 20) area = { arr: Number(n) }; return ' '; });

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

/** Centre (approximatif) de chaque arrondissement de Paris, pour se placer sans requête réseau. */
export const ARR_CENTERS = {
  1: [2.3364, 48.8626], 2: [2.3428, 48.8683], 3: [2.3600, 48.8630], 4: [2.3576, 48.8543], 5: [2.3507, 48.8445],
  6: [2.3327, 48.8491], 7: [2.3125, 48.8562], 8: [2.3125, 48.8727], 9: [2.3378, 48.8770], 10: [2.3607, 48.8761],
  11: [2.3800, 48.8591], 12: [2.3958, 48.8350], 13: [2.3622, 48.8283], 14: [2.3265, 48.8292], 15: [2.2924, 48.8401],
  16: [2.2620, 48.8604], 17: [2.3067, 48.8873], 18: [2.3482, 48.8925], 19: [2.3848, 48.8871], 20: [2.4012, 48.8634]
};
export const arrName = (n) => `${n}${n === 1 ? 'er' : 'e'} arrondissement`;
