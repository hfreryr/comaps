<script>
  import { getContext } from 'svelte';
  import ListDot from '#lib/ui/ListDot.svelte';
  import PinnedRow from '#lib/ui/PinnedRow.svelte';
  import { draggable } from '#lib/sheet.js';
  import { fmtDistance, fmtWait } from '#lib/routing.js';
  import { momentLabel } from '#lib/hours.js';
  import { typeLabel } from '#lib/places.js';

  // État et actions de la page (voir le bloc « app » de +page.svelte)
  const app = getContext('app');
</script>


    <section class="sheet" aria-label={app.category.label} use:draggable={app.category.saved ? { key: app.category.label, onDismiss: app.clearCategory } : { key: app.category.label, start: 'peek' }}>
      <button class="grip" aria-label="Agrandir la fiche"></button>
      <button class="close" onclick={app.clearCategory} aria-label="Fermer la liste">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg>
      </button>
      {#if app.category.saved && !app.savedList && !app.category.shared && !app.hubPanel}
        <h1>{app.chipList.find((c) => c.key === 'saved')?.label || 'Mes lieux'}</h1>
        <PinnedRow inSearch={false} />
        <h2 class="hub-h">Listes</h2>
        <ul class="hub-lists">
          {#each app.lists as l (l.id)}
            <li><button onclick={() => app.openSavedList(l.id)}>
              <ListDot l={l} size={34} />
              <span class="pl-name">{l.name}</span>
              <span class="pl-count">{app.favorites.filter((f) => f.lists.includes(l.id)).length}</span>
              <svg class="chev-r" viewBox="0 0 24 24" aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg>
            </button></li>
          {/each}
          <li>
            {#if app.hubPanel === 'newlist'}{:else}
              <form class="new-list" onsubmit={(e) => { e.preventDefault(); app.createList(app.newListName); app.newListName = ''; }}>
                <input bind:value={app.newListName} placeholder="Nouvelle liste…" aria-label="Nom de la nouvelle liste" maxlength="40" />
                <button class="link" disabled={!app.newListName.trim()}>Créer</button>
              </form>
            {/if}
          </li>
        </ul>
        <h2 class="hub-h">Vos données</h2>
        <ul class="rows hub-rows">
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" /></svg>
            <button class="row-btn" onclick={() => { app.importOpen = true; }}><span>Importer depuis Google Maps</span></button></li>
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><path d="M13.5 13.5h3v3h-3zM18 18h2.5M20.5 13.5V16" /></svg>
            <button class="row-btn" onclick={app.makeTransfer}><span>Transférer vers un autre appareil</span></button></li>
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.6-1.6A4.8 4.8 0 0 0 7 18.5z" /><path d="M12 11v5M9.8 13.2 12 11l2.2 2.2" /></svg>
            <button class="row-btn" onclick={() => (app.hubPanel = 'backup')}><span>Sauvegarder<small class="why" class:warn={app.favorites.length >= 5 && (app.backupAge === null || app.backupAge > 30)}>{app.backupAge === null ? 'Jamais sauvegardé' : app.backupAge === 0 ? 'Dernière sauvegarde aujourd\'hui' : `Dernière sauvegarde il y a ${app.backupAge} jour${app.backupAge > 1 ? 's' : ''}`}</small></span></button></li>
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" /></svg>
            <button class="row-btn" onclick={() => (app.hubPanel = 'restore')}><span>Restaurer une sauvegarde</span></button></li>
          <li class="row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
            <button class="row-btn" onclick={() => { app.clearCategory(); app.editChips = true; }}><span>Personnaliser les raccourcis</span></button></li>
        </ul>
        <p class="credit">Vos lieux restent sur cet appareil : ni compte, ni serveur. Sauvegardez-les pour ne pas les perdre.</p>
      {:else if app.category.saved && app.hubPanel === 'transfer'}
        <button class="link back-link" onclick={() => (app.hubPanel = null)}>‹ Mes lieux</button>
        <h1>Transférer</h1>
        <p class="kind">Ouvrez ce lien ou scannez ce code sur l'autre appareil.</p>
        {#if !app.transfer}<p class="muted">Préparation…</p>
        {:else}
          {#if app.transfer.qr}<div class="qr" aria-label="QR code de transfert">{@html app.transfer.qr}</div>
          {:else}<p class="credit">Trop de lieux pour un QR code : envoyez-vous le lien (AirDrop, Signal à vous-même…).</p>{/if}
          <button class="go wide done" onclick={app.shareTransfer}>Envoyer le lien</button>
          <p class="credit">⚠️ Ce lien contient tous vos lieux : envoyez-le seulement à vous-même. Il n'est stocké sur aucun serveur.</p>
        {/if}
      {:else if app.category.saved && app.hubPanel === 'backup'}
        <button class="link back-link" onclick={() => (app.hubPanel = null)}>‹ Mes lieux</button>
        <h1>Sauvegarder</h1>
        <p class="kind">Un fichier avec vos listes, Maison, Travail et vos raccourcis, à ranger où vous voulez : iCloud Drive, Proton Drive, un ordinateur…</p>
        <label class="pw">Mot de passe (facultatif, pour chiffrer le fichier)
          <input type="password" bind:value={app.backupPassword} autocomplete="new-password" placeholder="Aucun" /></label>
        {#if app.backupPassword}<p class="credit">Sans ce mot de passe, personne ne pourra lire le fichier, vous non plus : notez-le.</p>{/if}
        <button class="go wide done" onclick={app.makeBackup}>Créer la sauvegarde</button>
      {:else if app.category.saved && app.hubPanel === 'restore'}
        <button class="link back-link" onclick={() => { app.hubPanel = null; app.restoreNeedsPw = false; }}>‹ Mes lieux</button>
        <h1>Restaurer</h1>
        <p class="kind">Choisissez un fichier de sauvegarde d'Untracked Maps. Ses lieux s'ajoutent à ceux de cet appareil.</p>
        {#if app.restoreNeedsPw}
          <label class="pw">Ce fichier est protégé : mot de passe
            <input type="password" bind:value={app.restorePassword} autocomplete="current-password" /></label>
          <button class="go wide done" onclick={() => app.doRestore()}>Restaurer</button>
        {:else}
          <label class="action primary import-btn">
            <input type="file" accept=".json,application/json" hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; app.doRestore(f); }} />
            Choisir le fichier
          </label>
        {/if}
      {:else if app.category.saved}
        {@const l = app.category.shared ? app.category : app.listOf(app.savedList)}
        {#if !app.category.shared}<button class="link back-link" onclick={() => { app.savedList = null; app.refreshSaved(); }}>‹ Mes lieux</button>{/if}
        <h1 class="list-title"><ListDot l={l} size={30} />{l.name || app.category.label}</h1>
        <p class="kind">{app.category.shared ? `Liste partagée · ${app.nearby.length} lieu${app.nearby.length > 1 ? 'x' : ''}` : app.nearby.length ? `${app.nearby.length} lieu${app.nearby.length > 1 ? 'x' : ''}, ${app.nearbyFromMe ? 'les plus proches de vous d\'abord' : 'par distance'}` : 'Aucun lieu pour l\'instant : touchez « Enregistrer » sur la fiche d\'un lieu.'}</p>
        <div class="list-actions">
          {#if app.category.shared}
            <button class="go" onclick={app.keepIncomingList}>Ajouter à Mes lieux</button>
          {:else}
            {#if app.nearby.length}<button class="link" onclick={() => { app.listEditing = !app.listEditing; app.swiped = null; }}>{app.listEditing ? 'Terminé' : 'Modifier'}</button>{/if}
            {#if app.nearby.length && !app.listEditing}<button class="link" onclick={() => app.shareList(l)}>Partager</button>{/if}
            <button class="link" onclick={() => app.renameList(l)}>Renommer</button>
            {#if !['fav', 'todo'].includes(l.id)}<button class="link danger" onclick={() => app.deleteList(l)}>Supprimer</button>{/if}
          {/if}
        </div>
      {:else}
      <h1>{app.chipList.find((c) => c.key === app.category.key)?.label || app.category.label}</h1>
      {#if app.openAt && app.openCounts}
        <p class="kind">{app.openCounts.open ? `${app.openCounts.open} ouvert${app.openCounts.open > 1 ? 's' : ''} ${app.openAt.now ? 'maintenant' : momentLabel(app.openAt.at).replace(/ (\d)/, ' à $1')}` : `Aucun ouvert ${app.openAt.now ? 'maintenant' : momentLabel(app.openAt.at).replace(/ (\d)/, ' à $1')} dans cette zone`}</p>
      {:else}
        <p class="kind">{app.nearby.length ? (app.nearbyFromMe ? 'Les plus proches de vous' : 'Autour du centre de la carte') : app.nearbyDone ? 'Aucun dans cette zone. Déplacez la carte pour chercher ailleurs.' : 'Recherche…'}</p>
      {/if}
      {#if !app.category.transit}
        <div class="open-pills">
          <button class="opill" class:on={app.openAt?.now} aria-pressed={!!app.openAt?.now} onclick={() => app.setOpenAt(app.openAt?.now ? null : { now: true })}>Ouvert maintenant</button>
          <button class="opill" class:on={!!app.openAt?.at} aria-expanded={app.momentPicker} onclick={() => (app.momentPicker = !app.momentPicker)}>
            {app.openAt?.at ? momentLabel(app.openAt.at).replace(/^./, (x) => x.toUpperCase()) : 'Ouvert à…'}
            <svg viewBox="0 0 24 24" aria-hidden="true" class="chev" class:flip={app.momentPicker}><path d="m7 10 5 5 5-5" /></svg>
          </button>
          {#if app.openAt}<button class="opill-x" onclick={() => app.setOpenAt(null)} aria-label="Retirer le filtre d'horaires">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" /></svg></button>{/if}
        </div>
        {#if app.momentPicker}
          <div class="moment">
            <div class="moment-quick">
              <button onclick={() => app.quickMoment('midi')}>Midi</button>
              <button onclick={() => app.quickMoment('soir')}>Ce soir</button>
              <button onclick={() => app.quickMoment('demain-soir')}>Demain soir</button>
            </div>
            <div class="moment-sel">
              <select aria-label="Jour" value={app.pickerDay} onchange={(e) => { const [h, m] = app.pickerTime.split(':').map(Number); app.setOpenAt({ at: app.momentFrom(+e.currentTarget.value, h, m) }); app.momentPicker = true; }}>
                {#each app.pickerDays as d}<option value={d.i}>{d.label}</option>{/each}
              </select>
              <select aria-label="Heure" value={app.pickerTime} onchange={(e) => { const [h, m] = e.currentTarget.value.split(':').map(Number); app.setOpenAt({ at: app.momentFrom(app.pickerDay, h, m) }); app.momentPicker = true; }}>
                {#each app.pickerHours as [h, m]}<option value={`${h}:${m}`}>{h} h {m ? '30' : ''}</option>{/each}
              </select>
            </div>
          </div>
        {/if}
      {/if}
      {/if}
      <ul class="nearby">
        {#each app.nearby as { f, d, st, deps: sd, saved: sv } (f.id)}
          <li class:swipe-row={app.category.saved && app.savedList && sv} class:swiped={app.swiped === f.id || (app.listEditing && app.savedList && sv)}
            ontouchstart={app.category.saved && app.savedList && sv ? (e) => (app.swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, id: f.id }) : undefined}
            ontouchmove={app.category.saved && app.savedList && sv ? (e) => {
              if (!app.swipeStart) return;
              const dx = e.touches[0].clientX - app.swipeStart.x, dy = e.touches[0].clientY - app.swipeStart.y;
              if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) { app.swiped = dx < 0 ? app.swipeStart.id : null; app.swipeStart = null; }
            } : undefined}>
            {#if app.category.saved && app.savedList && sv}
              <button class="swipe-del" onclick={() => app.removeFromList(sv, app.savedList)} aria-label={`Retirer ${sv.name} de la liste`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13M10.5 10.5v6M13.5 10.5v6" /></svg>
              </button>
            {/if}
            {#if !(app.category.saved && (app.hubPanel || (!app.savedList && !app.category.shared)))}
            <button class="n-main" onclick={() => { if (app.swiped) { app.swiped = null; return; } app.nearby.find((n) => n.f === f)?.saved ? app.openPlace({ ...app.nearby.find((n) => n.f === f).saved }) : app.openFeature(f); }}>
              <span class="n-dot" style:--fam={app.category.saved ? (app.category.shared ? app.category.color : app.listOf(app.nearby.find((n) => n.f === f)?.saved?.lists?.[0]).color) : app.famColor(app.category)} aria-hidden="true"></span>
              <span class="r-text">
                <span class="r-name">{app.displayName(f, app.category)}</span>
                {#if app.category.transit}
                  {#if sd?.status === 'ok'}
                    {#each sd.data.lines.slice(0, 4) as l}
                      <span class="n-dep">
                        <span class="badge small" class:round={l.mode === 'SUBWAY' || l.mode === 'METRO'} style:background={l.color} style:color={l.textColor}>{l.line}</span>
                        <span class="n-dir">{l.headsign}</span>
                        <span class="n-time">{fmtWait(l.times[0], app.now)}</span>
                      </span>
                    {/each}
                  {:else if sd?.status === 'loading'}
                    <span class="r-meta">Prochains passages…</span>
                  {:else if sd?.status === 'none'}
                    <span class="r-meta">Aucun passage dans l'heure</span>
                  {:else}
                    <span class="r-meta">{typeLabel('', f.properties.subclass) || 'Station'} · touchez pour les horaires</span>
                  {/if}
                {:else}
                <span class="r-meta">{app.category.saved ? [app.nearby.find((n) => n.f === f)?.saved?.type, app.nearby.find((n) => n.f === f)?.saved?.address].filter(Boolean).join(' · ') || 'Lieu enregistré' : typeLabel('', f.properties.subclass) || app.category.label}{#if st?.open != null}{' · '}<span class:is-open={st.open} class:is-closed={!st.open}>{st.label}</span>{/if}</span>
                {/if}
              </span>
              <span class="n-dist">{fmtDistance(d)}</span>
            </button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if app.openAt && app.openCounts?.unknown && !app.category?.saved}
        <button class="unknown-row" onclick={() => { app.showUnknown = !app.showUnknown; app.applyOpenFilter(); }}>
          {app.showUnknown ? 'Masquer' : 'Afficher'} les {app.openCounts.unknown} lieux aux horaires inconnus
          <small>Personne ne les a encore indiqués sur OpenStreetMap : certains sont peut-être ouverts.</small>
        </button>
      {/if}
    </section>

<style>
  svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  input {
    border: 0; background: none; font: inherit; font-size: 17px; color: var(--ink);
    padding: 12px 0; min-width: 0; outline: none; width: 100%;
  }
  input::placeholder { color: var(--muted); }
  input::-webkit-search-cancel-button { display: none; }
  .r-text { display: grid; gap: 1px; min-width: 0; }
  .r-name { font-size: 16px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .r-meta { font-size: 14px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .link { border: 0; background: none; color: var(--accent); font: inherit; font-weight: 500; cursor: pointer; padding: 4px 0; }

  /* ——— Fiches ——— */
  .close {
    position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%;
    border: 0; background: var(--fill); cursor: pointer; display: grid; place-items: center; color: var(--muted);
  }
  .close svg { width: 16px; height: 16px; stroke-width: 2.4; }
  /* Zone de toucher d'au moins 44 px autour des petits boutons ronds */
  .close::after { content: ''; position: absolute; inset: -6px; }
  .hub-h { font-size: 15px; font-weight: 700; margin: 18px 0 4px; }
  .hub-lists { list-style: none; margin: 0; padding: 0; }
  .hub-lists > li > button {   /* (pas le bouton « Créer » du champ de nouvelle liste : il écrasait le champ à 0 px) */ display: grid; grid-template-columns: 34px 1fr auto auto; gap: 12px; align-items: center; width: 100%;
    min-height: 52px; border: 0; background: none; padding: 0; text-align: left; cursor: pointer; border-bottom: 1px solid var(--line); font-size: 16px; }
  .pl-count { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; }
  .chev-r { width: 18px; height: 18px; color: var(--faint); }
  .new-list { display: flex; gap: 8px; align-items: center; min-height: 50px; border-bottom: 1px solid var(--line); }
  .new-list input { flex: 1; border: 0; background: none; font: inherit; font-size: 16px; color: var(--ink); padding: 10px 0; min-width: 0; }
  .new-list .link:disabled { opacity: 0.4; }
  .go.wide.done { width: 100%; margin: 14px 0 4px; height: 46px; background: var(--accent-btn); }
  .hub-rows .row-btn span { display: grid; }
  .why.warn { color: #D0731B; font-weight: 600; }
  .back-link { margin: 6px 0 2px; font-size: 15px; }
  .list-title { display: flex; align-items: center; gap: 10px; }
  .list-actions { display: flex; gap: 18px; align-items: center; margin-top: 8px; }
  .list-actions .link { font-size: 15px; }
  .link.danger { color: var(--closed); }
  .qr { display: grid; place-items: center; margin: 14px auto 4px; width: min(260px, 70vw); background: #fff; border-radius: 12px; padding: 8px; }
  .qr :global(svg) { width: 100%; height: auto; display: block; }
  .pw { display: grid; gap: 6px; font-size: 14px; color: var(--muted); margin-top: 14px; }
  .pw input { font: inherit; font-size: 16px; color: var(--ink); background: var(--fill); border: 0; border-radius: 12px; padding: 12px 14px; }
  .swipe-row { position: relative; overflow: hidden; }
  .nearby button { box-sizing: border-box; }
  .swipe-row .n-main { position: relative; z-index: 1; background: var(--card); transition: width 0.2s ease; }
  /* Poubelle visible : la ligne se rétrécit (le texte reste lisible) au lieu de glisser hors de la fiche */
  .swipe-row.swiped .n-main { width: calc(100% - 72px); }
  .nearby .swipe-del { position: absolute; padding: 0; right: 0; top: 0; bottom: 0; width: 72px; border: 0; border-top: 1px solid var(--line);
    background: var(--closed); color: #fff; display: grid; grid-template-columns: 1fr; place-items: center; cursor: pointer; }
  .nearby button.swipe-del:hover { background: color-mix(in srgb, var(--closed) 85%, #000); }
  /* Ordinateur (souris) : au survol d'une ligne, une petite poubelle remplace la distance */
  @media (hover: hover) and (pointer: fine) {

    .swipe-row:not(.swiped) .swipe-del { z-index: 2; top: 50%; bottom: auto; right: 14px; width: 38px; height: 38px; margin-top: -19px;
      border: 0; border-radius: 50%; background: var(--fill); color: var(--closed); opacity: 0; transition: opacity 0.12s; }
    .swipe-row:not(.swiped):hover .swipe-del, .swipe-row:not(.swiped) .swipe-del:focus-visible { opacity: 1; }
    .nearby .swipe-row:not(.swiped) button.swipe-del:hover { background: color-mix(in srgb, var(--closed) 16%, var(--card)); }
    .swipe-row:not(.swiped):hover .n-dist { visibility: hidden; }
  }
  .swipe-del svg { width: 22px; height: 22px; stroke-width: 2; }
  .close ~ h1 { margin-right: 44px; }
  h1 { font-size: 24px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; margin: 2px 44px 2px 0; text-wrap: balance; }
  .kind { margin: 0; color: var(--muted); font-size: 15px; }
  .kind::first-letter { text-transform: uppercase; }
  .r-meta .is-open { color: var(--open); }
  .r-meta .is-closed { color: var(--closed); }
  .muted { color: var(--muted); font-weight: 400; }

  /* ——— Filtre « ouvert à… » ——— */
  .open-pills { display: flex; gap: 8px; margin: 10px 0 2px; align-items: center; overflow-x: auto; scrollbar-width: none; }
  .open-pills > * { flex: none; }
  .opill { display: inline-flex; align-items: center; gap: 4px; height: 34px; padding: 0 12px; border-radius: 17px; border: 1px solid var(--line);
    background: var(--card); color: var(--ink); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .opill .chev { width: 16px; height: 16px; }
  .opill.on { background: var(--accent-btn); border-color: var(--accent-btn); color: #fff; }
  .opill.on .chev { color: #fff; }
  .opill-x { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--fill); color: var(--muted); display: grid; place-items: center; cursor: pointer; }
  .opill-x svg { width: 15px; height: 15px; stroke-width: 2.4; }
  .moment { margin: 8px 0 4px; padding: 10px; background: var(--fill); border-radius: 14px; display: grid; gap: 8px; }
  .moment-quick { display: flex; gap: 6px; flex-wrap: wrap; }
  .moment-quick button { height: 32px; padding: 0 12px; border-radius: 16px; border: 0; background: var(--card); color: var(--accent); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
  .moment-sel { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .moment-sel select { font: inherit; font-size: 16px; color: var(--ink); background: var(--card); border: 0; border-radius: 10px; padding: 9px 10px; }
  .unknown-row { display: block; width: 100%; text-align: left; border: 0; border-top: 1px solid var(--line); background: none; padding: 14px 0 4px;
    font: inherit; font-size: 15px; font-weight: 600; color: var(--accent); cursor: pointer; }
  .unknown-row small { display: block; font-weight: 400; font-size: 13px; color: var(--muted); margin-top: 3px; }
  .action {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 56px; padding: 6px 4px;
    border-radius: 14px; border: 0; cursor: pointer; text-decoration: none; font-size: 13.5px; font-weight: 600; line-height: 1.1;
    background: var(--fill); color: var(--accent); box-sizing: border-box; min-width: 0;
  }
  .action:active { filter: brightness(0.94); }
  .action :global(svg) { width: 21px; height: 21px; flex: none; }
  .action.primary { background: var(--accent-btn); color: #fff; }

  .rows { list-style: none; margin: 16px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .row { display: grid; grid-template-columns: 24px 1fr; gap: 16px; align-items: center; min-height: 52px; border-bottom: 1px solid var(--line); font-size: 15.5px; }
  .row > svg { width: 22px; height: 22px; color: var(--accent); }
  .row-btn { display: flex; justify-content: space-between; align-items: center; border: 0; background: none; padding: 14px 0; cursor: pointer; text-align: left; }
  .chev { width: 20px; height: 20px; color: var(--muted); transition: transform 200ms; }
  .chev.flip { transform: rotate(180deg); }

  .nearby { list-style: none; margin: 12px calc(-1 * var(--gutter)) 0; padding: 0; }
  .nearby button {
    display: grid; grid-template-columns: 20px 1fr auto; gap: 14px; align-items: center; width: 100%;
    border: 0; background: none; padding: 10px var(--gutter); text-align: left; cursor: pointer; border-top: 1px solid var(--line);
  }
  .nearby button:hover { background: var(--fill); }
  .n-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--fam); box-shadow: 0 0 0 2px var(--card), 0 0 0 3px var(--line); justify-self: center; }
  .n-dist { color: var(--muted); font-size: 14px; font-variant-numeric: tabular-nums; }
  .n-dep { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 6px; font-size: 13.5px; margin-top: 3px; }
  .n-dir { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n-time { font-weight: 600; color: var(--open); font-variant-numeric: tabular-nums; }
  .why { display: block; font-size: 13px; color: var(--muted); margin-top: 2px; line-height: 1.35; }
  .import-btn { display: flex; justify-content: center; align-items: center; min-height: 48px; border-radius: 14px; cursor: pointer; font-weight: 600; }

  @media (prefers-reduced-motion: reduce) {

    .chev { animation: none; transition: none; }
  }
</style>
