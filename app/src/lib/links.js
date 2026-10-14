// Liens sortants vers les sites des lieux (données OSM, donc saisies par n'importe qui).

// Lien vers un site venu d'OSM : seulement http(s) ; les schémas qui exécutent du code (javascript:, data:…) sont neutralisés
export const href = (url) => {
  const u = String(url || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^(javascript|data|vbscript|file|blob):/i.test(u.replace(/[\s\0-\x1f]/g, ''))) return '#';
  return `https://${u}`;
};
export const host = (url) => { try { return new URL(href(url)).hostname.replace(/^www\./, ''); } catch { return url; } };
