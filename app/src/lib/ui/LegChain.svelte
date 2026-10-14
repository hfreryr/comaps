<!-- Enchaînement d'un trajet en transport : marche › M 4 › marche… -->
<script>
  import { tx } from '#lib/i18n/index.js';
  import ModeIcon from './ModeIcon.svelte';
  import { MODE_NAMES, fmtDuration } from '#lib/routing.js';
  import { badge } from '#lib/routeview.js';
  let { it } = $props();
</script>
  <span class="chain">
    {#each it.legs as leg, j}
      {#if j > 0}<span class="sep" aria-hidden="true">›</span>{/if}
      {#if leg.mode === 'STOP'}
        <span class="stop-chip" aria-label={tx('itin.arret_2', { from: leg.from })}></span>
      {:else if leg.mode === 'WALK'}
        <span class="walk-chip" aria-label={tx('itin.marche', { fmtDuration: fmtDuration(leg.duration) })}><ModeIcon id="walk" /></span>
      {:else}
        <span class="badge" style:background={leg.color} style:color={leg.textColor}
          aria-label={`${MODE_NAMES[leg.mode] || tx('itin.ligne')} ${leg.line}`}>{badge(leg)}</span>
      {/if}
    {/each}
  </span>
