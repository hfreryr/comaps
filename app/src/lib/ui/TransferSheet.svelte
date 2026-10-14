<script>
  import { getContext } from 'svelte';
  import { DEFAULT_LISTS } from '#lib/myplaces.js';
  import ListDot from '#lib/ui/ListDot.svelte';

  // État et actions de la page (voir le bloc « app » de +page.svelte)
  const app = getContext('app');
</script>


    <section class="sheet" aria-label="Récupérer vos lieux">
      <h1>Récupérer vos lieux</h1>
      <p class="kind">Depuis un autre appareil</p>
      <ul class="rows">
        <li class="row"><ListDot l={DEFAULT_LISTS[0]} size={24} /><span>{app.incoming.data.places.length} lieu{app.incoming.data.places.length > 1 ? 'x' : ''} dans {app.incoming.data.lists.length} liste{app.incoming.data.lists.length > 1 ? 's' : ''}</span></li>
        {#if app.incoming.data.shortcuts.home || app.incoming.data.shortcuts.work}
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v9.5h11V10" /><path d="M10.2 19.5v-4.8h3.6v4.8" /></svg><span>{[app.incoming.data.shortcuts.home && 'Maison', app.incoming.data.shortcuts.work && 'Travail'].filter(Boolean).join(' et ')}</span></li>
        {/if}
      </ul>
      <p class="credit">Ils s'ajoutent à ceux de cet appareil (rien n'est effacé).</p>
      <button class="go wide done" onclick={() => { const n = app.applyIncoming(app.incoming.raw); app.incoming = null; app.say(`${n} lieu${n > 1 ? 'x' : ''} ajouté${n > 1 ? 's' : ''} à Mes lieux`); }}>Ajouter à cet appareil</button>
      <button class="link more" onclick={() => (app.incoming = null)}>Ignorer</button>
    </section>

<style>
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  .link { border: 0; background: none; color: var(--accent); font: inherit; font-weight: 500; cursor: pointer; padding: 4px 0; }
  .go.wide.done { width: 100%; margin: 14px 0 4px; height: 46px; background: var(--accent-btn); }
  h1 { font-size: 24px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; margin: 2px 44px 2px 0; text-wrap: balance; }
  .kind { margin: 0; color: var(--muted); font-size: 15px; }
  .kind::first-letter { text-transform: uppercase; }

  .rows { list-style: none; margin: 16px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .row { display: grid; grid-template-columns: 24px 1fr; gap: 16px; align-items: center; min-height: 52px; border-bottom: 1px solid var(--line); font-size: 15.5px; }
  .row > svg { width: 22px; height: 22px; color: var(--accent); }
</style>
