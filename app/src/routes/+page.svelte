<script>
  import { onMount } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import '@fontsource-variable/instrument-sans';
  import { search, details, PARIS } from '#lib/places.js';
  import { hoursStatus, hoursTable } from '#lib/hours.js';

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

  let place = $state(null);
  let info = $state(null);
  let showWeek = $state(false);
  let locating = $state(false);
  let locateError = $state('');

  const status = $derived(info?.hours ? hoursStatus(info.hours, place.lat, place.lon) : null);
  const week = $derived(showWeek && info?.hours ? hoursTable(info.hours, place.lat, place.lon) : null);
  const showList = $derived(focused && query.trim().length >= 2);

  onMount(() => {
    maplibregl.setWorkerUrl(workerUrl);
    map = new maplibregl.Map({
      container: mapEl,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [PARIS.lon, PARIS.lat],
      zoom: 12.5,
      attributionControl: { compact: true }
    });
    // Noms en français, puis nom local, au lieu de l'anglais par défaut du style.
    map.on('style.load', () => {
      for (const layer of map.getStyle().layers) {
        const field = layer.layout?.['text-field'];
        if (field && JSON.stringify(field).includes('name_en')) {
          map.setLayoutProperty(layer.id, 'text-field',
            ['coalesce', ['get', 'name:fr'], ['get', 'name']]);
        }
      }
    });
    map.on('click', () => { if (place) closePlace(); });
    return () => map.remove();
  });

  // Recherche au fil de la frappe, avec un léger délai pour ne pas surcharger le serveur.
  let timer;
  let controller;
  $effect(() => {
    const q = query.trim();
    clearTimeout(timer);
    controller?.abort();
    searchError = '';
    if (q.length < 2) { results = []; searching = false; return; }
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

  async function openPlace(p) {
    place = p;
    info = null;
    showWeek = false;
    focused = false;
    query = p.name;
    document.activeElement?.blur();

    if (!marker) {
      const el = document.createElement('div');
      el.className = 'pin';
      marker = new maplibregl.Marker({ element: el, anchor: 'bottom' });
    }
    marker.setLngLat([p.lon, p.lat]).addTo(map);
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    map.flyTo({
      center: [p.lon, p.lat],
      zoom: Math.max(map.getZoom(), 16),
      padding: mobile ? { bottom: window.innerHeight * 0.42 } : { left: 400 },
      duration: 900
    });
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

  function onKey(e) {
    if (!showList || !results.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % results.length; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + results.length) % results.length; e.preventDefault(); }
    else if (e.key === 'Enter') { openPlace(results[Math.max(active, 0)]); }
    else if (e.key === 'Escape') { focused = false; }
  }

  function locate() {
    locateError = '';
    if (!navigator.geolocation) { locateError = 'Votre navigateur ne permet pas la localisation.'; return; }
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
        map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 16, duration: 900 });
      },
      () => { locating = false; locateError = 'Localisation refusée. Autorisez-la dans les réglages du navigateur.'; },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const href = (url) => (/^https?:\/\//.test(url) ? url : `https://${url}`);
</script>

<div class="app">
  <div class="map" bind:this={mapEl} aria-label="Carte de Paris"></div>

  <div class="search" class:open={showList}>
    <svg class="lens" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20" /></svg>
    <input
      type="search"
      placeholder="Rechercher un lieu ou une adresse"
      aria-label="Rechercher un lieu ou une adresse"
      autocomplete="off"
      bind:value={query}
      onfocus={() => (focused = true)}
      onblur={() => setTimeout(() => (focused = false), 150)}
      onkeydown={onKey}
    />
    {#if query}
      <button class="clear" onclick={clearSearch} aria-label="Effacer la recherche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
    {/if}

    {#if showList}
      <ul class="results" role="listbox">
        {#each results as r, i (r.id)}
          <li role="option" aria-selected={i === active}>
            <button class:active={i === active} onmousedown={() => openPlace(r)}>
              <span class="r-name">{r.name}</span>
              <span class="r-meta">{[r.type, r.address].filter(Boolean).join(', ')}</span>
            </button>
          </li>
        {/each}
        {#if !searching && !results.length && !searchError}
          <li class="note">Aucun résultat à Paris pour « {query.trim()} ». Essayez un nom de lieu ou une adresse.</li>
        {/if}
        {#if searchError}<li class="note">{searchError}</li>{/if}
        {#if searching && !results.length}<li class="note">Recherche…</li>{/if}
      </ul>
    {/if}
  </div>

  <button class="locate" class:busy={locating} onclick={locate} aria-label="Me localiser">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
  </button>
  {#if locateError}<p class="toast" role="status">{locateError}</p>{/if}

  {#if place}
    <section class="sheet" aria-label={place.name}>
      <div class="grip" aria-hidden="true"></div>
      <button class="close" onclick={closePlace} aria-label="Fermer la fiche">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>

      <h1>{place.name}</h1>
      {#if place.type || place.address}
        <p class="meta">{[place.type, place.address].filter(Boolean).join(', ')}</p>
      {/if}

      {#if info === null}
        <p class="status loading">Chargement des horaires…</p>
      {:else if status}
        <button class="status" class:is-open={status.open === true} class:is-closed={status.open === false}
          onclick={() => (showWeek = !showWeek)} aria-expanded={showWeek}>
          {status.label}
          <svg viewBox="0 0 24 24" aria-hidden="true" class:flip={showWeek}><path d="m7 10 5 5 5-5" /></svg>
        </button>
        {#if week}
          <table class="week">
            <tbody>
              {#each week as d}
                <tr class:today={d.today}><th>{d.day}</th><td>{d.text}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}
      {:else if place.type !== 'Adresse' && place.type !== 'Rue'}
        <p class="status unknown">Horaires non renseignés</p>
      {/if}

      {#if info && (info.phone || info.website)}
        <div class="actions">
          {#if info.phone}<a class="action" href={`tel:${info.phone.replace(/\s/g, '')}`}>Appeler</a>{/if}
          {#if info.website}<a class="action" href={href(info.website)} target="_blank" rel="noopener">{host(info.website)}</a>{/if}
        </div>
      {/if}

      {#if info?.checkDate}
        <p class="fresh">Informations vérifiées le {new Date(info.checkDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  :global(:root) {
    --guimard: #1f6b4a;
    --guimard-soft: #e3efe8;
    --ink: #17201c;
    --muted: #5e6a64;
    --line: #dde3df;
    --surface: #eef1ef;
    --lamp: #e9a23b;
    --closed: #b3401f;
    --radius-bar: 26px;
    --radius-sheet: 22px;
    --shadow: 0 6px 24px rgb(23 32 28 / 0.16);
  }
  :global(html, body) {
    margin: 0; height: 100%; overflow: hidden; background: var(--surface);
    font-family: 'Instrument Sans Variable', system-ui, sans-serif; color: var(--ink);
    -webkit-tap-highlight-color: transparent;
  }
  :global(button) { font: inherit; color: inherit; }
  :global(:focus-visible) { outline: 3px solid var(--lamp); outline-offset: 2px; }

  .app { position: fixed; inset: 0; }
  .map { position: absolute; inset: 0; }

  /* Recherche */
  .search {
    position: absolute; z-index: 3;
    top: calc(12px + env(safe-area-inset-top)); left: 12px; right: 12px; max-width: 420px;
    background: #fff; border-radius: var(--radius-bar); box-shadow: var(--shadow);
    display: grid; grid-template-columns: 44px 1fr auto; align-items: center;
  }
  .search.open { border-radius: var(--radius-bar) var(--radius-bar) 16px 16px; }
  .lens { width: 20px; height: 20px; justify-self: center; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
  input {
    border: 0; background: none; font: inherit; font-size: 17px; color: var(--ink);
    padding: 15px 0; min-width: 0; outline: none;
  }
  input::placeholder { color: var(--muted); }
  input::-webkit-search-cancel-button { display: none; }
  .clear { border: 0; background: none; width: 44px; height: 44px; cursor: pointer; display: grid; place-items: center; }
  .clear svg, .close svg { width: 18px; height: 18px; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }

  .results { grid-column: 1 / -1; list-style: none; margin: 0; padding: 4px 0 8px; border-top: 1px solid var(--line); max-height: 60vh; overflow-y: auto; }
  .results button {
    display: grid; gap: 2px; width: 100%; text-align: left; border: 0; background: none;
    padding: 10px 16px 10px 44px; cursor: pointer;
  }
  .results button:hover, .results button.active { background: var(--surface); }
  .r-name { font-size: 16px; font-weight: 550; }
  .r-meta { font-size: 14px; color: var(--muted); }
  .note { padding: 12px 16px 12px 44px; color: var(--muted); font-size: 15px; line-height: 1.4; }

  /* Localisation */
  .locate {
    position: absolute; z-index: 2; right: 12px; bottom: calc(36px + env(safe-area-inset-bottom));
    width: 48px; height: 48px; border-radius: 50%; border: 0; background: #fff; box-shadow: var(--shadow);
    display: grid; place-items: center; cursor: pointer;
  }
  .locate svg { width: 22px; height: 22px; fill: none; stroke: var(--guimard); stroke-width: 2; stroke-linecap: round; }
  .locate.busy svg { animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .toast {
    position: absolute; z-index: 4; left: 12px; right: 72px; bottom: calc(36px + env(safe-area-inset-bottom));
    margin: 0; padding: 12px 14px; background: var(--ink); color: #fff; border-radius: 14px; font-size: 14px; max-width: 360px;
  }

  /* Marqueurs */
  :global(.pin) {
    width: 26px; height: 34px;
    background: no-repeat center / contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 34'%3E%3Cpath d='M13 1C6.4 1 1 6.2 1 12.6 1 21.7 13 33 13 33s12-11.3 12-20.4C25 6.2 19.6 1 13 1z' fill='%231F6B4A' stroke='%23fff' stroke-width='2'/%3E%3Ccircle cx='13' cy='12.5' r='4.5' fill='%23E9A23B'/%3E%3C/svg%3E");
    filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.3));
  }
  :global(.me) {
    width: 16px; height: 16px; border-radius: 50%; background: var(--guimard);
    border: 3px solid #fff; box-shadow: 0 0 0 8px rgb(31 107 74 / 0.18);
  }

  /* Fiche lieu */
  .sheet {
    position: absolute; z-index: 3; left: 0; right: 0; bottom: 0;
    max-height: 62vh; overflow-y: auto;
    background: #fff; border-radius: var(--radius-sheet) var(--radius-sheet) 0 0; box-shadow: var(--shadow);
    padding: 10px 20px calc(24px + env(safe-area-inset-bottom));
    animation: rise 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes rise { from { transform: translateY(40px); opacity: 0; } }
  .grip { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 0 auto 10px; }
  .close {
    position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; border-radius: 50%;
    border: 0; background: var(--surface); cursor: pointer; display: grid; place-items: center;
  }
  h1 { font-size: 24px; line-height: 1.15; font-weight: 600; letter-spacing: -0.01em; margin: 4px 48px 4px 0; }
  .meta { margin: 0 0 14px; color: var(--muted); font-size: 15px; line-height: 1.4; }

  .status {
    display: inline-flex; align-items: center; gap: 6px; margin: 0 0 4px;
    font-size: 19px; font-weight: 600; border: 0; background: none; padding: 0; cursor: pointer; text-align: left;
  }
  .status svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; transition: transform 200ms; }
  .status svg.flip { transform: rotate(180deg); }
  .status.is-open { color: var(--guimard); }
  .status.is-closed { color: var(--closed); }
  .status.loading, .status.unknown { color: var(--muted); font-weight: 500; font-size: 16px; cursor: default; }

  .week { border-collapse: collapse; margin: 8px 0 4px; font-size: 15px; }
  .week th { text-align: left; font-weight: 400; color: var(--muted); padding: 3px 18px 3px 0; text-transform: capitalize; }
  .week td { padding: 3px 0; }
  .week tr.today th, .week tr.today td { color: var(--ink); font-weight: 600; }

  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
  .action {
    padding: 10px 16px; border-radius: 999px; background: var(--guimard-soft); color: var(--guimard);
    text-decoration: none; font-weight: 550; font-size: 15px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .fresh { margin: 18px 0 0; font-size: 13px; color: var(--muted); }

  /* Grand écran : la fiche devient un panneau à gauche, sous la recherche */
  @media (min-width: 768px) {
    .search { left: 16px; right: auto; width: 380px; top: 16px; }
    .sheet {
      left: 16px; right: auto; bottom: auto; top: 84px; width: 380px; max-height: calc(100vh - 110px);
      border-radius: var(--radius-sheet); padding: 18px 22px 22px;
      animation-name: appear;
    }
    @keyframes appear { from { transform: translateY(-8px); opacity: 0; } }
    .grip { display: none; }
    .locate { bottom: 40px; right: 16px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet, .status svg { animation: none; transition: none; }
    .locate.busy svg { animation: none; }
  }

  :global(.maplibregl-ctrl-attrib) { font-family: inherit; font-size: 11px; }
</style>
