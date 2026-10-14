<!-- Enchaînement d'un trajet en transport : marche › M 4 › marche… -->
<script>
  import ModeIcon from './ModeIcon.svelte';
  import { MODE_NAMES, fmtDuration } from '#lib/routing.js';
  import { badge } from '#lib/routeview.js';
  let { it } = $props();
</script>
  <span class="chain">
    {#each it.legs as leg, j}
      {#if j > 0}<span class="sep" aria-hidden="true">›</span>{/if}
      {#if leg.mode === 'STOP'}
        <span class="stop-chip" aria-label={`Arrêt : ${leg.from}`}></span>
      {:else if leg.mode === 'WALK'}
        <span class="walk-chip" aria-label={`Marche ${fmtDuration(leg.duration)}`}><ModeIcon id="walk" /></span>
      {:else}
        <span class="badge" style:background={leg.color} style:color={leg.textColor}
          aria-label={`${MODE_NAMES[leg.mode] || 'Ligne'} ${leg.line}`}>{badge(leg)}</span>
      {/if}
    {/each}
  </span>
