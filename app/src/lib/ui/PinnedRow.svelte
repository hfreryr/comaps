<script>
  import { getContext } from 'svelte';
  import ListDot from '#lib/ui/ListDot.svelte';

  // État et actions de la page (voir le bloc « app » de +page.svelte)
  const app = getContext('app');
  let { inSearch } = $props();
</script>


  <div class="pinned" role="list">
    {#each ['home', 'work'] as k}
      <button role="listitem" class="pin-btn" class:unset={!app.shortcuts[k]}
        onmousedown={inSearch ? (e) => { e.preventDefault(); app.useShortcut(k); } : undefined}
        onclick={inSearch ? undefined : () => app.useShortcut(k)}>
        <span class="pin-circle home">{#if k === 'home'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v9.5h11V10" /><path d="M10.2 19.5v-4.8h3.6v4.8" /></svg>{:else}<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17" /></svg>{/if}</span>
        <span class="pin-name">{app.SHORT_NAMES[k]}</span>
        <span class="pin-sub">{app.shortcuts[k] ? 'Itinéraire' : 'Ajouter'}</span>
      </button>
    {/each}
    {#each app.pinnedPlaces as f (app.placeKey(f))}
      <button role="listitem" class="pin-btn"
        onmousedown={inSearch ? (e) => { e.preventDefault(); app.pickResult({ ...f }); } : undefined}
        onclick={inSearch ? undefined : () => app.openPlace({ ...f, pin: { glyph: app.listOf(f.lists[0]).icon, color: app.listOf(f.lists[0]).color } })}>
        <ListDot l={app.listOf(f.lists[0])} size={44} />
        <span class="pin-name">{f.name}</span>
      </button>
    {/each}
  </div>


<style>
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  /* ——— Mes lieux ——— */
  .pinned { display: flex; gap: 14px; overflow-x: auto; padding: 8px 2px 6px; scrollbar-width: none; }
  .pinned::-webkit-scrollbar { display: none; }
  .pin-btn { display: grid; justify-items: center; align-content: start; gap: 3px; width: 64px; flex: none;
    padding: 0; border: 0; background: none; cursor: pointer; grid-template-columns: none; }
  .pin-circle { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-btn); color: #fff; }
  .pin-circle svg { width: 22px; height: 22px; }
  .pin-btn.unset .pin-circle { background: var(--fill); color: var(--accent); }
  .pin-name { font-size: 12.5px; font-weight: 600; max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pin-sub { font-size: 11.5px; color: var(--muted); }
  .pin-btn.unset .pin-sub { color: var(--accent); }
</style>
