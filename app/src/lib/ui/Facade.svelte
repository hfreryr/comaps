<!-- Devanture : photo 360° Panoramax recadrée vers le lieu (secteur de 45°), sans serveur.
     Styles dans base.css (.facade) : ils dépendent de la taille du conteneur (vignette, plein écran…). -->
<script>
  let { f, alt = '' } = $props();
</script>

<span class="facade" style:--fx={f.rel / 360 + 0.5}>
  <img src={f.src} {alt} loading="lazy" decoding="async" />
</span>
