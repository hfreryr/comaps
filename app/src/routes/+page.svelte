<script>
  import { onMount } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { search, details, typeLabel, PARIS } from '#lib/places.js';
  import { hoursStatus, hoursTable } from '#lib/hours.js';
  import { mapStyle, dotImage, metroImage, osmRef, FAMILIES } from '#lib/mapstyle.js';

  const CATEGORIES = [
    { label: 'Restaurants', classes: ['restaurant', 'fast_food'], family: 'food' },
    { label: 'Cafés', classes: ['cafe'], family: 'food' },
    { label: 'Boulangeries', classes: ['bakery', 'pastry'], family: 'food' },
    { label: 'Pharmacies', classes: ['pharmacy'], family: 'health' },
    { label: 'Courses', classes: ['supermarket', 'convenience', 'grocery'], family: 'shop' },
    { label: 'Musées', classes: ['museum', 'art_gallery', 'gallery'], family: 'culture' },
    { label: 'Bars', classes: ['bar', 'pub', 'beer'], family: 'food' }
  ];

  let mapEl;
  let map;
  let marker;
  let meMarker;

  let query = $state('');
  let results = $state([]);
  let searching = $state(false);
  let searchError = $state('');
  let focused = $state(false);
  let active = $state(-1);

  let category = $state(null);   // raccourci actif
  let nearby = $state([]);       // lieux de la catégorie autour du centre

  let place = $state(null);
  let info = $state(null);
  let showWeek = $state(false);
  let locating = $state(false);
  let toast = $state('');

  const status = $derived(info?.hours ? hoursStatus(info.hours, place.lat, place.lon) : null);
  const week = $derived(showWeek && info?.hours ? hoursTable(info.hours, place.lat, place.lon) : null);
  const showList = $derived(focused && query.trim().length >= 2);
  const address = $derived(info?.address || place?.address || '');

  onMount(() => {
    maplibregl.setWorkerUrl(workerUrl);
    map = new maplibregl.Map({
      container: mapEl,
      style: mapStyle(),
      center: [PARIS.lon, PARIS.lat],
      zoom: 13,
      hash: 'carte',
      attributionControl: { compact: true }
    });
    map.on('styleimagemissing', (e) => {
      if (e.id === 'dot' && !map.hasImage('dot')) map.addImage('dot', dotImage(), { sdf: true });
      if (e.id === 'metro' && !map.hasImage('metro')) map.addImage('metro', metroImage(), { pixelRatio: 1 });
    });
    // Mention des sources repliée par défaut (toujours accessible via le bouton « i »).
    map.once('load', () => {
      document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
    map.on('click', onMapClick);
    for (const id of ['poi', 'poi-hit', 'metro']) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    return () => map.remove();
  });

  // Toucher un lieu sur la carte ouvre sa fiche.
  function onMapClick(e) {
    const f = map.queryRenderedFeatures(e.point, { layers: ['poi-hit', 'poi', 'metro'] })[0];
    if (!f) { if (place) closePlace(); return; }
    openFeature(f);
  }

  function openFeature(f) {
    const ref = osmRef(f.id);
    const [lon, lat] = f.geometry.coordinates;
    openPlace({
      id: String(f.id),
      ...ref,
      name: f.properties.name,
      type: typeLabel('', f.properties.subclass) || typeLabel('', f.properties.class),
      address: '',
      lat, lon
    });
  }

  // Recherche au fil de la frappe, avec un léger délai pour ne pas surcharger le serveur.
  let timer;
  let controller;
  $effect(() => {
    const q = query.trim();
    clearTimeout(timer);
    controller?.abort();
    searchError = '';
    if (q.length < 2 || q === place?.name) { results = []; searching = false; return; }
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
    map.flyTo({
      center: [lon, lat],
      zoom: Math.max(map.getZoom(), 16.5),
      padding: mobile ? { bottom: window.innerHeight * 0.45, top: 120 } : { left: 420 },
      duration: 800
    });
  }

  async function openPlace(p) {
    place = p;
    info = null;
    showWeek = false;
    focused = false;
    document.activeElement?.blur();

    if (!marker) {
      const el = document.createElement('div');
      el.className = 'pin';
      marker = new maplibregl.Marker({ element: el, anchor: 'bottom' });
    }
    marker.setLngLat([p.lon, p.lat]).addTo(map);
    frame(p.lon, p.lat);
    try {
      info = await details(p);
    } catch {
      info = {};
    }
  }

  function closePlace() {
    place = null;
    info = null;
    marker?.remove();
  }

  function clearSearch() {
    query = '';
    results = [];
    closePlace();
  }

  // Raccourcis de catégorie : les lieux viennent des tuiles déjà chargées, sans serveur.
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
    if (map.getZoom() < 15) {
      map.flyTo({ zoom: 15.5, duration: 700 });
      map.once('idle', collect);
    } else collect();
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
  const fmtDist = (m) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

  function onKey(e) {
    if (!showList || !results.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % results.length; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + results.length) % results.length; e.preventDefault(); }
    else if (e.key === 'Enter') { pickResult(results[Math.max(active, 0)]); }
    else if (e.key === 'Escape') { focused = false; }
  }

  function pickResult(r) {
    clearCategory();
    query = r.name;
    openPlace(r);
  }

  function say(msg) {
    toast = msg;
    setTimeout(() => (toast = ''), 3500);
  }

  function locate() {
    if (!navigator.geolocation) return say('Votre navigateur ne permet pas la localisation.');
    locating = true;
    // La position reste sur votre appareil : elle n'est envoyée à aucun serveur.
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        locating = false;
        if (!meMarker) {
          const el = document.createElement('div');
          el.className = 'me';
          meMarker = new maplibregl.Marker({ element: el });
        }
        meMarker.setLngLat([coords.longitude, coords.latitude]).addTo(map);
        map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 16, duration: 800 });
      },
      () => { locating = false; say('Localisation refusée. Autorisez-la dans les réglages du navigateur.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const host = (url) => { try { return new URL(href(url)).hostname.replace(/^www\./, ''); } catch { return url; } };
  const href = (url) => (/^https?:\/\//.test(url) ? url : `https://${url}`);
  const familyColor = (c) => FAMILIES[c.family].color;
</script>

<div class="app">
  <div class="map" bind:this={mapEl} aria-label="Carte"></div>

  <header class="top">
    <div class="search" class:open={showList}>
      <svg class="lens" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20" /></svg>
      <input
        id="search"
        type="search"
        placeholder="Rechercher un lieu ou une adresse"
        aria-label="Rechercher un lieu ou une adresse"
        autocomplete="off"
        enterkeyhint="search"
        bind:value={query}
        onfocus={() => (focused = true)}
        onblur={() => setTimeout(() => (focused = false), 150)}
        onkeydown={onKey}
      />
      {#if query}
        <button class="icon-btn" onclick={clearSearch} aria-label="Effacer la recherche">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
        </button>
      {/if}

      {#if showList}
        <ul class="results" role="listbox">
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
          {#if !searching && !results.length && !searchError}
            <li class="note">Aucun résultat pour « {query.trim()} ». Essayez un nom de lieu ou une adresse.</li>
          {/if}
          {#if searchError}<li class="note">{searchError}</li>{/if}
          {#if searching && !results.length}<li class="note">Recherche…</li>{/if}
        </ul>
      {/if}
    </div>

    {#if !showList}
      <nav class="chips" aria-label="Catégories">
        {#each CATEGORIES as c}
          <button class="chip" class:on={category === c} onclick={() => pickCategory(c)}
            style:--fam={familyColor(c)} aria-pressed={category === c}>
            <span class="chip-dot" aria-hidden="true"></span>{c.label}
          </button>
        {/each}
      </nav>
    {/if}
  </header>

  <button class="locate" class:busy={locating} onclick={locate} aria-label="Me localiser">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4 4 11l7 2 2 7z" /></svg>
  </button>
  {#if toast}<p class="toast" role="status">{toast}</p>{/if}

  {#if place}
    <section class="sheet" aria-label={place.name}>
      <div class="grip" aria-hidden="true"></div>
      <button class="close" onclick={closePlace} aria-label="Fermer la fiche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>

      <h1>{place.name}</h1>
      <p class="kind">{[place.type, info?.cuisine && info.cuisine.split(';')[0].replace(/_/g, ' ')].filter(Boolean).join(' · ') || 'Lieu'}</p>

      {#if info === null}
        <p class="status muted">Chargement…</p>
      {:else if status}
        <p class="status" class:is-open={status.open === true} class:is-closed={status.open === false}>{status.label}</p>
      {/if}

      {#if info && (info.phone || info.website)}
        <div class="actions">
          {#if info.phone}
            <a class="action" href={`tel:${info.phone.replace(/\s/g, '')}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l2 4.6-2.3 1.6a12 12 0 0 0 6.1 6.1l1.6-2.3L21 15l-.5 2.4A3 3 0 0 1 17.6 20C10 20 4 14 4 6.4a3 3 0 0 1 2.6-2.9z" /></svg>
              Appeler
            </a>
          {/if}
          {#if info.website}
            <a class="action" href={href(info.website)} target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5M12 3.5C9.5 6.1 8.4 8.9 8.4 12s1.1 5.9 3.6 8.5" /></svg>
              Site web
            </a>
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
              <table class="week">
                <tbody>
                  {#each week as d}
                    <tr class:today={d.today}><th>{d.day}</th><td>{d.text}</td></tr>
                  {/each}
                </tbody>
              </table>
            </li>
          {/if}
        {:else if info && place.type !== 'Adresse' && place.type !== 'Rue'}
          <li class="row muted">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            <span>Horaires non renseignés</span>
          </li>
        {/if}
        {#if info?.phone}
          <li class="row">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l2 4.6-2.3 1.6a12 12 0 0 0 6.1 6.1l1.6-2.3L21 15l-.5 2.4A3 3 0 0 1 17.6 20C10 20 4 14 4 6.4a3 3 0 0 1 2.6-2.9z" /></svg>
            <span class="selectable">{info.phone}</span>
          </li>
        {/if}
        {#if info?.website}
          <li class="row">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5M12 3.5C9.5 6.1 8.4 8.9 8.4 12s1.1 5.9 3.6 8.5" /></svg>
            <span>{host(info.website)}</span>
          </li>
        {/if}
      </ul>

      {#if info?.checkDate}
        <p class="fresh">Informations vérifiées le {new Date(info.checkDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      {/if}
    </section>
  {:else if category}
    <section class="sheet list" aria-label={category.label}>
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
              <span class="n-dot" style:--fam={familyColor(category)} aria-hidden="true"></span>
              <span class="n-text">
                <span class="r-name">{f.properties.name}</span>
                <span class="r-meta">{typeLabel('', f.properties.subclass) || category.label}</span>
              </span>
              <span class="n-dist">{fmtDist(d)}</span>
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
    --ink: #1d1f22;
    --muted: #6b6f76;
    --line: #e7e7ea;
    --card: #ffffff;
    --fill: #f2f2f4;
    --open: #1e8e3e;
    --closed: #c5221f;
    --shadow-float: 0 1px 2px rgb(0 0 0 / 0.08), 0 4px 16px rgb(0 0 0 / 0.12);
    --shadow-sheet: 0 -2px 24px rgb(0 0 0 / 0.14);
    --ui: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }
  :global(html, body) {
    margin: 0; height: 100%; overflow: hidden; background: #f3f2ef;
    font-family: var(--ui); color: var(--ink); -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
  }
  :global(button) { font: inherit; color: inherit; }
  :global(:focus-visible) { outline: 3px solid var(--accent); outline-offset: 2px; }

  .app { position: fixed; inset: 0; }
  .map { position: absolute; inset: 0; }
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  /* Haut d'écran : recherche + raccourcis */
  .top {
    position: absolute; z-index: 3; left: 0; right: 0;
    top: env(safe-area-inset-top); padding: 10px 12px 0; pointer-events: none;
    display: grid; gap: 10px; max-width: 440px;
  }
  .top > * { pointer-events: auto; }
  .search {
    background: var(--card); border-radius: 26px; box-shadow: var(--shadow-float);
    display: grid; grid-template-columns: 48px 1fr auto; align-items: center;
  }
  .search.open { border-radius: 24px; }
  .lens { width: 20px; height: 20px; justify-self: center; color: var(--muted); stroke-width: 2.2; }
  input {
    border: 0; background: none; font: inherit; font-size: 17px; color: var(--ink);
    padding: 15px 0; min-width: 0; outline: none;
  }
  input::placeholder { color: var(--muted); }
  input::-webkit-search-cancel-button { display: none; }
  .icon-btn { border: 0; background: none; width: 46px; height: 46px; cursor: pointer; display: grid; place-items: center; color: var(--muted); }
  .icon-btn svg { width: 20px; height: 20px; stroke-width: 2; }

  .results { grid-column: 1 / -1; list-style: none; margin: 0; padding: 6px 0 8px; border-top: 1px solid var(--line); max-height: 62vh; overflow-y: auto; }
  .results button {
    display: grid; grid-template-columns: 48px 1fr; align-items: center; width: 100%; text-align: left;
    border: 0; background: none; padding: 9px 16px 9px 0; cursor: pointer;
  }
  .results button:hover, .results button.active { background: var(--fill); }
  .r-icon { justify-self: center; width: 32px; height: 32px; border-radius: 50%; background: var(--fill); display: grid; place-items: center; color: var(--muted); }
  .r-icon svg { width: 18px; height: 18px; }
  .r-text, .n-text { display: grid; gap: 1px; min-width: 0; }
  .r-name { font-size: 16px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .r-meta { font-size: 14px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { padding: 12px 16px 12px 48px; color: var(--muted); font-size: 15px; line-height: 1.4; }

  .chips {
    display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
    margin: 0 -12px; padding: 0 12px 6px;
  }
  .chips::-webkit-scrollbar { display: none; }
  .chip {
    flex: none; display: inline-flex; align-items: center; gap: 7px;
    height: 36px; padding: 0 14px 0 12px; border: 0; border-radius: 18px;
    background: var(--card); box-shadow: var(--shadow-float); font-size: 14.5px; font-weight: 500; cursor: pointer;
  }
  .chip-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--fam); }
  .chip.on { background: var(--fam); color: #fff; }
  .chip.on .chip-dot { background: #fff; }

  /* Localisation */
  .locate {
    position: absolute; z-index: 2; right: 12px; bottom: calc(40px + env(safe-area-inset-bottom));
    width: 50px; height: 50px; border-radius: 14px; border: 0; background: var(--card); box-shadow: var(--shadow-float);
    display: grid; place-items: center; cursor: pointer; color: var(--accent);
  }
  .locate svg { width: 22px; height: 22px; fill: currentColor; stroke-width: 1.5; }
  .locate.busy svg { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .toast {
    position: absolute; z-index: 4; left: 12px; right: 74px; bottom: calc(40px + env(safe-area-inset-bottom));
    margin: 0; padding: 13px 16px; background: rgb(29 31 34 / 0.92); color: #fff; border-radius: 14px; font-size: 14px; max-width: 360px;
  }

  /* Marqueurs */
  :global(.pin) {
    width: 30px; height: 40px;
    background: no-repeat center / contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 40'%3E%3Cpath d='M15 1.5C7.5 1.5 1.5 7.4 1.5 14.7 1.5 25 15 38.5 15 38.5S28.5 25 28.5 14.7C28.5 7.4 22.5 1.5 15 1.5z' fill='%23D93A2F' stroke='%23fff' stroke-width='2'/%3E%3Ccircle cx='15' cy='14.5' r='5' fill='%23fff'/%3E%3C/svg%3E");
    filter: drop-shadow(0 3px 4px rgb(0 0 0 / 0.3));
  }
  :global(.me) {
    width: 18px; height: 18px; border-radius: 50%; background: var(--accent);
    border: 3px solid #fff; box-shadow: 0 0 0 10px rgb(42 91 215 / 0.18), 0 1px 4px rgb(0 0 0 / 0.3);
  }

  /* Fiche (lieu ou liste) */
  .sheet {
    position: absolute; z-index: 3; left: 0; right: 0; bottom: 0;
    max-height: 64vh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--card); border-radius: 28px 28px 0 0; box-shadow: var(--shadow-sheet);
    padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
    animation: rise 280ms cubic-bezier(0.2, 0.9, 0.25, 1);
  }
  @keyframes rise { from { transform: translateY(60px); opacity: 0.4; } }
  .grip { width: 36px; height: 5px; border-radius: 3px; background: #d6d6da; margin: 0 auto 12px; }
  .close {
    position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%;
    border: 0; background: var(--fill); cursor: pointer; display: grid; place-items: center; color: var(--muted);
  }
  .close svg { width: 16px; height: 16px; stroke-width: 2.4; }
  h1 { font-size: 24px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; margin: 2px 44px 2px 0; text-wrap: balance; }
  .kind { margin: 0; color: var(--muted); font-size: 15px; text-transform: none; }
  .kind::first-letter { text-transform: uppercase; }
  .status { margin: 6px 0 0; font-size: 15.5px; font-weight: 600; }
  .status.is-open { color: var(--open); }
  .status.is-closed { color: var(--closed); }
  .muted { color: var(--muted); font-weight: 400; }

  .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
  .action {
    display: grid; justify-items: center; gap: 4px; padding: 10px 8px; border-radius: 14px;
    background: var(--fill); color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600;
  }
  .action svg { width: 22px; height: 22px; }
  .action:first-child { background: var(--accent); color: #fff; }

  .rows { list-style: none; margin: 16px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .row {
    display: grid; grid-template-columns: 24px 1fr; gap: 16px; align-items: center;
    min-height: 52px; border-bottom: 1px solid var(--line); font-size: 15.5px;
  }
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

  /* Grand écran : panneau à gauche */
  @media (min-width: 768px) {
    .top { padding: 16px 16px 0; width: 400px; }
    .sheet {
      left: 16px; right: auto; bottom: auto; top: 128px; width: 400px; max-height: calc(100vh - 150px);
      border-radius: 20px; padding: 18px 22px 22px; box-shadow: var(--shadow-float);
      animation-name: appear;
    }
    @keyframes appear { from { transform: translateY(-6px); opacity: 0; } }
    .grip { display: none; }
    .locate { bottom: 40px; right: 16px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet, .chev { animation: none; transition: none; }
    .locate.busy svg { animation: none; }
  }

  :global(.maplibregl-ctrl-attrib) { font-family: var(--ui); font-size: 11px; }
</style>
