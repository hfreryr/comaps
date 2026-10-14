// Maison, Travail et enregistrement des favoris.
// Code sorti de +page.svelte : il lit et modifie l'état de l'écran par l'objet « app » (bloc « app » de la page).

/** @param {any} app */
export function createShortcuts(app) {
  function saveFavorites() {
    try { localStorage.setItem(app.FAVS_KEY, JSON.stringify(app.favorites)); } catch { /* navigation privée */ }
  }
  function setShortcut(which, p) {
    app.shortcuts = { ...app.shortcuts, [which]: p ? { id: p.id, name: p.name, type: p.type, address: p.address || '', lat: p.lat, lon: p.lon, osmType: p.osmType, osmId: p.osmId, subclass: p.subclass, pin: p.pin } : undefined };
    try { localStorage.setItem(app.SHORTCUTS_KEY, JSON.stringify(app.shortcuts)); } catch { /* rien */ }
  }
  // Toucher « Maison » : itinéraire direct. S'il n'est pas encore défini, on le demande.
  function useShortcut(which) {
    const p = app.shortcuts[which];
    if (!p) {
      app.assigning = which;
      app.query = '';
      app.say(which === 'home' ? 'Tapez l\'adresse de votre maison' : 'Tapez l\'adresse de votre travail');
      setTimeout(() => document.getElementById('search')?.focus(), 50);
      return;
    }
    if (app.editing) { app.pickResult({ ...p }); return; }
    app.focused = false;
    document.activeElement?.blur();
    app.clearCategory();
    app.openPlace({ ...p, name: p.name || app.SHORT_NAMES[which] });
    app.startDirections();
  }

  return { saveFavorites, setShortcut, useShortcut };
}
