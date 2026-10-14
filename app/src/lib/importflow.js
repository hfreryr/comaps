// Import des lieux enregistrés dans Google Maps (fichier Takeout lu sur l'appareil).
// Code sorti de +page.svelte : il lit et modifie l'état de l'écran par l'objet « app » (bloc « app » de la page).
import { tx } from '#lib/i18n/index.js';
import { PARIS } from '#lib/places.js';
import { mergeInto } from '#lib/myplaces.js';
import { readGoogleExport } from '#lib/importgoogle.js';
import { search } from '#lib/geocode.js';

/** @param {any} app */
export function createImport(app) {
  // ——— Import des lieux enregistrés dans Google Maps ———
  async function importFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    app.importing = tx('import.lecture_du_fichier');
    try {
      const { places, home, work } = await readGoogleExport(file);
      let added = 0, missed = 0;
      // chaque liste Google retrouve son équivalent : Favoris, À tester (« À visiter »), ou une liste à son nom
      const listFor = (name) => {
        if (!name || /favori|favorite/i.test(name)) return 'fav';
        if (/want to go|visiter|envie/i.test(name)) return 'todo';
        const l = app.createList(name);
        if (l && /suivi|starred/i.test(name) && l.icon !== 'star') { app.lists = app.lists.map((x) => (x.id === l.id ? { ...x, icon: 'star', color: '#C7972B' } : x)); }
        return l?.id || 'fav';
      };
      const todo = places;
      const kept = [];
      for (const [i, p] of todo.entries()) {
        let { lat, lon } = p;
        if (!lat || !lon) {
          // L'export n'a pas toujours la position : on cherche le lieu par son nom, comme dans la barre de recherche.
          app.importing = tx('import.recherche_des_lieux_sans_position', { i: i + 1, n: todo.length });
          const r = (await search(p.address || p.name, PARIS).catch(() => []))[0];
          if (!r) { missed++; continue; }
          ({ lat, lon } = r);
        }
        kept.push({ id: `g${lat},${lon}`, name: p.name || p.address, type: tx('import.importe_de_google_maps'), address: p.address || '', lat, lon, lists: [listFor(p.listName)] });
      }
      const m = mergeInto({ lists: app.lists, places: app.favorites }, { lists: [], places: kept }, app.sameSpot);
      app.favorites = m.places;
      added = m.added;
      app.saveAll();
      app.refreshSaved();
      let extra = '';
      for (const [k, v] of [['home', home], ['work', work]]) {
        if (!v || app.shortcuts[k]) continue;
        let { lat, lon } = v;
        if (!lat || !lon) { const r = (await search(v.address || v.name, PARIS).catch(() => []))[0]; if (!r) continue; ({ lat, lon } = r); }
        app.setShortcut(k, { id: `${k}${lat}`, name: v.address || v.name, type: app.SHORT_NAMES[k], address: v.address || '', lat, lon });
        extra += tx('import.defini', { nom: app.SHORT_NAMES[k] });
      }
      app.importing = '';
      app.importOpen = false;
      if (!added && !extra) app.say(places.length ? tx('import.ces_lieux_sont_deja_dans_vos_favoris') : tx('import.aucun_lieu_trouve_dans_ce_fichier'));
      else app.say(tx('import.lieu_importe', { n: added, extra, manquants: missed ? tx('import.introuvable', { n: missed }) : '' }));
    } catch {
      app.importing = '';
      app.say(tx('import.ce_fichier_a_pas_pu_etre_lu'));
    }
  }

  return { importFile };
}
