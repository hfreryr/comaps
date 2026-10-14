<!-- Pastille ronde d'une liste de Mes lieux : couleur et pictogramme de la liste -->
<script>
  import { GLYPHS } from '#lib/mapstyle.js';
  let { l, size = 34 } = $props();
  const glyphUrl = (g) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#fff" fill-rule="evenodd" d="${GLYPHS[g] || GLYPHS.dot}"/></svg>`)}`;
</script>

<span class="list-dot" style:--lc={l.color} style:width={`${size}px`} style:height={`${size}px`} aria-hidden="true">
  <img src={glyphUrl(l.icon)} alt="" />
</span>

<style>
  .list-dot { flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--lc); justify-self: center; }
  .list-dot img { width: 58%; height: 58%; }
</style>
