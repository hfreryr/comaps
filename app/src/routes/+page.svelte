<script>
  import { onMount, tick } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { search, details, reverse, reverseAddress, typeLabel, PARIS } from '#lib/places.js';
  import { hoursStatus, hoursTable } from '#lib/hours.js';
  import { mapStyle, provideImage, osmRef, FAMILIES } from '#lib/mapstyle.js';
  import { streetRoute, transitRoutes, departures, MODE_NAMES, fmtDuration, fmtTime, fmtWait, fmtDistance } from '#lib/routing.js';

  const CATEGORIES = [
    { label: 'Restaurants', classes: ['restaurant', 'fast_food'], family: 'food' },
    { label: 'Cafés', classes: ['cafe'], family: 'cafe' },
    { label: 'Boulangeries', classes: ['bakery', 'pastry'], family: 'bakery' },
    { label: 'Pharmacies', classes: ['pharmacy'], family: 'health' },
    { label: 'Courses', classes: ['supermarket', 'convenience', 'grocery'], family: 'shop' },
    { label: 'Musées', classes: ['museum', 'art_gallery', 'gallery'], family: 'culture' },
    { label: 'Bars', classes: ['bar', 'pub', 'beer'], family: 'bar' }
  ];
  const MODES = [
    { id: 'walk', label: 'À pied' },
    { id: 'bike', label: 'Vélo' },
    { id: 'transit', label: 'Transports' }
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

  let place = $state(null);
  let info = $state(null);
  let showWeek = $state(false);
  let deps = $state(null);           // prochains passages d'une station : { status, data? }
  let now = $state(Date.now());
  let locating = $state(false);
  let toast = $state('');
  let me = $state(null); // dernière position connue de l'utilisateur, gardée sur l'appareil

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
  const showList = $derived(editing ? true : focused && query.trim().length >= 2);
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
    const base = new URL('.', location.href).href;
    map = new maplibregl.Map({
      container: mapEl,
      style: mapStyle(base),
      center: [PARIS.lon, PARIS.lat],
      zoom: 13,
      hash: 'carte',
      attributionControl: { compact: true, customAttribution:
        'Itinéraires <a href="https://valhalla1.openstreetmap.de" target="_blank" rel="noopener">Valhalla / FOSSGIS</a>, <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous</a> · <a href="https://github.com/hfreryr/comaps" target="_blank" rel="noopener">Projet libre</a>' },
      fadeDuration: 200
    });
    map.setMissingStyleImageResolver((id) => provideImage(map, id));
    if (location.hostname === 'localhost') window.__map = map; // pour les tests locaux
    map.once('load', () => {
      document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      addRouteLayers();
    });
    map.on('click', onMapClick);
    // Appui long (ou clic droit) : adresse du point, même si une fiche est ouverte.
    map.on('contextmenu', (e) => { if (!directions) openPoint(e.lngLat); });
    for (const id of ['poi', 'poi-other', 'poi-hit', 'landmark', 'metro']) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    return () => map.remove();
  });

  // ——— Carte ———
  function addRouteLayers() {
    map.addSource('route', { type: 'geojson', data: empty() });
    const before = 'water-name-point';
    const width = (a, b) => ['interpolate', ['exponential', 1.4], ['zoom'], 12, a, 18, b];
    // Trajets à pied, à vélo et en transport : trait plein, liseré foncé puis bord blanc.
    map.addLayer({ id: 'route-halo', type: 'line', source: 'route', filter: ['!=', ['get', 'kind'], 'transfer'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#FFFFFF', 'line-width': width(9, 17) } }, before);
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
      feats.push(mode === 'walk' ? line(r.coords, 'walk', WALK_COLOR, '#1B3F9E') : line(r.coords, 'bike', BIKE_COLOR, '#13612A'));
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
    if (place === p || place?.id === p.id) place = { ...p, name: label || 'Point sélectionné' };
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

  async function openPlace(p) {
    place = p;
    info = null;
    deps = null;
    showWeek = false;
    focused = false;
    document.activeElement?.blur();
    placeMarker(p.lon, p.lat);
    frame(p.lon, p.lat);
    if (STATION_TYPES.includes(p.type)) loadDepartures(p);
    try { info = await details(p); } catch { info = {}; }
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

  function pickCategory(c) {
    if (category === c) return clearCategory();
    category = c;
    closePlace();
    map.setFilter('poi-hit', ['match', ['get', 'subclass'], c.classes, true, false]);
    const collect = () => {
      const center = map.getCenter();
      const seen = new Set();
      nearby = map.querySourceFeatures('omt', { sourceLayer: 'poi',
          filter: ['all', ['has', 'name'], ['match', ['get', 'subclass'], c.classes, true, false]] })
        .filter((f) => !seen.has(f.id) && seen.add(f.id))
        .map((f) => ({ f, d: dist(center.lat, center.lng, f.geometry.coordinates[1], f.geometry.coordinates[0]) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 25);
    };
    if (map.getZoom() < 15) { map.flyTo({ zoom: 15.5, duration: 700 }); map.once('idle', collect); }
    else collect();
  }

  function clearCategory() {
    category = null;
    nearby = [];
    map.setFilter('poi-hit', ['==', ['get', 'subclass'], '__none__']);
  }

  function dist(lat1, lon1, lat2, lon2) {
    const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    return Math.hypot(x, lat2 - lat1) * 111320;
  }

  function onKey(e) {
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
    query = r.name;
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
    routes = { walk: { status: 'loading' }, bike: { status: 'loading' }, transit: { status: 'loading' } };
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
  const famColor = (c) => FAMILIES[c.family].color;
</script>

{#snippet modeIcon(id)}
  {#if id === 'walk'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4.5" r="1.9" class="solid" /><path d="m9.5 21 2.2-7 2.6 2.6V21M7.5 12.5 10 8.4l3.4.4 1.9 3 2.7 1.2M11.7 14l-.9-4.7" /></svg>
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
          {#each CATEGORIES as c}
            <button class="chip" class:on={category === c} onclick={() => pickCategory(c)} style:--fam={famColor(c)} aria-pressed={category === c}>
              <span class="chip-dot" aria-hidden="true"></span>{c.label}
            </button>
          {/each}
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

  {#if directions && !editing}
    <section class="sheet" aria-label="Itinéraire">
      <div class="grip" aria-hidden="true"></div>
      {#if !from}
        <p class="empty">Choisissez un point de départ pour calculer l'itinéraire.</p>
      {:else if !current || current.status === 'loading'}
        <p class="empty">Calcul de l'itinéraire…</p>
      {:else if current.status === 'none' && mode === 'transit' && routes.walk?.status === 'ok'}
        <p class="empty">Pas de transport utile sur ce trajet : à pied, c'est {fmtDuration(routes.walk.data.duration)}.</p>
        <button class="retry" onclick={() => chooseMode('walk')}>Voir le trajet à pied</button>
      {:else if current.status === 'none'}
        <p class="empty">Aucun itinéraire {mode === 'transit' ? 'en transports en commun' : mode === 'bike' ? 'à vélo' : 'à pied'} trouvé entre ces deux points.</p>
      {:else if current.status === 'error'}
        <p class="empty">Le service d'itinéraire ne répond pas. Réessayez dans un instant.</p>
        <button class="retry" onclick={computeRoutes}>Réessayer</button>
      {:else if mode !== 'transit'}
        {@const r = current.data}
        <div class="summary">
          <p class="big">{fmtDuration(r.duration)}</p>
          <p class="sub">{fmtDistance(r.distance)} · arrivée vers {arrival(r.duration)}</p>
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
                  {#each it.legs as leg}
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
        <p class="credit">Horaires : <a href="https://transitous.org/sources/" target="_blank" rel="noopener">Transitous et réseaux de transport</a></p>
      {/if}
    </section>
  {:else if place && !directions}
    <section class="sheet" aria-label={place.name}>
      <div class="grip" aria-hidden="true"></div>
      <button class="close" onclick={closePlace} aria-label="Fermer la fiche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>

      <h1>{title}</h1>
      <p class="kind">{isAddress
        ? (place.name.split(',').slice(1).join(',').trim() || place.address || 'Adresse')
        : [stationKind || place.type, info?.cuisine && info.cuisine.split(';')[0].replace(/_/g, ' ')].filter(Boolean).join(' · ') || 'Lieu'}</p>
      {#if info === null}
        <p class="status muted">Chargement…</p>
      {:else if status}
        <p class="status" class:is-open={status.open === true} class:is-closed={status.open === false}>{status.label}</p>
      {/if}

      <div class="actions">
        <button class="action primary" onclick={startDirections}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 21.2 12 12 21.2 2.8 12z" class="solid" /><path d="M9.5 14.5v-2.2a1.5 1.5 0 0 1 1.5-1.5h4M13 8.8l2 2-2 2" class="on-solid" /></svg>
          Itinéraire
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
        {:else if info && !isAddress && !isStation && place.type !== 'Rue'}
          <li class="row muted">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            <span>Horaires non renseignés</span>
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
      </ul>
      {#if info?.checkDate}
        <p class="fresh">Informations vérifiées le {new Date(info.checkDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      {/if}
    </section>
  {:else if category && !directions}
    <section class="sheet" aria-label={category.label}>
      <div class="grip" aria-hidden="true"></div>
      <button class="close" onclick={clearCategory} aria-label="Fermer la liste">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
      <h1>{category.label}</h1>
      <p class="kind">{nearby.length ? `${nearby.length} à proximité du centre de la carte` : 'Aucun dans cette zone. Déplacez la carte pour chercher ailleurs.'}</p>
      <ul class="nearby">
        {#each nearby as { f, d } (f.id)}
          <li>
            <button onclick={() => openFeature(f)}>
              <span class="n-dot" style:--fam={famColor(category)} aria-hidden="true"></span>
              <span class="r-text">
                <span class="r-name">{f.properties.name}</span>
                <span class="r-meta">{typeLabel('', f.properties.subclass) || category.label}</span>
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
    --open: #1e8e3e;
    --closed: #c5221f;
    --shadow-float: 0 0 0 0.5px rgb(0 0 0 / 0.06), 0 2px 6px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.08);
    --shadow-chip: 0 0 0 0.5px rgb(0 0 0 / 0.07), 0 1px 4px rgb(0 0 0 / 0.12);
    --shadow-sheet: 0 -1px 0 rgb(0 0 0 / 0.04), 0 -8px 30px rgb(0 0 0 / 0.12);
    --ui: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }
  :global(html, body) {
    margin: 0; height: 100%; overflow: hidden; background: #f6f4f0;
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
    display: grid; gap: 10px;
  }
  .top > * { pointer-events: auto; }
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
  .me-icon { background: #e8eefc; color: var(--accent); }
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
  .field-mark.from { border: 2.5px solid #1d1f22; width: 7px; height: 7px; }
  .field-mark.to { background: #d93a2f; }
  .fields::before {
    content: ''; position: absolute; left: 10px; top: 28px; bottom: 28px; width: 2px;
    background: repeating-linear-gradient(#c9ccd1 0 2px, transparent 2px 5px);
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

  .modes { display: flex; gap: 8px; }
  .mode {
    flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 40px; border: 0; border-radius: 20px; background: var(--card); box-shadow: var(--shadow-float);
    font-size: 14.5px; font-weight: 600; cursor: pointer; color: var(--ink); font-variant-numeric: tabular-nums;
  }
  .mode svg { width: 20px; height: 20px; }
  .mode.on { background: var(--accent); color: #fff; }
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

  /* ——— Fiches ——— */
  .sheet {
    position: absolute; z-index: 3; left: 0; right: 0; bottom: 0;
    max-height: 46vh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--card); border-radius: 26px 26px 0 0; box-shadow: var(--shadow-sheet);
    padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
    animation: rise 280ms cubic-bezier(0.2, 0.9, 0.25, 1);
  }
  @keyframes rise { from { transform: translateY(60px); opacity: 0.4; } }
  .grip { width: 36px; height: 5px; border-radius: 3px; background: #d8d8dc; margin: 0 auto 12px; }
  .close {
    position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%;
    border: 0; background: var(--fill); cursor: pointer; display: grid; place-items: center; color: var(--muted);
  }
  .close svg { width: 16px; height: 16px; stroke-width: 2.4; }
  h1 { font-size: 24px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; margin: 2px 44px 2px 0; text-wrap: balance; }
  .kind { margin: 0; color: var(--muted); font-size: 15px; }
  .kind::first-letter { text-transform: uppercase; }
  .status { margin: 6px 0 0; font-size: 15.5px; font-weight: 600; }
  .status.is-open { color: var(--open); }
  .status.is-closed { color: var(--closed); }
  .muted { color: var(--muted); font-weight: 400; }

  .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
  .action {
    display: grid; justify-items: center; gap: 4px; padding: 10px 8px; border-radius: 14px; border: 0; cursor: pointer;
    background: var(--fill); color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600;
  }
  .action svg { width: 22px; height: 22px; }
  .action.primary { background: var(--accent); color: #fff; }
  .action.primary .on-solid { stroke: var(--accent); stroke-width: 2; }

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
  .n-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--fam); box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--line); justify-self: center; }
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

  .options { list-style: none; margin: 0 -20px; padding: 0; }
  .options > li + li { border-top: 1px solid var(--line); }
  .option { display: grid; gap: 6px; width: 100%; border: 0; background: none; padding: 12px 20px; text-align: left; cursor: pointer; }
  .option.on { background: #f5f8ff; }
  .opt-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .chain { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
  .sep { color: #b4b7bc; font-size: 15px; }
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

  .legs { list-style: none; margin: 0; padding: 4px 20px 14px; background: #f5f8ff; }
  .leg { display: grid; grid-template-columns: 44px 16px 1fr; gap: 10px; min-height: 52px; }
  .leg-time { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; padding-top: 1px; }
  .leg-rail { width: 6px; border-radius: 3px; justify-self: center; margin-top: 4px; }
  .leg-rail.walk { width: 4px; background: repeating-linear-gradient(#9aa3ae 0 4px, transparent 4px 8px); }
  .leg-rail.end { width: 12px; height: 12px; border-radius: 50%; background: #d93a2f; margin-top: 3px; }
  .leg-body { display: grid; gap: 3px; padding-bottom: 12px; min-width: 0; }
  .leg-place { font-size: 15px; font-weight: 600; }
  .leg-meta { font-size: 13.5px; color: var(--muted); display: flex; align-items: center; flex-wrap: wrap; }
  .credit { font-size: 12.5px; color: var(--muted); margin: 12px 0 0; }
  .credit a { color: inherit; }

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
  :global(.maplibregl-ctrl-bottom-right) { margin-bottom: env(safe-area-inset-bottom); }
</style>
