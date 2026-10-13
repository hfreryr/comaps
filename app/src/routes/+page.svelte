<script>
  import { onMount, tick } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { searchCategory, details, typeLabel, fromTags, PARIS } from '#lib/places.js';
  import { search, reverse, reverseAddress } from '#lib/geocode.js';
  import { dataDate } from '#lib/placestore.js';
  import { hoursStatus, hoursTable, statusAt, momentLabel } from '#lib/hours.js';
  import { parseIntent, ARR_CENTERS, arrName } from '#lib/intent.js';
  import { draggable } from '#lib/sheet.js';
  import { wikiInfo } from '#lib/placeinfo.js';
  import { mapStyle, provideImage, osmRef, FAMILIES, DARK_LAND, darken, pinFor, pinImageId, GLYPHS } from '#lib/mapstyle.js';
  import { streetRoute, transitRoutes, transitWithStop, departures, trafficEstimate, MODE_NAMES, fmtDuration, fmtTime, fmtWait, fmtDistance } from '#lib/routing.js';
  import { stationExits, bestExit, exitLabel, sortExits } from '#lib/exits.js';
  import { readGoogleExport } from '#lib/importgoogle.js';
  import { DEFAULT_LISTS, LIST_ICONS, LIST_COLORS, migratePlaces, pack, unpack, packList, unpackList, snapshot, restore,
    backupFile, readBackup, mergeInto } from '#lib/myplaces.js';
  import qrcode from 'qrcode-generator';
  import { placeForExit, placeForTransfer, placeLabel } from '#lib/rame.js';
  import { ALL_CATEGORIES, CATEGORY_WORDS, FILLER, CHIPS_KEY, loadChipPrefs, categoryFor as catFor } from '#lib/categories.js';
  import { prepare, progress, arrowAngle, isRoundabout, navDistance, spokenDistance } from '#lib/nav.js';

  const MODES = [
    { id: 'walk', label: 'À pied' },
    { id: 'bike', label: 'Vélo' },
    { id: 'transit', label: 'Transports' },
    { id: 'car', label: 'Voiture' }
  ];
  const WALK_COLOR = '#2A5BD7';
  const BIKE_COLOR = WALK_COLOR;   // une seule couleur pour « mon itinéraire », comme Plans

  let mapEl;
  let map;
  let marker;
  let meMarker;

  // ——— Exploration ———
  let query = $state('');
  let results = $state([]);
  let searching = $state(false);
  let searchError = $state('');
  let focused = $state(false);
  let active = $state(-1);

  let category = $state(null);
  let nearby = $state([]);
  let nearbyFromMe = $state(false);
  let nearbyDone = $state(false);

  let place = $state(null);
  let info = $state(null);
  let showWeek = $state(false);
  let wiki = $state(null);           // extrait Wikipédia et photo Commons
  let moreText = $state(false);
  let viewer = $state(null);         // photo affichée en plein écran (indice), null : fermé
  let viewerEl = $state();
  let viewerIdx = $state(0);
  // Zoom dans la visionneuse : pincer, double-toucher, déplacer ; glisser vers le bas (sans zoom) ferme.
  let zoom = $state({ s: 1, x: 0, y: 0 });
  let dragY = $state(0);
  let gesture = null;
  let lastTap = 0;
  const clampZoom = (z) => {
    const w = innerWidth, h = innerHeight, mx = (w * (z.s - 1)) / 2, my = (h * (z.s - 1)) / 2;
    return { s: z.s, x: Math.max(-mx, Math.min(mx, z.x)), y: Math.max(-my, Math.min(my, z.y)) };
  };
  function toggleZoom(cx, cy) {
    if (zoom.s > 1) zoom = { s: 1, x: 0, y: 0 };
    else zoom = clampZoom({ s: 2.5, x: (innerWidth / 2 - cx) * 1.5, y: (innerHeight / 2 - cy) * 1.5 });
  }
  function zoomStart(e) {
    const t = e.touches;
    if (t.length === 2) {
      gesture = { kind: 'pinch', d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY), s: zoom.s, x: zoom.x, y: zoom.y };
    } else if (t.length === 1) {
      const now = Date.now();
      if (now - lastTap < 280) { toggleZoom(t[0].clientX, t[0].clientY); lastTap = 0; gesture = null; return; }
      lastTap = now;
      gesture = { kind: zoom.s > 1 ? 'pan' : 'maybe-down', x0: t[0].clientX, y0: t[0].clientY, x: zoom.x, y: zoom.y };
    }
  }
  function zoomMove(e) {
    if (!gesture) return;
    const t = e.touches;
    if (gesture.kind === 'pinch' && t.length === 2) {
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      zoom = clampZoom({ s: Math.max(1, Math.min(5, gesture.s * (d / gesture.d))), x: gesture.x, y: gesture.y });
    } else if (gesture.kind === 'pan' && t.length === 1) {
      zoom = clampZoom({ s: zoom.s, x: gesture.x + t[0].clientX - gesture.x0, y: gesture.y + t[0].clientY - gesture.y0 });
    } else if (gesture.kind === 'maybe-down' && t.length === 1) {
      const dx = t[0].clientX - gesture.x0, dy = t[0].clientY - gesture.y0;
      if (dy > 12 && dy > Math.abs(dx) * 1.3) gesture.kind = 'down';
      else if (Math.abs(dx) > 12) gesture = null;       // glissement horizontal : photo suivante (défilement natif)
    }
    if (gesture?.kind === 'down') { dragY = Math.max(0, t[0].clientY - gesture.y0); }
  }
  function zoomEnd() {
    if (gesture?.kind === 'down') { if (dragY > 110) viewer = null; dragY = 0; }
    if (zoom.s < 1.05) zoom = { s: 1, x: 0, y: 0 };
    gesture = null;
  }
  $effect(() => {
    zoom = { s: 1, x: 0, y: 0 };
    dragY = 0;
    if (viewer == null || !viewerEl) return;
    viewerIdx = viewer;
    viewerEl.scrollTo({ left: viewer * viewerEl.clientWidth, behavior: 'instant' });
  });
  let deps = $state(null);           // prochains passages d'une station : { status, data? }
  let now = $state(Date.now());
  let locating = $state(false);
  let toast = $state('');
  let me = $state(null); // dernière position connue de l'utilisateur, gardée sur l'appareil
  // Lieux récents : gardés uniquement dans ce navigateur, jamais envoyés ; effaçables d'un geste.
  const RECENTS_KEY = 'lieux-recents';
  let recents = $state(loadRecents());
  // Favoris : même principe, gardés uniquement dans ce navigateur.
  // Mes lieux : lieux enregistrés (chacun dans une ou plusieurs listes), listes, lieux épinglés.
  const FAVS_KEY = 'lieux-favoris';
  const LISTS_KEY = 'mes-listes';
  const PINS_KEY = 'lieux-epingles';
  const BACKUP_KEY = 'derniere-sauvegarde';
  let favorites = $state(migratePlaces(loadList(FAVS_KEY, 5000)));
  let lists = $state((() => { const l = loadList(LISTS_KEY, 100); return l.length ? l : DEFAULT_LISTS; })());
  let pins = $state(loadList(PINS_KEY, 30));
  let showSaved = $state((() => { try { return localStorage.getItem('mes-lieux-carte') !== 'non'; } catch { return true; } })());
  let lastBackup = $state((() => { try { return Number(localStorage.getItem(BACKUP_KEY)) || 0; } catch { return 0; } })());
  let savedList = $state(null);      // liste ouverte dans « Mes lieux » (null : vue d'ensemble)
  let listPicker = $state(false);    // fiche « Enregistrer dans… »
  let hubPanel = $state(null);       // 'transfer' | 'backup' | 'restore' | 'newlist'
  let incoming = $state(null);       // liste partagée ou transfert reçu par lien
  const savedEntry = $derived(place ? favorites.find((f) => sameSpot(f, place)) : null);
  const isFav = $derived(!!savedEntry);
  const listOf = (id) => lists.find((l) => l.id === id) || DEFAULT_LISTS[0];
  const listIcon = (l) => `cat|${l.icon}|${l.color}`;
  // pictogramme blanc (mêmes dessins que la carte) en image, pour les listes dans les fiches
  const glyphUrl = (g) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" fill-rule="evenodd" d="${GLYPHS[g] || GLYPHS.dot}"/></svg>`)}`;
  const placeKey = (p) => (p.osmType ? `${p.osmType}/${p.osmId}` : `${(+p.lat).toFixed(5)},${(+p.lon).toFixed(5)}`);
  const pinnedPlaces = $derived(pins.map((k) => favorites.find((f) => placeKey(f) === k)).filter(Boolean));

  // Maison et Travail : raccourcis gardés sur l'appareil.
  const SHORTCUTS_KEY = 'maison-travail';
  let shortcuts = $state(loadObj(SHORTCUTS_KEY));
  let assigning = $state(null);      // 'home' | 'work' : la prochaine adresse choisie devient ce raccourci
  const SHORT_NAMES = { home: 'Maison', work: 'Travail' };
  const placeShortcut = $derived(place ? ['home', 'work'].find((k) => shortcuts[k] && sameSpot(shortcuts[k], place)) : null);

  // Onglets de catégories
  let chipPrefs = $state(loadChipPrefs());
  const chipList = $derived(chipPrefs.filter((p) => !p.hidden).map((p) => {
    const c = ALL_CATEGORIES.find((x) => x.key === p.key);
    return { ...c, label: p.label?.trim() || c.label };
  }));
  let editChips = $state(false);
  let importOpen = $state(false);
  let importing = $state('');        // message de progression de l'import
  let exits = $state(null);          // sorties de la station ouverte : { status, data? }
  let allExits = $state(false);
  let legExits = $state({});         // sortie conseillée par étape du trajet en transport
  // Promesse affichée à la première ouverture (« ni compte, ni pistage »).
  let showPromise = $state((() => { try { return !localStorage.getItem('promesse-vue'); } catch { return false; } })());
  function closePromise() {
    showPromise = false;
    try { localStorage.setItem('promesse-vue', '1'); } catch { /* rien */ }
  }

  // Panorama plein écran : on l'ouvre centré sur le lieu (rel : degrés depuis le centre de la photo)
  function panoScroll(node, rel) {
    const img = node.querySelector('img');
    const center = () => { node.scrollLeft = (rel / 360 + 0.5) * img.clientWidth - node.clientWidth / 2; };
    if (img.complete) center(); else img.addEventListener('load', center, { once: true });
  }

  // ——— Itinéraire ———
  let directions = $state(false);
  let from = $state(null);           // { label, lat, lon, isMe? }
  let to = $state(null);
  let via = $state(null);            // arrêt intermédiaire facultatif
  let showVia = $state(false);
  let mode = $state('walk');
  let pickedStreet = $state(0);      // itinéraire choisi parmi le principal et ses variantes (à pied, vélo, voiture)
  let showSteps = $state(false);
  // Guidage en cours : { kind, mode, steps, coords, cum, total, s, k, off, arrived, … }
  let nav = $state(null);
  let navFollow = $state(true);      // la carte suit la position (jusqu'à ce qu'on la déplace à la main)
  let navList = $state(false);
  let voice = $state(true);
  let editing = $state(null);        // 'from' | 'to' | null
  let fieldQuery = $state('');
  let fieldEl = $state();
  let routes = $state({ walk: null, bike: null, transit: null }); // { status, data?, error? }
  let picked = $state(0);            // proposition de transport choisie
  let mapMode = $state('plan');      // 'plan' | 'transit'
  let showModes = $state(false);
  let lastEdit = { which: null, at: 0 }; // champ quitté juste avant un toucher sur la carte

  const status = $derived(info?.hours ? hoursStatus(info.hours, place.lat, place.lon) : null);
  const week = $derived(info?.hours ? hoursTable(info.hours, place.lat, place.lon) : null);
  let placeMenu = $state(false);     // menu « ••• » de la fiche lieu
  let osmDate = $state('');
  dataDate().then((d) => { if (d) osmDate = new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); }).catch(() => {});
  // Fraîcheur : date de la dernière vérification sur place notée dans OSM (check_date).
  const freshness = $derived.by(() => {
    const d = info?.checkDate ? new Date(info.checkDate) : null;
    if (!d || isNaN(d)) return null;
    const months = (Date.now() - d) / 2.63e9;
    const when = d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    return months <= 24 ? { ok: true, text: `Infos vérifiées en ${when}` } : { ok: false, text: `Infos non vérifiées depuis ${d.getFullYear()}` };
  });
  // Bandeau d'infos (distance, accès, entrée) : seulement ce qui est connu.
  const infoStrip = $derived.by(() => {
    const out = [];
    if (me && place) out.push({ label: 'Distance', value: fmtDistance(dist(me.lat, me.lon, place.lat, place.lon)) });
    const wc = { yes: 'Oui', limited: 'Partiel', no: 'Non' }[info?.wheelchair];
    if (wc) out.push({ label: 'Accès fauteuil', value: wc, wc: true });
    const fee = { no: 'Gratuite', yes: 'Payante' }[info?.fee];
    if (fee) out.push({ label: 'Entrée', value: fee });
    return out;
  });
  // Liens vers OpenStreetMap : c'est l'utilisateur qui modifie, sur le site d'OSM (nous n'écrivons rien).
  const osmEditUrl = $derived(place?.osmType ? `https://www.openstreetmap.org/edit?${place.osmType}=${place.osmId}` : null);
  const osmNoteUrl = $derived(place ? `https://www.openstreetmap.org/note/new#map=19/${(+place.lat).toFixed(6)}/${(+place.lon).toFixed(6)}` : '');
  const inFav = $derived(!!savedEntry?.lists?.includes('fav'));
  const isPinned = $derived(!!place && pins.includes(placeKey(place)));
  function favTap() {
    const was = inFav;
    setMembership('fav', !was);
    if (!was) say(`Ajouté à ${listOf('fav').name}`, { label: 'Autre liste', run: () => (listPicker = true) });
  }
  async function copyAddress() {
    placeMenu = false;
    try { await navigator.clipboard.writeText([title, address].filter(Boolean).join(', ')); say('Adresse copiée'); } catch { /* refusé */ }
  }
  const activeQuery = $derived(editing ? fieldQuery : query);
  // « restaurant ce soir 8e » : catégorie + moment + zone
  const intent = $derived(editing ? null : parseIntent(query));
  const catHit = $derived.by(() => {
    if (editing) return null;
    const direct = catFor(query, chipList);
    if (direct && !intent?.any) return direct;
    if (!intent?.any || !intent.words.length) return direct;
    // une catégorie parmi les mots restants ; les autres mots forment un nom de quartier
    for (const w of intent.words) {
      const c = catFor(w, chipList);
      if (c) {
        const rest = intent.words.filter((x) => !CATEGORY_WORDS[c.key].includes(x) && !FILLER.has(x));
        return { ...c, when: intent.when, area: intent.area || (rest.length ? { text: rest.join(' ') } : null) };
      }
    }
    return direct;
  });
  const whenText = (w) => (!w ? '' : w.now ? 'ouverts maintenant' : `ouverts ${momentLabel(w.at)}`);
  const areaText = (a) => (!a ? '' : a.arr ? arrName(a.arr) : a.text.replace(/^./, (x) => x.toUpperCase()));
  const showList = $derived(editing ? true : focused && (query.trim().length >= 2 || !query.trim()));
  const isAddress = $derived(place?.type === 'Adresse');
  const title = $derived(isAddress ? place.name.split(',')[0] : place?.name);
  const address = $derived(isAddress ? '' : (info?.address && info.address.includes(' ') ? info.address : '') || place?.address || '');
  const current = $derived(routes[mode]);
  const STATION_TYPES = ['Station de métro', 'Station', 'Gare', 'Entrée de métro', 'Station de tram'];
  const isStation = $derived(!!place && STATION_TYPES.includes(place.type));
  // « Métro 4 · RER B » : les lignes qui passent, déduites des prochains passages.
  const stationKind = $derived(deps?.status === 'ok'
    ? [...deps.data.lines.reduce((acc, l) => {
        const m = MODE_NAMES[l.mode] || 'Train';
        if (!acc.has(m)) acc.set(m, new Set());
        if (l.line !== m) acc.get(m).add(l.line);
        return acc;
      }, new Map())].map(([m, ls]) => `${m} ${[...ls].join(', ')}`.trim()).join(' · ')
    : null);

  onMount(() => {
    maplibregl.setWorkerUrl(workerUrl);
    const fresh = !location.hash.includes('carte='); // ouverture « à neuf » (pas un lien vers un endroit précis)
    // Mode sombre : suit le réglage du téléphone, y compris s'il change pendant l'utilisation.
    const darkMQ = matchMedia('(prefers-color-scheme: dark)');
    dark = darkMQ.matches;
    const base = new URL('.', location.href).href;
    map = new maplibregl.Map({
      container: mapEl,
      style: mapStyle(base, dark),
      center: [PARIS.lon, PARIS.lat],
      zoom: 13,
      hash: 'carte',
      attributionControl: { compact: true, customAttribution:
        'Recherche <a href="https://photon.komoot.io" target="_blank" rel="noopener">Photon / komoot</a> · Itinéraires <a href="https://valhalla1.openstreetmap.de" target="_blank" rel="noopener">Valhalla / FOSSGIS</a>, <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous</a> · <a href="https://github.com/hfreryr/untracked" target="_blank" rel="noopener">Projet libre</a> · <a href="confidentialite">Qui voit quoi</a>' },
      fadeDuration: 200
    });
    map.setMissingStyleImageResolver((id) => provideImage(map, id));
    if (location.hostname === 'localhost') window.__map = map; // pour les tests locaux
    if (location.hostname === 'localhost') window.__nav = () => nav && { k: nav.k, s: nav.s, total: nav.total, coords: $state.snapshot(nav.coords) };
    // Nos calques (trajet, favoris) sont à rajouter à chaque changement de style (clair ↔ sombre).
    map.on('style.load', addCustomLayers);
    darkMQ.addEventListener('change', (e) => { dark = e.matches; map.setStyle(mapStyle(base, dark)); });
    map.once('load', () => {
      document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      if (fresh) startupLocate();
      // Liste partagée (…#liste=…) ou transfert depuis un autre appareil (…#transfert=…) : tout est dans le lien.
      const lm = /[#&]liste=([\w-]+)/.exec(location.hash), tm = /[#&]transfert=([\w-]+)/.exec(location.hash);
      if (lm || tm) {
        history.replaceState(history.state, '', location.href.replace(/[#&](liste|transfert)=[\w-]+/, ''));
        if (tm) unpack(tm[1]).then((raw) => { incoming = { kind: 'transfer', raw, data: restore(raw) }; }).catch(() => say('Ce lien de transfert est incomplet.'));
        else unpackList(lm[1]).then((r) => {
          incoming = { kind: 'list', ...r };
          category = { key: 'shared', saved: true, shared: true, label: r.list.name, name: r.list.name, icon: r.list.icon || 'star', color: r.list.color || '#2A5BD7' };
          refreshSaved();
          const pts = nearby.slice(0, 10).map((n) => n.f.geometry.coordinates);
          if (pts.length) fitTo(pts);
        }).catch(() => say('Ce lien de liste est incomplet.'));
      }
      // Lien partagé vers un lieu (…#carte=…&lieu=node/123) : on rouvre sa fiche.
      const shared = /[#&]lieu=(node|way|relation)\/(\d+)/.exec(location.hash);
      if (shared) {
        const c = map.getCenter();
        openPlace({ id: `${shared[1]}${shared[2]}`, osmType: shared[1], osmId: Number(shared[2]), name: '', type: '', address: '', lat: c.lat, lon: c.lng });
      }
    });
    map.on('click', onMapClick);
    // Catégorie ouverte : quand on déplace ou zoome la carte à la main, la liste se recharge pour la nouvelle zone.
    map.on('movestart', (e) => { if (e.originalEvent) userMoved = viewChosen = true; });
    map.on('moveend', () => {
      setTimeout(() => (viewHash = location.hash), 500);   // (la carte met à jour l’adresse avec un léger délai)
      if (!userMoved) return;
      userMoved = false;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(reloadCategoryHere, 350);
    });
    map.on('dragstart', (e) => {
      if (!e.originalEvent) return;
      if (nav) navFollow = false;
      if (followMode !== 'none') followMode = 'none';
    });
    // l'app passe en arrière-plan : on arrête de suivre la position (batterie)
    const onVis = () => { if (document.hidden) stopWatch(); else if (me) startWatch(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown);
    const offline = () => say('Pas de connexion. La recherche et les itinéraires reprendront dès le retour du réseau.');
    const online = () => say('Connexion rétablie');
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    // Boussole : visible seulement quand la carte est tournée ou inclinée.
    const orient = () => { bearing = map.getBearing(); pitch = map.getPitch(); };
    map.on('rotate', orient);
    map.on('pitch', orient);
    // Appui long (ou clic droit) : adresse du point, même si une fiche est ouverte.
    map.on('contextmenu', (e) => { if (!directions) openPoint(e.lngLat); });
    for (const id of ['poi', 'poi-other', 'poi-hit', 'landmark', 'metro', 'fav']) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      map.remove();
    };
  });
  let topH = $state(120);
  let searchH = $state(56);   // sur grand écran, les raccourcis sont à droite de la recherche : seule la recherche compte   // hauteur du haut d'écran (recherche, ou départ/arrivée + modes) : la fiche se place dessous
  let bearing = $state(0);
  let pitch = $state(0);

  let dark = $state(false);
  const favData = () => ({ type: 'FeatureCollection', features: favorites.map((f, i) => {
    const l = listOf(f.lists?.[0]);
    return { type: 'Feature', id: i, geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
      properties: { i, name: f.name, icon: listIcon(l), tc: labelColor(l.color) } };
  }) });

  function addCustomLayers() {
    if (map.getSource('route')) return;
    addRouteLayers();
    map.addSource('cat-hits', { type: 'geojson', data: empty() });
    map.addLayer({ id: 'cat-hit', type: 'symbol', source: 'cat-hits',
      layout: { 'icon-image': ['get', 'icon'], 'icon-size': 1.15, 'icon-allow-overlap': true, 'symbol-sort-key': ['get', 'i'],
                'text-field': ['get', 'name'], 'text-font': ['Open Sans Bold'], 'text-size': 12.5, 'text-anchor': 'left',
                'text-offset': [1.3, 0], 'text-max-width': 8, 'text-optional': true },
      paint: { 'text-color': ['get', 'tc'], 'text-halo-color': dark ? 'rgba(22,24,28,0.9)' : '#FFFFFF', 'text-halo-width': 1.8 } });
    map.addSource('selected', { type: 'geojson', data: empty() });
    map.addSource('favs', { type: 'geojson', data: favData() });
    map.addLayer({ id: 'fav', type: 'symbol', source: 'favs',
      layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 1.05],
                'text-field': ['step', ['zoom'], '', 14, ['get', 'name']], 'text-font': ['Open Sans Semibold'], 'text-size': 12,
                'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-optional': true, 'text-max-width': 8 },
      paint: { 'text-color': ['get', 'tc'], 'text-halo-color': dark ? 'rgba(22,24,28,0.9)' : '#FFFFFF', 'text-halo-width': 1.6 } });
    map.addLayer({ id: 'selected', type: 'symbol', source: 'selected',
      layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                'text-field': ['get', 'name'], 'text-font': ['Open Sans Bold'], 'text-size': 13.5, 'text-anchor': 'left',
                'text-offset': [1.75, 0], 'text-max-width': 9, 'text-allow-overlap': true },
      paint: { 'text-color': ['get', 'tc'], 'text-halo-color': dark ? 'rgba(22,24,28,0.95)' : '#FFFFFF', 'text-halo-width': 2 } });
    dimPlaces(dimmed);
    isolate();
    // Après un changement de style : on remet l'état en cours (trajet, catégorie, mode transports).
    if (directions) drawRoute();
    else if (place) showSelection(place);
    if (category) applyHit(category);
    if (mapMode === 'transit') for (const id of ['transit-case', 'transit-line', 'transit-label']) map.setLayoutProperty(id, 'visibility', 'visible');
  }


  // ——— Carte ———
  function addRouteLayers() {
    map.addSource('route', { type: 'geojson', data: empty() });
    const before = 'water-name-point';
    // épaisseurs proches de Plans et Google Maps ; les variantes grises un peu plus fines
    const width = (a, b) => ['interpolate', ['exponential', 1.4], ['zoom'], 12, ['*', a, ['case', ['==', ['get', 'kind'], 'alt'], 0.8, 1]],
      18, ['*', b, ['case', ['==', ['get', 'kind'], 'alt'], 0.8, 1]]];
    // Trajets à pied, à vélo et en transport : trait plein, liseré foncé puis bord blanc.
    map.addLayer({ id: 'route-halo', type: 'line', source: 'route', filter: ['!=', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': dark ? DARK_LAND : '#FFFFFF', 'line-width': width(6.5, 12) } }, before);
    map.addLayer({ id: 'route-case', type: 'line', source: 'route', filter: ['!=', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'edge'], 'line-width': width(4.8, 9.5) } }, before);
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['!=', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': width(3.4, 7) } }, before);
    // Correspondances à pied dans un trajet en transport : points discrets.
    map.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['==', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#6F7A88', 'line-width': width(3.2, 5.5), 'line-dasharray': [0, 1.7] } }, before);
    // Étiquettes sur les tracés : « 18 min » sur celui choisi, « +2 min » sur les autres (comme Plans et Maps)
    map.addSource('route-tags', { type: 'geojson', data: empty() });
    const tagLayout = { 'text-field': ['get', 'label'], 'text-font': ['Open Sans Bold'], 'text-size': 13,
      'icon-image': ['case', ['get', 'sel'], 'tag-sel', 'tag-alt'], 'icon-text-fit': 'both', 'icon-text-fit-padding': [4, 8, 4, 8] };
    // les étiquettes restent toujours visibles ; leur position (routeTags) évite qu'elles se chevauchent
    map.addLayer({ id: 'route-tag', type: 'symbol', source: 'route-tags', filter: ['!', ['get', 'sel']],
      layout: { ...tagLayout, 'icon-allow-overlap': true, 'text-allow-overlap': true },
      paint: { 'text-color': dark ? '#E6E9EE' : '#1C1D1F' } });
    map.addLayer({ id: 'route-tag-sel', type: 'symbol', source: 'route-tags', filter: ['get', 'sel'],
      layout: { ...tagLayout, 'icon-allow-overlap': true, 'text-allow-overlap': true },
      paint: { 'text-color': '#FFFFFF' } });
    map.addSource('route-ends', { type: 'geojson', data: empty() });
    map.addLayer({ id: 'route-start', type: 'circle', source: 'route-ends',
      paint: { 'circle-radius': 7.5, 'circle-color': ['match', ['get', 'kind'], 'via', '#FFFFFF', '#2A5BD7'],
               'circle-stroke-color': ['match', ['get', 'kind'], 'via', '#1C1D1F', '#FFFFFF'], 'circle-stroke-width': 3.5 } });
  }
  const empty = () => ({ type: 'FeatureCollection', features: [] });

  function drawRoute(fit = true) {
    const src = map?.getSource('route');
    if (!src) return;
    const feats = [];
    const r = current?.status === 'ok' ? current.data : null;
    if (r && mode !== 'transit') {
      const opts = streetOpts(r);
      const sel = opts[pickedStreet] || r;
      // variantes en gris dessous (touchables), le trajet choisi en couleur par-dessus
      opts.forEach((o, i) => { if (o !== sel) feats.push({ ...line(o.coords, 'alt', '#A3ADBA', '#7F8A98'), properties: { kind: 'alt', color: '#A3ADBA', edge: '#7F8A98', i } }); });
      feats.push(mode === 'bike' ? line(sel.coords, 'bike', BIKE_COLOR, '#1B3F9E') : line(sel.coords, mode, WALK_COLOR, '#1B3F9E'));
    } else if (r && mode === 'transit' && r[picked]) {
      for (const leg of r[picked].legs) {
        if (leg.coords.length < 2) continue;
        feats.push(leg.mode === 'WALK' ? line(leg.coords, 'transfer', '#6F7A88') : line(leg.coords, 'transit', leg.color, shade(leg.color)));
      }
    }
    src.setData({ type: 'FeatureCollection', features: feats });
    map.getSource('route-ends').setData(from && directions ? { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [from.lon, from.lat] }, properties: { kind: 'from' } },
      ...(showVia && via ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [via.lon, via.lat] }, properties: { kind: 'via' } }] : [])] } : empty());
    const all = feats.flatMap((f) => f.geometry.coordinates);
    // zoom d'arrivée (après cadrage) : sert à écarter les étiquettes à l'écran
    const z = all.length && fit ? map.cameraForBounds(boundsOf(all), fitOptions())?.zoom ?? map.getZoom() : map.getZoom();
    map.getSource('route-tags')?.setData(routeTags(r, z));
    if (feats.length && fit) fitTo(all);
  }
  const line = (coords, kind, color, edge = color) => ({ type: 'Feature', properties: { kind, color, edge }, geometry: { type: 'LineString', coordinates: coords } });
  // Teinte plus foncée d'une couleur, pour le liseré d'un trait.
  function shade(hex, k = 0.7) {
    const n = parseInt(hex.slice(1, 7), 16);
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('');
  }
  // Pendant un itinéraire, les lieux de la carte s'effacent derrière le trajet.
  // Le lieu sélectionné est masqué à sa place (état « sel ») : c'est sa version agrandie qui s'affiche.
  let dimmed = false;
  function dimPlaces(on) {
    dimmed = on;
    const v = on ? 0.35 : 1;
    const op = ['case', ['boolean', ['feature-state', 'sel'], false], 0, v];
    // les résultats de la liste (restaurants…) disparaissent pendant l'itinéraire et reviennent après
    if (map.getLayer('cat-hit')) map.setLayoutProperty('cat-hit', 'visibility', on ? 'none' : 'visible');
    for (const id of ['poi', 'poi-other', 'landmark', 'metro', 'fav']) {
      if (!map.getLayer(id)) continue;
      const keep = id === 'fav';   // nos propres repères ne s'estompent pas pendant un trajet
      map.setPaintProperty(id, 'icon-opacity', keep ? ['case', ['boolean', ['feature-state', 'sel'], false], 0, 1] : op);
      map.setPaintProperty(id, 'text-opacity', keep ? ['case', ['boolean', ['feature-state', 'sel'], false], 0, 1] : op);
    }
  }
  function setMapMode(m) {
    mapMode = m;
    showModes = false;
    for (const id of ['transit-case', 'transit-line', 'transit-label']) map.setLayoutProperty(id, 'visibility', m === 'transit' ? 'visible' : 'none');
    if (m === 'transit' && map.getZoom() > 14.5) map.easeTo({ zoom: 13.5, duration: 600 });
  }

  function fitOptions() {
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    return { padding: mobile
        ? { top: 210, bottom: Math.round(window.innerHeight * 0.46), left: 36, right: 36 }
        : { top: 60, bottom: 60, left: 460, right: 60 }, maxZoom: 17 };
  }
  const boundsOf = (coords) => coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  function fitTo(coords) {
    map.fitBounds(boundsOf(coords), { ...fitOptions(), duration: 700 });
  }

  function onMapClick(e) {
    if (nav) return;
    if (directions) {
      const tag = !editing && map.queryRenderedFeatures(e.point, { layers: ['route-tag', 'route-tag-sel'] })[0];
      if (tag) return pickStreet(tag.properties.i);
      const alt = !editing && map.queryRenderedFeatures([[e.point.x - 8, e.point.y - 8], [e.point.x + 8, e.point.y + 8]], { layers: ['route-line'] })
        .find((f) => f.properties.kind === 'alt');
      if (alt) return pickStreet(alt.properties.i);
      const which = editing || (Date.now() - lastEdit.at < 800 ? lastEdit.which : null);
      if (which) pickOnMap(which, e.lngLat);
      return;
    }
    // Un panneau ou un menu ouvert : le premier toucher à côté le referme, sans rien ouvrir d'autre.
    if (showModes || editChips || importOpen) { showModes = false; editChips = false; importOpen = false; return; }
    const fav = map.queryRenderedFeatures(e.point, { layers: ['fav'] })[0];
    if (fav) {
      const f = favorites[fav.properties.i], l = listOf(f.lists?.[0]);
      return openPlace({ ...f, pin: { glyph: l.icon, color: l.color }, hide: [{ source: 'favs', id: fav.properties.i }] });
    }
    const hit = map.queryRenderedFeatures(e.point, { layers: ['cat-hit'] })[0];
    if (hit && nearby[hit.properties.i]?.saved) return openPlace({ ...nearby[hit.properties.i].saved, pin: { glyph: listOf(nearby[hit.properties.i].saved.lists?.[0]).icon, color: listOf(nearby[hit.properties.i].saved.lists?.[0]).color } });
    if (hit && nearby[hit.properties.i]) return openFeature(nearby[hit.properties.i].f, 'cat-hit');
    const f = map.queryRenderedFeatures(e.point, { layers: ['poi-hit', 'poi', 'poi-other', 'landmark', 'metro'] })[0];
    if (f) return openFeature(f);
    // Toucher un endroit vide : fiche de l'adresse (si une fiche est ouverte, le toucher la ferme d'abord).
    if (place) return closePlace();
    openPoint(e.lngLat);
  }

  async function openPoint({ lng, lat }) {
    const p = { id: `pt${lng},${lat}`, name: 'Point sélectionné', type: 'Adresse', address: '', lat, lon: lng };
    clearSelection();
    placeMarker(lng, lat);
    place = p;
    info = {};
    deps = null;
    wiki = null;          // (sinon la photo du lieu précédent restait affichée)
    exits = null;
    moreText = false;
    showWeek = false;
    const label = await reverseAddress(lat, lng).catch(() => null);
    if (place === p || place?.id === p.id) { place = { ...p, name: label || 'Point sélectionné' }; remember(place); }
  }

  function openFeature(f, layerId = f.layer?.id) {
    const [osmType, osmId] = (f.properties.osm || '').split('/');
    const ref = f.properties.osm ? { osmType, osmId: Number(osmId) } : osmRef(f.id);
    const [lon, lat] = f.geometry.coordinates;
    const ci = category && !category.transit ? nearby.findIndex((n) => n.f === f || (n.f.id === f.id && f.id != null)) : -1;
    const pin = ci >= 0 ? { glyph: catIcon(category), color: famColor(category) }
      : pinFor({ subclass: f.properties.subclass, family: f.properties.family, layer: layerId });
    const hide = [];
    if (f.source && f.id != null) hide.push(f.sourceLayer ? { source: f.source, sourceLayer: f.sourceLayer, id: f.id } : { source: f.source, id: f.id });
    if (ci >= 0) hide.push({ source: 'cat-hits', id: ci });
    openPlace({
      pin, hide,
      id: String(f.id), ...ref, name: category && !category.transit ? displayName(f, category) : f.properties.name,
      type: typeLabel('', f.properties.subclass) || typeLabel('', f.properties.class)
        || { culture: 'Culture', sight: 'Lieu remarquable', nature: 'Parc ou jardin', health: 'Hôpital', train: 'Gare', shop: 'Grand magasin' }[f.properties.family],
      address: '', lat, lon
    });
  }

  // ——— Recherche (barre principale ou champ de départ / d'arrivée) ———
  let timer;
  let controller;
  $effect(() => {
    const q = activeQuery.trim();
    clearTimeout(timer);
    controller?.abort();
    searchError = '';
    if (q.length < 2 || (!editing && q === place?.name)) { results = []; searching = false; return; }
    searching = true;
    timer = setTimeout(async () => {
      controller = new AbortController();
      try {
        const c = map?.getCenter();
        results = await search(q, c ? { lat: c.lat, lon: c.lng } : PARIS, controller.signal);
        active = -1;
      } catch (e) {
        if (e.name !== 'AbortError') {
          results = [];
          searchError = 'La recherche ne répond pas. Vérifiez votre connexion et réessayez.';
        }
      } finally {
        searching = false;
      }
    }, 250);
  });

  function frame(lon, lat) {
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    // Décale le lieu vers la zone visible (sans marge persistante, qui perturbe le rendu).
    const offset = mobile ? [0, -Math.round((window.innerHeight * 0.46 - 120) / 2)] : [210, 0];
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 16.5), offset, duration: 800 });
  }

  function placeMarker(lon, lat) {
    if (!marker) {
      const el = document.createElement('div');
      el.className = 'pin';
      marker = new maplibregl.Marker({ element: el, anchor: 'bottom' });
    }
    marker.setLngLat([lon, lat]).addTo(map);
  }

  // Couleur du nom à côté d'une pastille : plus foncée sur fond clair, plus claire en mode sombre.
  function labelColor(hex) {
    if (!dark) return darken(hex);
    const n = parseInt(hex.slice(1, 7), 16);
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * 0.45).toString(16).padStart(2, '0')).join('');
  }
  // Sélection d'un lieu : sa propre pastille, agrandie, à la place de la petite (repère rouge pour une adresse).
  let selStates = [];
  // (Les pastilles-photo sur la carte et les vignettes des listes ont été retirées le 13/10 : les vues de rue
  //  ne rendent pas l'ambiance d'un lieu. La vue de la rue reste dans la fiche, pour reconnaître l'entrée.)
  const clearSelPhoto = () => {};
  const clearPhotoPins = () => {};

  function clearSelection() {
    clearSelPhoto();
    for (const t of selStates) { try { map.setFeatureState(t, { sel: false }); } catch { /* tuile déchargée */ } }
    selStates = [];
    map?.getSource('selected')?.setData(empty());
  }
  function showSelection(p) {
    clearSelection();
    const pin = p.pin || pinFor({ subclass: p.subclass });
    if (!pin || !map?.getSource('selected')) { placeMarker(p.lon, p.lat); return; }
    marker?.remove();
    const color = pin === 'metro' ? '#2B4793' : pin.color;
    map.getSource('selected').setData({ type: 'FeatureCollection', features: [{ type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { icon: pinImageId(pin), name: p.name || '', tc: labelColor(color) } }] });
    selStates = p.hide || [];
    for (const t of selStates) { try { map.setFeatureState(t, { sel: true }); } catch { /* rien */ } }
  }

  function loadList(key, max) {
    try { return JSON.parse(localStorage.getItem(key) || '[]').slice(0, max); } catch { return []; }
  }
  function loadRecents() { return loadList(RECENTS_KEY, 8); }
  function loadObj(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
  }
  function saveFavorites() {
    try { localStorage.setItem(FAVS_KEY, JSON.stringify(favorites)); } catch { /* navigation privée */ }
  }
  function setShortcut(which, p) {
    shortcuts = { ...shortcuts, [which]: p ? { id: p.id, name: p.name, type: p.type, address: p.address || '', lat: p.lat, lon: p.lon, osmType: p.osmType, osmId: p.osmId, subclass: p.subclass, pin: p.pin } : undefined };
    try { localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts)); } catch { /* rien */ }
  }
  // Toucher « Maison » : itinéraire direct. S'il n'est pas encore défini, on le demande.
  function useShortcut(which) {
    const p = shortcuts[which];
    if (!p) {
      assigning = which;
      query = '';
      say(which === 'home' ? 'Tapez l\'adresse de votre maison' : 'Tapez l\'adresse de votre travail');
      setTimeout(() => document.getElementById('search')?.focus(), 50);
      return;
    }
    if (editing) { pickResult({ ...p }); return; }
    focused = false;
    document.activeElement?.blur();
    clearCategory();
    openPlace({ ...p, name: p.name || SHORT_NAMES[which] });
    startDirections();
  }

  // ——— Import des lieux enregistrés dans Google Maps ———
  async function importFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    importing = 'Lecture du fichier…';
    try {
      const { places, home, work } = await readGoogleExport(file);
      let added = 0, missed = 0;
      // chaque liste Google retrouve son équivalent : Favoris, À tester (« À visiter »), ou une liste à son nom
      const listFor = (name) => {
        if (!name || /favori|favorite/i.test(name)) return 'fav';
        if (/want to go|visiter|envie/i.test(name)) return 'todo';
        const l = createList(name);
        if (l && /suivi|starred/i.test(name) && l.icon !== 'star') { lists = lists.map((x) => (x.id === l.id ? { ...x, icon: 'star', color: '#C7972B' } : x)); }
        return l?.id || 'fav';
      };
      const todo = places;
      const kept = [];
      for (const [i, p] of todo.entries()) {
        let { lat, lon } = p;
        if (!lat || !lon) {
          // L'export n'a pas toujours la position : on cherche le lieu par son nom, comme dans la barre de recherche.
          importing = `Recherche des lieux sans position… ${i + 1} / ${todo.length}`;
          const r = (await search(p.address || p.name, PARIS).catch(() => []))[0];
          if (!r) { missed++; continue; }
          ({ lat, lon } = r);
        }
        kept.push({ id: `g${lat},${lon}`, name: p.name || p.address, type: 'Importé de Google Maps', address: p.address || '', lat, lon, lists: [listFor(p.listName)] });
      }
      const m = mergeInto({ lists, places: favorites }, { lists: [], places: kept }, sameSpot);
      favorites = m.places;
      added = m.added;
      saveAll();
      refreshSaved();
      let extra = '';
      for (const [k, v] of [['home', home], ['work', work]]) {
        if (!v || shortcuts[k]) continue;
        let { lat, lon } = v;
        if (!lat || !lon) { const r = (await search(v.address || v.name, PARIS).catch(() => []))[0]; if (!r) continue; ({ lat, lon } = r); }
        setShortcut(k, { id: `${k}${lat}`, name: v.address || v.name, type: SHORT_NAMES[k], address: v.address || '', lat, lon });
        extra += ` · ${SHORT_NAMES[k]} défini`;
      }
      importing = '';
      importOpen = false;
      if (!added && !extra) say(places.length ? 'Ces lieux sont déjà dans vos favoris.' : 'Aucun lieu trouvé dans ce fichier. Choisissez l\'archive Takeout de Google Maps.');
      else say(`${added} lieu${added > 1 ? 'x' : ''} importé${added > 1 ? 's' : ''}${extra}${missed ? ` · ${missed} introuvable${missed > 1 ? 's' : ''}` : ''}`);
    } catch {
      importing = '';
      say('Ce fichier n\'a pas pu être lu. Choisissez l\'archive .zip envoyée par Google.');
    }
  }

  // ——— Onglets personnalisés ———
  function saveChips() {
    try { localStorage.setItem(CHIPS_KEY, JSON.stringify(chipPrefs)); } catch { /* rien */ }
  }
  function moveChip(i, d) {
    const j = i + d;
    if (j < 0 || j >= chipPrefs.length) return;
    const next = [...chipPrefs];
    [next[i], next[j]] = [next[j], next[i]];
    chipPrefs = next;
    saveChips();
  }
  function toggleChip(i) {
    const p = { ...chipPrefs[i], hidden: !chipPrefs[i].hidden };
    const rest = chipPrefs.filter((_, k) => k !== i);
    // affiché → rejoint la fin des raccourcis affichés ; masqué → rejoint le haut des disponibles
    const firstHidden = rest.findIndex((x) => x.hidden);
    const at = firstHidden < 0 ? rest.length : firstHidden;
    chipPrefs = [...rest.slice(0, at), p, ...rest.slice(at)];
    saveChips();
  }
  function renameChip(i, label) {
    chipPrefs = chipPrefs.map((p, k) => (k === i ? { ...p, label } : p));
    saveChips();
  }
  function resetChips() {
    chipPrefs = ALL_CATEGORIES.map((c) => (c.on ? { key: c.key } : { key: c.key, hidden: true }));
    saveChips();
  }
  const catOf = (key) => ALL_CATEGORIES.find((c) => c.key === key);
  // Un même lieu : même identifiant OSM, ou même nom au même endroit (à ~20 m près).
  function sameSpot(a, b) {
    if (a.osmType && b.osmType) return a.osmType === b.osmType && String(a.osmId) === String(b.osmId);
    return a.name === b.name && Math.abs(a.lat - b.lat) < 0.0002 && Math.abs(a.lon - b.lon) < 0.0003;
  }
  function saveAll() {
    saveFavorites();
    try {
      localStorage.setItem(LISTS_KEY, JSON.stringify(lists));
      localStorage.setItem(PINS_KEY, JSON.stringify(pins));
    } catch { /* navigation privée */ }
  }
  const keepOf = (p) => ({ id: p.id, name: p.name, type: p.type, address: p.address || info?.address || '', lat: p.lat, lon: p.lon,
    osmType: p.osmType, osmId: p.osmId, subclass: p.subclass, pin: p.pin });
  // « Enregistrer » : un geste, dans Favoris ; le message propose de changer de liste. Déjà enregistré : choix des listes.
  function saveTap() {
    const p = place;
    if (!p) return;
    if (savedEntry) { listPicker = true; return; }
    favorites = [{ ...keepOf(p), lists: ['fav'] }, ...favorites];
    saveAll();
    say(`Enregistré dans ${listOf('fav').name}`, { label: 'Changer', run: () => (listPicker = true) });
  }
  function setMembership(listId, on) {
    const p = place;
    if (!p) return;
    const ex = favorites.find((f) => sameSpot(f, p));
    if (on && !ex) favorites = [{ ...keepOf(p), lists: [listId] }, ...favorites];
    else if (ex) {
      const ls = on ? [...new Set([...ex.lists, listId])] : ex.lists.filter((x) => x !== listId);
      if (!ls.length) {
        const before = favorites, beforePins = pins;
        favorites = favorites.filter((f) => f !== ex);
        pins = pins.filter((k) => k !== placeKey(ex));
        say('Retiré de Mes lieux', { label: 'Annuler', run: () => { favorites = before; pins = beforePins; saveAll(); } });
      } else favorites = favorites.map((f) => (f === ex ? { ...f, lists: ls } : f));
    }
    saveAll();
  }
  function togglePin(p) {
    const k = placeKey(p);
    if (pins.includes(k)) pins = pins.filter((x) => x !== k);
    else {
      if (!favorites.some((f) => sameSpot(f, p))) favorites = [{ ...keepOf(p), lists: ['fav'] }, ...favorites];
      pins = [...pins, k];
    }
    saveAll();
  }
  let newListName = $state('');
  let listEditing = $state(false);   // « Modifier » : une poubelle sur chaque lieu de la liste
  let swiped = $state(null);         // lieu glissé vers la gauche (poubelle visible)
  let swipeStart = null;
  function removeFromList(saved, listId) {
    const before = favorites, beforePins = pins;
    const ls = saved.lists.filter((x) => x !== listId);
    if (ls.length) favorites = favorites.map((f) => (f === saved ? { ...f, lists: ls } : f));
    else { favorites = favorites.filter((f) => f !== saved); pins = pins.filter((k) => k !== placeKey(saved)); }
    swiped = null;
    saveAll();
    refreshSaved();
    say(`« ${saved.name} » retiré de ${listOf(listId).name}`, { label: 'Annuler', run: () => { favorites = before; pins = beforePins; saveAll(); refreshSaved(); } });
  }
  function createList(name, then) {
    const n = name.trim();
    if (!n) return null;
    const ex = lists.find((l) => l.name.toLowerCase() === n.toLowerCase());
    if (ex) { then?.(ex.id); return ex; }
    const l = { id: `l${Date.now().toString(36)}`, name: n, icon: 'star',   // (pictogramme sobre ; la couleur distingue les listes)
      color: LIST_COLORS[lists.length % LIST_COLORS.length] };
    lists = [...lists, l];
    saveAll();
    then?.(l.id);
    return l;
  }
  function renameList(l) {
    const n = prompt('Nouveau nom de la liste', l.name)?.trim();
    if (!n) return;
    lists = lists.map((x) => (x.id === l.id ? { ...x, name: n } : x));
    saveAll();
  }
  function deleteList(l) {
    const before = { lists, favorites };
    lists = lists.filter((x) => x.id !== l.id);
    favorites = favorites.map((f) => ({ ...f, lists: f.lists.filter((x) => x !== l.id) })).filter((f) => f.lists.length);
    savedList = null;
    saveAll();
    refreshSaved();
    say(`Liste « ${l.name} » supprimée`, { label: 'Annuler', run: () => { lists = before.lists; favorites = before.favorites; saveAll(); refreshSaved(); } });
  }
  // Mes lieux sur la carte et dans la liste, triés par distance
  function refreshSaved() {
    if (!category?.saved) return;
    const o = me || (map ? { lat: map.getCenter().lat, lon: map.getCenter().lng } : PARIS);
    const src = category.shared ? incoming.places : favorites.filter((f) => !savedList || f.lists.includes(savedList));
    nearby = src.map((f, i) => {
      const l = category.shared ? category : listOf(f.lists?.[0]);
      return { f: { id: `s${i}`, properties: { name: f.name, subclass: f.subclass }, geometry: { coordinates: [f.lon, f.lat] } },
        d: dist(o.lat, o.lon, f.lat, f.lon), saved: f, icon: `cat|${l.icon}|${l.color}`, tc: labelColor(l.color) };
    }).sort((a, b) => a.d - b.d);
    nearbyFromMe = !!me;
    nearbyDone = true;
  }
  function openSavedList(id) {
    savedList = id;
    listEditing = false;
    swiped = null;
    refreshSaved();
    const pts = nearby.slice(0, 8).map((n) => n.f.geometry.coordinates);
    if (pts.length) fitTo(me ? [[me.lon, me.lat], ...pts] : pts);
  }
  async function shareList(l) {
    const places = favorites.filter((f) => f.lists.includes(l.id));
    const u = new URL(location.href);
    u.hash = `liste=${await packList(l, places)}`;
    const data = { title: l.name, text: `${l.name} · ${places.length} lieu${places.length > 1 ? 'x' : ''}`, url: u.toString() };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(data.url); say('Lien de la liste copié'); }
    } catch { /* partage annulé */ }
  }
  // Ajouter une liste reçue par lien
  function keepIncomingList() {
    const { list, places } = incoming;
    let name = list.name;
    if (lists.some((l) => l.name.toLowerCase() === name.toLowerCase())) name = `${name} (partagée)`;
    const l = { id: `l${Date.now().toString(36)}`, name, icon: list.icon || 'star', color: list.color || LIST_COLORS[2] };
    const m = mergeInto({ lists, places: favorites }, { lists: [l], places: places.map((p) => ({ ...p, lists: [l.id] })) }, sameSpot);
    lists = m.lists;
    favorites = m.places;
    saveAll();
    incoming = null;
    clearCategory();
    say(`Liste « ${name} » ajoutée à Mes lieux`);
  }

  // ——— Transfert vers un autre appareil (lien ou QR code) et sauvegarde dans un fichier ———
  let transfer = $state(null);       // { url, qr? }
  async function makeTransfer() {
    hubPanel = 'transfer';
    transfer = null;
    const data = await pack(snapshot({ lists, places: favorites, shortcuts, pins, chips: chipPrefs }));
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
    transfer = { url, qr };
  }
  async function shareTransfer() {
    try {
      if (navigator.share) await navigator.share({ title: 'Mes lieux · Untracked Maps', url: transfer.url });
      else { await navigator.clipboard.writeText(transfer.url); say('Lien copié'); }
    } catch { /* annulé */ }
  }
  function applyIncoming(data) {
    const r = restore(data);
    const m = mergeInto({ lists, places: favorites }, r, sameSpot);
    lists = m.lists;
    favorites = m.places;
    pins = [...new Set([...pins, ...r.pins])];
    for (const k of ['home', 'work']) if (r.shortcuts[k] && !shortcuts[k]) setShortcut(k, r.shortcuts[k]);
    if (r.chips?.length) { chipPrefs = r.chips; saveChips(); }
    saveAll();
    return m.added;
  }
  let backupPassword = $state('');
  async function makeBackup() {
    const file = await backupFile(snapshot({ lists, places: favorites, shortcuts, pins, chips: chipPrefs }), backupPassword.trim());
    backupPassword = '';
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Sauvegarde de Mes lieux' });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      lastBackup = Date.now();
      try { localStorage.setItem(BACKUP_KEY, String(lastBackup)); } catch { /* rien */ }
      hubPanel = null;
      say('Sauvegarde créée : rangez-la dans votre iCloud, Proton Drive…');
    } catch { /* partage annulé */ }
  }
  let restoreFile = null;
  let restoreNeedsPw = $state(false);
  let restorePassword = $state('');
  async function doRestore(file = restoreFile) {
    if (!file) return;
    restoreFile = file;
    try {
      const r = await readBackup(file, restorePassword);
      if (r.needsPassword) { restoreNeedsPw = true; return; }
      const added = applyIncoming(r.data);
      restoreFile = null; restoreNeedsPw = false; restorePassword = ''; hubPanel = null;
      refreshSaved();
      say(added ? `${added} lieu${added > 1 ? 'x' : ''} restauré${added > 1 ? 's' : ''}` : 'Tout était déjà là');
    } catch (e) {
      say(restoreNeedsPw ? 'Mot de passe incorrect' : 'Ce fichier n\'est pas une sauvegarde d\'Untracked Maps');
    }
  }
  const backupAge = $derived(lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null);

  // Les favoris apparaissent aussi sur la carte (pastille rose à cœur).
  $effect(() => {
    lists;
    const data = favData();
    map?.getSource('favs')?.setData(data);
  });
  function remember(p) {
    if (!p?.name || p.name === 'Point sélectionné') return;
    const keep = { id: p.id, name: p.name, type: p.type, address: p.address, lat: p.lat, lon: p.lon, osmType: p.osmType, osmId: p.osmId, subclass: p.subclass, pin: p.pin };
    recents = [keep, ...recents.filter((r) => r.id !== p.id && r.name !== p.name)].slice(0, 8);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(recents)); } catch { /* navigation privée : tant pis */ }
  }
  function forgetRecents() {
    const before = recents;
    recents = [];
    try { localStorage.removeItem(RECENTS_KEY); } catch { /* rien à effacer */ }
    say('Lieux récents effacés', { label: 'Annuler', run: () => {
      recents = before;
      try { localStorage.setItem(RECENTS_KEY, JSON.stringify(recents)); } catch { /* rien */ }
    } });
  }

  async function openPlace(p) {
    viewChosen = true;
    showModes = false;      // une seule chose ouverte à la fois
    editChips = false;
    importOpen = false;
    if (p.name) remember(p);
    place = p;
    info = null;
    wiki = null;
    moreText = false;
    deps = null;
    showWeek = false;
    focused = false;
    document.activeElement?.blur();
    showSelection(p);
    frame(p.lon, p.lat);
    exits = null;
    allExits = false;
    if (STATION_TYPES.includes(p.type)) {
      loadDepartures(p);
      if (p.type !== 'Entrée de métro') {
        exits = { status: 'loading' };
        stationExits(p.lat, p.lon).then((d) => { if (place?.id === p.id) exits = { status: 'ok', data: sortExits(d) }; })
          .catch(() => { if (place?.id === p.id) exits = { status: 'error' }; });
      }
    }
    try { info = await details(p); } catch { info = {}; }
    if (place?.id !== p.id) return;
    // Lien partagé : on ne connaissait que l'identifiant du lieu, on récupère son nom.
    if (!p.name && info.name) { place = { ...place, name: info.name, type: info.kind || place.type }; remember(place); showSelection(place); }
    if (info.wikidata || info.wikipedia) {
      const w = await wikiInfo(info).catch(() => null);
      if (place?.id === p.id) wiki = w;
    }
  }

  // Temps de marche estimé sur le téléphone (distance à vol d'oiseau × 1,3, à 4,8 km/h) : rien n'est envoyé.
  const walkEta = $derived.by(() => {
    if (!me || !place) return null;
    const m = dist(me.lat, me.lon, place.lat, place.lon) * 1.3;
    if (m < 60) return null;
    const min = Math.round(m / 80);
    return min <= 45 ? `≈ ${min} min à pied` : `≈ ${fmtDistance(m)}`;   // (texte complet pour l’accessibilité)
  });

  // Partager : lien qui rouvre directement la fiche du lieu (feuille de partage du téléphone, sinon copie).
  async function sharePlace() {
    const u = new URL(location.href);
    u.hash = `carte=17/${place.lat.toFixed(5)}/${place.lon.toFixed(5)}` + (place.osmType ? `&lieu=${place.osmType}/${place.osmId}` : '&point=1');
    const data = { title: place.name, text: place.name, url: u.toString() };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(data.url); say('Lien copié'); }
    } catch { /* partage annulé */ }
  }

  // Prochains passages d'une station, rafraîchis toutes les 30 s tant que la fiche est ouverte.
  async function loadDepartures(p) {
    if (!deps) deps = { status: 'loading' };
    try {
      const data = await departures(p.name, p.lat, p.lon);
      if (place?.id !== p.id) return;
      deps = data?.lines.length ? { status: 'ok', data } : { status: 'none' };
    } catch {
      if (place?.id === p.id && deps?.status !== 'ok') deps = { status: 'error' };
    }
  }
  $effect(() => {
    if (!isStation || directions) return;
    const p = place;
    const t = setInterval(() => { now = Date.now(); loadDepartures(p); }, 30000);
    const tick1 = setInterval(() => (now = Date.now()), 10000);
    return () => { clearInterval(t); clearInterval(tick1); };
  });

  function closePlace() {
    place = null;
    placeMenu = false;
    viewer = null;
    info = null;
    deps = null;
    wiki = null;
    exits = null;
    marker?.remove();
    clearSelection();
    if (reloadLater) setTimeout(reloadCategoryHere, 0);
  }

  function clearSearch() {
    query = '';
    results = [];
    closePlace();
  }


  const hitFilter = (c) => (c.transit ? ['==', ['get', 'subclass'], '__none__'] : ['match', ['get', c.by || 'subclass'], c.classes, true, false]);
  const catIcon = (c) => c.icon || FAMILIES[c.family]?.icon || 'dot';
  // Lieux mis en avant : filtre, pictogramme et couleur de la catégorie choisie.
  // Les lieux de la liste sont aussi posés sur la carte (y compris ceux trouvés hors de la vue).
  function applyHit(c) {
    const src = map?.getSource('cat-hits');
    if (!src) return;
    if (!c || c.transit) return src.setData(empty());
    src.setData({ type: 'FeatureCollection', features: nearby.map(({ f }, i) => ({
      type: 'Feature', id: i, geometry: { type: 'Point', coordinates: f.geometry.coordinates },
      properties: { i, name: displayName(f, c), icon: nearby[i].icon || `cat|${catIcon(c)}|${famColor(c)}`, tc: nearby[i].tc || labelColor(famColor(c)) } })) });
  }
  // Un lieu sans nom (toilettes, borne…) ou au nom de code (« G-040 ») prend le nom de sa catégorie.
  const displayName = (f, c) => {
    const n = f.properties.name;
    return !n || (c?.unnamed && /^[A-Z0-9][A-Z0-9 _-]{0,9}$/.test(n)) ? c?.unnamed || n || 'Sans nom' : n;
  };
  $effect(() => { nearby; category; applyHit(category); });

  // Lieux d'une catégorie autour d'un point. `fit` : élargir la carte si les plus proches sont hors de la vue
  // (seulement au premier choix de la catégorie, jamais quand on déplace la carte soi-même).
  async function collectCategory(c, origin, fit) {
      const req = ++catRequest;
      const stale = () => req !== catRequest || category?.key !== c.key;
      const o = origin || { lat: map.getCenter().lat, lon: map.getCenter().lng };
      const seen = new Set();
      const filter = c.transit
        ? ['all', ['has', 'name'], ['==', ['get', 'class'], 'railway'], ['match', ['get', 'subclass'], ['subway', 'station', 'halt'], true, false]]
        : c.unnamed ? hitFilter(c) : ['all', ['has', 'name'], hitFilter(c)];
      // Une station a souvent plusieurs points (un par ligne) : on n'en garde qu'un par nom.
      const keyOf = (f) => (c.transit ? f.properties.name : f.id);
      const list = map.querySourceFeatures('omt', { sourceLayer: 'poi', filter })
        .map((f) => ({ f, d: dist(o.lat, o.lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) }))
        .sort((a, b) => a.d - b.d)
        .filter(({ f }) => !seen.has(keyOf(f)) && seen.add(keyOf(f)))
        .slice(0, c.transit ? 8 : 80);
      if (stale()) return;
      if (c.transit) {
        nearby = list.map((n) => ({ ...n, deps: { status: 'loading' } }));
        nearbyDone = true;
        // Prochains passages des stations les plus proches, directement dans la liste.
        list.slice(0, 5).forEach((n, i) => {
          const [lon, lat] = n.f.geometry.coordinates;
          departures(n.f.properties.name, lat, lon)
            .then((d) => d?.lines.length ? { status: 'ok', data: d } : { status: 'none' })
            .catch(() => ({ status: 'error' }))
            .then((deps) => { if (!stale() && nearby[i]?.f.id === n.f.id) nearby[i] = { ...nearby[i], deps }; });
        });
        for (let i = 5; i < nearby.length; i++) nearby[i] = { ...nearby[i], deps: null };
        return;
      }
      // Compléter avec les lieux des tuiles préparées (tout ce qui est dans la zone, y compris hors de la vue
      // et sans nom dans la carte) : catégories rares, et horaires de chacun.
      const bb = map.getBounds();
      const span = Math.max(bb.getEast() - bb.getWest(), 0.02);
      const zone = { west: o.lon - span, east: o.lon + span, south: o.lat - span * 0.66, north: o.lat + span * 0.66 };
      const extra = c.inc ? await searchCategory(c.inc, zone, c.q).catch(() => []) : [];
      if (stale()) return;
      const near = (a, b) => dist(a[1], a[0], b[1], b[0]) < 80;
      const byName = new Map(extra.map((f) => [f.properties.name, f]));
      for (const f of extra) {
        const xy = f.geometry.coordinates;
        if (list.some((n) => n.f.properties.name === f.properties.name && near(n.f.geometry.coordinates, xy))) continue;
        list.push({ f, d: dist(o.lat, o.lon, xy[1], xy[0]) });
      }
      list.sort((a, b) => a.d - b.d);
      list.splice(80);
      // horaires : ceux de la tuile (par nom et position, les identifiants des tuiles de carte étant parfois différents)
      const hoursOf = (f) => f.tags?.opening_hours
        || [...(byName.get(f.properties.name) ? [byName.get(f.properties.name)] : [])].find((x) => near(x.geometry.coordinates, f.geometry.coordinates))?.tags?.opening_hours
        || null;
      // (les lieux de la carte sont des objets MapLibre : on recopie leurs champs, un « ... » perdrait la géométrie)
      const withFacade = (f, facade) => ({ id: f.id, properties: f.properties, geometry: f.geometry, source: f.source, sourceLayer: f.sourceLayer, layer: f.layer, tags: f.tags, facade });
      const twin = (f) => f.tags ? f : (byName.get(f.properties.name) && near(byName.get(f.properties.name).geometry.coordinates, f.geometry.coordinates) ? byName.get(f.properties.name) : null);
      nearbyAll = list.map((n) => ({ ...n, h: hoursOf(n.f), f: n.f.facade || !twin(n.f)?.facade ? n.f : withFacade(n.f, twin(n.f).facade) }));
      applyOpenFilter();
      nearbyDone = true;
      // Les plus proches sont hors de la vue (catégorie rare) : on élargit la carte pour les montrer.
      const first = nearby.slice(0, 4).map((n) => n.f.geometry.coordinates);
      if (fit && first.length && !first.some((xy) => map.getBounds().contains(xy))) fitTo([[o.lon, o.lat], ...first]);
  }

  // Filtre « ouvert à… » : null (pas de filtre) | { now: true } | { at: Date }
  let openAt = $state(null);
  let showUnknown = $state(false);   // afficher aussi les lieux aux horaires inconnus
  let momentPicker = $state(false);
  let nearbyAll = [];                 // lieux trouvés avant filtre (avec leurs horaires bruts)
  let openCounts = $state(null);      // { open, unknown, closed }
  function applyOpenFilter() {
    const at = openAt?.at || null;
    const items = nearbyAll.map((n) => {
      const [lon, lat] = n.f.geometry.coordinates;
      return { ...n, st: n.h ? (at ? statusAt(n.h, lat, lon, at) : hoursStatus(n.h, lat, lon)) : null };
    });
    if (!openAt) { openCounts = null; nearby = items.slice(0, 25); return; }
    const open = items.filter((n) => n.st?.open === true);
    const unknown = items.filter((n) => !n.st || n.st.open == null);
    openCounts = { open: open.length, unknown: unknown.length, closed: items.length - open.length - unknown.length };
    nearby = [...open.slice(0, 25), ...(showUnknown ? unknown.slice(0, 20) : [])];
  }
  function setOpenAt(v) {
    openAt = v;
    showUnknown = false;
    momentPicker = false;
    applyOpenFilter();
  }
  // Choix du moment : jour et heure
  const pickerDays = $derived.by(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      out.push({ i, label: i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, (x) => x.toUpperCase()) });
    }
    return out;
  });
  const pickerHours = Array.from({ length: 44 }, (_, k) => { const m = 6 * 60 + k * 30; return [Math.floor(m / 60) % 24, m % 60]; });
  function momentFrom(dayOffset, h, m) {
    const at = new Date(); at.setSeconds(0, 0);
    at.setDate(at.getDate() + dayOffset + (h < 6 ? 1 : 0));   // 0 h – 2 h : la nuit qui suit
    at.setHours(h, m);
    return at;
  }
  const pickerDay = $derived(openAt?.at ? Math.max(0, Math.round((new Date(openAt.at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5) - (openAt.at.getHours() < 6 ? 1 : 0)) : 0);
  const pickerTime = $derived(openAt?.at ? `${openAt.at.getHours()}:${openAt.at.getMinutes()}` : '20:0');
  function quickMoment(kind) {
    const now = new Date();
    if (kind === 'soir') return setOpenAt(now.getHours() >= 20 ? { now: true } : { at: momentFrom(0, 20, 0) });
    if (kind === 'midi') return setOpenAt({ at: momentFrom(now.getHours() >= 13 ? 1 : 0, 12, 30) });
    if (kind === 'demain-soir') return setOpenAt({ at: momentFrom(1, 20, 0) });
  }

  let userMoved = false;
  let reloadTimer = null;
  let catRequest = 0;
  // Recharger la catégorie ouverte pour la zone affichée (après un déplacement de la carte à la main).
  let reloadLater = false;
  let viewChosen = false;   // la personne a choisi ce qu'elle regarde (carte déplacée, lieu ou quartier cherché)
  // Un point est-il près du centre de la vue ? (sinon, on cherche autour du centre de la carte)
  function nearView(pt, share = 0.15) {
    const ctr = map.getCenter(), bb = map.getBounds();
    const span = dist(bb.getSouth(), bb.getWest(), bb.getNorth(), bb.getEast());
    return dist(pt.lat, pt.lon, ctr.lat, ctr.lng) < span * share;
  }
  function reloadCategoryHere() {
    const c = category;
    if (!c || c.saved || directions || nav) return;
    if (place) { reloadLater = true; return; }   // une fiche est ouverte : on recharge à sa fermeture
    reloadLater = false;
    // attendre que la carte ait chargé la nouvelle zone
    if (!map.areTilesLoaded()) { map.once('idle', () => { if (category?.key === c.key && !place) reloadCategoryHere(); }); return; }
    // votre position si elle est près du centre de la vue, sinon le centre de la carte
    const origin = me && nearView(me) ? me : null;
    nearbyFromMe = !!origin;
    collectCategory(c, origin, false);
  }

  async function pickCategory(c) {
    editChips = false;
    importOpen = false;
    if (category?.key === c.key) return clearCategory();
    if (c.saved) {
      category = c;
      closePlace();
      savedList = null;
      hubPanel = null;
      nearby = [];
      refreshSaved();
      return;
    }
    category = c;
    closePlace();
    nearby = [];
    nearbyDone = false;
    applyHit(c);
    // « Le plus proche de vous » : depuis votre position si elle est connue (ou déjà autorisée), sinon depuis le centre de la carte.
    let origin = me;
    if (!origin) {
      const perm = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
      if (perm?.state === 'granted') origin = await getPosition().catch(() => null);
    }
    // On regarde un autre quartier (ex. après avoir cherché « 8e arrondissement ») : on cherche là,
    // sans ramener la carte sur votre position.
    if (origin && viewChosen && !nearView(origin)) origin = null;
    if (category?.key !== c.key) return; // (l'état est une copie : on compare les clés)
    nearbyFromMe = !!origin;
    const collect = () => collectCategory(c, origin, true);
    const target = origin ? [origin.lon, origin.lat] : null;
    if (target || map.getZoom() < 15) {
      map.flyTo({ center: target || map.getCenter(), zoom: Math.max(c.transit ? 15 : 15.5, map.getZoom()), duration: 700 });
      // Si la carte est déjà au bon endroit, elle ne bouge pas : on n'attend pas indéfiniment.
      let done = false;
      const once = () => { if (!done) { done = true; collect(); } };
      map.once('idle', once);
      setTimeout(() => { if (!map.isMoving()) once(); }, 1200);
    } else collect();
  }

  function clearCategory() {
    clearPhotoPins();
    category = null;
    reloadLater = false;
    openAt = null;
    openCounts = null;
    momentPicker = false;
    nearbyAll = [];
    savedList = null;
    hubPanel = null;
    nearby = [];
    applyHit(null);
  }

  function dist(lat1, lon1, lat2, lon2) {
    const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    return Math.hypot(x, lat2 - lat1) * 111320;
  }

  async function openCategoryFromSearch() {
    const c = catHit;          // à lire avant de vider la recherche (catHit en dépend)
    query = '';
    focused = false;
    document.activeElement?.blur();
    if (c.when) { openAt = c.when; showUnknown = false; }
    let center = null;
    if (c.area?.arr) center = ARR_CENTERS[c.area.arr];
    else if (c.area?.text) {
      const r = (await search(`${c.area.text} Paris`).catch(() => []))[0];
      if (r) center = [r.lon, r.lat];
      else say(`« ${c.area.text} » introuvable : recherche autour de la carte`);
    }
    const { when, area, ...cat } = c;
    if (category?.key === cat.key) category = null;   // (sinon pickCategory refermerait la catégorie)
    if (!center) return pickCategory(cat);
    viewChosen = true;
    map.flyTo({ center, zoom: 15, duration: 800 });
    map.once('moveend', () => (map.areTilesLoaded() ? pickCategory(cat) : map.once('idle', () => pickCategory(cat))));
  }

  function onKey(e) {
    if (e.key === 'Enter' && catHit && active < 0) { e.preventDefault(); openCategoryFromSearch(); return; }
    if (!showList || !results.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % results.length; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + results.length) % results.length; e.preventDefault(); }
    else if (e.key === 'Enter') pickResult(results[Math.max(active, 0)]);
    else if (e.key === 'Escape') { focused = false; editing = null; }
  }

  function pickResult(r) {
    if (editing) {
      const pt = { label: r.name, lat: r.lat, lon: r.lon };
      const which = editing;
      setPoint(which, pt);
      editing = null;
      fieldQuery = '';
      results = [];
      if (which === 'to') placeMarker(pt.lon, pt.lat);
      computeRoutes();
      return;
    }
    clearCategory();
    if (assigning) {
      const which = assigning;
      assigning = null;
      setShortcut(which, r);
      say(`${SHORT_NAMES[which]} : ${r.name}`);
      query = '';
    } else query = r.name;
    openPlace(r);
  }

  // Message bref ; avec une action (« Annuler ») pour revenir sur un geste qui efface quelque chose.
  let toastAction = $state(null);
  let toastTimer;
  function say(msg, action = null) {
    toast = msg;
    toastAction = action;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = ''; toastAction = null; }, action ? 6000 : 3500);
  }
  // Une catégorie choisie : on n'affiche plus qu'elle sur la carte (les autres lieux s'effacent).
  function isolate() {
    if (!map) return;
    const only = category && !directions;
    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    for (const id of ['poi', 'poi-other', 'landmark', 'exit']) vis(id, !only);
    vis('fav', !only && showSaved);
    vis('metro', !only || !!category?.transit);
  }
  $effect(() => { category; directions; showSaved; isolate(); });

  // Fermer « ce qui est au-dessus » : Échap, ou le bouton Retour du téléphone.
  function closeTop() {
    if (viewer != null) viewer = null;
    else if (placeMenu) placeMenu = false;
    else if (listPicker) listPicker = false;
    else if (hubPanel) hubPanel = null;
    else if (savedList) { savedList = null; refreshSaved(); }
    else if (navList) navList = false;
    else if (nav) endNav();
    else if (showModes) showModes = false;
    else if (editing) editing = null;
    else if (editChips || importOpen) { editChips = false; importOpen = false; }
    else if (directions) closeDirections();
    else if (place) closePlace();
    else if (category) clearCategory();
    else if (focused) { focused = false; document.activeElement?.blur(); }
    else return false;
    return true;
  }
  // Retour : une entrée d'historique tant qu'un panneau est ouvert, pour que « Retour » le ferme
  // au lieu de quitter l'app.
  const anyOpen = $derived(!!(place || category || directions || editChips || importOpen || listPicker || viewer != null));
  let skipPop = false;
  $effect(() => {
    if (anyOpen && !history.state?.ui) history.pushState({ ...(history.state || {}), ui: 1 }, '', location.href);
    else if (!anyOpen && history.state?.ui) { skipPop = true; history.back(); }
  });
  // Revenir en arrière dans l'historique ne doit pas ramener la carte là où elle était à l'ouverture du panneau :
  // on garde la vue actuelle dans l'adresse (avant que la carte ne relise l'adresse).
  let viewHash = '';
  function onPopState() {
    if (viewHash && location.hash !== viewHash) history.replaceState(history.state, '', location.pathname + location.search + viewHash);
    if (skipPop) { skipPop = false; return; }
    closeTop();
    // encore un panneau dessous (une fiche ouverte depuis une liste) : Retour le fermera aussi
    if (anyOpen) history.pushState({ ...(history.state || {}), ui: 1 }, '', location.href);
  }
  function onKeyDown(e) {
    if (viewer != null && viewerEl && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      viewerEl.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * viewerEl.clientWidth, behavior: 'smooth' });
      return;
    }
    if (e.key === 'Escape' && closeTop()) e.preventDefault();
  }

  function undoToast() {
    const a = toastAction;
    toast = '';
    toastAction = null;
    a?.run();
  }

  // Point bleu de votre position, avec un faisceau qui montre la direction où vous regardez (boussole du téléphone).
  function showMe(lat, lon) {
    if (!meMarker) {
      const el = document.createElement('div');
      el.className = 'me';
      el.innerHTML = '<span class="me-beam"></span><span class="me-dot"></span>';
      meMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' });
      if (heading != null) { el.classList.add('has-heading'); meMarker.setRotation(heading); }
    }
    meMarker.setLngLat([lon, lat]).addTo(map);
  }

  // ——— Direction (boussole) ———
  // Le cap vient de la boussole du téléphone ; à défaut, du sens de la marche (GPS) quand on avance.
  // Rien n'est envoyé : tout reste sur l'appareil.
  let heading = null;            // degrés, 0 = nord
  let compassOn = false;
  let lastCompass = 0;
  let followMode = $state('none');   // 'none' | 'follow' (la carte vous suit) | 'heading' (la carte tourne avec vous)
  let posWatch = null;
  function setHeading(h, fromCompass) {
    if (h == null || Number.isNaN(h)) return;
    if (!fromCompass && Date.now() - lastCompass < 3000) return;   // la boussole prime sur le GPS
    if (fromCompass) lastCompass = Date.now();
    // lissage (sans faire le tour par 360 → 0)
    if (heading == null) heading = h;
    else { const d = ((h - heading + 540) % 360) - 180; if (Math.abs(d) < 1.5) return; heading = (heading + d * 0.35 + 360) % 360; }
    if (nav) return;   // pendant le guidage, la flèche suit le trajet
    const el = meMarker?.getElement();
    el?.classList.add('has-heading');
    meMarker?.setRotation(heading);
    if (followMode === 'heading' && !map.isMoving()) map.easeTo({ bearing: heading, duration: 250, easing: (t) => t });
  }
  function onOrientation(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;          // iPhone
    else if (e.absolute && typeof e.alpha === 'number') h = 360 - e.alpha;                  // Android
    if (h == null) return;
    h = (h + (screen.orientation?.angle || 0) + 360) % 360;                                // écran en paysage
    setHeading(h, true);
  }
  // iPhone : l'accès à la boussole se demande lors d'un geste (le bouton de localisation)
  async function startCompass() {
    if (compassOn) return;
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
      }
    } catch { return; }
    compassOn = true;
    if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onOrientation);
    else window.addEventListener('deviceorientation', onOrientation);
  }
  // Suivre la position tant que l'app est à l'écran (le point bouge avec vous)
  function startWatch() {
    if (posWatch != null || !navigator.geolocation || nav) return;
    posWatch = navigator.geolocation.watchPosition(({ coords }) => {
      if (nav) return;
      me = { label: 'Votre position', lat: coords.latitude, lon: coords.longitude, isMe: true };
      showMe(me.lat, me.lon);
      if (coords.speed > 1 && coords.heading != null) setHeading(coords.heading, false);
      if (followMode !== 'none' && !map.isMoving()) map.easeTo({ center: [me.lon, me.lat], duration: 600 });
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  function stopWatch() {
    if (posWatch != null) navigator.geolocation.clearWatch(posWatch);
    posWatch = null;
  }

  // La position reste sur l'appareil : elle n'est envoyée qu'aux moteurs d'itinéraire, au moment du calcul.
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('unsupported'));
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          me = { label: 'Votre position', lat: coords.latitude, lon: coords.longitude, isMe: true };
          showMe(me.lat, me.lon);
          startWatch();
          try { localStorage.setItem('position-ok', '1'); } catch { /* rien */ }
          resolve(me);
        },
        (err) => {
          // délai dépassé en haute précision (intérieur, GPS froid) : on retente avec la position approximative
          if (err.code !== 3) return reject(err);
          navigator.geolocation.getCurrentPosition(({ coords }) => {
            me = { label: 'Votre position', lat: coords.latitude, lon: coords.longitude, isMe: true };
            showMe(me.lat, me.lon);
            startWatch();
            resolve(me);
          }, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  // À l'ouverture, comme les cartes de référence : on se centre sur vous si vous l'acceptez.
  // Refus ou erreur : la carte reste sur Paris, sans message d'erreur.
  async function startupLocate() {
    try {
      const perm = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
      if (perm?.state === 'denied') return;
      // App installée sur l'écran d'accueil : iOS peut refuser (et mémoriser le refus) une demande faite sans
      // geste de l'utilisateur. On attend donc qu'il touche le bouton de localisation la première fois.
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      let ok = false;
      try { ok = localStorage.getItem('position-ok') === '1'; } catch { /* rien */ }
      if (standalone && !ok && perm?.state !== 'granted') {
        if (!showPromise) say('Touchez la flèche pour vous localiser.');
        return;
      }
      let firstTime = false;
      try { firstTime = !localStorage.getItem('position-expliquee'); localStorage.setItem('position-expliquee', '1'); } catch { /* rien */ }
      if (firstTime && perm?.state !== 'granted' && !showPromise) say('Votre position reste sur votre téléphone.');
      const p = await getPosition();
      // (pas si la personne a déjà choisi quoi regarder entre-temps : position arrivée tard)
      if (!place && !category && !directions && !viewChosen) { followMode = 'follow'; map.flyTo({ center: [p.lon, p.lat], zoom: 15.5, duration: 900 }); }
    } catch { /* on reste sur Paris */ }
  }

  // Un message qui dit la vraie cause (refus, page non sécurisée, signal introuvable, délai dépassé)
  function locError(e) {
    if (!window.isSecureContext) return 'Localisation impossible : la page n\'est pas sécurisée. Ouvrez https://untrackedmaps.app.';
    if (e?.code === 1) {
      const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      return app
        ? 'L\'iPhone refuse la localisation à l\'app installée sur l\'écran d\'accueil (problème connu des versions récentes d\'iOS). En attendant, ouvrez untrackedmaps.app dans Safari : la localisation y fonctionne.'
        : 'Localisation refusée. Autorisez-la dans les réglages du navigateur.';
    }
    if (e?.code === 3) return 'Position pas encore trouvée (délai dépassé). Réessayez, idéalement près d\'une fenêtre.';
    if (e?.code === 2) return 'Position introuvable : vérifiez que le Service de localisation du téléphone est activé.';
    return 'Localisation indisponible sur cet appareil.';
  }
  // Détail technique ajouté au message (pour diagnostiquer à distance une localisation qui ne marche pas)
  const locDetail = (e) => ` [${matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'app' : 'navigateur'} · ${window.isSecureContext ? 'https' : 'non sécurisé'} · code ${e?.code ?? '?'}${e?.message ? ` · ${e.message}` : ''}]`;

  // Bouton de localisation, comme Plans et Maps : 1er toucher → centré sur vous ; 2e → la carte tourne
  // dans la direction où vous regardez ; 3e → retour au nord en haut.
  async function locate() {
    // iPhone (app sur l'écran d'accueil) : une seule demande d'autorisation par toucher. La position passe
    // en premier ; la boussole n'est demandée qu'au 2e toucher (« la carte tourne avec vous »).
    if (me && followMode === 'follow') {
      startCompass();   // (doit partir du geste, avant toute attente)
      followMode = 'heading';
      map.easeTo({ center: [me.lon, me.lat], bearing: heading ?? map.getBearing(), duration: 500 });
      if (heading == null && compassOn) say('Direction pas encore disponible : tournez-vous un peu ou marchez quelques pas.');
      return;
    }
    if (me && followMode === 'heading') {
      followMode = 'follow';
      map.easeTo({ center: [me.lon, me.lat], bearing: 0, duration: 500 });
      return;
    }
    locating = true;
    try {
      const p = await getPosition();
      followMode = 'follow';
      // là où aucune autorisation n'est demandée (Android, ordinateur), la boussole démarre tout de suite
      if (typeof DeviceOrientationEvent === 'undefined' || typeof DeviceOrientationEvent.requestPermission !== 'function') startCompass();
      map.flyTo({ center: [p.lon, p.lat], zoom: Math.max(16, map.getZoom()), duration: 800 });
    } catch (e) {
      say(locError(e) + locDetail(e), { label: 'Réessayer', run: locate });
    } finally {
      locating = false;
    }
  }

  // Point choisi en touchant la carte : on retrouve l'adresse la plus proche.
  async function pickOnMap(which, { lng, lat }) {
    const pt = { label: 'Point sur la carte', lat, lon: lng };
    setPoint(which, pt);
    if (which === 'to') placeMarker(lng, lat);
    editing = null;
    lastEdit = { which: null, at: 0 };
    fieldQuery = '';
    results = [];
    computeRoutes();
    const label = await reverse(lat, lng).catch(() => null);
    if (label) {
      // (les objets d'état sont des copies : on compare les coordonnées)
      const same = (q) => q && q.lat === lat && q.lon === lng;
      if (same(pointOf(which))) setPoint(which, { ...pt, label });
    }
  }

  // ——— Itinéraire ———
  async function startDirections() {
    directions = true;
    dimPlaces(true);
    to = { label: place.name, lat: place.lat, lon: place.lon };
    clearSelection();
    placeMarker(to.lon, to.lat);
    via = null;
    showVia = false;
    routes = { walk: null, bike: null, transit: null };
    picked = 0;
    try {
      from = me || (await getPosition());
      const d = dist(from.lat, from.lon, to.lat, to.lon);
      mode = d > 2500 ? 'transit' : 'walk';
      computeRoutes();
    } catch {
      from = null;
      editField('from');
    }
  }

  function closeDirections() {
    directions = false;
    dimPlaces(false);
    editing = null;
    routeCtrl?.abort();
    routes = { walk: null, bike: null, transit: null };
    map.getSource('route')?.setData(empty());
    map.getSource('route-ends')?.setData(empty());
    map.getSource('route-tags')?.setData(empty());
    if (place) { showSelection(place); frame(place.lon, place.lat); }
  }

  const pointOf = (which) => ({ from, via, to })[which];
  function setPoint(which, pt) {
    if (which === 'from') from = pt;
    else if (which === 'via') via = pt;
    else to = pt;
  }
  function addStop() {
    showVia = true;
    editField('via');
  }
  function removeStop() {
    showVia = false;
    via = null;
    if (editing === 'via') editing = null;
    computeRoutes();
  }

  async function editField(which) {
    editing = which;
    fieldQuery = '';
    results = [];
    await tick();
    fieldEl?.focus();
  }

  function useMyPosition() {
    editing = null;
    getPosition().then((p) => { from = p; computeRoutes(); })
      .catch((e) => say(`${locError(e)} En attendant, choisissez un point de départ.`));
  }

  function swap() {
    [from, to] = [to, from];
    if (to) placeMarker(to.lon, to.lat);
    computeRoutes();
  }

  let routeCtrl;
  function computeRoutes() {
    routeCtrl?.abort();
    if (!from || !to || (showVia && !via)) return;
    routeCtrl = new AbortController();
    const signal = routeCtrl.signal;
    picked = 0;
    pickedStreet = 0;
    routes = { walk: { status: 'loading' }, bike: { status: 'loading' }, transit: { status: 'loading' }, car: { status: 'loading' } };
    const run = async (id, fn) => {
      try {
        const data = await fn();
        if (signal.aborted) return;
        routes[id] = (Array.isArray(data) && !data.length) ? { status: 'none' } : { status: 'ok', data };
      } catch (e) {
        if (e.name === 'AbortError') return;
        routes[id] = { status: e.message === 'no-route' ? 'none' : 'error' };
      }
      if (id === mode) drawRoute();
    };
    const v = showVia ? via : null;
    run('walk', () => streetRoute(from, to, 'walk', signal, v));
    run('bike', () => streetRoute(from, to, 'bike', signal, v));
    run('transit', () => (v ? transitWithStop(from, v, to, signal) : transitRoutes(from, to, signal)));
    run('car', async () => {
      const r = await streetRoute(from, to, 'car', signal, v);
      const t = await trafficEstimate(from, to);
      const withTraffic = (x) => ({ ...x, freeDuration: x.duration, duration: x.duration * t.factor, traffic: t.label });
      return { ...withTraffic(r), alts: r.alts.map(withTraffic) };
    });
  }

  function chooseMode(m) {
    mode = m;
    picked = 0;
    pickedStreet = 0;
    showSteps = false;
    drawRoute();
  }
  const streetOpts = (r) => (r ? [r, ...(r.alts || [])] : []);
  // « 3 min de plus » ; à durée affichée égale : la différence de distance (sinon « 1 min de plus » sous deux « 22 min »)
  function altTag(r, best) {
    const dm = Math.round(r.duration / 60) - Math.round(best.duration / 60);
    if (dm > 0) return `${dm} min de plus`;
    const dd = r.distance - best.distance;
    return dd > 50 ? `Même durée · ${fmtDistance(dd)} de plus` : 'Autre itinéraire, même durée';
  }
  function pickStreet(i) {
    pickedStreet = i;
    drawRoute(false);
  }
  // Où poser l'étiquette d'un tracé : sur sa partie la plus éloignée des autres tracés (là où il se distingue).
  function routeTags(r, zoom = map.getZoom()) {
    if (!r || mode === 'transit' || nav) return empty();
    const opts = streetOpts(r);
    const k = Math.cos((opts[0].coords[0][1] * Math.PI) / 180);
    const d2 = (a, b) => ((a[0] - b[0]) * k) ** 2 + (a[1] - b[1]) ** 2;
    const sel = opts[pickedStreet] || opts[0];
    const placed = [];
    // taille d'une étiquette sur la carte, en degrés, au zoom d'affichage (≈ 100 × 34 px)
    const mpp = 78271.5 * k / 2 ** zoom;
    const tagW = (100 * mpp) / 111320 / k, tagH = (34 * mpp) / 111320;
    const clashes = (c) => placed.some((q) => Math.abs(c[0] - q[0]) < tagW && Math.abs(c[1] - q[1]) < tagH);
    // le trajet choisi d'abord, puis les autres, chacun loin des autres tracés et des étiquettes déjà posées
    const order = [sel, ...opts.filter((o) => o !== sel)];
    const features = order.map((o) => {
      const i = opts.indexOf(o);
      const others = opts.filter((x) => x !== o).flatMap((x) => x.coords.filter((_, j) => j % 3 === 0));
      const n = o.coords.length;
      let best = o.coords[Math.floor(n / 2)], score = -1;
      for (let j = Math.floor(n * 0.15); j < n * 0.85; j += Math.max(1, Math.floor(n / 60))) {
        const c = o.coords[j];
        const mLine = others.length ? Math.min(...others.map((x) => d2(c, x))) : 1;
        const m = clashes(c) ? mLine * 1e-6 : mLine;      // un point qui chevauche une étiquette n'est retenu qu'en dernier recours
        if (m > score) { score = m; best = c; }
      }
      placed.push(best);
      // comme Plans et Maps : la durée sur le trajet choisi, l'écart (« +3 min ») sur les autres
      const dm = Math.round(o.duration / 60) - Math.round(sel.duration / 60);
      const label = o === sel ? fmtDuration(o.duration) : dm > 0 ? `+${dm} min` : dm < 0 ? `−${-dm} min` : 'Même durée';
      return { type: 'Feature', geometry: { type: 'Point', coordinates: best }, properties: { i, sel: o === sel, label } };
    });
    return { type: 'FeatureCollection', features };
  }

  function pickTransit(i) {
    picked = i;
    drawRoute();
  }

  // ——— Guidage ———
  let navWatch = null;
  let wakeLock = null;
  let offCount = 0;
  let rerouting = false;
  let arriveCount = 0;
  let spoken = new Set();
  let navTick;
  const NAV = { walk: { far: 120, near: 25, off: 35, zoom: 17.6 }, bike: { far: 200, near: 40, off: 45, zoom: 17 },
                car: { far: 500, near: 120, off: 50, zoom: 16.3 }, transit: { far: 0, near: 0, off: 9999, zoom: 16.5 } };

  function speak(text) {
    if (!voice || !text || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    speechSynthesis.speak(u);
  }

  // Trajet en transport → étapes du guidage : marcher, monter, descendre (avec sortie et place dans la rame).
  function transitSteps(it) {
    const coords = [], steps = [];
    it.legs.forEach((leg, i) => {
      const idx = Math.max(0, coords.length - 1);
      if (leg.mode === 'STOP') { steps.push({ text: `Arrêt : ${leg.from}`, type: 'stop', idx, t: +leg.start }); return; }
      coords.push(...leg.coords);
      if (leg.mode === 'WALK') {
        const dest = leg.to === 'Arrivée' || i === it.legs.length - 1 ? to.label : leg.to;
        steps.push({ text: `Marchez jusqu'à ${dest}`, sub: `${fmtDuration(leg.duration)}${leg.distance ? ` · ${fmtDistance(leg.distance)}` : ''}`, type: 'walk', idx, t: +leg.start });
      } else {
        const tip = legExits[`${picked}|${i}|${leg.to}`];
        const name = `${MODE_NAMES[leg.mode] || 'Ligne'} ${leg.line}`.trim();
        steps.push({ text: `Prenez le ${name} direction ${leg.headsign}`, sub: `À ${leg.from} · départ ${fmtTime(leg.start)}${tip?.place ? ` · montez ${placeLabel(tip.place)}` : ''}`,
          type: 'board', idx, t: +leg.start, leg });
        steps.push({ text: `Descendez à ${leg.to}`, sub: `${leg.stops ? `${leg.stops + 1} arrêts · ` : ''}arrivée ${fmtTime(leg.end)}${tip?.exit ? ` · ${exitLabel(tip.exit).replace(/^Sortie/, 'sortie')}` : ''}`,
          type: 'alight', idx: Math.max(0, coords.length - 1), t: +leg.end - 60000, leg });
      }
    });
    return { coords: coords.length > 1 ? coords : [[from.lon, from.lat], [to.lon, to.lat]], steps };
  }

  async function startNav(option) {
    const kind = mode === 'transit' ? 'transit' : 'street';
    let base;
    if (kind === 'transit') {
      const { coords, steps } = transitSteps(option);
      base = { ...prepare(coords, steps, option.duration), end: +option.end };
    } else {
      base = prepare(option.raw, option.steps, option.duration);
      map.getSource('route-tags')?.setData(empty());
      // pendant le trajet, seul l'itinéraire choisi reste sur la carte
      map.getSource('route')?.setData({ type: 'FeatureCollection', features: [line(option.coords, mode,
        mode === 'bike' ? BIKE_COLOR : WALK_COLOR, mode === 'bike' ? '#1B3F9E' : '#1B3F9E')] });
    }
    nav = { ...base, kind, mode, option, s: 0, k: 0, off: 0, arrived: false, startedAt: Date.now() };
    navFollow = true;
    navList = false;
    offCount = 0;
    arriveCount = 0;
    spoken = new Set();
    // l'écran reste allumé pendant le trajet (si le téléphone le permet)
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
    speak(kind === 'transit' ? nav.steps[0]?.text : nav.steps[0]?.speak || nav.steps[0]?.text);
    clearInterval(navTick);
    navTick = setInterval(() => { now = Date.now(); if (nav?.kind === 'transit') updateNav(); }, 5000);
    stopWatch();
    followMode = 'none';
    if (navigator.geolocation) {
      navWatch = navigator.geolocation.watchPosition(onFix, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    }
    if (me) onFix({ coords: { latitude: me.lat, longitude: me.lon, heading: null, speed: null } });
  }

  let lastFix = null;
  function onFix(pos) {
    if (!nav) return;
    const { latitude: lat, longitude: lon, heading, speed } = pos.coords;
    me = { label: 'Votre position', lat, lon, isMe: true };
    lastFix = { lat, lon, heading: speed > 1 && heading != null && !Number.isNaN(heading) ? heading : null };
    showMe(lat, lon);
    updateNav();
  }

  function updateNav() {
    if (!nav || !lastFix) return;
    const cfg = NAV[nav.kind === 'transit' ? 'transit' : nav.mode];
    const p = progress(nav, [lastFix.lon, lastFix.lat], nav.s);
    let k = p.k;
    if (nav.kind === 'transit') {
      // sous terre, plus de position : on avance aussi avec l'horaire
      const byTime = nav.steps.reduce((acc, st, i) => (st.t <= Date.now() ? i : acc), 0);
      k = Math.max(k, byTime, nav.k);
    } else k = Math.max(k, nav.k);
    // arrivée confirmée par deux positions de suite (une position ancienne ou imprécise ne suffit pas)
    const atEnd = nav.total - p.s < 20 && p.off < 40 || (nav.kind === 'transit' && Date.now() > nav.end && nav.total - p.s < 80);
    arriveCount = atEnd ? arriveCount + 1 : 0;
    const arrived = arriveCount >= 2;
    const heading = lastFix.heading ?? p.heading;
    const prevK = nav.k;
    nav = { ...nav, s: Math.max(p.s, nav.s - 30), k, off: p.off, heading, arrived: nav.arrived || arrived };
    meMarker?.setRotationAlignment('map');      // la flèche suit la carte (qui tourne avec vous)
    meMarker?.setRotation(heading);
    meMarker?.getElement().classList.add('navigating');
    if (navFollow) {
      map.easeTo({ center: [lastFix.lon, lastFix.lat], bearing: heading, pitch: 50, zoom: cfg.zoom,
        offset: [0, Math.round(window.innerHeight * 0.18)], duration: 900 });
    }
    if (nav.arrived && !spoken.has('fin')) { spoken.add('fin'); speak(`Vous êtes arrivé. ${to.label}`); return; }
    if (nav.kind === 'transit') {
      if (k !== prevK) speak(nav.steps[k].text);
      return;
    }
    // annonces : une de loin, une juste avant la manœuvre
    const next = nav.steps[k + 1];
    if (next) {
      const d = next.s - nav.s;
      if (d < cfg.near && !spoken.has(`${k + 1}n`)) { spoken.add(`${k + 1}n`); spoken.add(`${k + 1}f`); speak(next.speak || next.text); }
      else if (d < cfg.far && d > cfg.near * 2 && !spoken.has(`${k + 1}f`)) { spoken.add(`${k + 1}f`); speak(spokenDistance(d) + (next.speak || next.text).replace(/^./, (c) => c.toLowerCase())); }
    }
    // écart au trajet : nouveau calcul depuis la position actuelle
    offCount = p.off > cfg.off ? offCount + 1 : 0;
    if (offCount >= 3 && !rerouting) reroute();
  }

  async function reroute() {
    rerouting = true;
    try {
      const passedVia = !showVia || !via || nav.steps.findIndex((st) => st.type === 'stop') <= nav.k;
      const r = await streetRoute({ lat: me.lat, lon: me.lon }, to, nav.mode, undefined, passedVia ? null : via);
      if (!nav) return;
      let route = r;
      if (nav.mode === 'car') { const t = await trafficEstimate(me, to); route = { ...r, duration: r.duration * t.factor }; }
      nav = { ...nav, ...prepare(route.raw, route.steps, route.duration), option: route, s: 0, k: 0, startedAt: Date.now() };
      spoken = new Set();
      offCount = 0;
      say('Nouvel itinéraire');
      speak('Nouvel itinéraire. ' + (route.steps[0]?.speak || ''));
      map.getSource('route')?.setData({ type: 'FeatureCollection', features: [line(route.coords, nav.mode, nav.mode === 'bike' ? BIKE_COLOR : WALK_COLOR, nav.mode === 'bike' ? '#1B3F9E' : '#1B3F9E')] });
    } catch { /* on réessaiera au prochain écart */ }
    rerouting = false;
  }

  function endNav() {
    if (navWatch != null) navigator.geolocation.clearWatch(navWatch);
    navWatch = null;
    clearInterval(navTick);
    wakeLock?.release?.().catch?.(() => {});
    wakeLock = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    nav = null;
    navList = false;
    meMarker?.setRotation(heading ?? 0);   // retour au faisceau de direction
    meMarker?.getElement().classList.remove('navigating');
    startWatch();
    map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    drawRoute();
  }
  // l'écran peut se rallumer après un passage en arrière-plan : on redemande à le garder allumé
  $effect(() => {
    const again = async () => { if (nav && document.visibilityState === 'visible') { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* rien */ } } };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  });

  // Ce qu'affiche le bandeau du haut
  const navBanner = $derived.by(() => {
    if (!nav) return null;
    if (nav.arrived) return { arrived: true, text: `Vous êtes arrivé`, sub: to?.label };
    if (nav.kind === 'transit') {
      const st = nav.steps[nav.k];
      return { icon: st.type, text: st.text, sub: st.sub, then: nav.steps[nav.k + 1]?.text, line: st.leg };
    }
    const next = nav.steps[nav.k + 1];
    if (!next) return { icon: 'arrive', dist: navDistance(nav.total - nav.s), text: `Arrivée : ${to.label}` };
    return { icon: next.type, dist: navDistance(next.s - nav.s), text: next.text, then: nav.steps[nav.k + 2]?.text || `Arrivée : ${to.label}` };
  });
  const navRemaining = $derived.by(() => {
    if (!nav) return null;
    const left = nav.kind === 'transit' ? Math.max(0, (nav.end - now) / 1000) : nav.duration * Math.max(0, 1 - nav.s / nav.total);
    return { eta: fmtTime(new Date(now + left * 1000)), min: fmtDuration(left), km: fmtDistance(Math.max(0, nav.total - nav.s)) };
  });

  const arrival = (seconds) => fmtTime(new Date(Date.now() + seconds * 1000));
  const inMinutes = (d) => {
    const m = Math.round((d - Date.now()) / 60000);
    return m <= 0 ? 'maintenant' : m < 60 ? `dans ${m} min` : `à ${fmtTime(d)}`;
  };
  const PREFIX = { SUBWAY: 'M', METRO: 'M', TRAM: 'T', BUS: 'Bus', REGIONAL_RAIL: 'RER', SUBURBAN: 'RER' };
  const badge = (leg) => `${PREFIX[leg.mode] ? PREFIX[leg.mode] + ' ' : ''}${leg.line}`.trim();

  const host = (url) => { try { return new URL(href(url)).hostname.replace(/^www\./, ''); } catch { return url; } };
  const href = (url) => (/^https?:\/\//.test(url) ? url : `https://${url}`);
  const famColor = (c) => c.color || FAMILIES[c.family].color;

  // À la descente du métro ou du RER : sortie conseillée (la plus proche de l'étape suivante, d'après OSM)
  // et place dans la rame (données RATP / IDFM). Pour une correspondance : place pour changer au plus vite.
  $effect(() => {
    const r = routes.transit;
    if (mode !== 'transit' || r?.status !== 'ok' || !r.data[picked]) return;
    const it = r.data[picked];
    it.legs.forEach((leg, i) => {
      if (!['SUBWAY', 'METRO', 'REGIONAL_RAIL', 'SUBURBAN'].includes(leg.mode) || !leg.toPos) return;
      const k = `${picked}|${i}|${leg.to}`;
      if (legExits[k] !== undefined) return;
      legExits[k] = null;
      const after = it.legs.slice(i + 1);
      let nextRide = after.find((l) => l.mode !== 'WALK');
      if (nextRide?.mode === 'STOP') nextRide = null;          // on sort pour l'arrêt intermédiaire
      const walkBetween = after.slice(0, after.indexOf(nextRide)).reduce((t, l) => t + (l.duration || 0), 0);
      if (nextRide && walkBetween <= 600) {
        // correspondance dans la station (ou tout près) : pas de sortie, mais la bonne voiture
        placeForTransfer(leg.toStop, nextRide.fromStop)
          .then((pl) => { legExits[k] = pl ? { place: pl, transfer: nextRide } : false; })
          .catch(() => { legExits[k] = false; });
        return;
      }
      const nextLeg = after[0];
      const goal = nextLeg?.coords?.length ? { lon: nextLeg.coords.at(-1)[0], lat: nextLeg.coords.at(-1)[1] } : to;
      bestExit(leg.toPos, goal)
        .then(async (e) => {
          const pl = e ? await placeForExit(leg.toStop, e.name).catch(() => null) : null;
          legExits[k] = e ? { exit: e, place: pl } : false;
          // Le trajet à pied part de cette sortie, pas du centre de la station (un seul calcul, pour le trajet choisi)
          if (e && nextLeg?.mode === 'WALK' && !nextLeg.fromExit && e.lat != null && e.lon != null) {
            const w = await streetRoute({ lat: e.lat, lon: e.lon }, goal, 'walk').catch(() => null);
            const cur = routes.transit?.data?.[picked];
            if (w?.coords?.length && cur === it) {
              nextLeg.coords = w.coords;
              nextLeg.fromExit = true;
              drawRoute();
            }
          }
        })
        .catch(() => { legExits[k] = false; });
    });
  });
</script>

{#snippet modeIcon(id)}
  {#if id === 'walk'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4.5" r="1.9" class="solid" /><path d="m9.5 21 2.2-7 2.6 2.6V21M7.5 12.5 10 8.4l3.4.4 1.9 3 2.7 1.2M11.7 14l-.9-4.7" /></svg>
  {:else if id === 'car'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" /><path d="M3.5 12.5h17v4.5h-17zM6 17v2.2M18 17v2.2" /><circle cx="7.5" cy="14.7" r=".9" class="solid" /><circle cx="16.5" cy="14.7" r=".9" class="solid" /></svg>
  {:else if id === 'bike'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.8" cy="16" r="3.6" /><circle cx="18.2" cy="16" r="3.6" /><path d="m5.8 16 4-7.2h5.8L18.2 16M9.8 8.8l3.6 7.2H5.8M13.6 5.6h2.6" /></svg>
  {:else}
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="3" width="13" height="13.5" rx="3.5" /><path d="M5.5 10h13M8 20.5l2-3.6M16 20.5l-2-3.6" /><circle cx="9" cy="13.4" r=".9" class="solid" /><circle cx="15" cy="13.4" r=".9" class="solid" /></svg>
  {/if}
{/snippet}

{#snippet listDot(l, size = 34)}
  <span class="list-dot" style:--lc={l.color} style:width={`${size}px`} style:height={`${size}px`} aria-hidden="true">
    <img src={glyphUrl(l.icon)} alt="" />
  </span>
{/snippet}

{#snippet pinnedRow(inSearch)}
  <div class="pinned" role="list">
    {#each ['home', 'work'] as k}
      <button role="listitem" class="pin-btn" class:unset={!shortcuts[k]}
        onmousedown={inSearch ? (e) => { e.preventDefault(); useShortcut(k); } : undefined}
        onclick={inSearch ? undefined : () => useShortcut(k)}>
        <span class="pin-circle home">{#if k === 'home'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v9.5h11V10" /><path d="M10.2 19.5v-4.8h3.6v4.8" /></svg>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17" /></svg>{/if}</span>
        <span class="pin-name">{SHORT_NAMES[k]}</span>
        <span class="pin-sub">{shortcuts[k] ? 'Itinéraire' : 'Ajouter'}</span>
      </button>
    {/each}
    {#each pinnedPlaces as f (placeKey(f))}
      <button role="listitem" class="pin-btn"
        onmousedown={inSearch ? (e) => { e.preventDefault(); pickResult({ ...f }); } : undefined}
        onclick={inSearch ? undefined : () => openPlace({ ...f, pin: { glyph: listOf(f.lists[0]).icon, color: listOf(f.lists[0]).color } })}>
        {@render listDot(listOf(f.lists[0]), 44)}
        <span class="pin-name">{f.name}</span>
      </button>
    {/each}
  </div>
{/snippet}

{#snippet resultList()}
  <ul class="results" role="listbox">
    {#if editing}
      <li class="note map-hint">Ou touchez la carte pour choisir un point.</li>
    {/if}
    {#if editing === 'from'}
      <li role="option" aria-selected="false">
        <button onmousedown={useMyPosition}>
          <span class="r-icon me-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 4 4 11l7 2 2 7z" class="solid" /></svg></span>
          <span class="r-text"><span class="r-name">Votre position</span><span class="r-meta">Utiliser la localisation du téléphone</span></span>
        </button>
      </li>
    {/if}
    {#if activeQuery.trim().length < 2}
      <li class="pinned-li">{@render pinnedRow(true)}</li>
    {/if}
    {#if assigning && activeQuery.trim().length < 2}
      <li class="note">Tapez l'adresse de votre {assigning === 'home' ? 'maison' : 'travail'}, puis choisissez-la dans la liste.
        <button class="link" onmousedown={(e) => { e.preventDefault(); assigning = null; }}>Annuler</button></li>
    {/if}
    {#if activeQuery.trim().length < 2 && favorites.length}
      <li class="note recents-head"><span>Mes lieux</span>
        {#if !editing}<button class="link" onmousedown={(e) => { e.preventDefault(); focused = false; document.activeElement?.blur(); pickCategory(ALL_CATEGORIES[0]); }}>Tout voir</button>{/if}</li>
      {#each favorites.slice(0, 5) as r (r.id + r.lat)}
        <li role="option" aria-selected="false">
          <button onmousedown={() => pickResult(r)}>
            {@render listDot(listOf(r.lists?.[0]), 32)}
            <span class="r-text">
              <span class="r-name">{r.name}</span>
              <span class="r-meta">{[r.type, r.address].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        </li>
      {/each}
    {/if}
    {#if activeQuery.trim().length < 2 && recents.length}
      <li class="note recents-head"><span>Récents</span>
        <button class="link" onmousedown={(e) => { e.preventDefault(); forgetRecents(); }}>Effacer</button></li>
      {#each recents as r (r.id)}
        <li role="option" aria-selected="false">
          <button onmousedown={() => pickResult(r)}>
            <span class="r-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            </span>
            <span class="r-text">
              <span class="r-name">{r.name}</span>
              <span class="r-meta">{[r.type, r.address].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        </li>
      {/each}
    {/if}
    {#if catHit}
      <li role="option" aria-selected="false">
        <button onmousedown={openCategoryFromSearch}>
          <span class="r-icon cat-icon" style:--fam={famColor(catHit)} aria-hidden="true"></span>
          <span class="r-text">
            {#if catHit.when || catHit.area}
              <span class="r-name">{catHit.label}{catHit.when ? ` ${whenText(catHit.when)}` : ''}</span>
              <span class="r-meta">{catHit.area ? areaText(catHit.area) : 'Près de vous'}{catHit.when ? ' · selon les horaires connus' : ''}</span>
            {:else}
              <span class="r-name">{catHit.label} près de vous</span>
              <span class="r-meta">Les plus proches, avec leurs horaires</span>
            {/if}
          </span>
        </button>
      </li>
    {/if}
    {#each results as r, i (r.id)}
      <li role="option" aria-selected={i === active}>
        <button class:active={i === active} onmousedown={() => pickResult(r)}>
          <span class="r-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          </span>
          <span class="r-text">
            <span class="r-name">{r.name}</span>
            <span class="r-meta">{[r.type, r.address].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      </li>
    {/each}
    {#if activeQuery.trim().length >= 2 && !searching && !results.length && !searchError}
      <li class="note">Aucun résultat pour « {activeQuery.trim()} ». Essayez un nom de lieu ou une adresse.</li>
    {/if}
    {#if searchError}<li class="note">{searchError}</li>{/if}
    {#if searching && !results.length}<li class="note">Recherche…</li>{/if}
    {#if !editing && activeQuery.trim().length < 2}
      <li class="list-foot">
        <button class="link" onmousedown={(e) => { e.preventDefault(); importOpen = true; focused = false; document.activeElement?.blur(); }}>Importer vos lieux depuis Google Maps</button>
        <button class="link" onmousedown={(e) => { e.preventDefault(); editChips = true; focused = false; document.activeElement?.blur(); }}>Personnaliser les raccourcis</button>
        <span class="privacy-line">Ni compte, ni pistage : rien sur vous n'est collecté.</span>
      </li>
    {/if}
  </ul>
{/snippet}

{#snippet facade(f, alt = '')}
  <!-- devanture : photo 360° Panoramax recadrée vers le lieu (secteur de 45°), sans serveur -->
  <span class="facade" style:--fx={f.rel / 360 + 0.5}>
    <img src={f.src} {alt} loading="lazy" decoding="async" />
  </span>
{/snippet}

{#snippet photoBlock()}

      {#if wiki?.photos?.length}
        <div class="photos" class:single={wiki.photos.length === 1}>
          {#each wiki.photos as ph, i (ph.src)}
            <button class="ph" onclick={() => (viewer = i)} aria-label={`Voir la photo ${i + 1} sur ${wiki.photos.length} en plein écran`}>
              <img src={ph.src} alt={i === 0 ? title : ''} loading="lazy" />
              {#if i === 0 && wiki.photos.length > 1}<span class="ph-count">{wiki.photos.length} photos</span>{/if}
            </button>
          {/each}
        </div>
        <p class="ph-credit"><a href={wiki.photos[0].page} target="_blank" rel="noopener">Photos : Wikimedia Commons{wiki.photos[0].credit ? ` · ${wiki.photos[0].credit}` : ''}</a></p>
      {/if}
{/snippet}

{#snippet aboutBlock()}
      {#if wiki?.extract}
        <div class="about">
          <h2>Informations</h2>
          <p class:clamped={!moreText}>{wiki.extract}</p>
          {#if !moreText && wiki.extract.length > 180}<button class="link more" onclick={() => (moreText = true)}>Plus</button>{/if}
          <p class="credit">Plus d'infos sur <a href={wiki.url} target="_blank" rel="noopener">Wikipédia</a></p>
        </div>
      {/if}

{/snippet}

{#snippet transitBlock()}
      {#if isStation}
        <div class="deps" aria-live="polite">
          <h2>Prochains passages</h2>
          {#if !deps || deps.status === 'loading'}
            <p class="muted">Recherche des prochains passages…</p>
          {:else if deps.status === 'error'}
            <p class="muted">Horaires indisponibles pour le moment. Réessayez dans un instant.</p>
          {:else if deps.status === 'none'}
            <p class="muted">Aucun passage prévu dans l'heure.</p>
          {:else}
            <ul>
              {#each deps.data.lines as l}
                <li>
                  <span class="badge" class:round={l.mode === 'SUBWAY' || l.mode === 'METRO'} style:background={l.color} style:color={l.textColor}>{l.line}</span>
                  <span class="dep-dir">{l.headsign}</span>
                  <span class="dep-times">
                    {#if l.realTime}<span class="live" title="En temps réel" aria-label="En temps réel"></span>{/if}
                    {#each l.times as t, i}<span class:first={i === 0}>{fmtWait(t, now)}</span>{#if i < l.times.length - 1}<span class="sep"> · </span>{/if}{/each}
                  </span>
                </li>
              {/each}
            </ul>
            <p class="credit">Horaires : <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous et réseaux de transport</a></p>
          {/if}
        </div>
      {/if}
      {#if exits?.status === 'ok' && exits.data.length}
        <div class="exits">
          <h2>Sorties</h2>
          <ul>
            {#each allExits ? exits.data : exits.data.slice(0, 4) as e}
              <li><span class="exit-sq" aria-hidden="true"></span><span>{exitLabel(e)}</span>
                {#if e.wheelchair}<span class="exit-tag">accessible</span>{:else if e.escalator}<span class="exit-tag">escalier mécanique</span>{/if}</li>
            {/each}
          </ul>
          {#if exits.data.length > 4 && !allExits}<button class="link more" onclick={() => (allExits = true)}>Toutes les sorties ({exits.data.length})</button>{/if}
        </div>
      {/if}

{/snippet}

{#snippet rowsBlock()}
      <!-- Bon à savoir : infos notées par les contributeurs OSM, rien de déduit -->
      {#if info?.good?.length}
        <section class="psec">
          <h2>Bon à savoir</h2>
          <ul class="good">
            {#each info.good as g}
              <li class:no={!g.ok}>
                {#if g.ok}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>{/if}
                <span>{g.text}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if info?.facade}
        <section class="psec">
          <h2>Vue de la rue</h2>
          <button class="facade-card" onclick={() => (viewer = 'facade')} aria-label="Voir la vue de la rue en plein écran">
            {@render facade(info.facade, `Vue de la rue : ${title}`)}
          </button>
          <p class="ph-credit"><a href={info.facade.page} target="_blank" rel="noopener">Photo : {info.facade.credit}{info.facade.date ? ` · ${info.facade.date.slice(0, 4)}` : ''} · pour reconnaître l'entrée</a></p>
        </section>
      {/if}

      {#if week}
        <section class="psec">
          <h2>Horaires</h2>
          <table class="week"><tbody>
            {#each week as d}<tr class:today={d.today}><th>{d.day}</th><td>{d.text}</td></tr>{/each}
          </tbody></table>
        </section>
      {:else if info?.expectsHours && !isStation}
        <section class="psec">
          <h2>Horaires</h2>
          <p class="muted small">Personne ne les a encore ajoutés à OpenStreetMap, la carte libre que nous utilisons.</p>
          {#if osmEditUrl}<a class="link ext" href={osmEditUrl} target="_blank" rel="noopener">Ajouter les horaires ↗</a>{/if}
        </section>
      {/if}

      {#if info?.phone || info?.website || address}
        <section class="psec">
          <h2>Détails</h2>
          <dl class="details">
            {#if info?.phone}
              <div><dt>Téléphone</dt><dd><a href={`tel:${info.phone.replace(/\s/g, '')}`}>{info.phone}</a></dd></div>
            {/if}
            {#if info?.website}
              <div><dt>Site web</dt><dd><a href={href(info.website)} target="_blank" rel="noopener">{host(info.website)}</a></dd></div>
            {/if}
            {#if address}
              <div><dt>Adresse</dt><dd class="selectable">{address}</dd></div>
            {/if}
          </dl>
        </section>
      {/if}

      {#if placeShortcut}
        <p class="sc-note">Votre {SHORT_NAMES[placeShortcut].toLowerCase()} · <button class="link" onclick={() => { const k = placeShortcut, old = shortcuts[k]; setShortcut(k, null); say(`${SHORT_NAMES[k]} retiré`, { label: 'Annuler', run: () => setShortcut(k, old) }); }}>Retirer</button></p>
      {/if}

      {#if !isAddress}
        <div class="end-btns">
          <button class="end-btn" class:on={isPinned} onclick={() => { const was = isPinned; togglePin(place); say(was ? 'Désépinglé' : 'Épinglé en haut de Mes lieux'); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3.5h6l-1 6 3.5 3.5h-11L10 9.5zM12 13v7.5" /></svg>
            <span>{isPinned ? 'Épinglé' : 'Épingler'}</span>
          </button>
          <a class="end-btn" aria-label="Signaler un problème sur OpenStreetMap" href={osmNoteUrl} target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5M12 17v.3" /></svg>
            <span>Signaler</span>
          </a>
        </div>
      {/if}
      {#if info?.covered === false}
        <p class="contrib">Ce lieu est hors de la zone couverte par nos données détaillées (Paris pour l'instant) : seules les infos de la carte sont affichées.</p>
      {/if}
      <p class="contrib">
        {#if osmDate}Données OpenStreetMap du {osmDate}. {/if}Une info manque ou est fausse ?
        {#if osmEditUrl}<a href={osmEditUrl} target="_blank" rel="noopener">Complétez-la sur OpenStreetMap ↗</a>{:else}<a href={osmNoteUrl} target="_blank" rel="noopener">Signalez-la sur OpenStreetMap ↗</a>{/if},
        la carte libre que nous utilisons. Indiquez ce que vous constatez sur place, sans recopier Google Maps : sa licence l'interdit.
      </p>
{/snippet}

<div class="app" class:routing={directions} class:navigating={!!nav} style:--top-h={`${directions ? topH : searchH + 16}px`}>
  <div class="map" bind:this={mapEl} aria-label="Carte"></div>

  {#if !directions}
    <header class="top">
      <div class="search" class:open={showList} bind:offsetHeight={searchH}>
        <svg class="lens" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20" /></svg>
        <input id="search" type="search" placeholder="Rechercher un lieu ou une adresse" aria-label="Rechercher un lieu ou une adresse"
          autocomplete="off" enterkeyhint="search" bind:value={query}
          onfocus={() => { focused = true; editChips = false; importOpen = false; showModes = false; closePlace(); clearCategory(); }} onblur={() => setTimeout(() => (focused = false), 150)} onkeydown={onKey} />
        {#if query}
          <button class="icon-btn" onclick={clearSearch} aria-label="Effacer la recherche">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
          </button>
        {/if}
        {#if showList}{@render resultList()}{/if}
      </div>

      {#if !showList}
        <nav class="chips" aria-label="Catégories">
          {#each chipList as c (c.key)}
            <button class="chip" class:on={category?.key === c.key} onclick={() => pickCategory(c)} style:--fam={famColor(c)} aria-pressed={category?.key === c.key}>
              {#if c.saved}<svg class="chip-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3l-1.3-1.2C6 14.9 3 12.2 3 8.9 3 6.2 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.2 21 8.9c0 3.3-3 6-7.7 10.2z" /></svg>
              {:else}<span class="chip-dot" aria-hidden="true"></span>{/if}{c.label}
            </button>
          {/each}
          <button class="chip edit" class:on-edit={editChips} onclick={() => { editChips = !editChips; importOpen = false; }} aria-label="Personnaliser les raccourcis" aria-expanded={editChips}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
          </button>
        </nav>
      {/if}
    </header>
  {:else if !nav}
    <header class="top dir" bind:offsetHeight={topH}>
      <div class="dir-card" class:open={editing}>
        <button class="icon-btn back" onclick={closeDirections} aria-label="Revenir à la fiche du lieu">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div class="fields" class:has-add={!showVia && !editing}>
          {#each [['from', from, 'Choisir un point de départ'], ...(showVia ? [['via', via, 'Choisir un arrêt']] : []), ['to', to, 'Choisir une destination']] as [which, pt, ph] (which)}
            <div class="field" class:editing={editing === which} class:via-field={which === 'via'}>
              <span class="field-mark {which}" aria-hidden="true"></span>
              {#if editing === which}
                <input id={`field-${which}`} bind:this={fieldEl} bind:value={fieldQuery} placeholder={ph} autocomplete="off"
                  aria-label={{ from: 'Départ', via: 'Arrêt', to: 'Arrivée' }[which]} onkeydown={onKey}
                  onblur={() => { lastEdit = { which, at: Date.now() }; setTimeout(() => { if (editing === which && pointOf(which)) editing = null; }, 250); }} />
              {:else}
                <button class="field-btn" class:placeholder={!pt} onclick={() => editField(which)}>
                  {pt ? pt.label : ph}
                </button>
              {/if}
              {#if which === 'via'}
                <button class="icon-btn rm-stop" onclick={removeStop} aria-label="Retirer l'arrêt">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
                </button>
              {/if}
            </div>
          {/each}
          {#if !showVia && !editing}
            <button class="add-stop" onclick={addStop}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>Ajouter un arrêt
            </button>
          {/if}
        </div>
        <button class="icon-btn swap" onclick={swap} aria-label="Inverser départ et arrivée" disabled={!from || !to}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v15M4.5 7.5 8 4l3.5 3.5M16 20V5M12.5 16.5 16 20l3.5-3.5" /></svg>
        </button>
        {#if editing}{@render resultList()}{/if}
      </div>

      {#if !editing}
        <div class="modes" role="tablist" aria-label="Mode de déplacement">
          {#each MODES as m}
            {@const r = routes[m.id]}
            <button class="mode" class:on={mode === m.id} role="tab" aria-selected={mode === m.id} onclick={() => chooseMode(m.id)}>
              {@render modeIcon(m.id)}
              <span class="mode-time">
                {#if !r}{m.label}
                {:else if r.status === 'loading'}<span class="dots" aria-label="Calcul en cours"></span>
                {:else if r.status === 'ok'}{fmtDuration(m.id === 'transit' ? (r.data[m.id === mode ? picked : 0] || r.data[0]).duration
                  : (streetOpts(r.data)[m.id === mode ? pickedStreet : 0] || r.data).duration)}
                {:else}–{/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </header>
  {/if}

  {#if !directions}
    <div class="modes-ctl">
      {#if Math.abs(bearing) > 1 || pitch > 1}
        <button class="round-btn compass" onclick={() => map.easeTo({ bearing: 0, pitch: 0, duration: 500 })} aria-label="Remettre le nord en haut">
          <svg viewBox="0 0 24 24" aria-hidden="true" style:transform={`rotate(${-bearing}deg)`}><path d="M12 3 15.5 12h-7z" class="solid north" /><path d="M8.5 12h7L12 21z" /></svg>
        </button>
      {/if}
      {#if showModes}
        <div class="modes-pop" role="menu" aria-label="Type de carte">
          <button role="menuitemradio" aria-checked={mapMode === 'plan'} class:on={mapMode === 'plan'} onclick={() => setMapMode('plan')}>
            <span class="thumb plan" aria-hidden="true"></span>Plan
          </button>
          <button role="menuitemradio" aria-checked={mapMode === 'transit'} class:on={mapMode === 'transit'} onclick={() => setMapMode('transit')}>
            <span class="thumb transit" aria-hidden="true"></span>Transports
          </button>
          <label class="saved-toggle">
            <input type="checkbox" checked={showSaved} onchange={(e) => { showSaved = e.currentTarget.checked; try { localStorage.setItem('mes-lieux-carte', showSaved ? 'oui' : 'non'); } catch { /* rien */ } }} />
            Mes lieux sur la carte
          </label>
        </div>
      {/if}
      <button class="round-btn" onclick={() => (showModes = !showModes)} aria-label="Type de carte" aria-expanded={showModes}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 8.5 4.5L12 12.5 3.5 8z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" /></svg>
      </button>
    </div>
  {/if}
  <button class="locate" class:busy={locating} class:following={followMode !== 'none'} onclick={locate}
    aria-label={followMode === 'follow' ? 'Orienter la carte dans votre direction' : followMode === 'heading' ? 'Remettre le nord en haut' : 'Me localiser'}>
    {#if followMode === 'heading'}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 17 13H7z" class="solid" /><path d="M7 13h10l-5 8.5z" /><circle cx="12" cy="13" r="1.3" class="solid" /></svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true" class:hollow={followMode === 'none'}><path d="M20 4 4 11l7 2 2 7z" class="solid" /></svg>
    {/if}
  </button>
  {#if nav && navBanner}
    <div class="nav-top" class:arrived={navBanner.arrived} role="status" aria-live="polite">
      <div class="nav-main">
        <span class="nav-icon" aria-hidden="true">
          {#if navBanner.arrived || navBanner.icon === 'arrive' || navBanner.icon === 'stop'}
            <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" class="solid" /><circle cx="12" cy="9.5" r="2.6" class="hole" /></svg>
          {:else if navBanner.icon === 'walk'}{@render modeIcon('walk')}
          {:else if navBanner.icon === 'board' || navBanner.icon === 'alight'}
            <span class="badge" class:round={navBanner.line?.mode === 'SUBWAY' || navBanner.line?.mode === 'METRO'} style:background={navBanner.line?.color} style:color={navBanner.line?.textColor}>{navBanner.line ? badge(navBanner.line) : ''}</span>
          {:else if isRoundabout(navBanner.icon)}
            <svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="4.5" /><path d="M12 8.5V3M9 6l3-3 3 3M12 17.5V22" /></svg>
          {:else}
            <svg viewBox="0 0 24 24" style:transform={`rotate(${arrowAngle(navBanner.icon)}deg)`}><path d="M12 21V6M6.5 11.5 12 6l5.5 5.5" /></svg>
          {/if}
        </span>
        <span class="nav-txt">
          {#if navBanner.dist}<span class="nav-dist">{navBanner.dist}</span>{/if}
          <span class="nav-text">{navBanner.text}</span>
          {#if navBanner.sub}<span class="nav-sub">{navBanner.sub}</span>{/if}
        </span>
      </div>
      {#if navBanner.then && !navBanner.arrived}<p class="nav-then">Puis : {navBanner.then}</p>{/if}
    </div>
    {#if !navFollow}
      <button class="nav-recenter" onclick={() => { navFollow = true; updateNav(); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 19 20l-7-4-7 4z" class="solid" /></svg>Recentrer
      </button>
    {/if}
    {#if navList}
      <section class="sheet nav-list" aria-label="Étapes du trajet">
        <h1>Étapes</h1>
        <ol class="steps">
          {#each nav.steps as st, i}
            <li class:done={i < nav.k + (nav.kind === 'transit' ? 0 : 1)} class:now={i === (nav.kind === 'transit' ? nav.k : nav.k + 1)}>
              <span>{st.text}{#if st.sub}<small class="why">{st.sub}</small>{/if}</span>
            </li>
          {/each}
          <li class="arrive"><span>Arrivée : {to.label}</span></li>
        </ol>
      </section>
    {/if}
    <div class="nav-bottom">
      <button class="nav-eta" onclick={() => (navList = !navList)} aria-expanded={navList} aria-label="Voir les étapes">
        <strong>{navBanner.arrived ? 'Arrivé' : navRemaining.eta}</strong>
        <span>{navBanner.arrived ? to.label : `${navRemaining.min} · ${navRemaining.km}`}</span>
      </button>
      <button class="nav-btn" onclick={() => { voice = !voice; if (!voice && 'speechSynthesis' in window) speechSynthesis.cancel(); }} aria-pressed={voice} aria-label={voice ? 'Couper la voix' : 'Activer la voix'}>
        {#if voice}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></svg>
        {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></svg>{/if}
      </button>
      <button class="nav-end" onclick={endNav}>Fin</button>
    </div>
  {/if}
  {#if viewer === 'facade' && info?.facade}
    <!-- Devanture en plein écran : la photo 360° entière, qu'on fait défiler ; ouverte sur le lieu -->
    <div class="viewer" role="dialog" aria-modal="true" aria-label="Devanture de {title}">
      <div class="pano" use:panoScroll={info.facade.rel}>
        <img src={info.facade.src} alt={`Vue à 360° devant ${title}`} draggable="false" />
      </div>
      <div class="viewer-top">
        <span>Devanture · faites défiler pour regarder autour</span>
        <button class="viewer-close" onclick={() => (viewer = null)} aria-label="Fermer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
        </button>
      </div>
      <p class="viewer-credit"><a href={info.facade.page} target="_blank" rel="noopener">Photo : {info.facade.credit}{info.facade.date ? ` · ${info.facade.date.slice(0, 4)}` : ''} · ouvrir dans Panoramax</a></p>
    </div>
  {:else if viewer != null && wiki?.photos?.length}
    {@const ph = wiki.photos[viewerIdx] || wiki.photos[0]}
    <div class="viewer" role="dialog" aria-modal="true" aria-label="Photos de {title}">
      <div class="viewer-strip" class:zoomed={zoom.s > 1} bind:this={viewerEl} style:transform={dragY ? `translateY(${dragY}px)` : null}
        style:opacity={dragY ? Math.max(0.3, 1 - dragY / 500) : null}
        ontouchstart={zoomStart} ontouchmove={zoomMove} ontouchend={zoomEnd} ondblclick={(e) => toggleZoom(e.clientX, e.clientY)}
        onscroll={(e) => { const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth); if (i !== viewerIdx) { viewerIdx = i; zoom = { s: 1, x: 0, y: 0 }; } }}>
        {#each wiki.photos as p, i (p.src)}
          <div class="viewer-slide"><img src={Math.abs(i - viewerIdx) <= 1 ? p.full : p.src} alt={i === 0 ? title : ''} draggable="false"
            style:transform={i === viewerIdx && zoom.s > 1 ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` : null} /></div>
        {/each}
      </div>
      <div class="viewer-top">
        <span>{viewerIdx + 1} / {wiki.photos.length}</span>
        <button class="viewer-close" onclick={() => (viewer = null)} aria-label="Fermer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
        </button>
      </div>
      {#if wiki.photos.length > 1}
        <button class="viewer-nav prev" disabled={viewerIdx === 0} aria-label="Photo précédente"
          onclick={() => viewerEl.scrollBy({ left: -viewerEl.clientWidth, behavior: 'smooth' })}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
        <button class="viewer-nav next" disabled={viewerIdx === wiki.photos.length - 1} aria-label="Photo suivante"
          onclick={() => viewerEl.scrollBy({ left: viewerEl.clientWidth, behavior: 'smooth' })}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
      {/if}
      <p class="viewer-credit"><a href={ph.page} target="_blank" rel="noopener">{ph.credit || 'Wikimedia Commons'} · Wikimedia Commons</a></p>
    </div>
  {/if}
  {#if toast}<p class="toast" role="status">{toast}{#if toastAction}<button onclick={undoToast}>{toastAction.label}</button>{/if}</p>{/if}
  {#if showPromise && !place && !category && !directions && !importOpen && !editChips}
    <div class="promise" role="note">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
      <p><strong>Une carte qui ne vous piste pas.</strong> Ni compte, ni publicité, rien sur vous n'est collecté. Vos favoris restent sur votre téléphone. <a href="confidentialite" class="promise-link">Qui voit quoi ?</a></p>
      <button onclick={closePromise}>Compris</button>
    </div>
  {/if}

  {#if listPicker && place && !directions}
    <section class="sheet" aria-label="Enregistrer dans" use:draggable={{ key: 'picker', onDismiss: () => (listPicker = false) }}>
      <button class="grip" aria-label="Agrandir la fiche"></button>
      <button class="close" onclick={() => (listPicker = false)} aria-label="Fermer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
      <h1>Enregistrer dans</h1>
      <p class="kind">{place.name}</p>
      <ul class="pick-lists">
        {#each lists as l (l.id)}
          {@const on = !!savedEntry?.lists.includes(l.id)}
          <li><label>
            {@render listDot(l, 32)}
            <span class="pl-name">{l.name}</span>
            <span class="pl-count">{favorites.filter((f) => f.lists.includes(l.id)).length}</span>
            <input type="checkbox" checked={on} onchange={(e) => setMembership(l.id, e.currentTarget.checked)} />
          </label></li>
        {/each}
      </ul>
      <form class="new-list" onsubmit={(e) => { e.preventDefault(); createList(newListName, (id) => setMembership(id, true)); newListName = ''; }}>
        <input bind:value={newListName} placeholder="Nouvelle liste…" aria-label="Nom de la nouvelle liste" maxlength="40" />
        <button class="link" disabled={!newListName.trim()}>Créer</button>
      </form>
      <label class="pin-toggle">
        <input type="checkbox" checked={pins.includes(placeKey(place))} onchange={() => togglePin(place)} />
        Épingler en haut de la recherche
      </label>
      <button class="go wide done" onclick={() => (listPicker = false)}>Terminé</button>
    </section>
  {:else if incoming?.kind === 'transfer' && !directions}
    <section class="sheet" aria-label="Récupérer vos lieux">
      <h1>Récupérer vos lieux</h1>
      <p class="kind">Depuis un autre appareil</p>
      <ul class="rows">
        <li class="row">{@render listDot(DEFAULT_LISTS[0], 24)}<span>{incoming.data.places.length} lieu{incoming.data.places.length > 1 ? 'x' : ''} dans {incoming.data.lists.length} liste{incoming.data.lists.length > 1 ? 's' : ''}</span></li>
        {#if incoming.data.shortcuts.home || incoming.data.shortcuts.work}
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v9.5h11V10" /><path d="M10.2 19.5v-4.8h3.6v4.8" /></svg><span>{[incoming.data.shortcuts.home && 'Maison', incoming.data.shortcuts.work && 'Travail'].filter(Boolean).join(' et ')}</span></li>
        {/if}
      </ul>
      <p class="credit">Ils s'ajoutent à ceux de cet appareil (rien n'est effacé).</p>
      <button class="go wide done" onclick={() => { const n = applyIncoming(incoming.raw); incoming = null; say(`${n} lieu${n > 1 ? 'x' : ''} ajouté${n > 1 ? 's' : ''} à Mes lieux`); }}>Ajouter à cet appareil</button>
      <button class="link more" onclick={() => (incoming = null)}>Ignorer</button>
    </section>
  {:else if importOpen && !directions}
    <section class="sheet" aria-label="Importer vos lieux" use:draggable={{ key: 'import', onDismiss: () => (importOpen = false) }}>
      <button class="grip" aria-label="Agrandir la fiche"></button>
      <button class="close" onclick={() => (importOpen = false)} aria-label="Fermer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
      <h1>Vos lieux Google Maps</h1>
      <p class="kind">Récupérez vos lieux enregistrés, votre maison et votre travail.</p>
      <ol class="howto">
        <li>Ouvrez <a href="https://takeout.google.com/" target="_blank" rel="noopener">takeout.google.com</a>, touchez « Tout désélectionner », puis cochez seulement <strong>Maps (vos adresses)</strong>.</li>
        <li>Touchez « Étape suivante » puis « Créer une exportation ». Google vous envoie un lien par e-mail, souvent en quelques minutes.</li>
        <li>Téléchargez le fichier .zip, puis choisissez-le ici.</li>
      </ol>
      <label class="action primary import-btn">
        <input type="file" accept=".zip,.json,.csv,application/zip,application/json,text/csv" onchange={importFile} hidden />
        {importing || 'Choisir le fichier'}
      </label>
      <p class="credit">Le fichier est lu sur votre téléphone : il n'est envoyé nulle part. Vos lieux restent sur cet appareil.</p>
    </section>
  {:else if editChips && !directions}
    <section class="sheet" aria-label="Personnaliser les raccourcis" use:draggable={{ key: 'chips', onDismiss: () => (editChips = false) }}>
      <button class="grip" aria-label="Agrandir la fiche"></button>
      <button class="close" onclick={() => (editChips = false)} aria-label="Fermer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
      <h1>Raccourcis</h1>
      <p class="kind">Choisissez ceux qui s'affichent, leur ordre et leur nom.</p>
      <ul class="chip-edit">
        {#each chipPrefs as pr, i (pr.key)}
          {#if i === chipPrefs.findIndex((x) => x.hidden) && i > 0}<li class="ce-head">Autres raccourcis disponibles</li>{/if}
          {@const c = catOf(pr.key)}
          <li class:off={pr.hidden}>
            <button class="ce-toggle" onclick={() => toggleChip(i)} role="switch" aria-checked={!pr.hidden} aria-label={`Afficher ${c.label}`}
              style:--fam={famColor(c)}><span></span></button>
            <input value={pr.label ?? ''} placeholder={c.label} aria-label={`Nom du raccourci ${c.label}`}
              onchange={(e) => renameChip(i, e.currentTarget.value)} maxlength="20" />
            <button class="icon-btn" onclick={() => moveChip(i, -1)} disabled={i === 0} aria-label={`Monter ${c.label}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg></button>
            <button class="icon-btn" onclick={() => moveChip(i, 1)} disabled={i === chipPrefs.length - 1} aria-label={`Descendre ${c.label}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
          </li>
        {/each}
      </ul>
      <button class="link more" onclick={resetChips}>Revenir aux raccourcis d'origine</button>
    </section>
  {:else if directions && !editing && !nav}
    <section class="sheet" aria-label="Itinéraire" use:draggable={{ key: `${from?.lat},${to?.lat}` }}>
      <button class="grip" aria-label="Agrandir la fiche"></button>
      {#if !from}
        <p class="empty">Choisissez un point de départ pour calculer l'itinéraire.</p>
      {:else if !current || current.status === 'loading'}
        <p class="empty">Calcul de l'itinéraire…</p>
      {:else if current.status === 'none' && mode === 'transit' && routes.walk?.status === 'ok'}
        <p class="empty">Pas de transport utile sur ce trajet : à pied, c'est {fmtDuration(routes.walk.data.duration)}.</p>
        <button class="retry" onclick={() => chooseMode('walk')}>Voir le trajet à pied</button>
      {:else if current.status === 'none'}
        <p class="empty">Aucun itinéraire {mode === 'transit' ? 'en transports en commun' : mode === 'bike' ? 'à vélo' : mode === 'car' ? 'en voiture' : 'à pied'} trouvé entre ces deux points.</p>
      {:else if current.status === 'error'}
        <p class="empty">Le service d'itinéraire ne répond pas. Réessayez dans un instant.</p>
        <button class="retry" onclick={computeRoutes}>Réessayer</button>
      {:else if mode !== 'transit'}
        {@const opts = streetOpts(current.data)}
        {@const sel = opts[pickedStreet] || opts[0]}
        <ul class="route-cards">
          {#each opts as r, i}
            <li class:on={i === pickedStreet}>
              <button class="rc-main" onclick={() => pickStreet(i)} aria-pressed={i === pickedStreet}>
                <span class="rc-dur">{fmtDuration(r.duration)}</span>
                <span class="rc-sub">Arrivée {arrival(r.duration)} · {fmtDistance(r.distance)}</span>
                <span class="rc-tag">{i === 0 ? 'Le plus rapide' : altTag(r, opts[0])}</span>
              </button>
              <button class="go" onclick={() => startNav(r)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 19 20l-7-4-7 4z" class="solid" /></svg>Aller
              </button>
            </li>
          {/each}
        </ul>
        {#if mode === 'bike'}
          <p class="traffic-note">Itinéraire adapté aux vélos : pistes cyclables et rues calmes en priorité.</p>
        {/if}
        {#if mode === 'car'}
          <p class="traffic-note">{sel.traffic ? `Estimation avec le ${sel.traffic}` : 'Estimation sur route fluide'}, d'après les capteurs de la Ville de Paris. Pas de trafic en temps réel : nous ne suivons pas les téléphones.</p>
        {/if}
        <button class="link more" onclick={() => (showSteps = !showSteps)} aria-expanded={showSteps}>{showSteps ? 'Masquer les étapes' : 'Voir les étapes'}</button>
        {#if showSteps}
          <ol class="steps">
            {#each sel.steps as s}
              <li class:stop={s.stop}><span>{s.text}</span>{#if s.distance >= 10}<span class="step-dist">{fmtDistance(s.distance)}</span>{/if}</li>
            {/each}
            <li class="arrive"><span>Arrivée : {to.label}</span></li>
          </ol>
        {/if}
      {:else}
        <ul class="options">
          {#each current.data as it, i}
            <li>
              <button class="option" class:on={picked === i} onclick={() => pickTransit(i)} aria-expanded={picked === i}>
                <span class="opt-top">
                  <span class="chain">
                    {#each it.legs as leg, j}
                      {#if j > 0}<span class="sep" aria-hidden="true">›</span>{/if}
                      {#if leg.mode === 'STOP'}
                        <span class="stop-chip" aria-label={`Arrêt : ${leg.from}`}></span>
                      {:else if leg.mode === 'WALK'}
                        <span class="walk-chip" aria-label={`Marche ${fmtDuration(leg.duration)}`}>{@render modeIcon('walk')}</span>
                      {:else}
                        <span class="badge" style:background={leg.color} style:color={leg.textColor}
                          aria-label={`${MODE_NAMES[leg.mode] || 'Ligne'} ${leg.line}`}>{badge(leg)}</span>
                      {/if}
                    {/each}
                  </span>
                  <span class="opt-dur">{fmtDuration(it.duration)}</span>
                </span>
                <span class="opt-sub">
                  <strong>{fmtTime(it.board.start)}</strong> à {it.board.from}{#if it.board.realTime}<span class="live" title="Horaire en temps réel"> ● </span>{:else} · {/if}{inMinutes(it.board.start)}
                </span>
                {#if it.next.length}
                  <span class="opt-sub">Puis {it.next.map(fmtTime).join(' · ')}</span>
                {/if}
                <span class="opt-sub">Arrivée {fmtTime(it.end)}</span>
              </button>
              {#if picked === i}
                <button class="go wide" onclick={() => startNav(it)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 19 20l-7-4-7 4z" class="solid" /></svg>Aller
                </button>
                <ol class="legs">
                  {#each it.legs as leg, li}
                    {#if leg.mode === 'STOP'}
                      <li class="leg stop">
                        <span class="leg-time">{fmtTime(leg.start)}</span>
                        <span class="leg-rail stop" aria-hidden="true"></span>
                        <span class="leg-body">
                          <span class="leg-place">Arrêt : {leg.from}</span>
                          <span class="leg-meta">Reprise à {fmtTime(leg.end)}{leg.duration > 90 ? ` · ${fmtDuration(leg.duration)} sur place` : ''}</span>
                        </span>
                      </li>
                    {:else if leg.mode === 'WALK'}
                      <li class="leg walk">
                        <span class="leg-time">{fmtTime(leg.start)}</span>
                        <span class="leg-rail walk" aria-hidden="true"></span>
                        <span class="leg-body">
                          <span class="leg-place">{leg.from}</span>
                          <span class="leg-meta">Marcher {fmtDuration(leg.duration)}{leg.distance ? ` · ${fmtDistance(leg.distance)}` : ''}</span>
                        </span>
                      </li>
                    {:else}
                      <li class="leg">
                        <span class="leg-time">{fmtTime(leg.start)}</span>
                        <span class="leg-rail" style:background={leg.color} aria-hidden="true"></span>
                        <span class="leg-body">
                          <span class="leg-place">{leg.from}</span>
                          <span class="leg-meta">
                            <span class="badge small" style:background={leg.color} style:color={leg.textColor}>{badge(leg)}</span>
                            {MODE_NAMES[leg.mode] || ''} direction {leg.headsign}
                          </span>
                          <span class="leg-meta">{leg.stops ? `${leg.stops + 1} arrêts · ` : ''}{fmtDuration(leg.duration)}{leg.realTime ? ' · temps réel' : ''}</span>
                          {#each [legExits[`${i}|${li}|${leg.to}`]] as tip}
                          {#if tip?.place}
                            <span class="leg-tip"><span class="car-ic" aria-hidden="true"></span>Montez {placeLabel(tip.place)}{tip.transfer ? ` pour la correspondance${tip.transfer.line ? ` avec la ligne ${tip.transfer.line}` : ''}` : ''}</span>
                          {/if}
                          {#if tip?.exit}
                            <span class="leg-exit"><span class="exit-sq" aria-hidden="true"></span>À {leg.to}, prenez la {exitLabel(tip.exit).replace(/^Sortie/, 'sortie')}{tip.exit.ref ? '' : ' (sortie)'}</span>
                          {/if}
                          {/each}
                        </span>
                      </li>
                    {/if}
                  {/each}
                  <li class="leg end">
                    <span class="leg-time">{fmtTime(it.end)}</span>
                    <span class="leg-rail end" aria-hidden="true"></span>
                    <span class="leg-body"><span class="leg-place">{to.label}</span></span>
                  </li>
                </ol>
              {/if}
            </li>
          {/each}
        </ul>
        <p class="credit">Horaires : <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous et réseaux de transport</a> · Place dans la rame : RATP / Île-de-France Mobilités</p>
      {/if}
    </section>
  {:else if place && !directions}
    <section class="sheet" aria-label={place.name} use:draggable={{ key: place.id, onDismiss: closePlace }}>
      <button class="grip" aria-label="Agrandir la fiche"></button>
      <button class="close" onclick={closePlace} aria-label="Fermer la fiche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>

      <button class="share left" onclick={sharePlace} aria-label="Partager">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8 7.5l4-4 4 4M6 11.5H5v8h14v-8h-1" /></svg>
      </button>
      <div class="phead">
        <h1>{title}</h1>
        <p class="kind">{isAddress
          ? (place.name.split(',').slice(1).join(',').trim() || place.address || 'Adresse')
          : [stationKind || info?.kind || place.type, info?.cuisine && info.cuisine.split(';')[0].replace(/_/g, ' ')].filter(Boolean).join(' · ') || 'Lieu'}</p>
      </div>

      <!-- En un coup d'œil : ouvert ? loin ? encore à jour ? -->
      <p class="glance">
        {#if info === null}<span class="muted">Chargement…</span>
        {:else if status}<span class="st" class:is-open={status.open === true} class:is-closed={status.open === false}>{status.label}</span>{/if}
      </p>
      {#if freshness}
        <p class="fresh" class:old={!freshness.ok}>
          {#if freshness.ok}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{/if}{freshness.text}
        </p>
      {/if}

      <div class="actions" class:solo={!info?.phone && !info?.website}>
        <button class="action primary" onclick={startDirections}>
          {#if walkEta && /min/.test(walkEta)}
            {@render modeIcon('walk')}
            <span>{walkEta.replace(' à pied', '').replace('≈ ', '')}</span>
          {:else}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 21.2 12 12 21.2 2.8 12z" class="solid" /><path d="M9.5 14.5v-2.2a1.5 1.5 0 0 1 1.5-1.5h4M13 8.8l2 2-2 2" class="on-solid" /></svg>
            <span>Itinéraire</span>
          {/if}
        </button>
        {#if info?.phone}
          <a class="action" href={`tel:${info.phone.replace(/\s/g, '')}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l2 4.6-2.3 1.6a12 12 0 0 0 6.1 6.1l1.6-2.3L21 15l-.5 2.4A3 3 0 0 1 17.6 20C10 20 4 14 4 6.4a3 3 0 0 1 2.6-2.9z" /></svg>
            <span>Appeler</span>
          </a>
        {/if}
        {#if info?.website}
          <a class="action" href={href(info.website)} target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5M12 3.5C9.5 6.1 8.4 8.9 8.4 12s1.1 5.9 3.6 8.5" /></svg>
            <span>Site web</span>
          </a>
        {/if}
      </div>

      {#if infoStrip.length}
        <dl class="strip">
          {#each infoStrip as it}<div><dt>{it.label}</dt><dd>{it.value}</dd></div>{/each}
        </dl>
      {/if}

      <!-- Ordre selon ce qui sert le plus : une station → prochains passages et sorties d'abord ;
           un commerce → horaires, téléphone, site avant le texte Wikipédia ; un monument → photo et histoire. -->
      {#if isStation}
        {@render transitBlock()}{@render photoBlock()}{@render aboutBlock()}{@render rowsBlock()}
      {:else if info?.expectsHours}
        {@render photoBlock()}{@render rowsBlock()}{@render aboutBlock()}
      {:else}
        {@render photoBlock()}{@render aboutBlock()}{@render rowsBlock()}
      {/if}

      <!-- Barre flottante : favori, listes, plus -->
      <div class="fab-bar">
        {#if placeMenu}
          <div class="pmenu" role="menu">
            {#if !isStation}
              {#each ['home', 'work'] as k}
                <button role="menuitem" onclick={() => { placeMenu = false; if (placeShortcut === k) { const old = shortcuts[k]; setShortcut(k, null); say(`${SHORT_NAMES[k]} retiré`, { label: 'Annuler', run: () => setShortcut(k, old) }); } else { setShortcut(k, place); say(`${SHORT_NAMES[k]} enregistré · gardé sur cet appareil`); } }}>
                  {placeShortcut === k ? `Retirer « ${SHORT_NAMES[k]} »` : `Définir comme ${SHORT_NAMES[k]}`}
                </button>
              {/each}
            {/if}
            <button role="menuitem" onclick={copyAddress}>Copier l'adresse</button>
            <button role="menuitem" onclick={() => { placeMenu = false; sharePlace(); }}>Partager</button>
          </div>
        {/if}
        <div class="fab">
          <button class:on={inFav} onclick={favTap} aria-pressed={inFav} aria-label={inFav ? `Retirer de ${listOf('fav').name}` : `Ajouter à ${listOf('fav').name}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3l-1.3-1.2C6 14.9 3 12.2 3 8.9 3 6.2 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.2 21 8.9c0 3.3-3 6-7.7 10.2z" /></svg>
          </button>
          <button class:on={isFav && savedEntry.lists.some((x) => x !== 'fav')} onclick={() => (listPicker = true)} aria-label="Ajouter à une liste">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button onclick={() => (placeMenu = !placeMenu)} aria-expanded={placeMenu} aria-label="Plus d'options">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.4" class="solid" /><circle cx="12" cy="12" r="1.4" class="solid" /><circle cx="18" cy="12" r="1.4" class="solid" /></svg>
          </button>
        </div>
      </div>
    </section>
  {:else if category && !directions}
    <!-- Liste d'une catégorie : ouverte en aperçu (la carte reste visible), on l'agrandit si on veut la liste ;
         la faire glisser vers le bas la réduit sans fermer la catégorie (seule la croix ou le raccourci la ferment). -->
    <section class="sheet" aria-label={category.label} use:draggable={category.saved ? { key: category.label, onDismiss: clearCategory } : { key: category.label, start: 'peek' }}>
      <button class="grip" aria-label="Agrandir la fiche"></button>
      <button class="close" onclick={clearCategory} aria-label="Fermer la liste">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
      {#if category.saved && !savedList && !category.shared && !hubPanel}
        <h1>{chipList.find((c) => c.key === 'saved')?.label || 'Mes lieux'}</h1>
        {@render pinnedRow(false)}
        <h2 class="hub-h">Listes</h2>
        <ul class="hub-lists">
          {#each lists as l (l.id)}
            <li><button onclick={() => openSavedList(l.id)}>
              {@render listDot(l, 34)}
              <span class="pl-name">{l.name}</span>
              <span class="pl-count">{favorites.filter((f) => f.lists.includes(l.id)).length}</span>
              <svg class="chev-r" viewBox="0 0 24 24" aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg>
            </button></li>
          {/each}
          <li>
            {#if hubPanel === 'newlist'}{:else}
              <form class="new-list" onsubmit={(e) => { e.preventDefault(); createList(newListName); newListName = ''; }}>
                <input bind:value={newListName} placeholder="Nouvelle liste…" aria-label="Nom de la nouvelle liste" maxlength="40" />
                <button class="link" disabled={!newListName.trim()}>Créer</button>
              </form>
            {/if}
          </li>
        </ul>
        <h2 class="hub-h">Vos données</h2>
        <ul class="rows hub-rows">
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" /></svg>
            <button class="row-btn" onclick={() => { importOpen = true; }}><span>Importer depuis Google Maps</span></button></li>
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><path d="M13.5 13.5h3v3h-3zM18 18h2.5M20.5 13.5V16" /></svg>
            <button class="row-btn" onclick={makeTransfer}><span>Transférer vers un autre appareil</span></button></li>
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6-1.6A4.8 4.8 0 0 0 7 18.5z" /><path d="M12 11v5M9.8 13.2 12 11l2.2 2.2" /></svg>
            <button class="row-btn" onclick={() => (hubPanel = 'backup')}><span>Sauvegarder<small class="why" class:warn={favorites.length >= 5 && (backupAge === null || backupAge > 30)}>{backupAge === null ? 'Jamais sauvegardé' : backupAge === 0 ? 'Dernière sauvegarde aujourd\'hui' : `Dernière sauvegarde il y a ${backupAge} jour${backupAge > 1 ? 's' : ''}`}</small></span></button></li>
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" /></svg>
            <button class="row-btn" onclick={() => (hubPanel = 'restore')}><span>Restaurer une sauvegarde</span></button></li>
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
            <button class="row-btn" onclick={() => { clearCategory(); editChips = true; }}><span>Personnaliser les raccourcis</span></button></li>
        </ul>
        <p class="credit">Vos lieux restent sur cet appareil : ni compte, ni serveur. Sauvegardez-les pour ne pas les perdre.</p>
      {:else if category.saved && hubPanel === 'transfer'}
        <button class="link back-link" onclick={() => (hubPanel = null)}>‹ Mes lieux</button>
        <h1>Transférer</h1>
        <p class="kind">Ouvrez ce lien ou scannez ce code sur l'autre appareil.</p>
        {#if !transfer}<p class="muted">Préparation…</p>
        {:else}
          {#if transfer.qr}<div class="qr" aria-label="QR code de transfert">{@html transfer.qr}</div>
          {:else}<p class="credit">Trop de lieux pour un QR code : envoyez-vous le lien (AirDrop, Signal à vous-même…).</p>{/if}
          <button class="go wide done" onclick={shareTransfer}>Envoyer le lien</button>
          <p class="credit">⚠️ Ce lien contient tous vos lieux : envoyez-le seulement à vous-même. Il n'est stocké sur aucun serveur.</p>
        {/if}
      {:else if category.saved && hubPanel === 'backup'}
        <button class="link back-link" onclick={() => (hubPanel = null)}>‹ Mes lieux</button>
        <h1>Sauvegarder</h1>
        <p class="kind">Un fichier avec vos listes, Maison, Travail et vos raccourcis, à ranger où vous voulez : iCloud Drive, Proton Drive, un ordinateur…</p>
        <label class="pw">Mot de passe (facultatif, pour chiffrer le fichier)
          <input type="password" bind:value={backupPassword} autocomplete="new-password" placeholder="Aucun" /></label>
        {#if backupPassword}<p class="credit">Sans ce mot de passe, personne ne pourra lire le fichier, vous non plus : notez-le.</p>{/if}
        <button class="go wide done" onclick={makeBackup}>Créer la sauvegarde</button>
      {:else if category.saved && hubPanel === 'restore'}
        <button class="link back-link" onclick={() => { hubPanel = null; restoreNeedsPw = false; }}>‹ Mes lieux</button>
        <h1>Restaurer</h1>
        <p class="kind">Choisissez un fichier de sauvegarde d'Untracked Maps. Ses lieux s'ajoutent à ceux de cet appareil.</p>
        {#if restoreNeedsPw}
          <label class="pw">Ce fichier est protégé : mot de passe
            <input type="password" bind:value={restorePassword} autocomplete="current-password" /></label>
          <button class="go wide done" onclick={() => doRestore()}>Restaurer</button>
        {:else}
          <label class="action primary import-btn">
            <input type="file" accept=".json,application/json" hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; doRestore(f); }} />
            Choisir le fichier
          </label>
        {/if}
      {:else if category.saved}
        {@const l = category.shared ? category : listOf(savedList)}
        {#if !category.shared}<button class="link back-link" onclick={() => { savedList = null; refreshSaved(); }}>‹ Mes lieux</button>{/if}
        <h1 class="list-title">{@render listDot(l, 30)}{l.name || category.label}</h1>
        <p class="kind">{category.shared ? `Liste partagée · ${nearby.length} lieu${nearby.length > 1 ? 'x' : ''}` : nearby.length ? `${nearby.length} lieu${nearby.length > 1 ? 'x' : ''}, ${nearbyFromMe ? 'les plus proches de vous d\'abord' : 'par distance'}` : 'Aucun lieu pour l\'instant : touchez « Enregistrer » sur la fiche d\'un lieu.'}</p>
        <div class="list-actions">
          {#if category.shared}
            <button class="go" onclick={keepIncomingList}>Ajouter à Mes lieux</button>
          {:else}
            {#if nearby.length}<button class="link" onclick={() => { listEditing = !listEditing; swiped = null; }}>{listEditing ? 'Terminé' : 'Modifier'}</button>{/if}
            {#if nearby.length && !listEditing}<button class="link" onclick={() => shareList(l)}>Partager</button>{/if}
            <button class="link" onclick={() => renameList(l)}>Renommer</button>
            {#if !['fav', 'todo'].includes(l.id)}<button class="link danger" onclick={() => deleteList(l)}>Supprimer</button>{/if}
          {/if}
        </div>
      {:else}
      <h1>{chipList.find((c) => c.key === category.key)?.label || category.label}</h1>
      {#if openAt && openCounts}
        <p class="kind">{openCounts.open ? `${openCounts.open} ouvert${openCounts.open > 1 ? 's' : ''} ${openAt.now ? 'maintenant' : momentLabel(openAt.at).replace(/ (\d)/, ' à $1')}` : `Aucun ouvert ${openAt.now ? 'maintenant' : momentLabel(openAt.at).replace(/ (\d)/, ' à $1')} dans cette zone`}</p>
      {:else}
        <p class="kind">{nearby.length ? (nearbyFromMe ? 'Les plus proches de vous' : 'Autour du centre de la carte') : nearbyDone ? 'Aucun dans cette zone. Déplacez la carte pour chercher ailleurs.' : 'Recherche…'}</p>
      {/if}
      {#if !category.transit}
        <div class="open-pills">
          <button class="opill" class:on={openAt?.now} aria-pressed={!!openAt?.now} onclick={() => setOpenAt(openAt?.now ? null : { now: true })}>Ouvert maintenant</button>
          <button class="opill" class:on={!!openAt?.at} aria-expanded={momentPicker} onclick={() => (momentPicker = !momentPicker)}>
            {openAt?.at ? momentLabel(openAt.at).replace(/^./, (x) => x.toUpperCase()) : 'Ouvert à…'}
            <svg viewBox="0 0 24 24" aria-hidden="true" class="chev" class:flip={momentPicker}><path d="m7 10 5 5 5-5" /></svg>
          </button>
          {#if openAt}<button class="opill-x" onclick={() => setOpenAt(null)} aria-label="Retirer le filtre d'horaires">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg></button>{/if}
        </div>
        {#if momentPicker}
          <div class="moment">
            <div class="moment-quick">
              <button onclick={() => quickMoment('midi')}>Midi</button>
              <button onclick={() => quickMoment('soir')}>Ce soir</button>
              <button onclick={() => quickMoment('demain-soir')}>Demain soir</button>
            </div>
            <div class="moment-sel">
              <select aria-label="Jour" value={pickerDay} onchange={(e) => { const [h, m] = pickerTime.split(':').map(Number); setOpenAt({ at: momentFrom(+e.currentTarget.value, h, m) }); momentPicker = true; }}>
                {#each pickerDays as d}<option value={d.i}>{d.label}</option>{/each}
              </select>
              <select aria-label="Heure" value={pickerTime} onchange={(e) => { const [h, m] = e.currentTarget.value.split(':').map(Number); setOpenAt({ at: momentFrom(pickerDay, h, m) }); momentPicker = true; }}>
                {#each pickerHours as [h, m]}<option value={`${h}:${m}`}>{h} h {m ? '30' : ''}</option>{/each}
              </select>
            </div>
          </div>
        {/if}
      {/if}
      {/if}
      <ul class="nearby">
        {#each nearby as { f, d, st, deps: sd, saved: sv } (f.id)}
          <li class:swipe-row={category.saved && savedList && sv} class:swiped={swiped === f.id || (listEditing && savedList && sv)}
            ontouchstart={category.saved && savedList && sv ? (e) => (swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, id: f.id }) : undefined}
            ontouchmove={category.saved && savedList && sv ? (e) => {
              if (!swipeStart) return;
              const dx = e.touches[0].clientX - swipeStart.x, dy = e.touches[0].clientY - swipeStart.y;
              if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) { swiped = dx < 0 ? swipeStart.id : null; swipeStart = null; }
            } : undefined}>
            {#if category.saved && savedList && sv}
              <button class="swipe-del" onclick={() => removeFromList(sv, savedList)} aria-label={`Retirer ${sv.name} de la liste`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10.5 10.5v6M13.5 10.5v6" /></svg>
              </button>
            {/if}
            {#if !(category.saved && (hubPanel || (!savedList && !category.shared)))}
            <button class="n-main" onclick={() => { if (swiped) { swiped = null; return; } nearby.find((n) => n.f === f)?.saved ? openPlace({ ...nearby.find((n) => n.f === f).saved }) : openFeature(f); }}>
              <span class="n-dot" style:--fam={category.saved ? (category.shared ? category.color : listOf(nearby.find((n) => n.f === f)?.saved?.lists?.[0]).color) : famColor(category)} aria-hidden="true"></span>
              <span class="r-text">
                <span class="r-name">{displayName(f, category)}</span>
                {#if category.transit}
                  {#if sd?.status === 'ok'}
                    {#each sd.data.lines.slice(0, 4) as l}
                      <span class="n-dep">
                        <span class="badge small" class:round={l.mode === 'SUBWAY' || l.mode === 'METRO'} style:background={l.color} style:color={l.textColor}>{l.line}</span>
                        <span class="n-dir">{l.headsign}</span>
                        <span class="n-time">{fmtWait(l.times[0], now)}</span>
                      </span>
                    {/each}
                  {:else if sd?.status === 'loading'}
                    <span class="r-meta">Prochains passages…</span>
                  {:else if sd?.status === 'none'}
                    <span class="r-meta">Aucun passage dans l'heure</span>
                  {:else}
                    <span class="r-meta">{typeLabel('', f.properties.subclass) || 'Station'} · touchez pour les horaires</span>
                  {/if}
                {:else}
                <span class="r-meta">{category.saved ? [nearby.find((n) => n.f === f)?.saved?.type, nearby.find((n) => n.f === f)?.saved?.address].filter(Boolean).join(' · ') || 'Lieu enregistré' : typeLabel('', f.properties.subclass) || category.label}{#if st?.open != null}{' · '}<span class:is-open={st.open} class:is-closed={!st.open}>{st.label}</span>{/if}</span>
                {/if}
              </span>
              <span class="n-dist">{fmtDistance(d)}</span>
            </button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if openAt && openCounts?.unknown && !category?.saved}
        <button class="unknown-row" onclick={() => { showUnknown = !showUnknown; applyOpenFilter(); }}>
          {showUnknown ? 'Masquer' : 'Afficher'} les {openCounts.unknown} lieux aux horaires inconnus
          <small>Personne ne les a encore indiqués sur OpenStreetMap : certains sont peut-être ouverts.</small>
        </button>
      {/if}
    </section>
  {/if}
</div>

<style>
  :global(:root) {
    --accent: #2a5bd7;
    --ink: #1c1d1f;
    --muted: #6c7077;
    --line: #ececee;
    --card: #ffffff;
    --fill: #f3f3f5;
    --fav: #D63A7A;
    --open: #1e8e3e;
    --closed: #c5221f;
    --shadow-float: 0 0 0 0.5px rgb(0 0 0 / 0.06), 0 2px 6px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.08);
    --shadow-chip: 0 0 0 0.5px rgb(0 0 0 / 0.07), 0 1px 4px rgb(0 0 0 / 0.12);
    --shadow-sheet: 0 -1px 0 rgb(0 0 0 / 0.04), 0 -8px 30px rgb(0 0 0 / 0.12);
    --ui: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --page: #f6f4f0;
    --accent-btn: #2a5bd7;
    --soft-accent: #f5f8ff;
    --me-bg: #e8eefc;
    --grip: #d8d8dc;
    --faint: #b4b7bc;
    --rail: #c9ccd1;
    --walk-rail: #9aa3ae;
    --end: #d93a2f;
    color-scheme: light;
  }
  /* Mode sombre : suit le réglage du téléphone. */
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --accent: #6b9bff;
      --ink: #eceef1;
      --muted: #9aa0a7;
      --line: #30343b;
      --card: #1c1f24;
      --fill: #2a2e35;
      --fav: #f06ba0;
      --open: #4cc46b;
      --closed: #ff6b61;
      --shadow-float: 0 0 0 0.5px rgb(255 255 255 / 0.06), 0 2px 8px rgb(0 0 0 / 0.5), 0 8px 24px rgb(0 0 0 / 0.4);
      --shadow-chip: 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 1px 4px rgb(0 0 0 / 0.5);
      --shadow-sheet: 0 -1px 0 rgb(255 255 255 / 0.05), 0 -8px 30px rgb(0 0 0 / 0.5);
      --page: #1e2126;
      --accent-btn: #3a6fe0;
      --soft-accent: #1f2836;
      --me-bg: #22304a;
      --grip: #4a4f57;
      --faint: #5d636b;
      --rail: #4a4f57;
      --walk-rail: #6f7782;
      --end: #ff6b61;
      color-scheme: dark;
    }
  }
  :global(html, body) {
    margin: 0; height: 100%; overflow: hidden; background: var(--page);
    font-family: var(--ui); color: var(--ink); -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
  }
  :global(button) { font: inherit; color: inherit; }
  :global(:focus-visible) { outline: 3px solid var(--accent); outline-offset: 2px; }

  .app { position: fixed; inset: 0; }
  .map { position: absolute; inset: 0; }
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  svg .solid { fill: currentColor; stroke: none; }

  /* ——— Haut d'écran ——— */
  .top {
    position: absolute; z-index: 3; left: 0; right: 0;
    top: env(safe-area-inset-top); padding: 10px 12px 0; pointer-events: none;
    display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px;   /* minmax(0) : le contenu ne peut pas élargir la colonne */
  }
  .top > * { pointer-events: auto; min-width: 0; }
  .search {
    max-width: 440px;
    background: var(--card); border-radius: 28px; box-shadow: var(--shadow-float);
    display: grid; grid-template-columns: 48px 1fr auto; align-items: center;
  }
  .search.open { border-radius: 24px; }
  .lens { width: 20px; height: 20px; justify-self: center; color: var(--muted); stroke-width: 2.2; }
  input {
    border: 0; background: none; font: inherit; font-size: 17px; color: var(--ink);
    padding: 15px 0; min-width: 0; outline: none; width: 100%;
  }
  input::placeholder { color: var(--muted); }
  input::-webkit-search-cancel-button { display: none; }
  .icon-btn { border: 0; background: none; width: 46px; height: 46px; cursor: pointer; display: grid; place-items: center; color: var(--muted); }
  .icon-btn svg { width: 20px; height: 20px; stroke-width: 2; }
  .icon-btn:disabled { opacity: 0.35; cursor: default; }

  .results { grid-column: 1 / -1; list-style: none; margin: 0; padding: 6px 0 8px; border-top: 1px solid var(--line); max-height: 60vh; overflow-y: auto; }
  .results button {
    display: grid; grid-template-columns: 48px 1fr; align-items: center; width: 100%; text-align: left;
    border: 0; background: none; padding: 9px 16px 9px 0; cursor: pointer;
  }
  .results button:hover, .results button.active { background: var(--fill); }
  .r-icon { justify-self: center; width: 32px; height: 32px; border-radius: 50%; background: var(--fill); display: grid; place-items: center; color: var(--muted); }
  .r-icon svg { width: 18px; height: 18px; }
  .r-icon.cat-icon::after { content: ''; width: 12px; height: 12px; border-radius: 50%; background: var(--fam); }
  .me-icon { background: var(--me-bg); color: var(--accent); }
  .r-text { display: grid; gap: 1px; min-width: 0; }
  .r-name { font-size: 16px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .r-meta { font-size: 14px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { padding: 12px 16px 12px 48px; color: var(--muted); font-size: 15px; line-height: 1.4; }

  /* La zone qui défile garde de la place autour des boutons pour ne pas rogner leur ombre,
     et s'estompe à droite pour indiquer qu'on peut faire défiler. */
  .chips {
    display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
    margin: -4px -12px -16px; padding: 4px 12px 16px;
    -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 32px), transparent);
            mask-image: linear-gradient(90deg, #000 calc(100% - 32px), transparent);
  }
  .chips::-webkit-scrollbar { display: none; }
  .chip {
    flex: none; display: inline-flex; align-items: center; gap: 7px;
    height: 36px; padding: 0 14px 0 12px; border: 0; border-radius: 18px;
    background: var(--card); box-shadow: var(--shadow-chip); font-size: 14.5px; font-weight: 500; cursor: pointer;
  }
  .chip-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--fam); }
  .chip.on { background: var(--fam); color: #fff; }
  .chip.on .chip-dot { background: #fff; }

  /* ——— Panneau d'itinéraire ——— */
  .dir-card {
    background: var(--card); border-radius: 22px; box-shadow: var(--shadow-float);
    display: grid; grid-template-columns: 44px 1fr 46px; align-items: center; padding: 4px 0;
  }
  .back { width: 44px; color: var(--ink); }
  .fields { display: grid; position: relative; }
  .field { display: grid; grid-template-columns: 22px 1fr; align-items: center; min-height: 44px; }
  .field + .field { border-top: 1px solid var(--line); }
  .field-mark { width: 10px; height: 10px; border-radius: 50%; justify-self: center; }
  .field-mark.from { border: 2.5px solid var(--ink); width: 7px; height: 7px; }
  .field-mark.to { background: var(--end); }
  .fields::before {
    content: ''; position: absolute; left: 10px; top: 28px; bottom: 28px; width: 2px;
    background: repeating-linear-gradient(var(--rail) 0 2px, transparent 2px 5px);
  }
  .field-btn {
    border: 0; background: none; text-align: left; padding: 11px 8px 11px 6px; font-size: 16px; cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .field-btn.placeholder { color: var(--muted); }
  .field input { padding: 11px 8px 11px 6px; font-size: 16px; }
  .field.editing { background: var(--fill); border-radius: 10px; }
  .swap svg { width: 22px; height: 22px; color: var(--ink); }
  .dir-card .results { margin-top: 4px; }
  .field.via-field { grid-template-columns: 22px 1fr 44px; }
  .field-mark.via { width: 7px; height: 7px; border-radius: 2px; border: 2.5px solid var(--muted); background: var(--card); }
  .rm-stop { width: 36px; height: 36px; color: var(--muted); }
  .rm-stop svg { width: 18px; height: 18px; }
  .add-stop { display: flex; align-items: center; gap: 10px; border: 0; background: none; color: var(--accent); font-size: 15px; font-weight: 500;
    padding: 9px 6px 9px 0; cursor: pointer; border-top: 1px solid var(--line); margin-left: 22px; }
  .add-stop svg { width: 16px; height: 16px; stroke-width: 2.2; margin-left: -22px; }
  .fields.has-add::before { bottom: 64px; }
  .steps li.stop { font-weight: 600; }
  .stop-chip { width: 10px; height: 10px; border-radius: 2px; border: 2.5px solid var(--muted); background: var(--card); }
  .leg-rail.stop { background: none; border: 2.5px solid var(--muted); border-radius: 3px; width: 8px; height: 8px; align-self: start; margin-top: 6px; }

  .modes { display: flex; gap: 6px; }
  .mode {
    flex: 1; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 3px; padding: 0 4px; white-space: nowrap; overflow: hidden;
    height: 40px; border: 0; border-radius: 20px; background: var(--card); box-shadow: var(--shadow-float);
    font-size: 14.5px; font-weight: 600; cursor: pointer; color: var(--ink); font-variant-numeric: tabular-nums;
  }
  .mode svg { width: 19px; height: 19px; flex: none; }
  @media (max-width: 400px) { .mode { font-size: clamp(12px, 3.4vw, 13.5px); } .mode svg { width: 17px; height: 17px; } }
  .mode.on { background: var(--accent-btn); color: #fff; }
  .dots { display: inline-block; width: 22px; height: 6px; background: radial-gradient(circle, currentColor 2px, transparent 2.5px) 0 0 / 8px 6px repeat-x; opacity: 0.5; animation: pulse 1s infinite; }

  /* ——— Localisation et messages ——— */
  .locate {
    position: absolute; z-index: 2; right: 12px; bottom: calc(52px + env(safe-area-inset-bottom));
    width: 48px; height: 48px; border-radius: 50%; border: 0; background: var(--card); box-shadow: var(--shadow-float);
    display: grid; place-items: center; cursor: pointer; color: var(--accent);
  }
  .routing .locate { display: none; }
  .modes-ctl { position: absolute; z-index: 2; right: 12px; bottom: calc(110px + env(safe-area-inset-bottom)); display: grid; justify-items: end; gap: 10px; }
  .round-btn {
    width: 48px; height: 48px; border-radius: 50%; border: 0; background: var(--card); box-shadow: var(--shadow-float);
    display: grid; place-items: center; cursor: pointer; color: var(--ink);
  }
  .round-btn svg { width: 22px; height: 22px; }
  .modes-pop { display: flex; gap: 10px; padding: 12px; background: var(--card); border-radius: 18px; box-shadow: var(--shadow-float); }
  .modes-pop button {
    display: grid; justify-items: center; gap: 6px; border: 0; background: none; cursor: pointer; font-size: 13px; font-weight: 600; padding: 0;
  }
  .thumb { width: 76px; height: 54px; border-radius: 12px; border: 2px solid transparent; background-size: cover; }
  .modes-pop .on .thumb { border-color: var(--accent); }
  .modes-pop .on { color: var(--accent); }
  .thumb.plan { background: linear-gradient(115deg, transparent 45%, #fff 45% 52%, transparent 52%), linear-gradient(25deg, transparent 60%, #fff 60% 66%, transparent 66%), radial-gradient(circle at 25% 70%, #d4ebcb 0 18%, transparent 19%), #f1eee8; }
  .thumb.transit { background: linear-gradient(110deg, transparent 40%, #ffbe00 40% 46%, transparent 46%), linear-gradient(20deg, transparent 52%, #0055c8 52% 58%, transparent 58%), linear-gradient(160deg, transparent 62%, #e3051c 62% 68%, transparent 68%), linear-gradient(75deg, transparent 28%, #00643c 28% 34%, transparent 34%), #f1eee8; }
  .map-hint { color: var(--accent); font-size: 14px; padding-top: 10px; padding-bottom: 6px; }
  .locate svg { width: 21px; height: 21px; }
  .locate svg.hollow .solid { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
  .locate.following { color: var(--accent); }
  .locate.busy svg { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .toast {
    position: absolute; z-index: 4; left: 12px; right: 72px; bottom: calc(52px + env(safe-area-inset-bottom));
    margin: 0; padding: 13px 16px; background: rgb(28 29 31 / 0.92); color: #fff; border-radius: 14px; font-size: 14px; max-width: 360px;
    display: flex; align-items: center; gap: 12px;
  }
  .toast button { margin-left: auto; border: 0; background: none; color: #8fb4ff; font-weight: 700; font-size: 14px; padding: 6px 2px; min-height: 36px; cursor: pointer; }

  :global(.pin) {
    width: 30px; height: 40px;
    background: no-repeat center / contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 40'%3E%3Cpath d='M15 1.5C7.5 1.5 1.5 7.4 1.5 14.7 1.5 25 15 38.5 15 38.5S28.5 25 28.5 14.7C28.5 7.4 22.5 1.5 15 1.5z' fill='%23D93A2F' stroke='%23fff' stroke-width='2'/%3E%3Ccircle cx='15' cy='14.5' r='5' fill='%23fff'/%3E%3C/svg%3E");
    filter: drop-shadow(0 3px 4px rgb(0 0 0 / 0.3));
  }
  :global(.me) { width: 24px; height: 24px; position: relative; }
  :global(.me .me-dot) {
    position: absolute; inset: 0; border-radius: 50%; background: var(--accent); box-sizing: border-box;
    border: 3px solid #fff; box-shadow: 0 0 0 10px rgb(42 91 215 / 0.16), 0 1px 4px rgb(0 0 0 / 0.3);
  }
  /* Faisceau de direction : un éventail bleu dégradé qui part du point (comme Plans et Maps) */
  :global(.me .me-beam) {
    position: absolute; left: 50%; bottom: 50%; width: 76px; height: 64px; margin-left: -38px; display: none;
    background: radial-gradient(ellipse 50% 100% at 50% 100%, rgb(42 91 215 / 0.55), rgb(42 91 215 / 0) 100%);
    clip-path: polygon(50% 100%, 6% 0, 94% 0);
  }
  :global(.me.has-heading .me-beam) { display: block; }
  :global(.me.navigating .me-beam), :global(.me.navigating .me-dot) { display: none; }

  .results .recents-head { display: flex; padding-right: 16px; justify-content: space-between; align-items: center; font-weight: 600; color: var(--ink) !important; }
  .results .link { width: auto; flex: none; display: inline; padding: 4px 0; }
  .link { border: 0; background: none; color: var(--accent); font: inherit; font-weight: 500; cursor: pointer; padding: 4px 0; }

  /* ——— Fiches ——— */
  .sheet {
    position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; box-sizing: border-box;
    max-height: 46vh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--card); border-radius: 26px 26px 0 0; box-shadow: var(--shadow-sheet);
    padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
    animation: rise 280ms cubic-bezier(0.2, 0.9, 0.25, 1);
  }
  @keyframes rise { from { transform: translateY(60px); opacity: 0.4; } }
  /* Poignée : barre discrète, mais zone de toucher confortable (44 px) */
  .grip {
    display: block; width: 72px; height: 22px; margin: -6px auto 4px; padding: 0; border: 0; background: none; cursor: pointer;
    position: relative;
  }
  .grip::before { content: ''; position: absolute; left: 18px; right: 18px; top: 8px; height: 5px; border-radius: 3px; background: var(--grip); }
  .grip[hidden] { visibility: hidden; display: block; }
  .close {
    position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%;
    border: 0; background: var(--fill); cursor: pointer; display: grid; place-items: center; color: var(--muted);
  }
  .close svg { width: 16px; height: 16px; stroke-width: 2.4; }
  /* Zone de toucher d'au moins 44 px autour des petits boutons ronds */
  .close::after, .share::after { content: ''; position: absolute; inset: -6px; }
  .results .list-foot .link { min-height: 40px; }
  .rm-stop { width: 44px; height: 44px; }
  /* ——— Choix de l'itinéraire ——— */
  .route-cards { list-style: none; margin: 2px 0 6px; padding: 0; display: grid; gap: 6px; }
  .route-cards li { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 9px 10px 9px 14px;
    border-radius: 14px; background: var(--fill); border: 1.5px solid transparent; }
  .route-cards li.on { border-color: var(--accent); background: var(--soft-accent); }
  .rc-main { display: grid; gap: 2px; text-align: left; border: 0; background: none; padding: 0; cursor: pointer; min-width: 0; }
  .rc-main { gap: 0; }
  .rc-dur { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.25; }
  .rc-sub { font-size: 13.5px; color: var(--muted); }
  .rc-tag { font-size: 13px; color: var(--open); font-weight: 600; }
  .route-cards li:not(:first-child) .rc-tag { color: var(--muted); font-weight: 500; }
  .go { display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 12px; background: #1E9E4A; color: #fff;
    font-size: 15px; font-weight: 600; padding: 0 14px; height: 40px; cursor: pointer; }
  .go svg { width: 14px; height: 14px; }
  .go.wide { width: calc(100% - 40px); justify-content: center; margin: 4px 20px 6px; }
  .traffic-note { margin-top: 8px; }

  /* ——— Guidage ——— */
  .navigating .modes-ctl, .navigating .locate { display: none; }
  .navigating .toast { bottom: calc(96px + env(safe-area-inset-bottom)); right: 12px; }
  .nav-top {
    position: absolute; z-index: 5; left: 10px; right: 10px; top: calc(10px + env(safe-area-inset-top));
    background: #1D3A86; color: #fff; border-radius: 22px; box-shadow: var(--shadow-float); padding: 14px 16px; max-width: 520px;
  }
  .nav-top.arrived { background: #1E7A3E; }
  .nav-main { display: grid; grid-template-columns: 52px 1fr; gap: 12px; align-items: center; }
  .nav-icon { width: 52px; height: 52px; display: grid; place-items: center; }
  .nav-icon svg { width: 46px; height: 46px; stroke-width: 2.6; transition: transform 0.2s; }
  .nav-icon .solid { fill: #fff; }
  .nav-icon .hole { fill: #1D3A86; stroke: none; }
  .nav-icon .badge { font-size: 15px; }
  .nav-txt { display: grid; gap: 1px; min-width: 0; }
  .nav-dist { font-size: 30px; font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
  .nav-text { font-size: 18px; font-weight: 600; line-height: 1.25; }
  .nav-sub { font-size: 14px; opacity: 0.85; }
  .nav-then { margin: 10px 0 0; padding-top: 9px; border-top: 1px solid rgb(255 255 255 / 0.2); font-size: 14.5px; opacity: 0.9;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nav-bottom {
    position: absolute; z-index: 5; left: 0; right: 0; bottom: 0; display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center;
    padding: 12px 14px calc(12px + env(safe-area-inset-bottom)); background: var(--card); box-shadow: var(--shadow-sheet); border-radius: 22px 22px 0 0;
  }
  .nav-eta { display: grid; text-align: left; border: 0; background: none; padding: 4px 6px; cursor: pointer; min-width: 0; }
  .nav-eta strong { font-size: 22px; font-variant-numeric: tabular-nums; }
  .nav-eta span { font-size: 14px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nav-btn { width: 48px; height: 48px; border-radius: 50%; border: 0; background: var(--fill); display: grid; place-items: center; cursor: pointer; color: var(--ink); }
  .nav-btn svg { width: 22px; height: 22px; }
  .nav-end { height: 48px; padding: 0 22px; border: 0; border-radius: 24px; background: var(--closed); color: #fff; font-weight: 700; font-size: 16px; cursor: pointer; }
  .nav-recenter { position: absolute; z-index: 5; left: 50%; transform: translateX(-50%); bottom: calc(96px + env(safe-area-inset-bottom));
    display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px; border: 0; border-radius: 22px;
    background: var(--card); color: var(--accent); font-weight: 700; box-shadow: var(--shadow-float); cursor: pointer; }
  .nav-recenter svg { width: 16px; height: 16px; }
  .nav-list { bottom: calc(72px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; z-index: 4; }
  .nav-list h1 { margin-top: 8px; }
  .steps li.done { color: var(--faint); }
  .steps li.now { font-weight: 700; color: var(--accent); }
  :global(.me.navigating) {
    width: 0; height: 0; border-radius: 0; background: none; box-shadow: none;
    border-left: 13px solid transparent; border-right: 13px solid transparent; border-bottom: 30px solid var(--accent);
    filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 2px 4px rgb(0 0 0 / 0.35));
  }
  /* ——— Mes lieux ——— */
  .list-dot { flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--lc); justify-self: center; }
  .list-dot img { width: 58%; height: 58%; }
  .pinned { display: flex; gap: 14px; overflow-x: auto; padding: 8px 2px 6px; scrollbar-width: none; }
  .pinned::-webkit-scrollbar { display: none; }
  .results .pinned-li { padding: 4px 14px 2px; }
  .results .pinned .pin-btn, .pin-btn { display: grid; justify-items: center; align-content: start; gap: 3px; width: 64px; flex: none;
    padding: 0; border: 0; background: none; cursor: pointer; grid-template-columns: none; }
  .pin-circle { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-btn); color: #fff; }
  .pin-circle svg { width: 22px; height: 22px; }
  .pin-btn.unset .pin-circle { background: var(--fill); color: var(--accent); }
  .pin-name { font-size: 12.5px; font-weight: 600; max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pin-sub { font-size: 11.5px; color: var(--muted); }
  .pin-btn.unset .pin-sub { color: var(--accent); }
  .hub-h { font-size: 15px; font-weight: 700; margin: 18px 0 4px; }
  .hub-lists, .pick-lists { list-style: none; margin: 0; padding: 0; }
  .hub-lists button, .pick-lists label { display: grid; grid-template-columns: 34px 1fr auto auto; gap: 12px; align-items: center; width: 100%;
    min-height: 52px; border: 0; background: none; padding: 0; text-align: left; cursor: pointer; border-bottom: 1px solid var(--line); font-size: 16px; }
  .pick-lists label { grid-template-columns: 32px 1fr auto 28px; }
  .pick-lists input { width: 22px; height: 22px; accent-color: var(--accent-btn); }
  .pl-count { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; }
  .chev-r { width: 18px; height: 18px; color: var(--faint); }
  .new-list { display: flex; gap: 8px; align-items: center; min-height: 50px; border-bottom: 1px solid var(--line); }
  .new-list input { flex: 1; border: 0; background: none; font: inherit; font-size: 16px; color: var(--ink); padding: 10px 0; min-width: 0; }
  .new-list .link:disabled { opacity: 0.4; }
  .pin-toggle, .saved-toggle { display: flex; align-items: center; gap: 10px; font-size: 15px; padding: 14px 0 6px; cursor: pointer; }
  .pin-toggle input, .saved-toggle input { width: 20px; height: 20px; accent-color: var(--accent-btn); }
  .modes-pop .saved-toggle { grid-column: 1 / -1; font-size: 13px; font-weight: 600; padding: 4px 0 0; }
  .modes-pop { flex-wrap: wrap; }
  .go.wide.done { width: 100%; margin: 14px 0 4px; height: 46px; background: var(--accent-btn); }
  .hub-rows .row-btn span { display: grid; }
  .why.warn { color: #D0731B; font-weight: 600; }
  .back-link { margin: 6px 0 2px; font-size: 15px; }
  .list-title { display: flex; align-items: center; gap: 10px; }
  .list-actions { display: flex; gap: 18px; align-items: center; margin-top: 8px; }
  .list-actions .link { font-size: 15px; }
  .link.danger { color: var(--closed); }
  .qr { display: grid; place-items: center; margin: 14px auto 4px; width: min(260px, 70vw); background: #fff; border-radius: 12px; padding: 8px; }
  .qr :global(svg) { width: 100%; height: auto; display: block; }
  .pw { display: grid; gap: 6px; font-size: 14px; color: var(--muted); margin-top: 14px; }
  .pw input { font: inherit; font-size: 16px; color: var(--ink); background: var(--fill); border: 0; border-radius: 12px; padding: 12px 14px; }
  .action.saved { color: var(--lc, var(--fav)); }
  .action.saved svg path { fill: var(--lc, var(--fav)); stroke: var(--lc, var(--fav)); }
  /* ——— Photos ——— */
  .photos { display: flex; gap: 6px; overflow-x: auto; scroll-snap-type: x mandatory; margin: 16px -20px 0; padding: 0 20px; scrollbar-width: none; }
  .photos::-webkit-scrollbar { display: none; }
  .ph { flex: none; position: relative; width: 72%; aspect-ratio: 4 / 3; border: 0; padding: 0; border-radius: 14px; overflow: hidden;
    background: var(--fill); cursor: zoom-in; scroll-snap-align: start; scroll-margin-left: 20px; }
  .ph:not(:first-child) { width: 46%; }
  .photos.single .ph { width: 100%; aspect-ratio: 16 / 10; }
  .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph-count { position: absolute; left: 8px; bottom: 8px; background: rgb(0 0 0 / 0.6); color: #fff; font-size: 12.5px; font-weight: 600;
    padding: 4px 9px; border-radius: 10px; }
  .ph-credit { font-size: 11.5px; color: var(--muted); margin: 5px 0 0; }
  .ph-credit a { color: inherit; text-decoration: none; }
  .viewer { position: fixed; inset: 0; z-index: 20; background: #000; color: #fff; }
  .viewer-strip { position: absolute; inset: 0; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none;
    touch-action: pan-x; transition: opacity 0.15s; }
  .viewer-strip.zoomed { overflow: hidden; touch-action: none; }
  .viewer-slide img { transition: transform 0.12s ease-out; will-change: transform; user-select: none; -webkit-user-drag: none; }
  .viewer-strip::-webkit-scrollbar { display: none; }
  .viewer-slide { flex: none; width: 100%; height: 100%; display: grid; place-items: center; scroll-snap-align: center; }
  .viewer-slide img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .viewer-top { position: absolute; left: 0; right: 0; top: 0; display: flex; justify-content: space-between; align-items: center;
    padding: calc(10px + env(safe-area-inset-top)) 12px 10px 18px; font-size: 15px; font-weight: 600;
    background: linear-gradient(rgb(0 0 0 / 0.55), transparent); }
  .viewer-close, .viewer-nav { width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgb(255 255 255 / 0.16); color: #fff;
    display: grid; place-items: center; cursor: pointer; }
  .viewer-close svg, .viewer-nav svg { width: 22px; height: 22px; stroke-width: 2.2; }
  .viewer-nav { position: absolute; top: 50%; transform: translateY(-50%); }
  .viewer-nav.prev { left: 12px; }
  .viewer-nav.next { right: 12px; }
  .viewer-nav:disabled { opacity: 0; pointer-events: none; }
  @media (hover: none) { .viewer-nav { display: none; } }
  .viewer-credit { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; padding: 14px 18px calc(14px + env(safe-area-inset-bottom));
    font-size: 12.5px; background: linear-gradient(transparent, rgb(0 0 0 / 0.6)); }
  .viewer-credit a { color: rgb(255 255 255 / 0.85); text-decoration: none; }
  .swipe-row { position: relative; overflow: hidden; }
  .nearby button { box-sizing: border-box; }
  .swipe-row .n-main { position: relative; z-index: 1; background: var(--card); transition: width 0.2s ease; }
  /* Poubelle visible : la ligne se rétrécit (le texte reste lisible) au lieu de glisser hors de la fiche */
  .swipe-row.swiped .n-main { width: calc(100% - 72px); }
  .nearby .swipe-del { position: absolute; padding: 0; right: 0; top: 0; bottom: 0; width: 72px; border: 0; border-top: 1px solid var(--line);
    background: var(--closed); color: #fff; display: grid; grid-template-columns: 1fr; place-items: center; cursor: pointer; }
  .nearby button.swipe-del:hover { background: color-mix(in srgb, var(--closed) 85%, #000); }
  /* Ordinateur (souris) : au survol d'une ligne, une petite poubelle remplace la distance */
  @media (hover: hover) and (pointer: fine) {
    .swipe-row:not(.swiped) .swipe-del { z-index: 2; top: 50%; bottom: auto; right: 14px; width: 38px; height: 38px; margin-top: -19px;
      border: 0; border-radius: 50%; background: var(--fill); color: var(--closed); opacity: 0; transition: opacity 0.12s; }
    .swipe-row:not(.swiped):hover .swipe-del, .swipe-row:not(.swiped) .swipe-del:focus-visible { opacity: 1; }
    .nearby .swipe-row:not(.swiped) button.swipe-del:hover { background: color-mix(in srgb, var(--closed) 16%, var(--card)); }
    .swipe-row:not(.swiped):hover .n-dist { visibility: hidden; }
  }
  .swipe-del svg { width: 22px; height: 22px; stroke-width: 2; }
  .chip-heart { width: 15px; height: 15px; fill: var(--fam); stroke: none; }
  .chip.on .chip-heart { fill: #fff; }
  .chip.edit.on-edit { background: var(--accent-btn); color: #fff; }
  .compass svg { width: 24px; height: 24px; transition: transform 0.1s; }
  .compass .north { fill: var(--closed); }
  .share {
    position: absolute; top: 14px; right: 54px; width: 32px; height: 32px; border-radius: 50%;
    border: 0; background: var(--fill); cursor: pointer; display: grid; place-items: center; color: var(--muted);
  }
  .share svg { width: 17px; height: 17px; stroke-width: 2.1; }
  .share ~ h1 { margin-right: 88px; }
  .close ~ h1 { margin-right: 44px; }
  .act-label { display: flex; flex-direction: column; align-items: center; line-height: 1.15; }
  .act-label small { font-size: 11.5px; font-weight: 500; opacity: 0.9; margin-top: 1px; }
  .photo { margin: 16px 0 0; }
  .photo img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 14px; background: var(--fill); display: block; }
  .photo figcaption { font-size: 11.5px; color: var(--muted); margin-top: 5px; }
  .photo figcaption a { color: inherit; text-decoration: none; }
  .about { margin-top: 18px; }
  .about h2 { font-size: 17px; font-weight: 700; margin: 0 0 6px; }
  .about p { margin: 0; font-size: 15px; line-height: 1.45; }
  .about p.clamped { display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .about .more { font-weight: 700; margin-top: 2px; }
  .about .credit { margin-top: 6px; }
  .about .credit a { color: var(--accent); text-decoration: none; }
  h1 { font-size: 24px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; margin: 2px 44px 2px 0; text-wrap: balance; }
  .kind { margin: 0; color: var(--muted); font-size: 15px; }
  .kind::first-letter { text-transform: uppercase; }
  .status { margin: 6px 0 0; font-size: 15.5px; font-weight: 600; }
  .status.is-open, .r-meta .is-open { color: var(--open); }
  .status.is-closed, .r-meta .is-closed { color: var(--closed); }
  .muted { color: var(--muted); font-weight: 400; }

  .promise-link { color: inherit; font-weight: 600; text-decoration: underline; }
  /* ——— Devantures (Panoramax) ——— */
  :global(.facade) { display: block; position: relative; overflow: hidden; container-type: inline-size; aspect-ratio: 4 / 3; background: var(--fill); }
  :global(.facade img) { position: absolute; width: 800cqw; height: 400cqw; max-width: none; left: calc(50cqw - var(--fx) * 800cqw); top: -155cqw; }
  .facade-card { display: block; width: 100%; padding: 0; border: 0; margin: 0; border-radius: 14px; overflow: hidden; cursor: zoom-in; position: relative; background: none; }
  .facade-card :global(.facade) { aspect-ratio: 16 / 10; }
  .ph-tag { position: absolute; left: 10px; top: 10px; background: rgb(0 0 0 / 0.55); color: #fff; font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 8px; }
  .n-thumb { display: block; width: 44px; height: 44px; border-radius: 10px; overflow: hidden; }
  .n-thumb :global(.facade) { aspect-ratio: 1; height: 100%; }
  .n-thumb :global(.facade img) { top: -170cqw; }
  .nearby li:has(.n-thumb) button.n-main { grid-template-columns: 44px 1fr auto; }
  :global(.pin-photo) { display: block; padding: 0; border: 3px solid #fff; border-radius: 50%; overflow: hidden; background: var(--fill); cursor: pointer;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.3); }
  :global(.pin-photo.s64) { width: 64px; height: 64px; }
  :global(.pin-photo.s40) { width: 40px; height: 40px; }
  :global(.pin-photo .facade) { width: 100%; height: 100%; aspect-ratio: 1; }
  :global(.pin-photo .facade img) { top: -170cqw; }
  .pano { position: absolute; inset: 0; overflow-x: auto; overflow-y: hidden; display: flex; align-items: center; scrollbar-width: none; }
  .pano img { height: min(100vh, 50vw * 1); max-width: none; display: block; }
  @media (max-aspect-ratio: 1/1) { .pano img { height: 60vh; } }

  /* ——— Filtre « ouvert à… » ——— */
  .open-pills { display: flex; gap: 8px; margin: 10px 0 2px; align-items: center; overflow-x: auto; scrollbar-width: none; }
  .open-pills > * { flex: none; }
  .opill { display: inline-flex; align-items: center; gap: 4px; height: 34px; padding: 0 12px; border-radius: 17px; border: 1px solid var(--line);
    background: var(--card); color: var(--ink); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .opill .chev { width: 16px; height: 16px; }
  .opill.on { background: var(--accent-btn); border-color: var(--accent-btn); color: #fff; }
  .opill.on .chev { color: #fff; }
  .opill-x { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--fill); color: var(--muted); display: grid; place-items: center; cursor: pointer; }
  .opill-x svg { width: 15px; height: 15px; stroke-width: 2.4; }
  .moment { margin: 8px 0 4px; padding: 10px; background: var(--fill); border-radius: 14px; display: grid; gap: 8px; }
  .moment-quick { display: flex; gap: 6px; flex-wrap: wrap; }
  .moment-quick button { height: 32px; padding: 0 12px; border-radius: 16px; border: 0; background: var(--card); color: var(--accent); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .moment-sel { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .moment-sel select { font: inherit; font-size: 16px; color: var(--ink); background: var(--card); border: 0; border-radius: 10px; padding: 9px 10px; }
  .unknown-row { display: block; width: 100%; text-align: left; border: 0; border-top: 1px solid var(--line); background: none; padding: 14px 0 4px;
    font: inherit; font-size: 15px; font-weight: 600; color: var(--accent); cursor: pointer; }
  .unknown-row small { display: block; font-weight: 400; font-size: 13px; color: var(--muted); margin-top: 3px; }

  /* ——— Fiche lieu, façon Plans ——— */
  .share.left { left: 14px; right: auto; }
  .phead { text-align: center; margin: 0 44px; }
  .phead h1 { margin: 2px 0; }
  .glance { margin: 8px 0 0; text-align: center; font-size: 15px; display: flex; flex-wrap: wrap; justify-content: center; gap: 0 6px; }
  .glance .st { font-weight: 600; }
  .glance .is-open { color: var(--open); }
  .glance .is-closed { color: var(--closed); }
  .glance .dot { color: var(--muted); }
  .fresh { margin: 3px 0 0; text-align: center; font-size: 13px; color: var(--open); display: flex; justify-content: center; align-items: center; gap: 4px; }
  .fresh svg { width: 14px; height: 14px; stroke-width: 2.6; }
  .fresh.old { color: var(--muted); }
  /* Boutons d'action : même largeur, pictogramme au-dessus du texte ; un seul bouton prend toute la largeur */
  .actions { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; margin: 14px 0 0; }
  .action {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 56px; padding: 6px 4px;
    border-radius: 14px; border: 0; cursor: pointer; text-decoration: none; font-size: 13.5px; font-weight: 600; line-height: 1.1;
    background: var(--fill); color: var(--accent); box-sizing: border-box; min-width: 0;
  }
  .action span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .action:active { filter: brightness(0.94); }
  .action svg { width: 21px; height: 21px; flex: none; }
  .action.primary { background: var(--accent-btn); color: #fff; }
  .actions.solo .action { flex-direction: row; min-height: 48px; font-size: 15.5px; gap: 8px; }
  .action.primary .solid { fill: currentColor; }
  /* Bandeau : libellé discret au-dessus, valeur en gras, séparés par un trait */
  .strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); margin: 14px 0 0; }
  .strip div { padding: 0 10px; border-left: 1px solid var(--line); }
  .strip div:first-child { border-left: 0; padding-left: 0; }
  .strip dt { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.02em; }
  .strip dd { margin: 2px 0 0; font-size: 15px; font-weight: 600; }
  /* Sections du bas */
  .psec { margin-top: 22px; }
  .psec h2 { font-size: 17px; font-weight: 700; margin: 0 0 8px; }
  .psec .small { font-size: 14px; margin: 0 0 4px; }
  .link.ext { font-weight: 600; text-decoration: none; display: inline-block; padding: 6px 0; }
  .good { list-style: none; margin: 0; padding: 12px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; background: var(--fill); border-radius: 14px; font-size: 14.5px; }
  .good li { display: flex; align-items: center; gap: 7px; }
  .good svg { width: 16px; height: 16px; flex: none; stroke-width: 2.4; color: var(--open); }
  .good li.no svg { color: var(--closed); }
  .details { margin: 0; background: var(--fill); border-radius: 14px; padding: 0 14px; }
  .details div { padding: 10px 0; border-top: 1px solid var(--line); }
  .details div:first-child { border-top: 0; }
  .details dt { font-size: 13px; color: var(--muted); }
  .details dd { margin: 2px 0 0; font-size: 15.5px; overflow-wrap: anywhere; }
  .details a { color: var(--accent); text-decoration: none; }
  .sc-note { margin: 14px 0 0; font-size: 14.5px; color: var(--muted); }
  .end-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 22px; }
  .end-btn { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 46px; border: 0; border-radius: 14px; background: var(--fill);
    color: var(--accent); font: inherit; font-size: 14.5px; font-weight: 600; text-decoration: none; cursor: pointer; padding: 0 8px; text-align: center; }
  .end-btn svg { width: 19px; height: 19px; flex: none; }
  .end-btn.on svg path:first-child { fill: currentColor; }
  .contrib { margin: 14px 0 52px; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .contrib a { color: var(--accent); text-decoration: none; font-weight: 600; }
  /* Barre flottante en bas à droite de la fiche */
  .fab-bar { position: sticky; bottom: 0; height: 0; display: flex; justify-content: flex-end; z-index: 2; pointer-events: none; }
  .fab, .pmenu { pointer-events: auto; }
  .fab { position: absolute; bottom: 4px; right: -6px; display: flex; gap: 2px; padding: 4px; border-radius: 26px; background: var(--card);
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.18), 0 0 0 0.5px rgb(0 0 0 / 0.08); }
  .fab button { width: 42px; height: 42px; border-radius: 50%; border: 0; background: var(--fill); color: var(--accent); display: grid; place-items: center; cursor: pointer; }
  .fab svg { width: 21px; height: 21px; stroke-width: 2; }
  .fab .solid { fill: currentColor; stroke: none; }
  .fab button.on { color: var(--fav); }
  .fab button.on path { fill: currentColor; }
  .pmenu { position: absolute; bottom: 62px; right: -6px; min-width: 220px; background: var(--card); border-radius: 14px; overflow: hidden;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.2), 0 0 0 0.5px rgb(0 0 0 / 0.08); }
  .pmenu button { display: block; width: 100%; text-align: left; border: 0; background: none; font: inherit; font-size: 15.5px; color: var(--ink);
    padding: 13px 16px; border-top: 1px solid var(--line); cursor: pointer; }
  .pmenu button:first-child { border-top: 0; }
  .r-icon.fav-icon { color: var(--fav); background: color-mix(in srgb, var(--fav) 12%, transparent); }
  .r-icon.fav-icon .solid { fill: currentColor; stroke: none; }
  .action.primary .on-solid { stroke: var(--accent-btn); stroke-width: 2; }

  .rows { list-style: none; margin: 16px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .row { display: grid; grid-template-columns: 24px 1fr; gap: 16px; align-items: center; min-height: 52px; border-bottom: 1px solid var(--line); font-size: 15.5px; }
  .row > svg { width: 22px; height: 22px; color: var(--accent); }
  .row.muted > svg { color: var(--muted); }
  .row-btn { display: flex; justify-content: space-between; align-items: center; border: 0; background: none; padding: 14px 0; cursor: pointer; text-align: left; }
  .chev { width: 20px; height: 20px; color: var(--muted); transition: transform 200ms; }
  .chev.flip { transform: rotate(180deg); }
  .selectable { user-select: all; }
  .week-row { border-bottom: 1px solid var(--line); padding: 2px 0 12px 40px; }
  .week { border-collapse: collapse; font-size: 15px; font-variant-numeric: tabular-nums; }
  .week th { text-align: left; font-weight: 400; color: var(--muted); padding: 4px 20px 4px 0; text-transform: capitalize; }
  .week td { padding: 4px 0; }
  .week tr.today th, .week tr.today td { color: var(--ink); font-weight: 600; }

  .nearby { list-style: none; margin: 12px -20px 0; padding: 0; }
  .nearby button {
    display: grid; grid-template-columns: 20px 1fr auto; gap: 14px; align-items: center; width: 100%;
    border: 0; background: none; padding: 11px 20px; text-align: left; cursor: pointer; border-top: 1px solid var(--line);
  }
  .nearby button:hover { background: var(--fill); }
  .n-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--fam); box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--line); justify-self: center; }
  .n-dist { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; }

  /* ——— Résultat d'itinéraire ——— */
  .empty { color: var(--muted); font-size: 15.5px; line-height: 1.45; margin: 4px 0 8px; }
  .retry { border: 0; background: var(--fill); color: var(--accent); font-weight: 600; padding: 10px 16px; border-radius: 12px; cursor: pointer; }
  .summary { display: grid; gap: 2px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .big { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .sub { margin: 0; color: var(--muted); font-size: 15px; }
  .steps { list-style: none; margin: 0; padding: 0; counter-reset: step; }
  .steps li {
    display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: baseline;
    padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 15.5px; line-height: 1.35;
  }
  .step-dist { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .steps .arrive { font-weight: 600; border-bottom: 0; }

  .traffic-note { font-size: 12.5px; color: var(--muted); margin: 6px 0 0; line-height: 1.4; }
  .options { list-style: none; margin: 0 -20px; padding: 0; }
  .options > li + li { border-top: 1px solid var(--line); }
  .option { display: grid; gap: 6px; width: 100%; border: 0; background: none; padding: 12px 20px; text-align: left; cursor: pointer; }
  .option.on { background: var(--soft-accent); }
  .opt-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .chain { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
  .sep { color: var(--faint); font-size: 15px; }
  .walk-chip { display: grid; place-items: center; color: var(--muted); }
  .walk-chip svg { width: 18px; height: 18px; }
  .badge {
    display: inline-grid; place-items: center; min-width: 26px; height: 24px; padding: 0 7px; border-radius: 7px;
    font-size: 13px; font-weight: 700; line-height: 1; white-space: nowrap;
  }
  .badge.small { height: 20px; min-width: 22px; font-size: 12px; padding: 0 6px; margin-right: 4px; }
  .opt-dur { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .opt-sub { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; }
  .opt-sub strong { color: var(--ink); font-weight: 600; }
  .live { color: var(--open); font-size: 10px; vertical-align: 2px; }
  .badge.round { border-radius: 50%; width: 26px; min-width: 26px; height: 26px; padding: 0; }

  /* Prochains passages d'une station */
  .deps { margin: 18px 0 4px; }
  .deps h2 { font-size: 15px; font-weight: 700; margin: 0 0 6px; }
  .deps > p.muted { color: var(--muted); font-size: 14.5px; margin: 6px 0 10px; }
  .deps ul { list-style: none; margin: 0; padding: 0; }
  .deps li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; min-height: 48px; border-bottom: 1px solid var(--line); }
  .dep-dir { font-size: 15px; line-height: 1.25; min-width: 0; }
  .dep-times { font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; display: flex; align-items: center; gap: 2px; }
  .dep-times .first { color: var(--open); font-weight: 700; font-size: 15px; }
  .dep-times .live { width: 7px; height: 7px; border-radius: 50%; background: var(--open); margin-right: 6px; animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .row-link { color: var(--accent, #2A5BD7); text-decoration: none; padding: 14px 0; overflow-wrap: anywhere; }
  .row-link:hover { text-decoration: underline; }

  .legs { list-style: none; margin: 0; padding: 4px 20px 14px; background: var(--soft-accent); }
  .leg { display: grid; grid-template-columns: 44px 16px 1fr; gap: 10px; min-height: 52px; }
  .leg-time { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; padding-top: 1px; }
  .leg-rail { width: 6px; border-radius: 3px; justify-self: center; margin-top: 4px; }
  .leg-rail.walk { width: 4px; background: repeating-linear-gradient(var(--walk-rail) 0 4px, transparent 4px 8px); }
  .leg-rail.end { width: 12px; height: 12px; border-radius: 50%; background: var(--end); margin-top: 3px; }
  .leg-body { display: grid; gap: 3px; padding-bottom: 12px; min-width: 0; }
  .leg-place { font-size: 15px; font-weight: 600; }
  .leg-meta { font-size: 13.5px; color: var(--muted); display: flex; align-items: center; flex-wrap: wrap; }
  .credit { font-size: 12.5px; color: var(--muted); margin: 12px 0 0; }
  .credit a { color: inherit; }

  /* ——— Retours des tests : raccourcis, métro, sorties, import, promesse ——— */
  .shortcuts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 6px 12px 8px; }
  .results .shortcuts button {
    grid-template-columns: 36px 1fr; gap: 10px; padding: 8px 10px; border-radius: 14px; background: var(--fill); min-width: 0;
  }
  .sc-icon { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-btn); color: #fff; }
  .sc-icon svg { width: 19px; height: 19px; }
  .shortcuts .unset .sc-icon { background: var(--card); color: var(--accent); }
  .shortcuts .unset .r-meta { color: var(--accent); }
  .list-foot { display: grid; justify-items: start; gap: 2px; padding: 10px 16px 6px 48px; border-top: 1px solid var(--line); margin-top: 6px; }
  .results .list-foot .link { font-size: 14.5px; }
  .privacy-line { font-size: 12.5px; color: var(--muted); padding-top: 6px; }
  .chip.edit { padding: 0 12px; color: var(--muted); }
  .chip.edit svg { width: 17px; height: 17px; }
  .badge.small.round { width: 20px; min-width: 20px; height: 20px; }
  .n-dep { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 6px; font-size: 13.5px; margin-top: 3px; }
  .n-dir { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n-time { font-weight: 600; color: var(--open); font-variant-numeric: tabular-nums; }
  .exit-sq { display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: #2E8B57; flex: none; margin-right: 6px; vertical-align: -1px; }
  .leg-exit, .leg-tip { font-size: 13.5px; color: var(--ink); margin-top: 4px; display: flex; align-items: flex-start; line-height: 1.35; }
  .leg-exit .exit-sq { margin-top: 3px; }
  .car-ic { flex: none; width: 14px; height: 10px; margin: 4px 6px 0 0; border: 2px solid var(--ink); border-radius: 3px; box-sizing: border-box;
    background: linear-gradient(90deg, transparent 30%, var(--ink) 30% 40%, transparent 40% 60%, var(--ink) 60% 70%, transparent 70%); }
  .exits { margin: 18px 0 4px; }
  .exits h2 { font-size: 15px; font-weight: 700; margin: 0 0 6px; }
  .exits ul { list-style: none; margin: 0; padding: 0; }
  .exits li { display: flex; align-items: center; min-height: 40px; border-bottom: 1px solid var(--line); font-size: 14.5px; gap: 2px; }
  .exit-tag { margin-left: auto; font-size: 12px; color: var(--muted); padding-left: 8px; white-space: nowrap; }
  .why { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; line-height: 1.35; }
  .row.muted > span { padding: 10px 0; }
  .sc-row { grid-template-columns: 24px auto auto auto 1fr; gap: 12px; }
  .sc-row > svg { color: var(--muted); }
  .sc-row > span { color: var(--muted); }
  .howto { margin: 14px 0 16px; padding-left: 20px; display: grid; gap: 10px; font-size: 15px; line-height: 1.45; }
  .howto a { color: var(--accent); }
  .import-btn { display: flex; justify-content: center; align-items: center; min-height: 48px; border-radius: 14px; cursor: pointer; font-weight: 600; }
  .chip-edit { list-style: none; margin: 12px 0 8px; padding: 0; }
  .chip-edit li.ce-head { display: block; min-height: 0; padding: 18px 0 6px; font-size: 13px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .chip-edit li { display: grid; grid-template-columns: 44px 1fr 40px 40px; align-items: center; gap: 4px; border-bottom: 1px solid var(--line); min-height: 52px; }
  .chip-edit input { border: 0; background: none; font: inherit; font-size: 16px; color: var(--ink); padding: 10px 0; min-width: 0; }
  .chip-edit input::placeholder { color: var(--ink); }
  .chip-edit li.off input, .chip-edit li.off input::placeholder { color: var(--faint); }
  .chip-edit .icon-btn { width: 40px; height: 40px; }
  .chip-edit .icon-btn:disabled { opacity: 0.25; }
  .ce-toggle { width: 38px; height: 24px; border-radius: 12px; border: 0; background: var(--fam); position: relative; cursor: pointer; padding: 0; }
  .ce-toggle span { position: absolute; top: 3px; left: 17px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: left 0.15s; }
  li.off .ce-toggle { background: var(--line); }
  li.off .ce-toggle span { left: 3px; }
  .promise {
    position: absolute; z-index: 4; left: 12px; right: 12px; bottom: calc(112px + env(safe-area-inset-bottom)); max-width: 420px;
    display: grid; grid-template-columns: 26px 1fr; gap: 6px 12px; align-items: start;
    padding: 14px 16px; background: var(--card); border-radius: 18px; box-shadow: var(--shadow-float); font-size: 14.5px; line-height: 1.4;
  }
  .promise svg { width: 24px; height: 24px; color: var(--accent); margin-top: 1px; }
  .promise p { margin: 0; }
  .promise button { grid-column: 2; justify-self: end; border: 0; background: var(--accent-btn); color: #fff; font-weight: 600; border-radius: 16px; padding: 7px 16px; cursor: pointer; }

  /* ——— Grand écran : panneaux à gauche ——— */
  @media (min-width: 768px) {
    /* Grand écran : raccourcis à droite de la recherche, sur une ou deux lignes, sans défilement. */
    .top { padding: 16px 16px 0; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; right: 76px; }
    .top.dir { flex-direction: column; flex-wrap: nowrap; right: auto; }
    .search, .dir-card, .modes { width: 400px; flex: none; }
    .chips { flex: 1; min-width: 0; flex-wrap: wrap; overflow: visible; margin: 0; padding: 6px 0 0; -webkit-mask-image: none; mask-image: none; }
    .sheet {
      left: 16px; right: auto; bottom: auto; top: calc(var(--top-h, 112px) + 16px); width: 400px;
      max-height: calc(100vh - var(--top-h, 112px) - 32px);
      border-radius: 20px; padding: 18px 22px 22px; box-shadow: var(--shadow-float); animation-name: appear;
    }

    @keyframes appear { from { transform: translateY(-6px); opacity: 0; } }
    .grip { display: none; }
    .locate { bottom: 40px; right: 16px; }
    .modes-ctl { bottom: 100px; right: 16px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet, .chev { animation: none; transition: none; }
    .locate.busy svg, .dots, .dep-times .live { animation: none; }
  }

  :global(.maplibregl-ctrl-attrib) { font-family: var(--ui); font-size: 11px; }
  @media (prefers-color-scheme: dark) {
    :global(.maplibregl-ctrl-attrib) { background: rgb(28 31 36 / 0.8) !important; color: var(--muted); }
    :global(.maplibregl-ctrl-attrib a) { color: var(--muted) !important; }
    :global(.maplibregl-ctrl-attrib-button) { filter: invert(1); }
  }
  /* Flèche classique sur la carte, main fermée seulement pendant qu'on la fait glisser. */
  :global(.maplibregl-canvas-container.maplibregl-interactive) { cursor: default; }
  :global(.maplibregl-canvas-container.maplibregl-interactive:active) { cursor: grabbing; }
  :global(.maplibregl-ctrl-bottom-right) { margin-bottom: env(safe-area-inset-bottom); }
</style>
