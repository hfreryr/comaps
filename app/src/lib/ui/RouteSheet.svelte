<!-- Fiche itinéraire : modes en onglets, résumé de l'itinéraire choisi (ce que montre l'aperçu),
     puis étapes et autres itinéraires en tirant la fiche. Modèle : Google Maps et Plans (voir docs/espace-ecran.md). -->
<script>
  import { tx } from '#lib/i18n/index.js';
  import { tripFare, fmtEuros } from '#lib/fares.js';
  import { draggable } from '#lib/sheet.js';
  import { MODE_NAMES, fmtDuration, fmtTime, fmtDistance } from '#lib/routing.js';
  import { placeLabel } from '#lib/rame.js';
  import { MODES, arrival, departure, departInfo, departText, transitTags, badge, streetOpts, altTag, exitPhrase } from '#lib/routeview.js';
  import ModeIcon from './ModeIcon.svelte';
  import LegChain from './LegChain.svelte';
  import WhenPicker from './WhenPicker.svelte';

  let { from, to, mode, routes, picked, pickedStreet, showVia, legExits,
    chooseMode, pickStreet, pickTransit, startNav, addStop, computeRoutes, transitPref = 'all', setTransitPref, when = null } = $props();
  const current = $derived(routes[mode]);
  // les comptes à rebours des départs (« dans 1, 4, 7 min ») avancent tout seuls, comme sur Citymapper
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 15000); return () => clearInterval(t); });
</script>

{#snippet depart(o)}
  <!-- comme Citymapper : signe « temps réel » devant, puis « dans 1, 4, 7 min de Château Rouge » ou l'heure du train -->
  {@const d = departInfo(o, when, now)}
  <span class="sum-sub depart">{#if d.live}<span class="live" title={tx('itin.horaire_en_temps_reel')}>●</span>{' '}{/if}{departText(d)}</span>
{/snippet}

<section class="sheet route-sheet" aria-label={tx('fiche.itineraire')} use:draggable={{ key: `${from?.lat},${to?.lat},${mode}`, start: 'peek', min: true, tease: 58 }}>
  <button class="grip" aria-label={tx('liste.agrandir_la_fiche')}></button>
  <div class="mode-tabs" data-min-end role="tablist" aria-label={tx('itin.mode_de_deplacement')}>
    {#each MODES as m}
      {@const r = routes[m.id]}
      <button class="mode-tab" class:on={mode === m.id} role="tab" aria-selected={mode === m.id} onclick={() => chooseMode(m.id)} aria-label={m.label}>
        <ModeIcon id={m.id} />
        <span class="mode-time">
          {#if !r}{m.label}
          {:else if r.status === 'loading'}<span class="dots" aria-label={tx('itin.calcul_en_cours')}></span>
          {:else if r.status === 'ok'}{fmtDuration(m.id === 'transit' ? (r.data[m.id === mode ? picked : 0] || r.data[0]).duration
            : (streetOpts(r.data)[m.id === mode ? pickedStreet : 0] || r.data).duration)}
          {:else}–{/if}
        </span>
      </button>
    {/each}
  </div>
  <WhenPicker />
  {#if mode === 'transit' && setTransitPref}
    <!-- choisir ses modes (P4 : « je ne peux pas sélectionner uniquement le métro ») -->
    <div class="t-prefs" role="radiogroup" aria-label={tx('itin.modes_de_transport')}>
      {#each [['all', tx('itin.tous')], ['metro', tx('itin.metro')], ['rail', tx('itin.metro_et_rer')], ['road', tx('itin.bus_et_tram')]] as [id, label]}
        <button class="t-pref" class:on={transitPref === id} role="radio" aria-checked={transitPref === id} onclick={() => setTransitPref(id)}>{label}</button>
      {/each}
    </div>
  {/if}
  {#if !from}
    <p class="empty" data-peek-end>{tx('itin.choisissez_un_point_de_depart_pour')}</p>
  {:else if !current || current.status === 'loading'}
    <p class="empty" data-peek-end>{tx('itin.calcul_de_itineraire')}</p>
  {:else if current.status === 'none' && mode === 'transit' && routes.walk?.status === 'ok'}
    <div data-peek-end>
      <p class="empty">{tx('itin.pas_de_transport_utile_sur_ce_trajet', { fmtDuration: fmtDuration(routes.walk.data.duration) })}</p>
      <button class="retry" onclick={() => chooseMode('walk')}>{tx('itin.voir_le_trajet_a_pied')}</button>
    </div>
  {:else if current.status === 'none'}
    <p class="empty" data-peek-end>{tx('itin.aucun_itineraire_trouve_entre_ces', { mode: mode === 'transit' ? tx('itin.en_transports_en_commun') : mode === 'bike' ? tx('itin.a_velo') : mode === 'car' ? tx('itin.en_voiture') : tx('itin.a_pied') })}</p>
  {:else if current.status === 'error'}
    <div data-peek-end>
      <p class="empty">{tx('itin.le_service_itineraire_ne_repond_pas')}</p>
      <button class="retry" onclick={computeRoutes}>{tx('itin.reessayer')}</button>
    </div>
  {:else if mode !== 'transit'}
    {@const opts = streetOpts(current.data)}
    {@const sel = opts[pickedStreet] || opts[0]}
    <div class="sum" data-peek-end>
      <div class="sum-text">
        <span class="sum-dur">{fmtDuration(sel.duration)}</span>
        <span class="sum-sub">{when?.arrive ? tx('itin.partez_a', { depart: departure(sel.duration, when), fmtDistance: fmtDistance(sel.distance) })
          : tx('itin.arrivee', { arrival: arrival(sel.duration, when), fmtDistance: fmtDistance(sel.distance) })}</span>
        <span class="sum-tag" class:best={pickedStreet === 0}>{pickedStreet === 0 ? (opts.length > 1 ? tx('itin.le_plus_rapide') : '') : altTag(sel, opts[0])}</span>
      </div>
      <div class="sum-actions">
        <button class="go" onclick={() => startNav(sel)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 19 20l-7-4-7 4z" class="solid" /></svg>{tx('itin.aller')}
        </button>
        {#if !showVia}<button class="soft-btn" onclick={addStop}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>{tx('itin.arret')}</button>{/if}
      </div>
    </div>
    {#if opts.length > 1}
      <h3 class="sub-h">{tx('itin.autres_itineraires')} <small>{tx('itin.aussi_sur_la_carte')}</small></h3>
      <ul class="alt-list">
        {#each opts as r, i}
          {#if i !== pickedStreet}
            <li><button onclick={() => pickStreet(i)}>
              <span class="alt-dur">{fmtDuration(r.duration)}</span>
              <span class="alt-sub">{when?.arrive ? tx('itin.partez_a_2', { depart: departure(r.duration, when), fmtDistance: fmtDistance(r.distance), etiquette: i === 0 ? tx('itin.le_plus_rapide_2') : altTag(r, opts[0]).toLowerCase() })
                : tx('itin.arrivee_2', { arrival: arrival(r.duration, when), fmtDistance: fmtDistance(r.distance), etiquette: i === 0 ? tx('itin.le_plus_rapide_2') : altTag(r, opts[0]).toLowerCase() })}</span>
            </button></li>
          {/if}
        {/each}
      </ul>
    {/if}
    {#if mode === 'bike'}
      <p class="traffic-note">{tx('itin.itineraire_adapte_aux_velos_pistes')}</p>
    {/if}
    {#if mode === 'car'}
      <p class="traffic-note">{tx('itin.apres_les_capteurs_de_la_ville_de', { estimation: sel.traffic ? tx('itin.estimation_avec_le', { traffic: sel.traffic }) : tx('itin.estimation_sur_route_fluide') })}</p>
    {/if}
    <h3 class="sub-h">{tx('itin.etapes')}</h3>
    <ol class="steps">
      {#each sel.steps as st}
        <li class:stop={st.stop}><span>{st.text}</span>{#if st.distance >= 10}<span class="step-dist">{fmtDistance(st.distance)}</span>{/if}</li>
      {/each}
      <li class="arrive"><span>{tx('itin.arrivee_3', { label: to.label })}</span></li>
    </ol>
  {:else}
    {@const it = current.data[picked] || current.data[0]}
    {@const tags = transitTags(current.data)}
    <div class="sum transit" data-peek-end>
      <div class="sum-text">
        <span class="opt-top">
          <LegChain it={it} />
          <span class="sum-dur small">{fmtDuration(it.duration)}</span>
        </span>
        {@render depart(it)}
        <span class="sum-sub">{tx('itin.arrivee_4', { fmtTime: fmtTime(it.end) })}{#if tripFare(it.legs) != null}<span title={tx('itin.prix_detail')}>{tx('itin.prix', { prix: fmtEuros(tripFare(it.legs)) })}</span>{/if}</span>
        {#if tags[picked]}<span class="sum-tag best">{tags[picked]}</span>{/if}
        <!-- l'info la plus attendue (test P3) dès le résumé : où se placer dans la rame et quelle sortie prendre à l'arrivée -->
        {#each [it.legs.map((leg, li) => ({ leg, tip: legExits[`${picked}|${li}|${leg.to}`] })).filter((x) => x.tip?.exit || x.tip?.place).at(-1)] as last}
          {#if last?.tip?.place}<span class="sum-tip"><span class="car-ic" aria-hidden="true"></span>{tx('itin.montez', { placeLabel: placeLabel(last.tip.place), suite: '' })}</span>{/if}
          {#if last?.tip?.exit && exitPhrase(last.tip.exit)}<span class="sum-tip"><span class="exit-sq" aria-hidden="true"></span>{tx('itin.a_station_sortie', { station: last.leg.to, sortie: exitPhrase(last.tip.exit) })}</span>{/if}
        {/each}
      </div>
      <div class="sum-actions">
        <button class="go" onclick={() => startNav(it)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 19 20l-7-4-7 4z" class="solid" /></svg>{tx('itin.aller')}
        </button>
        {#if !showVia}<button class="soft-btn" onclick={addStop}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>{tx('itin.arret')}</button>{/if}
      </div>
    </div>
    <h3 class="sub-h">{tx('itin.etapes')}</h3>
    <ol class="legs">
      {#each it.legs as leg, li}
        {#if leg.mode === 'STOP'}
          <li class="leg stop">
            <span class="leg-time">{fmtTime(leg.start)}</span>
            <span class="leg-rail stop" aria-hidden="true"></span>
            <span class="leg-body">
              <span class="leg-place">{tx('itin.arret_2', { from: leg.from })}</span>
              <span class="leg-meta">{tx('itin.reprise_a', { fmtTime: fmtTime(leg.end), suite: leg.duration > 90 ? tx('itin.sur_place', { fmtDuration: fmtDuration(leg.duration) }) : '' })}</span>
            </span>
          </li>
        {:else if leg.mode === 'WALK'}
          <li class="leg walk">
            <span class="leg-time">{fmtTime(leg.start)}</span>
            <span class="leg-rail walk" aria-hidden="true"></span>
            <span class="leg-body">
              <span class="leg-place">{leg.from}</span>
              <span class="leg-meta">{tx('itin.marcher', { fmtDuration: fmtDuration(leg.duration), suite: leg.distance ? ` · ${fmtDistance(leg.distance)}` : '' })}</span>
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
                {tx('itin.direction', { ligne: MODE_NAMES[leg.mode] || '', headsign: leg.headsign })}
              </span>
              <span class="leg-meta">{leg.stops ? tx('itin.arrets', { n: leg.stops + 1 }) : ''}{fmtDuration(leg.duration)}{leg.realTime ? tx('itin.temps_reel') : ''}</span>
              {#each [legExits[`${picked}|${li}|${leg.to}`]] as tip}
              {#if tip?.place}
                <span class="leg-tip"><span class="car-ic" aria-hidden="true"></span>{tx('itin.montez', { placeLabel: placeLabel(tip.place), suite: tip.transfer ? tx('itin.pour_la_correspondance', { ligne: tip.transfer.line ? tx('itin.avec_la_ligne', { line: tip.transfer.line }) : '' }) : '' })}</span>
              {/if}
              {#if tip?.exit && exitPhrase(tip.exit)}
                <span class="leg-exit"><span class="exit-sq" aria-hidden="true"></span>{tx('itin.a_station_sortie', { station: leg.to, sortie: exitPhrase(tip.exit) })}</span>
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
    {#if current.data.length > 1}
      <h3 class="sub-h">{tx('itin.autres_itineraires')}</h3>
      <ul class="alt-list">
        {#each current.data as o, i}
          {#if i !== picked}
            <li><button onclick={() => pickTransit(i)}>
              <span class="opt-top"><LegChain it={o} /><span class="alt-dur">{fmtDuration(o.duration)}</span></span>
              {#if tags[i]}<span class="alt-sub tag">{tags[i]}</span>{/if}
              {@render depart(o)}
            </button></li>
          {/if}
        {/each}
      </ul>
    {/if}
    <p class="credit">{tx('fiche.horaires')} <a href="https://transitous.org/sources/" target="_blank" rel="noopener">{tx('fiche.transitous_et_reseaux_de_transport')}</a> {tx('itin.place_dans_la_rame_ratp_ile_de')}</p>
  {/if}
</section>

<style>
  /* Onglets des modes, en tête de fiche (comme Google Maps) : icône + temps, trait sous le mode choisi */
  .mode-tabs { display: flex; margin: 0 -16px; padding: 0 8px; border-bottom: 1px solid var(--line); }
  .mode-tab {
    flex: 1; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 42px; padding: 0 2px;
    border: 0; background: none; cursor: pointer; color: var(--muted); font-size: var(--fs-meta); font-weight: 600;
    font-variant-numeric: tabular-nums; white-space: nowrap; position: relative;
  }
  .mode-tab :global(svg) { width: 18px; height: 18px; flex: none; }
  .mode-tab.on { color: var(--accent); }
  .mode-tab.on::after { content: ''; position: absolute; left: 14%; right: 14%; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: var(--accent); }
  .route-sheet .empty, .route-sheet [data-peek-end] > .empty { margin-top: 12px; }
  /* Résumé de l'itinéraire choisi : ce que l'aperçu montre */
  .sum { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px 0 2px; }
  .sum-text { display: grid; gap: 1px; min-width: 0; }
  .sum-dur { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .sum-dur.small { font-size: 18px; white-space: nowrap; }
  .sum-sub { font-size: var(--fs-meta); color: var(--muted); font-variant-numeric: tabular-nums; }
  .sum-sub strong { color: var(--ink); font-weight: 600; }
  .sum-tag { font-size: var(--fs-small); color: var(--muted); font-weight: 500; }
  .sum-tag.best { color: var(--open); font-weight: 600; }
  .sum-tag:empty { display: none; }
  .sum-actions { display: flex; gap: 8px; }
  .sum-actions .go { flex: 1; justify-content: center; }
  .soft-btn { display: inline-flex; align-items: center; gap: 4px; height: 40px; padding: 0 14px; border: 0; border-radius: 12px;
    background: var(--fill); color: var(--accent); font-size: var(--fs-body); font-weight: 600; cursor: pointer; }
  .soft-btn svg { width: 16px; height: 16px; stroke-width: 2.2; }
  .sub-h { font-size: var(--fs-meta); font-weight: 700; color: var(--muted); text-transform: none; margin: 16px 0 6px; }
  .sub-h small { font-weight: 500; }
  .alt-list { list-style: none; margin: 0 -16px; padding: 0; }
  .alt-list li + li { border-top: 1px solid var(--line); }
  .alt-list button { display: grid; gap: 2px; width: 100%; padding: 9px 16px; border: 0; background: none; text-align: left; cursor: pointer; }
  .alt-list button:active { background: var(--fill); }
  .alt-dur { font-size: var(--fs-body); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .alt-sub { font-size: var(--fs-small); color: var(--muted); font-variant-numeric: tabular-nums; }
  .alt-sub.tag { color: var(--open); font-weight: 600; }
  /* étapes du trajet en transport : pleine largeur de la fiche, sans fond */
  .route-sheet :global(.legs) { margin: 0 calc(-1 * var(--gutter)); padding: 4px var(--gutter) 6px; background: none; }
  .t-prefs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 10px 16px 2px; margin: 0 -16px; }
  .t-pref { flex: none; height: 30px; padding: 0 12px; border-radius: 15px; border: 1px solid var(--line); background: var(--card); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; }
  .t-pref.on { background: var(--accent-btn); border-color: var(--accent-btn); color: #fff; }
</style>
