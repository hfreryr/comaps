// Exemples de recherche qui s'écrivent puis s'effacent dans la barre vide, une seule fois à l'ouverture
// (idée du porteur du projet, 15/10 : montrer qu'on peut écrire « restaurant ouvert demain dans le 8e »).
// Accessibilité (WCAG 2.2.2) : une animation qui démarre seule doit durer 5 s au plus, sinon il faut pouvoir
// l'arrêter. On reste sous 5 s, on s'arrête au premier toucher, et rien ne bouge si « réduire les animations ».

export const MAX_MS = 5000;

/** Étapes de l'animation : [{ text, wait }] ; wait = délai (ms) avant d'afficher text. Pur, donc testable. */
export function hintSteps(examples, { type = 32, hold = 850, erase = 12, rest = '' } = {}) {
  const steps = [];
  for (const ex of examples) {
    for (let i = 1; i <= ex.length; i++) steps.push({ text: ex.slice(0, i), wait: type });
    steps.push({ text: ex, wait: hold });                        // l'exemple reste lisible un instant
    for (let i = ex.length - 1; i >= 0; i--) steps.push({ text: ex.slice(0, i), wait: erase });
  }
  steps.push({ text: rest, wait: 0 });                           // retour au texte habituel de la barre
  return steps;
}
export const totalMs = (steps) => steps.reduce((s, x) => s + x.wait, 0);

/** Lance l'animation : show(texte) est appelé à chaque étape. Renvoie stop(), qui remet le texte habituel. */
export function playHint(examples, show, rest, { delay = 900, reduce = false } = {}) {
  if (reduce || !examples.length) return () => {};
  const steps = hintSteps(examples, { rest });
  let timer = null, i = 0, done = false;
  const next = () => {
    if (done || i >= steps.length) return;
    const s = steps[i++];
    timer = setTimeout(() => { show(s.text); next(); }, s.wait);
  };
  timer = setTimeout(next, delay);
  return () => { if (done) return; done = true; clearTimeout(timer); show(rest); };
}
