// Zoom à deux doigts et double toucher dans la visionneuse de photos.
// Code sorti de +page.svelte : il lit et modifie l'état de l'écran par l'objet « app » (bloc « app » de la page).

/** @param {any} app */
export function createZoom(app) {
  const clampZoom = (z) => {
    const w = innerWidth, h = innerHeight, mx = (w * (z.s - 1)) / 2, my = (h * (z.s - 1)) / 2;
    return { s: z.s, x: Math.max(-mx, Math.min(mx, z.x)), y: Math.max(-my, Math.min(my, z.y)) };
  };
  function toggleZoom(cx, cy) {
    if (app.zoom.s > 1) app.zoom = { s: 1, x: 0, y: 0 };
    else app.zoom = clampZoom({ s: 2.5, x: (innerWidth / 2 - cx) * 1.5, y: (innerHeight / 2 - cy) * 1.5 });
  }
  function zoomStart(e) {
    const t = e.touches;
    if (t.length === 2) {
      app.gesture = { kind: 'pinch', d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), s: app.zoom.s, x: app.zoom.x, y: app.zoom.y };
    } else if (t.length === 1) {
      const now = Date.now();
      if (now - app.lastTap < 280) { toggleZoom(t[0].clientX, t[0].clientY); app.lastTap = 0; app.gesture = null; return; }
      app.lastTap = now;
      app.gesture = { kind: app.zoom.s > 1 ? 'pan' : 'maybe-down', x0: t[0].clientX, y0: t[0].clientY, x: app.zoom.x, y: app.zoom.y };
    }
  }
  function zoomMove(e) {
    if (!app.gesture) return;
    const t = e.touches;
    if (app.gesture.kind === 'pinch' && t.length === 2) {
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      app.zoom = clampZoom({ s: Math.max(1, Math.min(5, app.gesture.s * (d / app.gesture.d))), x: app.gesture.x, y: app.gesture.y });
    } else if (app.gesture.kind === 'pan' && t.length === 1) {
      app.zoom = clampZoom({ s: app.zoom.s, x: app.gesture.x + t[0].clientX - app.gesture.x0, y: app.gesture.y + t[0].clientY - app.gesture.y0 });
    } else if (app.gesture.kind === 'maybe-down' && t.length === 1) {
      const dx = t[0].clientX - app.gesture.x0, dy = t[0].clientY - app.gesture.y0;
      if (dy > 12 && dy > Math.abs(dx) * 1.3) app.gesture.kind = 'down';
      else if (Math.abs(dx) > 12) app.gesture = null;       // glissement horizontal : photo suivante (défilement natif)
    }
    if (app.gesture?.kind === 'down') { app.dragY = Math.max(0, t[0].clientY - app.gesture.y0); }
  }
  function zoomEnd() {
    if (app.gesture?.kind === 'down') { if (app.dragY > 110) app.viewer = null; app.dragY = 0; }
    if (app.zoom.s < 1.05) app.zoom = { s: 1, x: 0, y: 0 };
    app.gesture = null;
  }

  return { clampZoom, toggleZoom, zoomStart, zoomMove, zoomEnd };
}
