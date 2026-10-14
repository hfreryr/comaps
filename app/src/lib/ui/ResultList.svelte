<script>
  import { getContext } from 'svelte';
  import { ALL_CATEGORIES } from '#lib/categories.js';
  import ListDot from '#lib/ui/ListDot.svelte';
  import PinnedRow from '#lib/ui/PinnedRow.svelte';

  // État et actions de la page (voir le bloc « app » de +page.svelte)
  const app = getContext('app');
  let {  } = $props();
</script>


  <ul class="results" role="listbox">
    {#if app.editing}
      <li class="note map-hint">Ou touchez la carte pour choisir un point.</li>
    {/if}
    {#if app.editing === 'from'}
      <li role="option" aria-selected="false">
        <button onmousedown={app.useMyPosition}>
          <span class="r-icon me-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 4 4 11l7 2 2 7z" class="solid" /></svg></span>
          <span class="r-text"><span class="r-name">Votre position</span><span class="r-meta">Utiliser la localisation du téléphone</span></span>
        </button>
      </li>
    {/if}
    {#if app.activeQuery.trim().length < 2}
      <li class="pinned-li"><PinnedRow inSearch={true} /></li>
    {/if}
    {#if app.assigning && app.activeQuery.trim().length < 2}
      <li class="note">Tapez l'adresse de votre {app.assigning === 'home' ? 'maison' : 'travail'}, puis choisissez-la dans la liste.
        <button class="link" onmousedown={(e) => { e.preventDefault(); app.assigning = null; }}>Annuler</button></li>
    {/if}
    {#if app.activeQuery.trim().length < 2 && app.favorites.length}
      <li class="note recents-head"><span>Mes lieux</span>
        {#if !app.editing}<button class="link" onmousedown={(e) => { e.preventDefault(); app.focused = false; document.activeElement?.blur(); app.pickCategory(ALL_CATEGORIES[0]); }}>Tout voir</button>{/if}</li>
      {#each app.favorites.slice(0, 5) as r (r.id + r.lat)}
        <li role="option" aria-selected="false">
          <button onmousedown={() => app.pickResult(r)}>
            <ListDot l={app.listOf(r.lists?.[0])} size={32} />
            <span class="r-text">
              <span class="r-name">{r.name}</span>
              <span class="r-meta">{[r.type, r.address].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        </li>
      {/each}
    {/if}
    {#if app.activeQuery.trim().length < 2 && app.recents.length}
      <li class="note recents-head"><span>Récents</span>
        <button class="link" onmousedown={(e) => { e.preventDefault(); app.forgetRecents(); }}>Effacer</button></li>
      {#each app.recents as r (r.id)}
        <li role="option" aria-selected="false">
          <button onmousedown={() => app.pickResult(r)}>
            <span class="r-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
            </span>
            <span class="r-text">
              <span class="r-name">{r.name}</span>
              <span class="r-meta">{[r.type, r.address].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        </li>
      {/each}
    {/if}
    {#if app.catHit}
      <li role="option" aria-selected="false">
        <button onmousedown={app.openCategoryFromSearch}>
          <span class="r-icon cat-icon" style:--fam={app.famColor(app.catHit)} aria-hidden="true"></span>
          <span class="r-text">
            {#if app.catHit.when || app.catHit.area}
              <span class="r-name">{app.catHit.label}{app.catHit.when ? ` ${app.whenText(app.catHit.when)}` : ''}</span>
              <span class="r-meta">{app.catHit.area ? app.areaText(app.catHit.area) : 'Près de vous'}{app.catHit.when ? ' · selon les horaires connus' : ''}</span>
            {:else}
              <span class="r-name">{app.catHit.label} près de vous</span>
              <span class="r-meta">Les plus proches, avec leurs horaires</span>
            {/if}
          </span>
        </button>
      </li>
    {/if}
    {#each app.results as r, i (r.id)}
      <li role="option" aria-selected={i === app.active}>
        <button class:active={i === app.active} onmousedown={() => app.pickResult(r)}>
          <span class="r-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          </span>
          <span class="r-text">
            <span class="r-name">{r.name}</span>
            <span class="r-meta">{[r.type, r.address].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      </li>
    {/each}
    {#if app.activeQuery.trim().length >= 2 && !app.searching && !app.results.length && !app.searchError}
      <li class="note">Aucun résultat pour « {app.activeQuery.trim()} ». Essayez un nom de lieu ou une adresse.</li>
    {/if}
    {#if app.searchError}<li class="note">{app.searchError}</li>{/if}
    {#if app.searching && !app.results.length}<li class="note">Recherche…</li>{/if}
    {#if !app.editing && app.activeQuery.trim().length < 2}
      <li class="list-foot">
        <button class="link" onmousedown={(e) => { e.preventDefault(); app.importOpen = true; app.focused = false; document.activeElement?.blur(); }}>Importer vos lieux depuis Google Maps</button>
        <button class="link" onmousedown={(e) => { e.preventDefault(); app.editChips = true; app.focused = false; document.activeElement?.blur(); }}>Personnaliser les raccourcis</button>
        <span class="privacy-line">Ni compte, ni pistage : rien sur vous n'est collecté.</span>
      </li>
    {/if}
  </ul>


<style>
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  svg .solid { fill: currentColor; stroke: none; }

  .results { grid-column: 1 / -1; list-style: none; margin: 0; padding: 6px 0 8px; border-top: 1px solid var(--line); max-height: 60vh; overflow-y: auto; }
  .results button {
    display: grid; grid-template-columns: 48px 1fr; align-items: center; width: 100%; text-align: left;
    border: 0; background: none; padding: 9px 16px 9px 0; cursor: pointer;
  }
  .results button:hover, .results button.active { background: var(--fill); }
  .r-icon { justify-self: center; width: 32px; height: 32px; border-radius: 50%; background: var(--fill); display: grid; place-items: center; color: var(--muted); }
  .r-icon svg { width: 18px; height: 18px; }
  .r-icon.cat-icon::after { content: ''; width: 12px; height: 12px; border-radius: 50%; background: var(--fam); }
  .me-icon { background: var(--me-bg); color: var(--accent); }
  .r-text { display: grid; gap: 1px; min-width: 0; }
  .r-name { font-size: 16px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .r-meta { font-size: 14px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { padding: 12px 16px 12px 48px; color: var(--muted); font-size: 15px; line-height: 1.4; }
  .map-hint { color: var(--accent); font-size: 14px; padding-top: 10px; padding-bottom: 6px; }

  .results .recents-head { display: flex; padding-right: 16px; justify-content: space-between; align-items: center; font-weight: 600; color: var(--ink) !important; }
  .results .link { width: auto; flex: none; display: inline; padding: 4px 0; }
  .link { border: 0; background: none; color: var(--accent); font: inherit; font-weight: 500; cursor: pointer; padding: 4px 0; }
  .results .list-foot .link { min-height: 40px; }
  .results .pinned-li { padding: 4px 14px 2px; }
  .list-foot { display: grid; justify-items: start; gap: 2px; padding: 10px 16px 6px 48px; border-top: 1px solid var(--line); margin-top: 6px; }
  .results .list-foot .link { font-size: 14.5px; }
  .privacy-line { font-size: 12.5px; color: var(--muted); padding-top: 6px; }
</style>
