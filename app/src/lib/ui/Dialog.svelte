<!-- Fenêtre modale (règles d'interface : docs/regles-interface.md) : une seule à la fois, fond assombri,
     se ferme par la croix, par Échap ou en touchant le fond ; le focus va dans la fenêtre puis revient au bouton. -->
<script>
  import { tx } from '#lib/i18n/index.js';
  import { closeAll } from '#lib/popover.js';
  let { title, onclose, children } = $props();
  let box = $state();
  let node = $state();
  let back = null;
  $effect(() => {
    closeAll();                                   // un menu ouvert se ferme : une seule chose ouverte à la fois
    back = document.activeElement;
    document.body.appendChild(node);              // au-dessus de tout, hors des fiches qui défilent
    box?.focus();
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onclose(); } };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); node.remove(); back?.focus?.(); };
  });
</script>

<div class="dlg-back" bind:this={node} onclick={(e) => { if (e.target === e.currentTarget) onclose(); }} role="presentation">
  <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title" tabindex="-1" bind:this={box}>
    <button class="dlg-close" onclick={onclose} aria-label={tx('photos.fermer')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
    </button>
    <h2 id="dlg-title">{title}</h2>
    {@render children?.()}
  </div>
</div>

<style>
  .dlg-back { position: fixed; inset: 0; z-index: 60; background: rgb(0 0 0 / 0.4); display: grid; place-items: center; padding: 16px; }
  .dlg { position: relative; width: min(420px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; box-sizing: border-box;
    background: var(--card); color: var(--ink); border-radius: 20px; padding: 20px 20px 22px; box-shadow: var(--shadow-float); outline: none; }
  h2 { margin: 2px 44px 10px 0; font-size: 19px; line-height: 1.25; }
  .dlg :global(p) { margin: 0 0 10px; font-size: 15px; line-height: 1.45; }
  .dlg-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: var(--fill);
    color: var(--muted); display: grid; place-items: center; cursor: pointer; }
  .dlg-close::after { content: ''; position: absolute; inset: -6px; }
  .dlg-close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }
</style>
