<script>
  import { tx } from '#lib/i18n/index.js';
  import { getContext } from 'svelte';
  import Facade from '#lib/ui/Facade.svelte';

  // État et actions de la page (voir le bloc « app » de +page.svelte)
  const app = getContext('app');
</script>


  {#if app.place && !app.directions && !app.nav && app.info?.facade && app.viewer == null && (app.placeSheetH == null || app.placeSheetH < app.innerH * 0.6)}
    <!-- Vue de la rue posée sur la carte, juste au-dessus de la fiche (comme Plans et Google Maps) ; plein écran au toucher -->
    <button class="street-thumb" style:bottom={app.placeSheetH != null ? `${app.placeSheetH + 12}px` : null} onclick={() => (app.viewer = 'facade')}
      aria-label={tx('photos.voir_la_vue_de_la_rue')}>
      <Facade f={app.info.facade} alt={tx('photos.vue_de_la_rue', { title: app.title })} />
      <span class="st-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 3.5 0 1 0 15 0M17 9.5l2.5 2.5 2.5-2.5" /><circle cx="12" cy="12" r="1.6" class="solid" /></svg></span>
      <span class="st-src">{tx('photos.panoramax')}</span>
    </button>
  {/if}

<style>
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  svg .solid { fill: currentColor; stroke: none; }
  .street-thumb { position: absolute; z-index: 2; left: 12px; bottom: 50%; width: 112px; height: 76px; padding: 0; border: 2.5px solid #fff;
    border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-float); background: var(--fill); cursor: zoom-in; animation: appear-thumb 200ms ease-out; }
  .street-thumb :global(.facade) { aspect-ratio: auto; width: 100%; height: 100%; }
  .street-thumb :global(.facade img) { top: -170cqw; }
  .st-icon { position: absolute; left: 5px; bottom: 5px; width: 22px; height: 22px; border-radius: 50%; background: rgb(0 0 0 / 0.55); display: grid; place-items: center; color: #fff; }
  .st-icon svg { width: 16px; height: 16px; stroke-width: 2; }
  .st-src { position: absolute; right: 4px; top: 4px; font-size: 9.5px; font-weight: 600; color: #fff; background: rgb(0 0 0 / 0.45); padding: 1px 5px; border-radius: 6px; }
  @media (min-width: 768px) {
 .street-thumb { left: 432px; bottom: 24px !important; width: 160px; height: 104px; }
  
  }
</style>
