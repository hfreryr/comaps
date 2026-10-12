// Style de carte maison, sur les tuiles vectorielles OpenFreeMap (schéma OpenMapTiles).
// Intention : une carte calme et lisible — routes blanches, couleurs douces,
// lieux colorés par famille — pour que l'information prime sur le décor.

export const C = {
  land: '#F3F2EF',
  urban: '#EEECE8',
  building: '#E4E1DC',
  buildingEdge: '#D8D4CE',
  park: '#CFE6C8',
  wood: '#BFDDB6',
  water: '#A8D2F0',
  waterLabel: '#3D7AAB',
  road: '#FFFFFF',
  roadCase: '#DCD8D1',
  major: '#FFFFFF',
  majorCase: '#D3CEC6',
  highway: '#F8D488',
  highwayCase: '#E2B65E',
  path: '#C9C4BB',
  rail: '#C4C0BA',
  label: '#3C4043',
  roadLabel: '#5F6368',
  halo: '#FFFFFF'
};

// Familles de lieux : couleur et sous-classes OpenMapTiles correspondantes.
export const FAMILIES = {
  food:    { color: '#E0702E', classes: ['restaurant', 'fast_food', 'cafe', 'bar', 'beer', 'ice_cream', 'bakery', 'pastry', 'confectionery', 'pub', 'food_court', 'biergarten'] },
  shop:    { color: '#3F6BD8', classes: ['shop', 'clothing_store', 'grocery', 'supermarket', 'convenience', 'books', 'jewelry', 'shoes', 'florist', 'gift', 'butcher', 'cheese', 'wine', 'alcohol_shop', 'deli', 'hairdresser', 'beauty', 'optician', 'furniture', 'art', 'antiques', 'mall', 'department_store', 'stationery', 'toys'] },
  culture: { color: '#0E8F9C', classes: ['museum', 'art_gallery', 'gallery', 'theatre', 'cinema', 'attraction', 'monument', 'castle', 'library', 'arts_centre', 'place_of_worship', 'church', 'viewpoint'] },
  nature:  { color: '#3A8A4F', classes: ['park', 'garden', 'playground', 'zoo', 'pitch', 'sports_centre', 'swimming_pool', 'stadium'] },
  health:  { color: '#D24A43', classes: ['pharmacy', 'hospital', 'doctors', 'dentist', 'clinic', 'veterinary'] },
  stay:    { color: '#A0509A', classes: ['hotel', 'hostel', 'guest_house', 'lodging'] }
};

const familyColor = ['match', ['get', 'subclass']];
for (const f of Object.values(FAMILIES)) familyColor.push(f.classes, f.color);
familyColor.push('#6E737A');

const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const NAME = ['coalesce', ['get', 'name'], ['get', 'name:latin']];

const w = (stops) => ['interpolate', ['exponential', 1.6], ['zoom'], ...stops];

function road(id, classes, color, casing, widths, extra = {}) {
  const filter = ['all', ['match', ['get', 'class'], classes, true, false], ['!=', ['get', 'brunnel'], 'tunnel']];
  return [
    { id: `${id}-case`, type: 'line', source: 'omt', 'source-layer': 'transportation', filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': casing, 'line-width': w(widths.map((v, i) => (i % 2 ? v + 2 : v))), ...extra.case } },
    { id, type: 'line', source: 'omt', 'source-layer': 'transportation', filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': w(widths), ...extra.fill } }
  ];
}

export function mapStyle() {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
      attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">contributeurs OpenStreetMap</a>' } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': C.land } },
      { id: 'urban', type: 'fill', source: 'omt', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['residential', 'commercial', 'retail', 'industrial', 'neighbourhood'], true, false],
        paint: { 'fill-color': C.urban } },
      { id: 'landuse-green', type: 'fill', source: 'omt', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['cemetery', 'pitch', 'stadium', 'playground'], true, false],
        paint: { 'fill-color': C.park, 'fill-opacity': 0.7 } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['grass', 'wood', 'farmland', 'wetland'], true, false],
        paint: { 'fill-color': ['match', ['get', 'class'], 'wood', C.wood, C.park] } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': C.park } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': C.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
        paint: { 'line-color': C.water, 'line-width': w([10, 1, 18, 8]) } },

      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14,
        paint: { 'fill-color': C.building, 'fill-outline-color': C.buildingEdge,
                 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1] } },
      { id: 'building-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 16.5,
        paint: { 'fill-extrusion-color': C.building,
                 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
                 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
                 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 16.5, 0, 17.5, 0.75] } },

      { id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 15,
        filter: ['match', ['get', 'class'], ['path', 'track'], true, false],
        paint: { 'line-color': C.path, 'line-width': w([15, 0.8, 19, 2]), 'line-dasharray': [2, 1.5] } },
      ...road('road-minor', ['minor', 'service'], C.road, C.roadCase, [12, 0.5, 14, 2, 18, 14], { case: { 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1] } }),
      ...road('road-mid', ['tertiary', 'secondary'], C.major, C.majorCase, [10, 0.8, 14, 4, 18, 22]),
      ...road('road-major', ['primary', 'trunk'], C.major, C.majorCase, [8, 1, 14, 5.5, 18, 28]),
      ...road('road-highway', ['motorway'], C.highway, C.highwayCase, [6, 1, 14, 6, 18, 30]),
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
        filter: ['all', ['==', ['get', 'class'], 'rail'], ['!=', ['get', 'brunnel'], 'tunnel']],
        paint: { 'line-color': C.rail, 'line-width': w([12, 1, 18, 3]) } },

      { id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': 13, 'text-letter-spacing': 0.05 },
        paint: { 'text-color': C.waterLabel, 'text-halo-color': 'rgba(255,255,255,0.7)', 'text-halo-width': 1 } },
      { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT,
                  'text-size': w([14, 10, 18, 14]), 'text-max-angle': 30, 'symbol-spacing': 300 },
        paint: { 'text-color': C.roadLabel, 'text-halo-color': C.halo, 'text-halo-width': 1.5 } },

      // Lieux : pastille colorée + nom de la même couleur, par famille.
      { id: 'poi', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 15,
        filter: ['all', ['has', 'name'], ['!', ['match', ['get', 'class'], ['bus', 'railway', 'entrance', 'ferry_terminal'], true, false]],
                 ['<=', ['get', 'rank'], ['step', ['zoom'], 6, 16, 14, 17, 30, 18, 999]]],
        layout: { 'icon-image': 'dot', 'icon-size': 0.5, 'text-field': NAME, 'text-font': FONT,
                  'text-size': 12.5, 'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-max-width': 9,
                  'text-optional': true, 'symbol-sort-key': ['get', 'rank'] },
        paint: { 'icon-color': familyColor, 'icon-halo-color': C.halo, 'icon-halo-width': 1.5,
                 'text-color': familyColor, 'text-halo-color': C.halo, 'text-halo-width': 1.5 } },
      // Lieux mis en avant par un raccourci de catégorie (filtre posé par l'app).
      { id: 'poi-hit', type: 'symbol', source: 'omt', 'source-layer': 'poi', filter: ['==', ['get', 'subclass'], '__none__'],
        layout: { 'icon-image': 'dot', 'icon-size': 0.8, 'icon-allow-overlap': true, 'text-field': NAME, 'text-font': FONT_BOLD,
                  'text-size': 13, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-optional': true },
        paint: { 'icon-color': familyColor, 'icon-halo-color': C.halo, 'icon-halo-width': 2,
                 'text-color': familyColor, 'text-halo-color': C.halo, 'text-halo-width': 1.5 } },
      // Stations de métro et RER : pastille « M », nom affiché à partir du zoom 14,5.
      { id: 'metro', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 12.5,
        filter: ['all', ['==', ['get', 'class'], 'railway'], ['match', ['get', 'subclass'], ['subway', 'station', 'halt'], true, false]],
        layout: { 'icon-image': 'metro', 'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.32, 16, 0.45],
                  'text-field': ['step', ['zoom'], '', 14.5, NAME], 'text-font': FONT,
                  'text-size': 12, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-optional': true },
        paint: { 'text-color': '#2C4A9A', 'text-halo-color': C.halo, 'text-halo-width': 1.5 } },

      { id: 'place-small', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 12,
        filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false],
        layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': w([12, 11, 16, 14]), 'text-max-width': 8 },
        paint: { 'text-color': '#6B6F73', 'text-halo-color': C.halo, 'text-halo-width': 1.5 } },
      { id: 'place-city', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false], maxzoom: 14,
        layout: { 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': w([6, 12, 12, 20]) },
        paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 2 } },
      { id: 'housenumber', type: 'symbol', source: 'omt', 'source-layer': 'housenumber', minzoom: 18,
        layout: { 'text-field': ['get', 'housenumber'], 'text-font': FONT, 'text-size': 10 },
        paint: { 'text-color': '#9AA0A6' } }
    ]
  };
}

// Pastille ronde utilisée par les lieux (image SDF : la couleur est appliquée par le style).
export function dotImage(size = 32) {
  const data = new Uint8Array(size * size * 4);
  const r = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
    const i = (y * size + x) * 4;
    // SDF : alpha à 192 sur le bord du disque, décroissant vers l'extérieur
    const a = Math.max(0, Math.min(255, 192 + (r - 3 - d) * 24));
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = a;
  }
  return { width: size, height: size, data };
}

// Pastille métro : disque bleu, liseré blanc, « M » blanc.
export function metroImage(size = 48) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2C4A9A';
  g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#FFFFFF';
  g.font = `700 ${Math.round(size * 0.52)}px -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('M', size / 2, size / 2 + size * 0.03);
  return g.getImageData(0, 0, size, size);
}

// Identifiant de tuile → élément OSM (planetiler : id OSM × 10 + type).
export function osmRef(featureId) {
  if (featureId == null) return null;
  const type = { 1: 'node', 2: 'way', 3: 'relation' }[featureId % 10];
  return type ? { osmType: type, osmId: Math.floor(featureId / 10) } : null;
}
