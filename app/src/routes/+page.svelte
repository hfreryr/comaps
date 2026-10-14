<script>
  import { onMount, tick, setContext } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import '#lib/ui/base.css';
  import ModeIcon from '#lib/ui/ModeIcon.svelte';
  import { badge, streetOpts } from '#lib/routeview.js';
  import { href, host } from '#lib/links.js';
  import { empty, addRouteLayers, addPlaceLayers, routeTags as tagsFor } from '#lib/maplayers.js';
  import RouteSheet from '#lib/ui/RouteSheet.svelte';
  import NavView from '#lib/ui/NavView.svelte';
  import StreetThumb from '#lib/ui/StreetThumb.svelte';
  import PromiseBanner from '#lib/ui/PromiseBanner.svelte';
  import ChipsEditor from '#lib/ui/ChipsEditor.svelte';
  import ImportSheet from '#lib/ui/ImportSheet.svelte';
  import TransferSheet from '#lib/ui/TransferSheet.svelte';
  import ListPicker from '#lib/ui/ListPicker.svelte';
  import PhotoViewer from '#lib/ui/PhotoViewer.svelte';
  import TopBar from '#lib/ui/TopBar.svelte';
  import ResultList from '#lib/ui/ResultList.svelte';
  import CategorySheet from '#lib/ui/CategorySheet.svelte';
  import PinnedRow from '#lib/ui/PinnedRow.svelte';
  import PlaceSheet from '#lib/ui/PlaceSheet.svelte';
  import ListDot from '#lib/ui/ListDot.svelte';
  import Facade from '#lib/ui/Facade.svelte';
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
  import { exitForQuay, placeForTransfer, placeLabel } from '#lib/rame.js';
  import { ALL_CATEGORIES, CATEGORY_WORDS, FILLER, CHIPS_KEY, loadChipPrefs, categoryFor as catFor } from '#lib/categories.js';
  import { createImport } from '#lib/importflow.js';
  import { createNav } from '#lib/navflow.js';
  import { createDirections } from '#lib/directionsflow.js';
  import { createLocation } from '#lib/location.js';
  import { createScreen } from '#lib/screen.js';
  import { createSearch } from '#lib/searchflow.js';
  import { createPlace } from '#lib/placeflow.js';
  import { createMyPlaces } from '#lib/myplacesflow.js';
  import { createChips } from '#lib/chipsflow.js';
  import { createShortcuts } from '#lib/shortcutsflow.js';
  import { createMapDraw } from '#lib/mapdraw.js';
  import { createZoom } from '#lib/zoom.js';
  import { prepare, progress, navDistance, spokenDistance } from '#lib/nav.js';

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
  let viewer = $state(null);
  let placeSheetH = $state(null);    // hauteur de la fiche lieu (téléphone), pour poser la vignette de vue de la rue au-dessus
  let innerH = $state(typeof window === 'undefined' ? 800 : window.innerHeight);
  $effect(() => { if (!place) placeSheetH = null; });         // photo affichée en plein écran (indice), null : fermé
  let viewerEl = $state();
  let viewerIdx = $state(0);
  // Zoom dans la visionneuse : pincer, double-toucher, déplacer ; glisser vers le bas (sans zoom) ferme.
  let zoom = $state({ s: 1, x: 0, y: 0 });
  let dragY = $state(0);
  let gesture = null;
  let lastTap = 0;
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



  // ——— Carte ———

  // Pendant un itinéraire, les lieux de la carte s'effacent derrière le trajet.
  // Le lieu sélectionné est masqué à sa place (état « sel ») : c'est sa version agrandie qui s'affiche.
  let dimmed = false;





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



  // Sélection d'un lieu : sa propre pastille, agrandie, à la place de la petite (repère rouge pour une adresse).
  let selStates = [];


  function loadList(key, max) {
    try { return JSON.parse(localStorage.getItem(key) || '[]').slice(0, max); } catch { return []; }
  }
  function loadRecents() { return loadList(RECENTS_KEY, 8); }
  function loadObj(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
  }


  let newListName = $state('');
  let listEditing = $state(false);   // « Modifier » : une poubelle sur chaque lieu de la liste
  let swiped = $state(null);         // lieu glissé vers la gauche (poubelle visible)
  let swipeStart = null;

  // ——— Transfert vers un autre appareil (lien ou QR code) et sauvegarde dans un fichier ———
  let transfer = $state(null);       // { url, qr? }
  let backupPassword = $state('');
  let restoreFile = null;
  let restoreNeedsPw = $state(false);
  let restorePassword = $state('');
  const backupAge = $derived(lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null);

  // Les favoris apparaissent aussi sur la carte (pastille rose à cœur).
  $effect(() => {
    lists;
    const data = favData();
    map?.getSource('favs')?.setData(data);
  });


  // Temps de marche estimé sur le téléphone (distance à vol d'oiseau × 1,3, à 4,8 km/h) : rien n'est envoyé.
  const walkEta = $derived.by(() => {
    if (!me || !place) return null;
    const m = dist(me.lat, me.lon, place.lat, place.lon) * 1.3;
    if (m < 60) return null;
    const min = Math.round(m / 80);
    return min <= 45 ? `≈ ${min} min à pied` : `≈ ${fmtDistance(m)}`;   // (texte complet pour l’accessibilité)
  });


  $effect(() => {
    if (!isStation || directions) return;
    const p = place;
    const t = setInterval(() => { now = Date.now(); loadDepartures(p); }, 30000);
    const tick1 = setInterval(() => (now = Date.now()), 10000);
    return () => { clearInterval(t); clearInterval(tick1); };
  });




  $effect(() => { nearby; category; applyHit(category); });


  // Filtre « ouvert à… » : null (pas de filtre) | { now: true } | { at: Date }
  let openAt = $state(null);
  let showUnknown = $state(false);   // afficher aussi les lieux aux horaires inconnus
  let momentPicker = $state(false);
  let nearbyAll = [];                 // lieux trouvés avant filtre (avec leurs horaires bruts)
  let openCounts = $state(null);      // { open, unknown, closed }
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
  const pickerDay = $derived(openAt?.at ? Math.max(0, Math.round((new Date(openAt.at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5) - (openAt.at.getHours() < 6 ? 1 : 0)) : 0);
  const pickerTime = $derived(openAt?.at ? `${openAt.at.getHours()}:${openAt.at.getMinutes()}` : '20:0');

  let userMoved = false;
  let reloadTimer = null;
  let catRequest = 0;
  // Recharger la catégorie ouverte pour la zone affichée (après un déplacement de la carte à la main).
  let reloadLater = false;
  let viewChosen = false;   // la personne a choisi ce qu'elle regarde (carte déplacée, lieu ou quartier cherché)







  // Message bref ; avec une action (« Annuler ») pour revenir sur un geste qui efface quelque chose.
  let toastAction = $state(null);
  let toastTimer;
  $effect(() => { category; directions; showSaved; isolate(); });

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



  // ——— Direction (boussole) ———
  // Le cap vient de la boussole du téléphone ; à défaut, du sens de la marche (GPS) quand on avance.
  // Rien n'est envoyé : tout reste sur l'appareil.
  let heading = null;            // degrés, 0 = nord
  let compassOn = false;
  let lastCompass = 0;
  let followMode = $state('none');   // 'none' | 'follow' (la carte vous suit) | 'heading' (la carte tourne avec vous)
  let posWatch = null;












  let routeCtrl;



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




  let lastFix = null;



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
      const RAIL = ['SUBWAY', 'METRO', 'REGIONAL_RAIL', 'SUBURBAN'];
      if (nextRide && RAIL.includes(nextRide.mode) && walkBetween <= 600) {
        // correspondance métro/RER dans la station (ou tout près) : pas de sortie, mais la bonne voiture
        // (vers un bus ou un tram, on sort : on conseille la sortie la plus proche de l'arrêt)
        placeForTransfer(leg.toStop, nextRide.fromStop)
          .then((pl) => { legExits[k] = pl ? { place: pl, transfer: nextRide } : false; })
          .catch(() => { legExits[k] = false; });
        return;
      }
      const nextLeg = after[0];
      const goal = nextLeg?.coords?.length ? { lon: nextLeg.coords.at(-1)[0], lat: nextLeg.coords.at(-1)[1] } : to;
      // Sortie RATP la plus proche de la suite du trajet, avec la voiture où monter ; sinon, sortie OSM sans placement.
      exitForQuay(leg.toStop, goal).catch(() => null)
        .then(async (ratp) => ratp || bestExit(leg.toPos, goal).then((e) => (e ? { exit: e, place: null } : null)))
        .then(async (hit) => {
          const e = hit?.exit;
          legExits[k] = hit || false;
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

  // <app> État et actions partagés avec les composants de l'écran (getContext('app')). Bloc généré : un nom par ligne.
  const app = {
    get BACKUP_KEY() { return BACKUP_KEY; },
    get BIKE_COLOR() { return BIKE_COLOR; },
    get FAVS_KEY() { return FAVS_KEY; },
    get LISTS_KEY() { return LISTS_KEY; },
    get NAV() { return NAV; },
    get PINS_KEY() { return PINS_KEY; },
    get RECENTS_KEY() { return RECENTS_KEY; },
    get SHORTCUTS_KEY() { return SHORTCUTS_KEY; },
    get SHORT_NAMES() { return SHORT_NAMES; },
    get STATION_TYPES() { return STATION_TYPES; },
    get WALK_COLOR() { return WALK_COLOR; },
    get active() { return active; }, set active(v) { active = v; },
    get activeQuery() { return activeQuery; },
    get address() { return address; },
    get allExits() { return allExits; }, set allExits(v) { allExits = v; },
    get anyOpen() { return anyOpen; },
    get applyHit() { return applyHit; },
    get applyIncoming() { return applyIncoming; },
    get applyOpenFilter() { return applyOpenFilter; },
    get areaText() { return areaText; },
    get arriveCount() { return arriveCount; }, set arriveCount(v) { arriveCount = v; },
    get assigning() { return assigning; }, set assigning(v) { assigning = v; },
    get backupAge() { return backupAge; },
    get backupPassword() { return backupPassword; }, set backupPassword(v) { backupPassword = v; },
    get catHit() { return catHit; },
    get catIcon() { return catIcon; },
    get catOf() { return catOf; },
    get catRequest() { return catRequest; }, set catRequest(v) { catRequest = v; },
    get category() { return category; }, set category(v) { category = v; },
    get chipList() { return chipList; },
    get chipPrefs() { return chipPrefs; }, set chipPrefs(v) { chipPrefs = v; },
    get clearCategory() { return clearCategory; },
    get clearPhotoPins() { return clearPhotoPins; },
    get clearSearch() { return clearSearch; },
    get clearSelection() { return clearSelection; },
    get closeDirections() { return closeDirections; },
    get closePlace() { return closePlace; },
    get closePromise() { return closePromise; },
    get compassOn() { return compassOn; }, set compassOn(v) { compassOn = v; },
    get computeRoutes() { return computeRoutes; },
    get copyAddress() { return copyAddress; },
    get createList() { return createList; },
    get current() { return current; },
    get dark() { return dark; }, set dark(v) { dark = v; },
    get deleteList() { return deleteList; },
    get deps() { return deps; }, set deps(v) { deps = v; },
    get dimPlaces() { return dimPlaces; },
    get dimmed() { return dimmed; }, set dimmed(v) { dimmed = v; },
    get directions() { return directions; }, set directions(v) { directions = v; },
    get displayName() { return displayName; },
    get dist() { return dist; },
    get doRestore() { return doRestore; },
    get dragY() { return dragY; }, set dragY(v) { dragY = v; },
    get drawRoute() { return drawRoute; },
    get editChips() { return editChips; }, set editChips(v) { editChips = v; },
    get editField() { return editField; },
    get editing() { return editing; }, set editing(v) { editing = v; },
    get endNav() { return endNav; },
    get exits() { return exits; }, set exits(v) { exits = v; },
    get famColor() { return famColor; },
    get favTap() { return favTap; },
    get favorites() { return favorites; }, set favorites(v) { favorites = v; },
    get fieldEl() { return fieldEl; }, set fieldEl(v) { fieldEl = v; },
    get fieldQuery() { return fieldQuery; }, set fieldQuery(v) { fieldQuery = v; },
    get fitTo() { return fitTo; },
    get focused() { return focused; }, set focused(v) { focused = v; },
    get followMode() { return followMode; }, set followMode(v) { followMode = v; },
    get forgetRecents() { return forgetRecents; },
    get frame() { return frame; },
    get freshness() { return freshness; },
    get from() { return from; }, set from(v) { from = v; },
    get gesture() { return gesture; }, set gesture(v) { gesture = v; },
    get getPosition() { return getPosition; },
    get heading() { return heading; }, set heading(v) { heading = v; },
    get hubPanel() { return hubPanel; }, set hubPanel(v) { hubPanel = v; },
    get importFile() { return importFile; },
    get importOpen() { return importOpen; }, set importOpen(v) { importOpen = v; },
    get importing() { return importing; }, set importing(v) { importing = v; },
    get inFav() { return inFav; },
    get incoming() { return incoming; }, set incoming(v) { incoming = v; },
    get info() { return info; }, set info(v) { info = v; },
    get infoStrip() { return infoStrip; },
    get innerH() { return innerH; }, set innerH(v) { innerH = v; },
    get isAddress() { return isAddress; },
    get isFav() { return isFav; },
    get isPinned() { return isPinned; },
    get isStation() { return isStation; },
    get isolate() { return isolate; },
    get keepIncomingList() { return keepIncomingList; },
    get labelColor() { return labelColor; },
    get lastBackup() { return lastBackup; }, set lastBackup(v) { lastBackup = v; },
    get lastCompass() { return lastCompass; }, set lastCompass(v) { lastCompass = v; },
    get lastEdit() { return lastEdit; }, set lastEdit(v) { lastEdit = v; },
    get lastFix() { return lastFix; }, set lastFix(v) { lastFix = v; },
    get lastTap() { return lastTap; }, set lastTap(v) { lastTap = v; },
    get legExits() { return legExits; }, set legExits(v) { legExits = v; },
    get line() { return line; },
    get listEditing() { return listEditing; }, set listEditing(v) { listEditing = v; },
    get listIcon() { return listIcon; },
    get listOf() { return listOf; },
    get listPicker() { return listPicker; }, set listPicker(v) { listPicker = v; },
    get lists() { return lists; }, set lists(v) { lists = v; },
    get locError() { return locError; },
    get locating() { return locating; }, set locating(v) { locating = v; },
    get makeBackup() { return makeBackup; },
    get makeTransfer() { return makeTransfer; },
    get map() { return map; }, set map(v) { map = v; },
    get mapMode() { return mapMode; }, set mapMode(v) { mapMode = v; },
    get marker() { return marker; }, set marker(v) { marker = v; },
    get me() { return me; }, set me(v) { me = v; },
    get meMarker() { return meMarker; }, set meMarker(v) { meMarker = v; },
    get mode() { return mode; }, set mode(v) { mode = v; },
    get momentFrom() { return momentFrom; },
    get momentPicker() { return momentPicker; }, set momentPicker(v) { momentPicker = v; },
    get moreText() { return moreText; }, set moreText(v) { moreText = v; },
    get moveChip() { return moveChip; },
    get nav() { return nav; }, set nav(v) { nav = v; },
    get navFollow() { return navFollow; }, set navFollow(v) { navFollow = v; },
    get navList() { return navList; }, set navList(v) { navList = v; },
    get navTick() { return navTick; }, set navTick(v) { navTick = v; },
    get navWatch() { return navWatch; }, set navWatch(v) { navWatch = v; },
    get nearby() { return nearby; }, set nearby(v) { nearby = v; },
    get nearbyAll() { return nearbyAll; }, set nearbyAll(v) { nearbyAll = v; },
    get nearbyDone() { return nearbyDone; }, set nearbyDone(v) { nearbyDone = v; },
    get nearbyFromMe() { return nearbyFromMe; }, set nearbyFromMe(v) { nearbyFromMe = v; },
    get newListName() { return newListName; }, set newListName(v) { newListName = v; },
    get now() { return now; }, set now(v) { now = v; },
    get offCount() { return offCount; }, set offCount(v) { offCount = v; },
    get onKey() { return onKey; },
    get openAt() { return openAt; }, set openAt(v) { openAt = v; },
    get openCategoryFromSearch() { return openCategoryFromSearch; },
    get openCounts() { return openCounts; }, set openCounts(v) { openCounts = v; },
    get openFeature() { return openFeature; },
    get openPlace() { return openPlace; },
    get openSavedList() { return openSavedList; },
    get osmDate() { return osmDate; }, set osmDate(v) { osmDate = v; },
    get osmEditUrl() { return osmEditUrl; },
    get osmNoteUrl() { return osmNoteUrl; },
    get pickCategory() { return pickCategory; },
    get pickOnMap() { return pickOnMap; },
    get pickResult() { return pickResult; },
    get pickStreet() { return pickStreet; },
    get picked() { return picked; }, set picked(v) { picked = v; },
    get pickedStreet() { return pickedStreet; }, set pickedStreet(v) { pickedStreet = v; },
    get pickerDay() { return pickerDay; },
    get pickerDays() { return pickerDays; },
    get pickerHours() { return pickerHours; },
    get pickerTime() { return pickerTime; },
    get pinnedPlaces() { return pinnedPlaces; },
    get pins() { return pins; }, set pins(v) { pins = v; },
    get place() { return place; }, set place(v) { place = v; },
    get placeKey() { return placeKey; },
    get placeMarker() { return placeMarker; },
    get placeMenu() { return placeMenu; }, set placeMenu(v) { placeMenu = v; },
    get placeSheetH() { return placeSheetH; }, set placeSheetH(v) { placeSheetH = v; },
    get placeShortcut() { return placeShortcut; },
    get pointOf() { return pointOf; },
    get posWatch() { return posWatch; }, set posWatch(v) { posWatch = v; },
    get query() { return query; }, set query(v) { query = v; },
    get quickMoment() { return quickMoment; },
    get recents() { return recents; }, set recents(v) { recents = v; },
    get refreshSaved() { return refreshSaved; },
    get reloadCategoryHere() { return reloadCategoryHere; },
    get reloadLater() { return reloadLater; }, set reloadLater(v) { reloadLater = v; },
    get remember() { return remember; },
    get removeFromList() { return removeFromList; },
    get removeStop() { return removeStop; },
    get renameChip() { return renameChip; },
    get renameList() { return renameList; },
    get rerouting() { return rerouting; }, set rerouting(v) { rerouting = v; },
    get resetChips() { return resetChips; },
    get restoreFile() { return restoreFile; }, set restoreFile(v) { restoreFile = v; },
    get restoreNeedsPw() { return restoreNeedsPw; }, set restoreNeedsPw(v) { restoreNeedsPw = v; },
    get restorePassword() { return restorePassword; }, set restorePassword(v) { restorePassword = v; },
    get results() { return results; }, set results(v) { results = v; },
    get routeCtrl() { return routeCtrl; }, set routeCtrl(v) { routeCtrl = v; },
    get routes() { return routes; }, set routes(v) { routes = v; },
    get sameSpot() { return sameSpot; },
    get saveAll() { return saveAll; },
    get saveChips() { return saveChips; },
    get saveFavorites() { return saveFavorites; },
    get savedEntry() { return savedEntry; },
    get savedList() { return savedList; }, set savedList(v) { savedList = v; },
    get say() { return say; },
    get searchError() { return searchError; }, set searchError(v) { searchError = v; },
    get searchH() { return searchH; }, set searchH(v) { searchH = v; },
    get searching() { return searching; }, set searching(v) { searching = v; },
    get selStates() { return selStates; }, set selStates(v) { selStates = v; },
    get setMembership() { return setMembership; },
    get setOpenAt() { return setOpenAt; },
    get setPoint() { return setPoint; },
    get setShortcut() { return setShortcut; },
    get shareList() { return shareList; },
    get sharePlace() { return sharePlace; },
    get shareTransfer() { return shareTransfer; },
    get shortcuts() { return shortcuts; }, set shortcuts(v) { shortcuts = v; },
    get showList() { return showList; },
    get showMe() { return showMe; },
    get showModes() { return showModes; }, set showModes(v) { showModes = v; },
    get showPromise() { return showPromise; }, set showPromise(v) { showPromise = v; },
    get showSaved() { return showSaved; }, set showSaved(v) { showSaved = v; },
    get showSelection() { return showSelection; },
    get showSteps() { return showSteps; }, set showSteps(v) { showSteps = v; },
    get showUnknown() { return showUnknown; }, set showUnknown(v) { showUnknown = v; },
    get showVia() { return showVia; }, set showVia(v) { showVia = v; },
    get showWeek() { return showWeek; }, set showWeek(v) { showWeek = v; },
    get skipPop() { return skipPop; }, set skipPop(v) { skipPop = v; },
    get spoken() { return spoken; }, set spoken(v) { spoken = v; },
    get startDirections() { return startDirections; },
    get startWatch() { return startWatch; },
    get stationKind() { return stationKind; },
    get status() { return status; },
    get stopWatch() { return stopWatch; },
    get swap() { return swap; },
    get swipeStart() { return swipeStart; }, set swipeStart(v) { swipeStart = v; },
    get swiped() { return swiped; }, set swiped(v) { swiped = v; },
    get title() { return title; },
    get to() { return to; }, set to(v) { to = v; },
    get toast() { return toast; }, set toast(v) { toast = v; },
    get toastAction() { return toastAction; }, set toastAction(v) { toastAction = v; },
    get toastTimer() { return toastTimer; }, set toastTimer(v) { toastTimer = v; },
    get toggleChip() { return toggleChip; },
    get togglePin() { return togglePin; },
    get toggleZoom() { return toggleZoom; },
    get topH() { return topH; }, set topH(v) { topH = v; },
    get transfer() { return transfer; }, set transfer(v) { transfer = v; },
    get useMyPosition() { return useMyPosition; },
    get useShortcut() { return useShortcut; },
    get via() { return via; }, set via(v) { via = v; },
    get viewChosen() { return viewChosen; }, set viewChosen(v) { viewChosen = v; },
    get viewHash() { return viewHash; }, set viewHash(v) { viewHash = v; },
    get viewer() { return viewer; }, set viewer(v) { viewer = v; },
    get viewerEl() { return viewerEl; }, set viewerEl(v) { viewerEl = v; },
    get viewerIdx() { return viewerIdx; }, set viewerIdx(v) { viewerIdx = v; },
    get voice() { return voice; }, set voice(v) { voice = v; },
    get wakeLock() { return wakeLock; }, set wakeLock(v) { wakeLock = v; },
    get walkEta() { return walkEta; },
    get week() { return week; },
    get whenText() { return whenText; },
    get wiki() { return wiki; }, set wiki(v) { wiki = v; },
    get zoom() { return zoom; }, set zoom(v) { zoom = v; },
    get zoomEnd() { return zoomEnd; },
    get zoomMove() { return zoomMove; },
    get zoomStart() { return zoomStart; },
  };
  setContext('app', app);
  // </app>
  const { clampZoom, toggleZoom, zoomStart, zoomMove, zoomEnd } = createZoom(app);
  const { favData, addCustomLayers, drawRoute, line, shade, dimPlaces, setMapMode, fitOptions, boundsOf, fitTo, onMapClick, openPoint, openFeature, frame, placeMarker, labelColor, clearSelPhoto, clearPhotoPins, clearSelection, showSelection } = createMapDraw(app);
  const { saveFavorites, setShortcut, useShortcut } = createShortcuts(app);
  const { saveChips, moveChip, toggleChip, renameChip, resetChips, catOf } = createChips(app);
  const { sameSpot, saveAll, keepOf, saveTap, setMembership, togglePin, removeFromList, createList, renameList, deleteList, refreshSaved, openSavedList, shareList, keepIncomingList, makeTransfer, shareTransfer, applyIncoming, makeBackup, doRestore } = createMyPlaces(app);
  const { remember, forgetRecents, openPlace, sharePlace, loadDepartures, closePlace } = createPlace(app);
  const { clearSearch, hitFilter, catIcon, applyHit, displayName, collectCategory, applyOpenFilter, setOpenAt, momentFrom, quickMoment, nearView, reloadCategoryHere, pickCategory, clearCategory, dist, openCategoryFromSearch, onKey, pickResult } = createSearch(app);
  const { say, isolate, closeTop, onPopState, onKeyDown, undoToast, showMe } = createScreen(app);
  const { setHeading, onOrientation, startCompass, startWatch, stopWatch, getPosition, startupLocate, locError, locDetail, locate, pickOnMap } = createLocation(app);
  const { startDirections, closeDirections, pointOf, setPoint, addStop, removeStop, editField, useMyPosition, swap, computeRoutes, chooseMode, sheetToTop, pickStreet, pickTransit } = createDirections(app);
  const { speak, transitSteps, startNav, onFix, updateNav, reroute, endNav } = createNav(app);
  const { importFile } = createImport(app);
</script>









<svelte:window bind:innerHeight={innerH} />
<div class="app" class:routing={directions} class:navigating={!!nav} style:--top-h={`${directions ? topH : searchH + 16}px`}>
  <div class="map" bind:this={mapEl} aria-label="Carte"></div>

  <TopBar />

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
    <NavView {nav} {navBanner} {navRemaining} {to} {navFollow} bind:navList bind:voice {endNav}
      recenter={() => { navFollow = true; updateNav(); }} />
  {/if}
  <StreetThumb />
  <PhotoViewer />
  {#if toast}<p class="toast" role="status">{toast}{#if toastAction}<button onclick={undoToast}>{toastAction.label}</button>{/if}</p>{/if}
  <PromiseBanner />

  {#if listPicker && place && !directions}
    <ListPicker />
  {:else if incoming?.kind === 'transfer' && !directions}
    <TransferSheet />
  {:else if importOpen && !directions}
    <ImportSheet />
  {:else if editChips && !directions}
    <ChipsEditor />
  {:else if directions && !editing && !nav}
    <RouteSheet {from} {to} {mode} {routes} {picked} {pickedStreet} {showVia} {legExits}
      {chooseMode} {pickStreet} {pickTransit} {startNav} {addStop} {computeRoutes} />
  {:else if place && !directions}
    <PlaceSheet />
  {:else if category && !directions}
    <!-- Liste d'une catégorie : ouverte en aperçu (la carte reste visible), on l'agrandit si on veut la liste ;
         la faire glisser vers le bas la réduit sans fermer la catégorie (seule la croix ou le raccourci la ferment). -->
    <CategorySheet />
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
    --page: #f4efdf;
    --accent-btn: #2a5bd7;
    --soft-accent: #f5f8ff;
    --me-bg: #e8eefc;
    --grip: #d8d8dc;
    --faint: #b4b7bc;
    --rail: #c9ccd1;
    --walk-rail: #9aa3ae;
    --end: #d93a2f;
    /* Échelle de tailles unique (densité proche de Google Maps). Les champs de saisie restent à 16 px :
       en dessous, Safari zoome sur la page au moment de taper. */
    --fs-body: 15px;
    --fs-meta: 13.5px;
    --fs-small: 12.5px;
    --gutter: 16px;
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
  input {
    border: 0; background: none; font: inherit; font-size: 17px; color: var(--ink);
    padding: 12px 0; min-width: 0; outline: none; width: 100%;
  }
  input::placeholder { color: var(--muted); }
  input::-webkit-search-cancel-button { display: none; }


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
  /* ——— Choix de l'itinéraire ——— */

  /* ——— Guidage ——— */
  .navigating .modes-ctl, .navigating .locate { display: none; }
  .navigating .toast { bottom: calc(96px + env(safe-area-inset-bottom)); right: 12px; }
  :global(.me.navigating) {
    width: 0; height: 0; border-radius: 0; background: none; box-shadow: none;
    border-left: 13px solid transparent; border-right: 13px solid transparent; border-bottom: 30px solid var(--accent);
    filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 2px 4px rgb(0 0 0 / 0.35));
  }
  .saved-toggle { display: flex; align-items: center; gap: 10px; font-size: 15px; padding: 14px 0 6px; cursor: pointer; }
  .saved-toggle input { width: 20px; height: 20px; accent-color: var(--accent-btn); }
  .modes-pop .saved-toggle { grid-column: 1 / -1; font-size: 13px; font-weight: 600; padding: 4px 0 0; }
  .modes-pop { flex-wrap: wrap; }
  .compass svg { width: 24px; height: 24px; transition: transform 0.1s; }
  .compass .north { fill: var(--closed); }
  /* ——— Devantures (Panoramax) ——— */
  :global(.facade) { display: block; position: relative; overflow: hidden; container-type: inline-size; aspect-ratio: 4 / 3; background: var(--fill); }
  :global(.facade img) { position: absolute; width: 800cqw; height: 400cqw; max-width: none; left: calc(50cqw - var(--fx) * 800cqw); top: -155cqw; }
  @keyframes appear-thumb { from { opacity: 0; transform: scale(0.92); } }
  :global(.pin-photo) { display: block; padding: 0; border: 3px solid #fff; border-radius: 50%; overflow: hidden; background: var(--fill); cursor: pointer;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.3); }
  :global(.pin-photo.s64) { width: 64px; height: 64px; }
  :global(.pin-photo.s40) { width: 40px; height: 40px; }
  :global(.pin-photo .facade) { width: 100%; height: 100%; aspect-ratio: 1; }
  :global(.pin-photo .facade img) { top: -170cqw; }
  @keyframes pulse { 50% { opacity: 0.35; } }

  /* ——— Grand écran : panneaux à gauche ——— */
  @media (min-width: 768px) {
    .locate { bottom: 40px; right: 16px; }
    .modes-ctl { bottom: 100px; right: 16px; }
  
  
  }

  @media (prefers-reduced-motion: reduce) {
    .locate.busy svg { animation: none; }
  
  
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
