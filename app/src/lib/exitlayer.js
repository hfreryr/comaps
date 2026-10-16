// Sorties de la station ouverte, dessinées sur la carte (P5 : « ce qui serait encore mieux, c'est d'avoir
// l'emplacement des sorties sur la map »). Carré vert à numéro blanc, comme dans la fiche.
const EXIT_GREEN = '#2E8B57';

/** Affiche ces sorties (liste vide = les retirer). */
export function showExits(map, exits) {
  if (!map?.getStyle?.()) return;
  const data = { type: 'FeatureCollection', features: (exits || []).map((e, i) => ({ type: 'Feature', id: i,
    geometry: { type: 'Point', coordinates: [e.lon, e.lat] }, properties: { ref: e.ref || '', name: e.name || '' } })) };
  const src = map.getSource('exits');
  if (src) { src.setData(data); return; }
  if (!data.features.length) return;
  map.addSource('exits', { type: 'geojson', data });
  map.addLayer({ id: 'exits-dot', type: 'circle', source: 'exits', minzoom: 14,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 5, 17, 10], 'circle-color': EXIT_GREEN, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
  map.addLayer({ id: 'exits-num', type: 'symbol', source: 'exits', minzoom: 15.5,
    layout: { 'text-field': ['get', 'ref'], 'text-font': ['Inter Bold'], 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#fff' } });
}
