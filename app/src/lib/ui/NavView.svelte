<!-- Guidage : bandeau de la prochaine manœuvre, bouton Recentrer, étapes, barre du bas (arrivée, voix, fin). -->
<script>
  import { tx } from '#lib/i18n/index.js';
  import { arrowAngle, isRoundabout } from '#lib/nav.js';
  import { badge } from '#lib/routeview.js';
  import ModeIcon from './ModeIcon.svelte';

  let { nav, navBanner, navRemaining, to, navFollow, navList = $bindable(), voice = $bindable(), endNav, recenter } = $props();
</script>

<div class="nav-top" class:arrived={navBanner.arrived} role="status" aria-live="polite">
  <div class="nav-main">
    <span class="nav-icon" aria-hidden="true">
      {#if navBanner.arrived || navBanner.icon === 'arrive' || navBanner.icon === 'stop'}
        <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" class="solid" /><circle cx="12" cy="9.5" r="2.6" class="hole" /></svg>
      {:else if navBanner.icon === 'walk'}<ModeIcon id="walk" />
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
  {#if navBanner.then && !navBanner.arrived}<p class="nav-then">{tx('guidage.puis', { then: navBanner.then })}</p>{/if}
</div>
{#if !navFollow}
  <button class="nav-recenter" onclick={recenter}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 19 20l-7-4-7 4z" class="solid" /></svg>{tx('guidage.recentrer')}
  </button>
{/if}
{#if navList}
  <section class="sheet nav-list" aria-label={tx('guidage.etapes_du_trajet')}>
    <h1>{tx('itin.etapes')}</h1>
    <ol class="steps">
      {#each nav.steps as st, i}
        <li class:done={i < nav.k + (nav.kind === 'transit' ? 0 : 1)} class:now={i === (nav.kind === 'transit' ? nav.k : nav.k + 1)}>
          <span>{st.text}{#if st.sub}<small class="why">{st.sub}</small>{/if}</span>
        </li>
      {/each}
      <li class="arrive"><span>{tx('itin.arrivee_3', { label: to.label })}</span></li>
    </ol>
  </section>
{/if}
<div class="nav-bottom">
  <button class="nav-eta" onclick={() => (navList = !navList)} aria-expanded={navList} aria-label={tx('guidage.voir_les_etapes')}>
    <strong>{navBanner.arrived ? tx('guidage.arrive') : navRemaining.eta}</strong>
    <span>{navBanner.arrived ? to.label : `${navRemaining.min} · ${navRemaining.km}`}</span>
  </button>
  <button class="nav-btn" onclick={() => { voice = !voice; if (!voice && 'speechSynthesis' in window) speechSynthesis.cancel(); }} aria-pressed={voice} aria-label={voice ? tx('guidage.couper_la_voix') : tx('guidage.activer_la_voix')}>
    {#if voice}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></svg>
    {:else}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></svg>{/if}
  </button>
  <button class="nav-end" onclick={endNav}>{tx('guidage.fin')}</button>
</div>

<style>
  .nav-top {
    position: absolute; z-index: 5; left: 10px; right: 10px; top: calc(10px + env(safe-area-inset-top));
    background: #1D3A86; color: #fff; border-radius: 22px; box-shadow: var(--shadow-float); padding: 14px 16px; max-width: 520px;
  }
  .nav-top.arrived { background: #1E7A3E; }
  .nav-main { display: grid; grid-template-columns: 52px 1fr; gap: 12px; align-items: center; }
  .nav-icon { width: 52px; height: 52px; display: grid; place-items: center; }
  .nav-icon :global(svg) { width: 46px; height: 46px; stroke-width: 2.6; transition: transform 0.2s; }
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
  h1 { font-size: 24px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; margin: 2px 44px 2px 0; }
  .why { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; line-height: 1.35; }
  .steps li.done { color: var(--faint); }
  .steps li.now { font-weight: 700; color: var(--accent); }
</style>
