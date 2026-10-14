// Accord simple, partagé par fr.js et index.js : pluriel(2, 'lieu', 'lieux') → « lieux » (singulier pour 0 et 1).
export const pluriel = (n, un, plusieurs) => (Math.abs(n) >= 2 ? plusieurs : un);
