<script>
  import { getContext } from 'svelte';

  // État et actions de la page (voir le bloc « app » de +page.svelte)
  const app = getContext('app');
</script>


  {#if app.showPromise && !app.place && !app.category && !app.directions && !app.importOpen && !app.editChips}
    <div class="promise" role="note">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
      <p><strong>Une carte qui ne vous piste pas.</strong> Ni compte, ni publicité, rien sur vous n'est collecté. Vos favoris restent sur votre téléphone. <a href="confidentialite" class="promise-link">Qui voit quoi ?</a></p>
      <button onclick={app.closePromise}>Compris</button>
    </div>
  {/if}

<style>
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  .promise-link { color: inherit; font-weight: 600; text-decoration: underline; }
  .promise {
    position: absolute; z-index: 4; left: 12px; right: 12px; bottom: calc(112px + env(safe-area-inset-bottom)); max-width: 420px;
    display: grid; grid-template-columns: 26px 1fr; gap: 6px 12px; align-items: start;
    padding: 14px 16px; background: var(--card); border-radius: 18px; box-shadow: var(--shadow-float); font-size: 14.5px; line-height: 1.4;
  }
  .promise svg { width: 24px; height: 24px; color: var(--accent); margin-top: 1px; }
  .promise p { margin: 0; }
  .promise button { grid-column: 2; justify-self: end; border: 0; background: var(--accent-btn); color: #fff; font-weight: 600; border-radius: 16px; padding: 7px 16px; cursor: pointer; }
</style>
