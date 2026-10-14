<!-- Pictogramme d'un mode de déplacement : walk | bike | transit | car -->
<script>
  let { id } = $props();
</script>
  {#if id === 'walk'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4.5" r="1.9" class="solid" /><path d="m9.5 21 2.2-7 2.6 2.6V21M7.5 12.5 10 8.4l3.4.4 1.9 3 2.7 1.2M11.7 14l-.9-4.7" /></svg>
  {:else if id === 'car'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" /><path d="M3.5 12.5h17v4.5h-17zM6 17v2.2M18 17v2.2" /><circle cx="7.5" cy="14.7" r=".9" class="solid" /><circle cx="16.5" cy="14.7" r=".9" class="solid" /></svg>
  {:else if id === 'bike'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.8" cy="16" r="3.6" /><circle cx="18.2" cy="16" r="3.6" /><path d="m5.8 16 4-7.2h5.8L18.2 16M9.8 8.8l3.6 7.2H5.8M13.6 5.6h2.6" /></svg>
  {:else}
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="3" width="13" height="13.5" rx="3.5" /><path d="M5.5 10h13M8 20.5l2-3.6M16 20.5l-2-3.6" /><circle cx="9" cy="13.4" r=".9" class="solid" /><circle cx="15" cy="13.4" r=".9" class="solid" /></svg>
  {/if}
