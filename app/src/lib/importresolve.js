// Retrouver la position d'un lieu importé de Google Maps dont l'export ne donne que le nom
// (les listes Google n'ont pas de coordonnées). On cherche d'abord dans nos propres données
// (sur le téléphone, rien n'est envoyé), puis, à défaut, le nom seul part au moteur de recherche.
import { searchLocal } from './localsearch.js';
import { searchAnywhere } from './geocode.js';

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Choisit le résultat : un seul lieu portant exactement ce nom → sûr ; plusieurs (enseigne, homonymes) → le plus
 * proche, signalé « à vérifier » ; aucun nom exact → le premier résultat, lui aussi à vérifier.
 * @returns {{ place: object, sure: boolean } | null}
 */
export function pick(name, results) {
  if (!results?.length) return null;
  const exact = results.filter((r) => norm(r.name) === norm(name));
  if (exact.length) return { place: exact[0], sure: exact.length === 1 };
  return { place: results[0], sure: false };
}

/** @param {{name:string, address?:string}} p  @param {{lat:number, lon:number}} at */
export async function resolvePlace(p, at, deps = { local: searchLocal, remote: searchAnywhere }) {
  if (!p.address) {
    const local = pick(p.name, await deps.local(p.name, at).catch(() => []));
    if (local?.sure) return local;
  }
  const remote = pick(p.name, await deps.remote(p.address || p.name, at).catch(() => []));
  return remote;
}

/** Applique fn à chaque élément, quelques-uns à la fois (le moteur de recherche est un service partagé). */
export async function eachLimited(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}
