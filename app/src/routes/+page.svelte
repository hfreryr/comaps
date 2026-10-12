<script>
  import { onMount, tick } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { search, details, reverse, reverseAddress, typeLabel, PARIS } from '#lib/places.js';
  import { hoursStatus, hoursTable } from '#lib/hours.js';
  import { draggable } from '#lib/sheet.js';
  import { wikiInfo } from '#lib/placeinfo.js';
  import { mapStyle, provideImage, osmRef, FAMILIES, DARK_LAND } from '#lib/mapstyle.js';
  import { streetRoute, transitRoutes, departures, trafficEstimate, MODE_NAMES, fmtDuration, fmtTime, fmtWait, fmtDistance } from '#lib/routing.js';
  import { stationExits, bestExit, exitLabel, sortExits } from '#lib/exits.js';
  import { readGoogleExport } from '#lib/importgoogle.js';
  import { placeForExit, placeForTransfer, placeLabel } from '#lib/rame.js';

  // Raccourcis de catégories. « key » ne change jamais ; l'intitulé et l'ordre sont personnalisables.
  const ALL_CATEGORIES = [
    { key: 'resto', label: 'Restaurants', classes: ['restaurant', 'fast_food'], family: 'food' },
    { key: 'cafe', label: 'Cafés', classes: ['cafe'], family: 'cafe' },
    { key: 'metro', label: 'Métro', transit: true, color: '#2B4793' },
    { key: 'pharmacie', label: 'Pharmacies', classes: ['pharmacy'], family: 'health' },
    { key: 'courses', label: 'Courses', classes: ['supermarket', 'convenience', 'grocery'], family: 'shop' },
    { key: 'distributeur', label: 'Distributeurs', classes: ['atm'], family: 'money' },
    { key: 'boulangerie', label: 'Boulangeries', classes: ['bakery', 'pastry'], family: 'bakery' },
    { key: 'bar', label: 'Bars', classes: ['bar', 'pub', 'beer'], family: 'bar' },
    { key: 'musee', label: 'Musées', classes: ['museum', 'art_gallery', 'gallery'], family: 'culture' },
    { key: 'banque', label: 'Banques', classes: ['bank'], family: 'money' },
    { key: 'essence', label: 'Stations-service', classes: ['fuel'], family: 'fuel' }
  ];
  // Taper un type de lieu (« pharmacie », « métro le plus proche ») propose la liste triée par proximité.
  const CATEGORY_WORDS = {
    resto: ['restaurant', 'restaurants', 'resto', 'restos', 'manger', 'dejeuner', 'diner', 'brasserie', 'brasseries'],
    cafe: ['cafe', 'cafes', 'coffee', 'cafeteria'],
    metro: ['metro', 'metros', 'station', 'stations', 'rer', 'subway', 'transport', 'transports', 'arret'],
    pharmacie: ['pharmacie', 'pharmacies', 'pharma', 'medicament', 'medicaments'],
    courses: ['courses', 'supermarche', 'supermarches', 'epicerie', 'epiceries', 'superette', 'supermarket', 'magasin', 'alimentaire'],
    distributeur: ['distributeur', 'distributeurs', 'dab', 'atm', 'retirer', 'retrait', 'argent', 'liquide', 'cash', 'billets', 'billet'],
    boulangerie: ['boulangerie', 'boulangeries', 'boulanger', 'pain', 'patisserie', 'patisseries', 'viennoiseries'],
    bar: ['bar', 'bars', 'boire', 'verre', 'pub', 'pubs', 'apero'],
    musee: ['musee', 'musees', 'expo', 'expos', 'exposition', 'expositions', 'galerie', 'galeries'],
    banque: ['banque', 'banques', 'agence', 'agences', 'bancaire'],
    essence: ['essence', 'carburant', 'gazole', 'diesel', 'fuel', 'pompe', 'station', 'service', 'stations', 'services']
  };
  // Onglets personnalisés : [{ key, label?, hidden? }] dans l'ordre choisi, gardés sur l'appareil.
  const CHIPS_KEY = 'onglets';
  function loadChipPrefs() {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(CHIPS_KEY) || '[]'); } catch { /* rien */ }
    const known = saved.filter((p) => ALL_CATEGORIES.some((c) => c.key === p.key));
    // une catégorie ajoutée après coup apparaît à la fin
    return [...known, ...ALL_CATEGORIES.filter((c) => !known.some((p) => p.key === c.key)).map((c) => ({ key: c.key }))];
  }
  const FILLER = new Set(['proche', 'proches', 'pres', 'de', 'd', 'moi', 'ici', 'ouvert', 'ouverte', 'ouverts', 'ouvertes',
    'autour', 'la', 'le', 'les', 'plus', 'un', 'une', 'des', 'du', 'a', 'cote', 'maintenant', 'pas', 'loin', 'nearby', 'near', 'me']);
  const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function categoryFor(q) {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return null;
    for (const c of chipList.length ? [...chipList, ...ALL_CATEGORIES.filter((a) => !chipList.some((x) => x.key === a.key))] : ALL_CATEGORIES) {
      const kws = CATEGORY_WORDS[c.key];
      if (words.some((w) => kws.includes(w)) && words.every((w) => kws.includes(w) || FILLER.has(w))) return c;
    }
    return null;
  }

  const MODES = [
    { id: 'walk', label: 'À pied' },
    { id: 'bike', label: 'Vélo' },
    { id: 'transit', label: 'Transports' },
    { id: 'car', label: 'Voiture' }
  ];
  const WALK_COLOR = '#2A5BD7';
  const BIKE_COLOR = '#1E8E3E';

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
  let deps = $state(null);           // prochains passages d'une station : { status, data? }
  let now = $state(Date.now());
  let locating = $state(false);
  let toast = $state('');
  let me = $state(null); // dernière position connue de l'utilisateur, gardée sur l'appareil
  // Lieux récents : gardés uniquement dans ce navigateur, jamais envoyés ; effaçables d'un geste.
  const RECENTS_KEY = 'lieux-recents';
  let recents = $state(loadRecents());
  // Favoris : même principe, gardés uniquement dans ce navigateur.
  const FAVS_KEY = 'lieux-favoris';
  let favorites = $state(loadList(FAVS_KEY, 200));
  const isFav = $derived(!!place && favorites.some((f) => sameSpot(f, place)));

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

  // ——— Itinéraire ———
  let directions = $state(false);
  let from = $state(null);           // { label, lat, lon, isMe? }
  let to = $state(null);
  let mode = $state('walk');
  let editing = $state(null);        // 'from' | 'to' | null
  let fieldQuery = $state('');
  let fieldEl = $state();
  let routes = $state({ walk: null, bike: null, transit: null }); // { status, data?, error? }
  let picked = $state(0);            // proposition de transport choisie
  let mapMode = $state('plan');      // 'plan' | 'transit'
  let showModes = $state(false);
  let lastEdit = { which: null, at: 0 }; // champ quitté juste avant un toucher sur la carte

  const status = $derived(info?.hours ? hoursStatus(info.hours, place.lat, place.lon) : null);
  const week = $derived(showWeek && info?.hours ? hoursTable(info.hours, place.lat, place.lon) : null);
  const activeQuery = $derived(editing ? fieldQuery : query);
  const catHit = $derived(editing ? null : categoryFor(query));
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
        'Itinéraires <a href="https://valhalla1.openstreetmap.de" target="_blank" rel="noopener">Valhalla / FOSSGIS</a>, <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous</a> · <a href="https://github.com/hfreryr/untracked" target="_blank" rel="noopener">Projet libre</a>' },
      fadeDuration: 200
    });
    map.setMissingStyleImageResolver((id) => provideImage(map, id));
    if (location.hostname === 'localhost') window.__map = map; // pour les tests locaux
    // Nos calques (trajet, favoris) sont à rajouter à chaque changement de style (clair ↔ sombre).
    map.on('style.load', addCustomLayers);
    darkMQ.addEventListener('change', (e) => { dark = e.matches; map.setStyle(mapStyle(base, dark)); });
    map.once('load', () => {
      document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      if (fresh) startupLocate();
      // Lien partagé vers un lieu (…#carte=…&lieu=node/123) : on rouvre sa fiche.
      const shared = /[#&]lieu=(node|way|relation)\/(\d+)/.exec(location.hash);
      if (shared) {
        const c = map.getCenter();
        openPlace({ id: `${shared[1]}${shared[2]}`, osmType: shared[1], osmId: Number(shared[2]), name: '', type: '', address: '', lat: c.lat, lon: c.lng });
      }
    });
    map.on('click', onMapClick);
    // Appui long (ou clic droit) : adresse du point, même si une fiche est ouverte.
    map.on('contextmenu', (e) => { if (!directions) openPoint(e.lngLat); });
    for (const id of ['poi', 'poi-other', 'poi-hit', 'landmark', 'metro', 'fav']) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    return () => map.remove();
  });

  let dark = $state(false);
  const favData = () => ({ type: 'FeatureCollection', features: favorites.map((f, i) => ({
    type: 'Feature', id: i, geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: { i, name: f.name } })) });

  function addCustomLayers() {
    if (map.getSource('route')) return;
    addRouteLayers();
    map.addSource('favs', { type: 'geojson', data: favData() });
    map.addLayer({ id: 'fav', type: 'symbol', source: 'favs',
      layout: { 'icon-image': 'fav', 'icon-allow-overlap': true, 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 16, 1.05],
                'text-field': ['step', ['zoom'], '', 14, ['get', 'name']], 'text-font': ['Open Sans Semibold'], 'text-size': 12,
                'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-optional': true, 'text-max-width': 8 },
      paint: { 'text-color': dark ? '#F08AB4' : '#A82C5F', 'text-halo-color': dark ? 'rgba(22,24,28,0.9)' : '#FFFFFF', 'text-halo-width': 1.6 } });
    // Après un changement de style : on remet l'état en cours (trajet, catégorie, mode transports).
    if (directions) { drawRoute(); dimPlaces(true); }
    if (category) map.setFilter('poi-hit', hitFilter(category));
    if (mapMode === 'transit') for (const id of ['transit-case', 'transit-line', 'transit-label']) map.setLayoutProperty(id, 'visibility', 'visible');
  }


  // ——— Carte ———
  function addRouteLayers() {
    map.addSource('route', { type: 'geojson', data: empty() });
    const before = 'water-name-point';
    const width = (a, b) => ['interpolate', ['exponential', 1.4], ['zoom'], 12, a, 18, b];
    // Trajets à pied, à vélo et en transport : trait plein, liseré foncé puis bord blanc.
    map.addLayer({ id: 'route-halo', type: 'line', source: 'route', filter: ['!=', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': dark ? DARK_LAND : '#FFFFFF', 'line-width': width(9, 17) } }, before);
    map.addLayer({ id: 'route-case', type: 'line', source: 'route', filter: ['!=', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'edge'], 'line-width': width(6.5, 13) } }, before);
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['!=', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': width(4.5, 9.5) } }, before);
    // Correspondances à pied dans un trajet en transport : points discrets.
    map.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['==', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#6F7A88', 'line-width': width(4, 7), 'line-dasharray': [0, 1.7] } }, before);
    map.addSource('route-ends', { type: 'geojson', data: empty() });
    map.addLayer({ id: 'route-start', type: 'circle', source: 'route-ends',
      paint: { 'circle-radius': 7.5, 'circle-color': '#2A5BD7', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3.5 } });
  }
  const empty = () => ({ type: 'FeatureCollection', features: [] });

  function drawRoute() {
    const src = map?.getSource('route');
    if (!src) return;
    const feats = [];
    const r = current?.status === 'ok' ? current.data : null;
    if (r && mode !== 'transit') {
      feats.push(mode === 'bike' ? line(r.coords, 'bike', BIKE_COLOR, '#13612A') : line(r.coords, mode, WALK_COLOR, '#1B3F9E'));
    } else if (r && mode === 'transit' && r[picked]) {
      for (const leg of r[picked].legs) {
        if (leg.coords.length < 2) continue;
        feats.push(leg.mode === 'WALK' ? line(leg.coords, 'transfer', '#6F7A88') : line(leg.coords, 'transit', leg.color, shade(leg.color)));
      }
    }
    src.setData({ type: 'FeatureCollection', features: feats });
    map.getSource('route-ends').setData(from && directions ? { type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [from.lon, from.lat] }, properties: {} }] } : empty());
    if (feats.length) fitTo(feats.flatMap((f) => f.geometry.coordinates));
  }
  const line = (coords, kind, color, edge = color) => ({ type: 'Feature', properties: { kind, color, edge }, geometry: { type: 'LineString', coordinates: coords } });
  // Teinte plus foncée d'une couleur, pour le liseré d'un trait.
  function shade(hex, k = 0.7) {
    const n = parseInt(hex.slice(1, 7), 16);
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('');
  }
  // Pendant un itinéraire, les lieux de la carte s'effacent derrière le trajet.
  function dimPlaces(on) {
    for (const id of ['poi', 'poi-other', 'landmark', 'metro']) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, 'icon-opacity', on ? 0.35 : 1);
      map.setPaintProperty(id, 'text-opacity', on ? 0.35 : 1);
    }
  }
  function setMapMode(m) {
    mapMode = m;
    showModes = false;
    for (const id of ['transit-case', 'transit-line', 'transit-label']) map.setLayoutProperty(id, 'visibility', m === 'transit' ? 'visible' : 'none');
    if (m === 'transit' && map.getZoom() > 14.5) map.easeTo({ zoom: 13.5, duration: 600 });
  }

  function fitTo(coords) {
    const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
    for (const c of coords) b.extend(c);
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    map.fitBounds(b, {
      padding: mobile
        ? { top: 210, bottom: Math.round(window.innerHeight * 0.46), left: 36, right: 36 }
        : { top: 60, bottom: 60, left: 460, right: 60 },
      maxZoom: 17, duration: 700
    });
  }

  function onMapClick(e) {
    if (directions) {
      const which = editing || (Date.now() - lastEdit.at < 800 ? lastEdit.which : null);
      if (which) pickOnMap(which, e.lngLat);
      return;
    }
    showModes = false;
    const fav = map.queryRenderedFeatures(e.point, { layers: ['fav'] })[0];
    if (fav) return openPlace({ ...favorites[fav.properties.i] });
    const f = map.queryRenderedFeatures(e.point, { layers: ['poi-hit', 'poi', 'poi-other', 'landmark', 'metro'] })[0];
    if (f) return openFeature(f);
    // Toucher un endroit vide : fiche de l'adresse (si une fiche est ouverte, le toucher la ferme d'abord).
    if (place) return closePlace();
    openPoint(e.lngLat);
  }

  async function openPoint({ lng, lat }) {
    const p = { id: `pt${lng},${lat}`, name: 'Point sélectionné', type: 'Adresse', address: '', lat, lon: lng };
    placeMarker(lng, lat);
    place = p;
    info = {};
    deps = null;
    showWeek = false;
    const label = await reverseAddress(lat, lng).catch(() => null);
    if (place === p || place?.id === p.id) { place = { ...p, name: label || 'Point sélectionné' }; remember(place); }
  }

  function openFeature(f) {
    const [osmType, osmId] = (f.properties.osm || '').split('/');
    const ref = f.properties.osm ? { osmType, osmId: Number(osmId) } : osmRef(f.id);
    const [lon, lat] = f.geometry.coordinates;
    openPlace({
      id: String(f.id), ...ref, name: f.properties.name,
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
    shortcuts = { ...shortcuts, [which]: p ? { id: p.id, name: p.name, type: p.type, address: p.address || '', lat: p.lat, lon: p.lon, osmType: p.osmType, osmId: p.osmId } : undefined };
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
      const todo = places.filter((p) => !favorites.some((f) => f.name === p.name && (!p.lat || Math.abs(f.lat - p.lat) < 0.0003)));
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
        kept.push({ id: `g${lat},${lon}`, name: p.name || p.address, type: 'Importé de Google Maps', address: p.address || '', lat, lon });
        added++;
      }
      favorites = [...kept, ...favorites];
      saveFavorites();
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
    chipPrefs = chipPrefs.map((p, k) => (k === i ? { ...p, hidden: !p.hidden } : p));
    saveChips();
  }
  function renameChip(i, label) {
    chipPrefs = chipPrefs.map((p, k) => (k === i ? { ...p, label } : p));
    saveChips();
  }
  function resetChips() {
    chipPrefs = ALL_CATEGORIES.map((c) => ({ key: c.key }));
    saveChips();
  }
  const catOf = (key) => ALL_CATEGORIES.find((c) => c.key === key);
  // Un même lieu : même identifiant OSM, ou même nom au même endroit (à ~20 m près).
  function sameSpot(a, b) {
    if (a.osmType && b.osmType) return a.osmType === b.osmType && String(a.osmId) === String(b.osmId);
    return a.name === b.name && Math.abs(a.lat - b.lat) < 0.0002 && Math.abs(a.lon - b.lon) < 0.0003;
  }
  function toggleFavorite() {
    const p = place;
    if (!p) return;
    if (favorites.some((f) => sameSpot(f, p))) {
      favorites = favorites.filter((f) => !sameSpot(f, p));
      say('Retiré de vos favoris');
    } else {
      const keep = { id: p.id, name: p.name, type: p.type, address: p.address || info?.address || '', lat: p.lat, lon: p.lon, osmType: p.osmType, osmId: p.osmId };
      favorites = [keep, ...favorites];
      say('Ajouté à vos favoris · gardé sur cet appareil uniquement');
    }
    saveFavorites();
  }
  // Les favoris apparaissent aussi sur la carte (pastille rose à cœur).
  $effect(() => {
    const data = favData();
    map?.getSource('favs')?.setData(data);
  });
  function remember(p) {
    if (!p?.name || p.name === 'Point sélectionné') return;
    const keep = { id: p.id, name: p.name, type: p.type, address: p.address, lat: p.lat, lon: p.lon, osmType: p.osmType, osmId: p.osmId };
    recents = [keep, ...recents.filter((r) => r.id !== p.id && r.name !== p.name)].slice(0, 8);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(recents)); } catch { /* navigation privée : tant pis */ }
  }
  function forgetRecents() {
    recents = [];
    try { localStorage.removeItem(RECENTS_KEY); } catch { /* rien à effacer */ }
  }

  async function openPlace(p) {
    if (p.name) remember(p);
    place = p;
    info = null;
    wiki = null;
    moreText = false;
    deps = null;
    showWeek = false;
    focused = false;
    document.activeElement?.blur();
    placeMarker(p.lon, p.lat);
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
    if (!p.name && info.name) { place = { ...place, name: info.name, type: info.kind || place.type }; remember(place); }
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
    info = null;
    deps = null;
    marker?.remove();
  }

  function clearSearch() {
    query = '';
    results = [];
    closePlace();
  }

  // Horaires des lieux des listes : petit index chargé à la première liste ouverte.
  let hoursIndex = null;
  const loadHours = () => (hoursIndex ??= fetch(new URL('data/hours.json', location.href)).then((r) => r.json()).catch(() => ({ v: [], k: {} })));

  const hitFilter = (c) => (c.transit ? ['==', ['get', 'subclass'], '__none__'] : ['match', ['get', 'subclass'], c.classes, true, false]);

  async function pickCategory(c) {
    if (category?.key === c.key) return clearCategory();
    category = c;
    closePlace();
    nearby = [];
    nearbyDone = false;
    map.setFilter('poi-hit', hitFilter(c));
    // « Le plus proche de vous » : depuis votre position si elle est connue (ou déjà autorisée), sinon depuis le centre de la carte.
    let origin = me;
    if (!origin) {
      const perm = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
      if (perm?.state === 'granted') origin = await getPosition().catch(() => null);
    }
    if (category?.key !== c.key) return; // (l'état est une copie : on compare les clés)
    nearbyFromMe = !!origin;
    const hoursP = loadHours();
    const collect = async () => {
      const o = origin || { lat: map.getCenter().lat, lon: map.getCenter().lng };
      const seen = new Set();
      const filter = c.transit
        ? ['all', ['has', 'name'], ['==', ['get', 'class'], 'railway'], ['match', ['get', 'subclass'], ['subway', 'station', 'halt'], true, false]]
        : ['all', ['has', 'name'], ['match', ['get', 'subclass'], c.classes, true, false]];
      // Une station a souvent plusieurs points (un par ligne) : on n'en garde qu'un par nom.
      const keyOf = (f) => (c.transit ? f.properties.name : f.id);
      const list = map.querySourceFeatures('omt', { sourceLayer: 'poi', filter })
        .map((f) => ({ f, d: dist(o.lat, o.lon, f.geometry.coordinates[1], f.geometry.coordinates[0]) }))
        .sort((a, b) => a.d - b.d)
        .filter(({ f }) => !seen.has(keyOf(f)) && seen.add(keyOf(f)))
        .slice(0, c.transit ? 8 : 25);
      if (c.transit) {
        nearby = list.map((n) => ({ ...n, deps: { status: 'loading' } }));
        nearbyDone = true;
        // Prochains passages des stations les plus proches, directement dans la liste.
        list.slice(0, 5).forEach((n, i) => {
          const [lon, lat] = n.f.geometry.coordinates;
          departures(n.f.properties.name, lat, lon)
            .then((d) => d?.lines.length ? { status: 'ok', data: d } : { status: 'none' })
            .catch(() => ({ status: 'error' }))
            .then((deps) => { if (category?.key === c.key && nearby[i]?.f.id === n.f.id) nearby[i] = { ...nearby[i], deps }; });
        });
        for (let i = 5; i < nearby.length; i++) nearby[i] = { ...nearby[i], deps: null };
        return;
      }
      const hours = await hoursP;
      if (category?.key !== c.key) return;
      nearby = list.map((n) => {
        const h = hours.v[hours.k[String(n.f.id)]];
        return { ...n, st: h ? hoursStatus(h, n.f.geometry.coordinates[1], n.f.geometry.coordinates[0]) : null };
      });
      nearbyDone = true;
    };
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
    category = null;
    nearby = [];
    map?.setFilter('poi-hit', ['==', ['get', 'subclass'], '__none__']);
  }

  function dist(lat1, lon1, lat2, lon2) {
    const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    return Math.hypot(x, lat2 - lat1) * 111320;
  }

  function openCategoryFromSearch() {
    const c = catHit;          // à lire avant de vider la recherche (catHit en dépend)
    query = '';
    focused = false;
    document.activeElement?.blur();
    pickCategory(c);
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
      if (which === 'from') from = pt; else to = pt;
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

  function say(msg) {
    toast = msg;
    setTimeout(() => (toast = ''), 3500);
  }

  // La position reste sur l'appareil : elle n'est envoyée qu'aux moteurs d'itinéraire, au moment du calcul.
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('unsupported'));
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          me = { label: 'Votre position', lat: coords.latitude, lon: coords.longitude, isMe: true };
          if (!meMarker) {
            const el = document.createElement('div');
            el.className = 'me';
            meMarker = new maplibregl.Marker({ element: el });
          }
          meMarker.setLngLat([me.lon, me.lat]).addTo(map);
          resolve(me);
        },
        reject,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  // À l'ouverture, comme les cartes de référence : on se centre sur vous si vous l'acceptez.
  // Refus ou erreur : la carte reste sur Paris, sans message d'erreur.
  async function startupLocate() {
    try {
      const perm = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
      if (perm?.state === 'denied') return;
      let firstTime = false;
      try { firstTime = !localStorage.getItem('position-expliquee'); localStorage.setItem('position-expliquee', '1'); } catch { /* rien */ }
      if (firstTime && perm?.state !== 'granted' && !showPromise) say('Votre position reste sur votre téléphone.');
      const p = await getPosition();
      if (!place && !category && !directions) map.flyTo({ center: [p.lon, p.lat], zoom: 15.5, duration: 900 });
    } catch { /* on reste sur Paris */ }
  }

  async function locate() {
    locating = true;
    try {
      const p = await getPosition();
      map.flyTo({ center: [p.lon, p.lat], zoom: 16, duration: 800 });
    } catch {
      say('Localisation refusée. Autorisez-la dans les réglages du navigateur.');
    } finally {
      locating = false;
    }
  }

  // Point choisi en touchant la carte : on retrouve l'adresse la plus proche.
  async function pickOnMap(which, { lng, lat }) {
    const pt = { label: 'Point sur la carte', lat, lon: lng };
    if (which === 'from') from = pt; else { to = pt; placeMarker(lng, lat); }
    editing = null;
    lastEdit = { which: null, at: 0 };
    fieldQuery = '';
    results = [];
    computeRoutes();
    const label = await reverse(lat, lng).catch(() => null);
    if (label) {
      // (les objets d'état sont des copies : on compare les coordonnées)
      const same = (q) => q && q.lat === lat && q.lon === lng;
      if (which === 'from' && same(from)) from = { ...pt, label };
      if (which === 'to' && same(to)) to = { ...pt, label };
    }
  }

  // ——— Itinéraire ———
  async function startDirections() {
    directions = true;
    dimPlaces(true);
    to = { label: place.name, lat: place.lat, lon: place.lon };
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
    if (place) { placeMarker(place.lon, place.lat); frame(place.lon, place.lat); }
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
      .catch(() => say('Localisation refusée. Choisissez un point de départ.'));
  }

  function swap() {
    [from, to] = [to, from];
    if (to) placeMarker(to.lon, to.lat);
    computeRoutes();
  }

  let routeCtrl;
  function computeRoutes() {
    routeCtrl?.abort();
    if (!from || !to) return;
    routeCtrl = new AbortController();
    const signal = routeCtrl.signal;
    picked = 0;
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
    run('walk', () => streetRoute(from, to, 'walk', signal));
    run('bike', () => streetRoute(from, to, 'bike', signal));
    run('transit', () => transitRoutes(from, to, signal));
    run('car', async () => {
      const r = await streetRoute(from, to, 'car', signal);
      const t = await trafficEstimate(from, to);
      return { ...r, freeDuration: r.duration, duration: r.duration * t.factor, traffic: t.label };
    });
  }

  function chooseMode(m) {
    mode = m;
    picked = 0;
    drawRoute();
  }

  function pickTransit(i) {
    picked = i;
    drawRoute();
  }

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
      const nextRide = after.find((l) => l.mode !== 'WALK');
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
      <li class="shortcuts">
        {#each ['home', 'work'] as k}
          <button onmousedown={(e) => { e.preventDefault(); useShortcut(k); }} class:unset={!shortcuts[k]}>
            <span class="sc-icon" aria-hidden="true">{#if k === 'home'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v9.5h11V10" /><path d="M10.2 19.5v-4.8h3.6v4.8" /></svg>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17" /></svg>{/if}</span>
            <span class="r-text"><span class="r-name">{SHORT_NAMES[k]}</span>
              <span class="r-meta">{shortcuts[k] ? (shortcuts[k].name || '').split(',')[0] : 'Ajouter'}</span></span>
          </button>
        {/each}
      </li>
    {/if}
    {#if assigning && activeQuery.trim().length < 2}
      <li class="note">Tapez l'adresse de votre {assigning === 'home' ? 'maison' : 'travail'}, puis choisissez-la dans la liste.
        <button class="link" onmousedown={(e) => { e.preventDefault(); assigning = null; }}>Annuler</button></li>
    {/if}
    {#if activeQuery.trim().length < 2 && favorites.length}
      <li class="note recents-head"><span>Favoris</span></li>
      {#each favorites.slice(0, editing ? 5 : 8) as r (r.id + r.lat)}
        <li role="option" aria-selected="false">
          <button onmousedown={() => pickResult(r)}>
            <span class="r-icon fav-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 20.3l-1.3-1.2C6 14.9 3 12.2 3 8.9 3 6.2 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.2 21 8.9c0 3.3-3 6-7.7 10.2z" class="solid" /></svg>
            </span>
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
            <span class="r-name">{catHit.label} près de vous</span>
            <span class="r-meta">Les plus proches, avec leurs horaires</span>
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

<div class="app" class:routing={directions}>
  <div class="map" bind:this={mapEl} aria-label="Carte"></div>

  {#if !directions}
    <header class="top">
      <div class="search" class:open={showList}>
        <svg class="lens" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20" /></svg>
        <input id="search" type="search" placeholder="Rechercher un lieu ou une adresse" aria-label="Rechercher un lieu ou une adresse"
          autocomplete="off" enterkeyhint="search" bind:value={query}
          onfocus={() => (focused = true)} onblur={() => setTimeout(() => (focused = false), 150)} onkeydown={onKey} />
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
              <span class="chip-dot" aria-hidden="true"></span>{c.label}
            </button>
          {/each}
          <button class="chip edit" onclick={() => (editChips = true)} aria-label="Personnaliser les raccourcis">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
          </button>
        </nav>
      {/if}
    </header>
  {:else}
    <header class="top dir">
      <div class="dir-card" class:open={editing}>
        <button class="icon-btn back" onclick={closeDirections} aria-label="Revenir à la fiche du lieu">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div class="fields">
          {#each [['from', from, 'Choisir un point de départ'], ['to', to, 'Choisir une destination']] as [which, pt, ph]}
            <div class="field" class:editing={editing === which}>
              <span class="field-mark {which}" aria-hidden="true"></span>
              {#if editing === which}
                <input id={`field-${which}`} bind:this={fieldEl} bind:value={fieldQuery} placeholder={ph} autocomplete="off"
                  aria-label={which === 'from' ? 'Départ' : 'Arrivée'} onkeydown={onKey}
                  onblur={() => { lastEdit = { which, at: Date.now() }; setTimeout(() => { if (editing === which && (which === 'from' ? from : to)) editing = null; }, 250); }} />
              {:else}
                <button class="field-btn" class:placeholder={!pt} onclick={() => editField(which)}>
                  {pt ? pt.label : ph}
                </button>
              {/if}
            </div>
          {/each}
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
                {:else if r.status === 'ok'}{fmtDuration(m.id === 'transit' ? r.data[0].duration : r.data.duration)}
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
      {#if showModes}
        <div class="modes-pop" role="menu" aria-label="Type de carte">
          <button role="menuitemradio" aria-checked={mapMode === 'plan'} class:on={mapMode === 'plan'} onclick={() => setMapMode('plan')}>
            <span class="thumb plan" aria-hidden="true"></span>Plan
          </button>
          <button role="menuitemradio" aria-checked={mapMode === 'transit'} class:on={mapMode === 'transit'} onclick={() => setMapMode('transit')}>
            <span class="thumb transit" aria-hidden="true"></span>Transports
          </button>
        </div>
      {/if}
      <button class="round-btn" onclick={() => (showModes = !showModes)} aria-label="Type de carte" aria-expanded={showModes}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.5 8.5 4.5L12 12.5 3.5 8z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" /></svg>
      </button>
    </div>
  {/if}
  <button class="locate" class:busy={locating} onclick={locate} aria-label="Me localiser">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4 4 11l7 2 2 7z" class="solid" /></svg>
  </button>
  {#if toast}<p class="toast" role="status">{toast}</p>{/if}
  {#if showPromise && !place && !category && !directions && !importOpen && !editChips}
    <div class="promise" role="note">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
      <p><strong>Une carte qui ne vous piste pas.</strong> Ni compte, ni publicité, rien sur vous n'est collecté. Vos favoris restent sur votre téléphone.</p>
      <button onclick={closePromise}>Compris</button>
    </div>
  {/if}

  {#if importOpen && !directions}
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
  {:else if directions && !editing}
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
        {@const r = current.data}
        <div class="summary">
          <p class="big">{fmtDuration(r.duration)}</p>
          <p class="sub">{fmtDistance(r.distance)} · arrivée vers {arrival(r.duration)}</p>
          {#if mode === 'bike'}
            <p class="traffic-note">Itinéraire adapté aux vélos : pistes cyclables et rues calmes en priorité.</p>
          {/if}
          {#if mode === 'car'}
            <p class="traffic-note">{r.traffic ? `Estimation avec le ${r.traffic}` : 'Estimation sur route fluide'}, d'après les capteurs de la Ville de Paris. Pas de trafic en temps réel : nous ne suivons pas les téléphones.</p>
          {/if}
        </div>
        <ol class="steps">
          {#each r.steps as s}
            <li><span>{s.text}</span>{#if s.distance >= 10}<span class="step-dist">{fmtDistance(s.distance)}</span>{/if}</li>
          {/each}
          <li class="arrive"><span>Arrivée : {to.label}</span></li>
        </ol>
      {:else}
        <ul class="options">
          {#each current.data as it, i}
            <li>
              <button class="option" class:on={picked === i} onclick={() => pickTransit(i)} aria-expanded={picked === i}>
                <span class="opt-top">
                  <span class="chain">
                    {#each it.legs as leg, j}
                      {#if j > 0}<span class="sep" aria-hidden="true">›</span>{/if}
                      {#if leg.mode === 'WALK'}
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
                <ol class="legs">
                  {#each it.legs as leg, li}
                    {#if leg.mode === 'WALK'}
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
      <button class="share" onclick={sharePlace} aria-label="Partager ce lieu">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8 7.5l4-4 4 4M6 11.5H5v8h14v-8h-1" /></svg>
      </button>
      <button class="close" onclick={closePlace} aria-label="Fermer la fiche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>

      <h1>{title}</h1>
      <p class="kind">{isAddress
        ? (place.name.split(',').slice(1).join(',').trim() || place.address || 'Adresse')
        : [stationKind || info?.kind || place.type, info?.cuisine && info.cuisine.split(';')[0].replace(/_/g, ' ')].filter(Boolean).join(' · ') || 'Lieu'}</p>
      {#if info === null}
        <p class="status muted">Chargement…</p>
      {:else if status}
        <p class="status" class:is-open={status.open === true} class:is-closed={status.open === false}>{status.label}</p>
      {/if}

      <div class="actions">
        <button class="action primary" onclick={startDirections}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 21.2 12 12 21.2 2.8 12z" class="solid" /><path d="M9.5 14.5v-2.2a1.5 1.5 0 0 1 1.5-1.5h4M13 8.8l2 2-2 2" class="on-solid" /></svg>
          <span class="act-label">Itinéraire{#if walkEta}<small aria-label={walkEta}>{walkEta.replace(' à pied', '')}</small>{/if}</span>
        </button>
        <button class="action" class:saved={isFav} onclick={toggleFavorite} aria-pressed={isFav}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3l-1.3-1.2C6 14.9 3 12.2 3 8.9 3 6.2 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.2 21 8.9c0 3.3-3 6-7.7 10.2z" /></svg>
          {isFav ? 'Enregistré' : 'Enregistrer'}
        </button>
        {#if info?.phone}
          <a class="action" href={`tel:${info.phone.replace(/\s/g, '')}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l2 4.6-2.3 1.6a12 12 0 0 0 6.1 6.1l1.6-2.3L21 15l-.5 2.4A3 3 0 0 1 17.6 20C10 20 4 14 4 6.4a3 3 0 0 1 2.6-2.9z" /></svg>
            Appeler
          </a>
        {/if}
        {#if info?.website}
          <a class="action" href={href(info.website)} target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5M12 3.5C9.5 6.1 8.4 8.9 8.4 12s1.1 5.9 3.6 8.5" /></svg>
            Site web
          </a>
        {/if}
      </div>

      {#if wiki?.photo}
        <figure class="photo">
          <img src={wiki.photo.src} alt={title} loading="lazy" />
          <figcaption><a href={wiki.photo.page} target="_blank" rel="noopener">Photo : {wiki.photo.credit || 'Wikimedia Commons'} · Wikimedia Commons</a></figcaption>
        </figure>
      {/if}
      {#if wiki?.extract}
        <div class="about">
          <h2>Informations</h2>
          <p class:clamped={!moreText}>{wiki.extract}</p>
          {#if !moreText && wiki.extract.length > 180}<button class="link more" onclick={() => (moreText = true)}>Plus</button>{/if}
          <p class="credit">Plus d'infos sur <a href={wiki.url} target="_blank" rel="noopener">Wikipédia</a></p>
        </div>
      {/if}

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

      <ul class="rows">
        {#if address}
          <li class="row">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
            <span>{address}</span>
          </li>
        {/if}
        {#if status}
          <li class="row">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            <button class="row-btn" onclick={() => (showWeek = !showWeek)} aria-expanded={showWeek}>
              <span>{showWeek ? 'Masquer les horaires' : 'Voir les horaires de la semaine'}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" class="chev" class:flip={showWeek}><path d="m7 10 5 5 5-5" /></svg>
            </button>
          </li>
          {#if week}
            <li class="week-row">
              <table class="week"><tbody>
                {#each week as d}<tr class:today={d.today}><th>{d.day}</th><td>{d.text}</td></tr>{/each}
              </tbody></table>
            </li>
          {/if}
        {:else if info?.expectsHours && !isStation}
          <li class="row muted">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            <span>Horaires non renseignés<small class="why">Personne ne les a encore ajoutés à la carte collaborative que nous utilisons (OpenStreetMap).</small></span>
          </li>
        {/if}
        {#if info?.phone}
          <li class="row">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l2 4.6-2.3 1.6a12 12 0 0 0 6.1 6.1l1.6-2.3L21 15l-.5 2.4A3 3 0 0 1 17.6 20C10 20 4 14 4 6.4a3 3 0 0 1 2.6-2.9z" /></svg>
            <a class="row-link" href={`tel:${info.phone.replace(/\s/g, '')}`}>{info.phone}</a>
          </li>
        {/if}
        {#if info?.website}
          <li class="row">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5M12 3.5C9.5 6.1 8.4 8.9 8.4 12s1.1 5.9 3.6 8.5" /></svg>
            <a class="row-link" href={href(info.website)} target="_blank" rel="noopener">{host(info.website)}</a>
          </li>
        {/if}
        {#if !isStation}
          <li class="row sc-row">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v9.5h11V10" /><path d="M10.2 19.5v-4.8h3.6v4.8" /></svg>
            {#if placeShortcut}
              <span>Votre {SHORT_NAMES[placeShortcut].toLowerCase()}</span>
              <button class="link" onclick={() => { setShortcut(placeShortcut, null); say('Raccourci retiré'); }}>Retirer</button>
            {:else}
              <span>Définir comme</span>
              <button class="link" onclick={() => { setShortcut('home', place); say('Maison enregistrée · gardée sur cet appareil'); }}>Maison</button>
              <button class="link" onclick={() => { setShortcut('work', place); say('Travail enregistré · gardé sur cet appareil'); }}>Travail</button>
            {/if}
          </li>
        {/if}
        {#each info?.practical || [] as d}
          <li class="row">
            {#if d.icon === 'wheelchair'}
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="4.5" r="1.8" /><path d="M11 7.5v6h5l2 5M11 10h4M8.5 11.2a5 5 0 1 0 6.3 6.3" /></svg>
            {:else if d.icon === 'ticket'}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" /><path d="M14 7v10" stroke-dasharray="2 2" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 20.5h17M5 20.5v-9M19 20.5v-9M9 20.5v-9M15 20.5v-9M3.5 11.5h17L12 4z" /></svg>
            {/if}
            <span>{d.text}</span>
          </li>
        {/each}
      </ul>
      {#if info?.checkDate}
        <p class="fresh">Informations vérifiées le {new Date(info.checkDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      {/if}
    </section>
  {:else if category && !directions}
    <section class="sheet" aria-label={category.label} use:draggable={{ key: category.label, onDismiss: clearCategory }}>
      <button class="grip" aria-label="Agrandir la fiche"></button>
      <button class="close" onclick={clearCategory} aria-label="Fermer la liste">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
      <h1>{chipList.find((c) => c.key === category.key)?.label || category.label}</h1>
      <p class="kind">{nearby.length ? (nearbyFromMe ? 'Les plus proches de vous' : 'Autour du centre de la carte') : nearbyDone ? 'Aucun dans cette zone. Déplacez la carte pour chercher ailleurs.' : 'Recherche…'}</p>
      <ul class="nearby">
        {#each nearby as { f, d, st, deps: sd } (f.id)}
          <li>
            <button onclick={() => openFeature(f)}>
              <span class="n-dot" style:--fam={famColor(category)} aria-hidden="true"></span>
              <span class="r-text">
                <span class="r-name">{f.properties.name}</span>
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
                <span class="r-meta">{typeLabel('', f.properties.subclass) || category.label}{#if st?.open != null}{' · '}<span class:is-open={st.open} class:is-closed={!st.open}>{st.label}</span>{/if}</span>
                {/if}
              </span>
              <span class="n-dist">{fmtDistance(d)}</span>
            </button>
          </li>
        {/each}
      </ul>
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
  .locate.busy svg { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .toast {
    position: absolute; z-index: 4; left: 12px; right: 72px; bottom: calc(52px + env(safe-area-inset-bottom));
    margin: 0; padding: 13px 16px; background: rgb(28 29 31 / 0.92); color: #fff; border-radius: 14px; font-size: 14px; max-width: 360px;
  }

  :global(.pin) {
    width: 30px; height: 40px;
    background: no-repeat center / contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 40'%3E%3Cpath d='M15 1.5C7.5 1.5 1.5 7.4 1.5 14.7 1.5 25 15 38.5 15 38.5S28.5 25 28.5 14.7C28.5 7.4 22.5 1.5 15 1.5z' fill='%23D93A2F' stroke='%23fff' stroke-width='2'/%3E%3Ccircle cx='15' cy='14.5' r='5' fill='%23fff'/%3E%3C/svg%3E");
    filter: drop-shadow(0 3px 4px rgb(0 0 0 / 0.3));
  }
  :global(.me) {
    width: 18px; height: 18px; border-radius: 50%; background: var(--accent);
    border: 3px solid #fff; box-shadow: 0 0 0 10px rgb(42 91 215 / 0.16), 0 1px 4px rgb(0 0 0 / 0.3);
  }

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
  .share {
    position: absolute; top: 14px; right: 54px; width: 32px; height: 32px; border-radius: 50%;
    border: 0; background: var(--fill); cursor: pointer; display: grid; place-items: center; color: var(--muted);
  }
  .share svg { width: 17px; height: 17px; stroke-width: 2.1; }
  .share ~ h1 { margin-right: 88px; }
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

  .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
  .action {
    display: grid; justify-items: center; gap: 4px; padding: 10px 8px; border-radius: 14px; border: 0; cursor: pointer;
    background: var(--fill); color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600;
  }
  .action svg { width: 22px; height: 22px; }
  .action.primary { background: var(--accent-btn); color: #fff; }
  .action.saved { color: var(--fav); }
  .action.saved svg path { fill: var(--fav); stroke: var(--fav); }
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
  .fresh { margin: 14px 0 0; font-size: 13px; color: var(--muted); }

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
      left: 16px; right: auto; bottom: auto; top: 128px; width: 400px; max-height: calc(100vh - 150px);
      border-radius: 20px; padding: 18px 22px 22px; box-shadow: var(--shadow-float); animation-name: appear;
    }
    .routing .sheet { top: 172px; max-height: calc(100vh - 194px); }
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
