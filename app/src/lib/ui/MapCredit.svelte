<!-- Mention « © OpenStreetMap » (et IGN en vue satellite), obligatoire. Les règles d'attribution de la fondation OSM
     permettent de la replier au bout de 5 s ou dès qu'on touche la carte, si elle reste accessible ailleurs :
     la fenêtre ⓘ « À propos » donne les crédits complets. https://osmfoundation.org/wiki/Licence/Attribution_Guidelines -->
<script>
  import { tx } from '#lib/i18n/index.js';
  import { getContext } from 'svelte';

  // État et actions de la page (voir le bloc « app » de +page.svelte)
  const app = getContext('app');
  let shown = $state(true);
  let timer = null;
  function showFor5s() {
    shown = true;
    clearTimeout(timer);
    timer = setTimeout(() => (shown = false), 5000);
  }
  // au démarrage, puis à chaque changement de fond (la vue satellite ajoute l'IGN)
  $effect(() => { app.mapMode; showFor5s(); return () => clearTimeout(timer); });
  // replié dès que la personne touche la carte (déplacer, zoomer, choisir un lieu)
  $effect(() => {
    const hide = (e) => { if (shown && e.target?.closest?.('.maplibregl-canvas')) { clearTimeout(timer); shown = false; } };
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('wheel', hide, true);
    return () => { document.removeEventListener('pointerdown', hide, true); document.removeEventListener('wheel', hide, true); };
  });
</script>

{#if shown && !app.directions}
  <a class="credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
    {tx('carte.mention_osm')}{#if app.mapMode === 'satellite'}{' · '}{tx('carte.mention_ign')}{/if}
  </a>
{/if}

<style>
  .credit {
    position: absolute; z-index: 2; left: 10px; bottom: calc(12px + env(safe-area-inset-bottom));
    padding: 4px 8px; border-radius: 9px; background: color-mix(in srgb, var(--card) 88%, transparent);
    color: var(--ink); font-size: 11.5px; text-decoration: none; animation: fade 0.3s;
  }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .credit { animation: none; } }
</style>
