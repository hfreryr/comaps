// Vue satellite (P6 : « je l'utilise tout le temps ») : photographies aériennes de l'IGN (BD ORTHO, Licence Ouverte 2.0),
// servies par la Géoplateforme, sans clé. France seulement. Les noms de rues et de lieux restent par-dessus.
// Ce que voit l'IGN : l'adresse IP et la zone regardée (page « Qui voit quoi »).
export const ORTHO = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS'
  + '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

/** Ajoute (ou retire) la photo aérienne sous les étiquettes. */
export function setSatellite(map, on) {
  if (!on) {
    if (map.getLayer('satellite')) map.removeLayer('satellite');
    return;
  }
  if (!map.getSource('satellite')) {
    map.addSource('satellite', { type: 'raster', tiles: [ORTHO], tileSize: 256, maxzoom: 19,
      attribution: '<a href="https://geoservices.ign.fr/bdortho" target="_blank" rel="noopener">IGN BD ORTHO</a>' });
  }
  if (map.getLayer('satellite')) return;
  // sous la première couche d'étiquettes : les surfaces et les traits du plan disparaissent, les noms restent
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 150 } }, firstLabel);
}
