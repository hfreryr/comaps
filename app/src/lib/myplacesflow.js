// Mes lieux : listes, épingles, Maison et Travail, transfert et sauvegarde.
// Code sorti de +page.svelte : il lit et modifie l'état de l'écran par l'objet « app » (bloc « app » de la page).
import { LIST_COLORS, backupFile, mergeInto, pack, packList, readBackup, restore, snapshot } from '#lib/myplaces.js';
import { PARIS } from '#lib/places.js';
import qrcode from 'qrcode-generator';

/** @param {any} app */
export function createMyPlaces(app) {
  // Un même lieu : même identifiant OSM, ou même nom au même endroit (à ~20 m près).
  function sameSpot(a, b) {
    if (a.osmType && b.osmType) return a.osmType === b.osmType && String(a.osmId) === String(b.osmId);
    return a.name === b.name && Math.abs(a.lat - b.lat) < 0.0002 && Math.abs(a.lon - b.lon) < 0.0003;
  }
  function saveAll() {
    app.saveFavorites();
    try {
      localStorage.setItem(app.LISTS_KEY, JSON.stringify(app.lists));
      localStorage.setItem(app.PINS_KEY, JSON.stringify(app.pins));
    } catch { /* navigation privée */ }
  }
  const keepOf = (p) => ({ id: p.id, name: p.name, type: p.type, address: p.address || app.info?.address || '', lat: p.lat, lon: p.lon,
    osmType: p.osmType, osmId: p.osmId, subclass: p.subclass, pin: p.pin });
  // « Enregistrer » : un geste, dans Favoris ; le message propose de changer de liste. Déjà enregistré : choix des listes.
  function saveTap() {
    const p = app.place;
    if (!p) return;
    if (app.savedEntry) { app.listPicker = true; return; }
    app.favorites = [{ ...keepOf(p), lists: ['fav'] }, ...app.favorites];
    saveAll();
    app.say(`Enregistré dans ${app.listOf('fav').name}`, { label: 'Changer', run: () => (app.listPicker = true) });
  }
  function setMembership(listId, on) {
    const p = app.place;
    if (!p) return;
    const ex = app.favorites.find((f) => sameSpot(f, p));
    if (on && !ex) app.favorites = [{ ...keepOf(p), lists: [listId] }, ...app.favorites];
    else if (ex) {
      const ls = on ? [...new Set([...ex.lists, listId])] : ex.lists.filter((x) => x !== listId);
      if (!ls.length) {
        const before = app.favorites, beforePins = app.pins;
        app.favorites = app.favorites.filter((f) => f !== ex);
        app.pins = app.pins.filter((k) => k !== app.placeKey(ex));
        app.say('Retiré de Mes lieux', { label: 'Annuler', run: () => { app.favorites = before; app.pins = beforePins; saveAll(); } });
      } else app.favorites = app.favorites.map((f) => (f === ex ? { ...f, lists: ls } : f));
    }
    saveAll();
  }
  function togglePin(p) {
    const k = app.placeKey(p);
    if (app.pins.includes(k)) app.pins = app.pins.filter((x) => x !== k);
    else {
      if (!app.favorites.some((f) => sameSpot(f, p))) app.favorites = [{ ...keepOf(p), lists: ['fav'] }, ...app.favorites];
      app.pins = [...app.pins, k];
    }
    saveAll();
  }
  function removeFromList(saved, listId) {
    const before = app.favorites, beforePins = app.pins;
    const ls = saved.lists.filter((x) => x !== listId);
    if (ls.length) app.favorites = app.favorites.map((f) => (f === saved ? { ...f, lists: ls } : f));
    else { app.favorites = app.favorites.filter((f) => f !== saved); app.pins = app.pins.filter((k) => k !== app.placeKey(saved)); }
    app.swiped = null;
    saveAll();
    refreshSaved();
    app.say(`« ${saved.name} » retiré de ${app.listOf(listId).name}`, { label: 'Annuler', run: () => { app.favorites = before; app.pins = beforePins; saveAll(); refreshSaved(); } });
  }
  function createList(name, then) {
    const n = name.trim();
    if (!n) return null;
    const ex = app.lists.find((l) => l.name.toLowerCase() === n.toLowerCase());
    if (ex) { then?.(ex.id); return ex; }
    const l = { id: `l${Date.now().toString(36)}`, name: n, icon: 'star',   // (pictogramme sobre ; la couleur distingue les listes)
      color: LIST_COLORS[app.lists.length % LIST_COLORS.length] };
    app.lists = [...app.lists, l];
    saveAll();
    then?.(l.id);
    return l;
  }
  function renameList(l) {
    const n = prompt('Nouveau nom de la liste', l.name)?.trim();
    if (!n) return;
    app.lists = app.lists.map((x) => (x.id === l.id ? { ...x, name: n } : x));
    saveAll();
  }
  function deleteList(l) {
    const before = { lists: app.lists, favorites: app.favorites };
    app.lists = app.lists.filter((x) => x.id !== l.id);
    app.favorites = app.favorites.map((f) => ({ ...f, lists: f.lists.filter((x) => x !== l.id) })).filter((f) => f.lists.length);
    app.savedList = null;
    saveAll();
    refreshSaved();
    app.say(`Liste « ${l.name} » supprimée`, { label: 'Annuler', run: () => { app.lists = before.lists; app.favorites = before.favorites; saveAll(); refreshSaved(); } });
  }
  // Mes lieux sur la carte et dans la liste, triés par distance
  function refreshSaved() {
    if (!app.category?.saved) return;
    const o = app.me || (app.map ? { lat: app.map.getCenter().lat, lon: app.map.getCenter().lng } : PARIS);
    const src = app.category.shared ? app.incoming.places : app.favorites.filter((f) => !app.savedList || f.lists.includes(app.savedList));
    app.nearby = src.map((f, i) => {
      const l = app.category.shared ? app.category : app.listOf(f.lists?.[0]);
      return { f: { id: `s${i}`, properties: { name: f.name, subclass: f.subclass }, geometry: { coordinates: [f.lon, f.lat] } },
        d: app.dist(o.lat, o.lon, f.lat, f.lon), saved: f, icon: `cat|${l.icon}|${l.color}`, tc: app.labelColor(l.color) };
    }).sort((a, b) => a.d - b.d);
    app.nearbyFromMe = !!app.me;
    app.nearbyDone = true;
  }
  function openSavedList(id) {
    app.savedList = id;
    app.listEditing = false;
    app.swiped = null;
    refreshSaved();
    const pts = app.nearby.slice(0, 8).map((n) => n.f.geometry.coordinates);
    if (pts.length) app.fitTo(app.me ? [[app.me.lon, app.me.lat], ...pts] : pts);
  }
  async function shareList(l) {
    const places = app.favorites.filter((f) => f.lists.includes(l.id));
    const u = new URL(location.href);
    u.hash = `liste=${await packList(l, places)}`;
    const data = { title: l.name, text: `${l.name} · ${places.length} lieu${places.length > 1 ? 'x' : ''}`, url: u.toString() };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(data.url); app.say('Lien de la liste copié'); }
    } catch { /* partage annulé */ }
  }
  // Ajouter une liste reçue par lien
  function keepIncomingList() {
    const { list, places } = app.incoming;
    let name = list.name;
    if (app.lists.some((l) => l.name.toLowerCase() === name.toLowerCase())) name = `${name} (partagée)`;
    const l = { id: `l${Date.now().toString(36)}`, name, icon: list.icon || 'star', color: list.color || LIST_COLORS[2] };
    const m = mergeInto({ lists: app.lists, places: app.favorites }, { lists: [l], places: places.map((p) => ({ ...p, lists: [l.id] })) }, sameSpot);
    app.lists = m.lists;
    app.favorites = m.places;
    saveAll();
    app.incoming = null;
    app.clearCategory();
    app.say(`Liste « ${name} » ajoutée à Mes lieux`);
  }
  async function makeTransfer() {
    app.hubPanel = 'transfer';
    app.transfer = null;
    const data = await pack(snapshot({ lists: app.lists, places: app.favorites, shortcuts: app.shortcuts, pins: app.pins, chips: app.chipPrefs }));
    const u = new URL(location.href);
    u.hash = `transfert=${data}`;
    const url = u.toString();
    let qr = null;
    if (url.length <= 1500) {             // au-delà, un QR code devient trop dense pour être lu sur un écran
      const q = qrcode(0, 'L');
      q.addData(url);
      q.make();
      qr = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    }
    app.transfer = { url, qr };
  }
  async function shareTransfer() {
    try {
      if (navigator.share) await navigator.share({ title: 'Mes lieux · Untracked Maps', url: app.transfer.url });
      else { await navigator.clipboard.writeText(app.transfer.url); app.say('Lien copié'); }
    } catch { /* annulé */ }
  }
  function applyIncoming(data) {
    const r = restore(data);
    const m = mergeInto({ lists: app.lists, places: app.favorites }, r, sameSpot);
    app.lists = m.lists;
    app.favorites = m.places;
    app.pins = [...new Set([...app.pins, ...r.pins])];
    for (const k of ['home', 'work']) if (r.shortcuts[k] && !app.shortcuts[k]) app.setShortcut(k, r.shortcuts[k]);
    if (r.chips?.length) { app.chipPrefs = r.chips; app.saveChips(); }
    saveAll();
    return m.added;
  }
  async function makeBackup() {
    const file = await backupFile(snapshot({ lists: app.lists, places: app.favorites, shortcuts: app.shortcuts, pins: app.pins, chips: app.chipPrefs }), app.backupPassword.trim());
    app.backupPassword = '';
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Sauvegarde de Mes lieux' });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      app.lastBackup = Date.now();
      try { localStorage.setItem(app.BACKUP_KEY, String(app.lastBackup)); } catch { /* rien */ }
      app.hubPanel = null;
      app.say('Sauvegarde créée : rangez-la dans votre iCloud, Proton Drive…');
    } catch { /* partage annulé */ }
  }
  async function doRestore(file = app.restoreFile) {
    if (!file) return;
    app.restoreFile = file;
    try {
      const r = await readBackup(file, app.restorePassword);
      if (r.needsPassword) { app.restoreNeedsPw = true; return; }
      const added = applyIncoming(r.data);
      app.restoreFile = null; app.restoreNeedsPw = false; app.restorePassword = ''; app.hubPanel = null;
      refreshSaved();
      app.say(added ? `${added} lieu${added > 1 ? 'x' : ''} restauré${added > 1 ? 's' : ''}` : 'Tout était déjà là');
    } catch (e) {
      app.say(app.restoreNeedsPw ? 'Mot de passe incorrect' : 'Ce fichier n\'est pas une sauvegarde d\'Untracked Maps');
    }
  }

  return { sameSpot, saveAll, keepOf, saveTap, setMembership, togglePin, removeFromList, createList, renameList, deleteList, refreshSaved, openSavedList, shareList, keepIncomingList, makeTransfer, shareTransfer, applyIncoming, makeBackup, doRestore };
}
