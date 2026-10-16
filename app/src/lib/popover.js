// Menus et panneaux flottants : un seul comportement pour toute l'app (règles dans docs/regles-interface.md).
//  1. Un seul ouvert à la fois : en ouvrir un ferme le précédent.
//  2. Toucher en dehors le ferme, sans déclencher ce qu'il y a dessous ; Échap aussi, et le focus revient au bouton.
//  3. Toujours entièrement visible : posé au-dessus de tout (hors des fiches qui le rogneraient), placé du côté où il y a
//     la place, ramené dans l'écran, et défilant s'il est plus haut que la place disponible.
// Usage : <div use:popover={{ trigger: () => boutonQuiOuvre, close: () => (ouvert = false), place: 'above' }}>

const MARGIN = 8;           // écart minimal avec les bords de l'écran
let current = null;         // fermeture du menu ouvert

/** Ferme le menu ouvert, s'il y en a un (ouverture d'une fiche, bouton Retour…). Renvoie true s'il y en avait un. */
export function closeAll() {
  const c = current;
  current = null;
  c?.();
  return !!c;
}

/** Place `node` (en position fixe) contre le bouton, du côté où il tient, et dans l'écran. Exporté pour les tests. */
export function placeNear(rect, size, view, prefer = 'above', align = 'end') {
  const below = view.h - rect.bottom - MARGIN * 2, above = rect.top - MARGIN * 2;
  const side = prefer === 'above' ? (size.h <= above || above >= below ? 'above' : 'below') : (size.h <= below || below >= above ? 'below' : 'above');
  const room = side === 'above' ? above : below;
  const h = Math.min(size.h, room);
  const top = side === 'above' ? rect.top - MARGIN - h : rect.bottom + MARGIN;
  let left = align === 'end' ? rect.right - size.w : rect.left;
  left = Math.max(MARGIN, Math.min(left, view.w - size.w - MARGIN));
  return { top: Math.max(MARGIN, top), left, maxHeight: room, side };
}

/** @param {HTMLElement} node @param {{ trigger: () => HTMLElement|null, close: () => void, place?: 'above'|'below', align?: 'start'|'end', float?: boolean }} opts */
export function popover(node, opts) {
  let o = opts;
  const close = () => { if (current === close) current = null; o.close(); };
  if (current && current !== close) current();
  current = close;

  // 3. au-dessus de tout, hors des conteneurs qui défilent ou rognent (les fiches)
  const float = o.float !== false;
  if (float) {
    document.body.appendChild(node);
    node.style.position = 'fixed';
    node.style.zIndex = '50';
    node.style.overflowY = 'auto';
    node.style.overscrollBehavior = 'contain';
  }
  const place = () => {
    const t = o.trigger?.();
    if (!float || !t) return;
    node.style.maxHeight = '';
    const r = t.getBoundingClientRect(), s = node.getBoundingClientRect();
    const p = placeNear(r, { w: s.width, h: s.height }, { w: innerWidth, h: innerHeight }, o.place || 'above', o.align || 'end');
    Object.assign(node.style, { top: `${p.top}px`, left: `${p.left}px`, right: 'auto', bottom: 'auto', maxHeight: `${p.maxHeight}px` });
  };
  place();
  requestAnimationFrame(place);

  // 2. toucher en dehors : fermer, et avaler le « clic » qui suit pour ne rien déclencher dessous
  const away = (e) => {
    const t = o.trigger?.();
    if (node.contains(e.target) || t?.contains(e.target)) return;
    close();
    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    document.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', swallow, true), 400);
  };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); o.trigger?.()?.focus(); } };
  document.addEventListener('pointerdown', away, true);
  document.addEventListener('keydown', key, true);
  addEventListener('resize', place);

  return {
    update(n) { o = n; place(); },
    destroy() {
      if (current === close) current = null;
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
      removeEventListener('resize', place);
      if (float) node.remove();
    }
  };
}
