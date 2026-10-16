<!-- Heure de l'itinéraire : « Partir maintenant » par défaut ; on peut choisir de partir ou d'arriver à une heure
     donnée, un autre jour (demande de P6 et P7, tests du 15/10/2026). Sélecteur de date et d'heure du téléphone. -->
<script>
  import { tx } from '#lib/i18n/index.js';
  import { getContext } from 'svelte';
  import { whenLabel, toInput, fromInput } from '#lib/when.js';
  import { popover } from '#lib/popover.js';

  // État et actions de la page (voir le bloc « app » de +page.svelte)
  const app = getContext('app');
  let open = $state(false);
  let kind = $state('now');      // now | depart | arrive
  let value = $state('');
  let btn = $state();

  function toggle() {
    open = !open;
    if (!open) return;
    kind = !app.when ? 'now' : app.when.arrive ? 'arrive' : 'depart';
    // par défaut : dans un quart d'heure, arrondi aux 5 minutes
    value = toInput(app.when?.t ?? Math.ceil((Date.now() + 15 * 60000) / 300000) * 300000);
  }
  function apply() {
    app.setWhen(kind === 'now' ? null : fromInput(value, kind === 'arrive'));
    open = false;
  }
</script>

<div class="when">
  <button class="when-btn" bind:this={btn} class:set={!!app.when} aria-expanded={open} onclick={toggle}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
    {whenLabel(app.when)}
    <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
  </button>
  {#if open}
    <div class="when-panel" use:popover={{ trigger: () => btn, close: () => (open = false), place: 'below', align: 'start' }}>
      <div class="seg" role="radiogroup" aria-label={tx('quand.heure_du_trajet')}>
        {#each [['now', tx('quand.maintenant')], ['depart', tx('quand.partir_a')], ['arrive', tx('quand.arriver_a')]] as [id, label]}
          <button class="seg-btn" class:on={kind === id} role="radio" aria-checked={kind === id} onclick={() => (kind = id)}>{label}</button>
        {/each}
      </div>
      {#if kind !== 'now'}
        <label class="when-field">
          <span class="visually-hidden">{kind === 'arrive' ? tx('quand.arriver_a') : tx('quand.partir_a')}</span>
          <input type="datetime-local" bind:value min={toInput(Date.now())} step="300" />
        </label>
      {/if}
      <button class="when-ok" onclick={apply}>{tx('quand.valider')}</button>
    </div>
  {/if}
</div>

<style>
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .when { margin: 2px 0 8px; }
  .when-btn {
    display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px 0 9px; border-radius: 16px;
    border: 1px solid var(--line); background: var(--card); color: var(--ink); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
  }
  .when-btn.set { border-color: var(--accent); color: var(--accent); }
  .when-btn svg { width: 17px; height: 17px; flex: none; }
  .when-btn .chev { width: 15px; height: 15px; }
  /* menu flottant (popover.js) : entier à l'écran, au-dessus de la fiche */
  .when-panel { width: min(360px, calc(100vw - 32px)); box-sizing: border-box; padding: 12px; border-radius: 16px; background: var(--card);
    box-shadow: var(--shadow-float); display: grid; gap: 10px; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 3px; border-radius: 11px; background: var(--fill); }
  .seg-btn { height: 34px; border: 0; border-radius: 9px; background: none; color: var(--ink); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
  .seg-btn.on { background: var(--accent-btn); color: #fff; }
  .when-field input {
    width: 100%; box-sizing: border-box; height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line);
    background: var(--card); color: var(--ink); font: inherit; font-size: 16px;
  }
  .when-ok { height: 44px; border: 0; border-radius: 12px; background: var(--accent-btn); color: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
