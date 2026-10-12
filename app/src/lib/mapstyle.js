// Style de carte maison, sur les tuiles vectorielles OpenFreeMap (schéma OpenMapTiles).
// Intention : une carte calme et nette. Fond chaud très clair, routes blanches sans contour
// appuyé, voies rapides ambrées, parcs et eau doux, bâtiments en léger relief, et des lieux
// signalés par une pastille colorée à pictogramme blanc. Police : Open Sans, hébergée avec l'app.

export const C = {
  land: '#F6F4F0',
  landAlt: '#F1EEE8',      // zones commerciales et équipements
  pedestrian: '#FBFAF7',
  building: '#E8E5DF',
  buildingEdge: '#DCD8D1',
  building3d: '#EAE6E0',
  park: '#D4EBCB',
  wood: '#C7E3BC',
  water: '#ABD4F2',
  waterLabel: '#4A84B5',
  road: '#FFFFFF',
  roadCase: '#E4E0D9',
  majorCase: '#DAD4CB',
  highway: '#FAD98A',
  highwayCase: '#EDC060',
  path: '#D3CEC6',
  rail: '#CCC8C1',
  label: '#2E3135',
  labelSoft: '#7C8187',
  roadLabel: '#6A6E73',
  halo: '#FFFFFF'
};

export const FONT = {
  regular: ['Open Sans Regular'],
  semibold: ['Open Sans Semibold'],
  bold: ['Open Sans Bold'],
  italic: ['Open Sans Italic']
};

// Familles de lieux : couleur, pictogramme et sous-classes OpenMapTiles.
export const FAMILIES = {
  food:    { color: '#E8742F', icon: 'utensils', classes: ['restaurant', 'fast_food', 'food_court', 'ice_cream', 'deli'] },
  cafe:    { color: '#E8742F', icon: 'cup',      classes: ['cafe'] },
  bar:     { color: '#E8742F', icon: 'glass',    classes: ['bar', 'pub', 'beer', 'biergarten', 'nightclub', 'wine', 'alcohol_shop'] },
  bakery:  { color: '#E8742F', icon: 'bread',    classes: ['bakery', 'pastry', 'confectionery'] },
  shop:    { color: '#4169D8', icon: 'bag',      classes: ['shop', 'clothing_store', 'clothes', 'grocery', 'supermarket', 'convenience', 'books', 'jewelry', 'shoes', 'florist', 'gift', 'butcher', 'cheese', 'hairdresser', 'beauty', 'optician', 'furniture', 'art', 'antiques', 'mall', 'department_store', 'stationery', 'toys', 'mobile_phone', 'electronics', 'bicycle', 'sports', 'cosmetics', 'perfumery'] },
  culture: { color: '#12919E', icon: 'columns',  classes: ['museum', 'art_gallery', 'gallery', 'theatre', 'cinema', 'arts_centre', 'library'] },
  sight:   { color: '#12919E', icon: 'star',     classes: ['attraction', 'monument', 'castle', 'viewpoint', 'memorial', 'place_of_worship', 'church', 'cathedral'] },
  nature:  { color: '#3E8E52', icon: 'tree',     classes: ['park', 'garden', 'playground', 'zoo', 'nature_reserve'] },
  health:  { color: '#D84A45', icon: 'cross',    classes: ['pharmacy', 'hospital', 'doctors', 'dentist', 'clinic', 'veterinary'] },
  stay:    { color: '#9A55A0', icon: 'bed',      classes: ['hotel', 'hostel', 'guest_house', 'lodging', 'motel'] }
};
const OTHER = { color: '#7D838A', icon: 'dot' };
const ALL_CLASSES = [...new Set(Object.values(FAMILIES).flatMap((f) => f.classes))];

export function familyOf(subclass) {
  for (const f of Object.values(FAMILIES)) if (f.classes.includes(subclass)) return f;
  return OTHER;
}

function matchBy(prop, pick, fallback) {
  const m = ['match', ['get', 'subclass']];
  for (const f of Object.values(FAMILIES)) m.push(f.classes, pick(f));
  m.push(fallback);
  return m;
}
const POI_ICON = matchBy('subclass', (f) => `poi-${f.icon}`, 'poi-dot');
const POI_TEXT = matchBy('subclass', (f) => darken(f.color), darken(OTHER.color));

function darken(hex, k = 0.78) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const NAME = ['coalesce', ['get', 'name:fr'], ['get', 'name'], ['get', 'name:latin']];
const zoom = (stops, base = 1.5) => ['interpolate', ['exponential', base], ['zoom'], ...stops];
const fade = (from, to) => ['interpolate', ['linear'], ['zoom'], from, 0, to, 1];

function roadPair(id, classes, { color, casing, widths, minzoom = 0, caseFade }) {
  const filter = ['all', ['match', ['get', 'class'], classes, true, false], ['!=', ['get', 'brunnel'], 'tunnel']];
  const caseWidths = widths.map((v, i) => (i % 2 ? v + 1.6 : v));
  return [
    { id: `${id}-case`, type: 'line', source: 'omt', 'source-layer': 'transportation', filter, minzoom,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': casing, 'line-width': zoom(caseWidths), ...(caseFade ? { 'line-opacity': fade(...caseFade) } : {}) } },
    { id, type: 'line', source: 'omt', 'source-layer': 'transportation', filter, minzoom,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': color, 'line-width': zoom(widths) } }
  ];
}

export function mapStyle(base = '') {
  return {
    version: 8,
    glyphs: `${base}fonts/{fontstack}/{range}.pbf`,
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
        attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>' }
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': C.land } },
      { id: 'landuse-alt', type: 'fill', source: 'omt', 'source-layer': 'landuse', minzoom: 12,
        filter: ['match', ['get', 'class'], ['commercial', 'retail', 'hospital', 'school', 'university', 'college', 'railway'], true, false],
        paint: { 'fill-color': C.landAlt } },
      { id: 'landuse-green', type: 'fill', source: 'omt', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['cemetery', 'pitch', 'stadium', 'playground', 'garden'], true, false],
        paint: { 'fill-color': C.park, 'fill-opacity': 0.85 } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['grass', 'wood', 'farmland', 'wetland'], true, false],
        paint: { 'fill-color': ['match', ['get', 'class'], 'wood', C.wood, C.park] } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': C.park } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': C.water } },
      { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
        paint: { 'line-color': C.water, 'line-width': zoom([10, 1, 18, 8]) } },
      { id: 'pedestrian-area', type: 'fill', source: 'omt', 'source-layer': 'transportation', minzoom: 15,
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['match', ['get', 'subclass'], ['pedestrian', 'platform'], true, false]],
        paint: { 'fill-color': C.pedestrian } },

      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14,
        paint: { 'fill-color': C.building, 'fill-outline-color': C.buildingEdge, 'fill-opacity': fade(14, 15) } },
      { id: 'building-edge', type: 'line', source: 'omt', 'source-layer': 'building', minzoom: 16,
        paint: { 'line-color': C.buildingEdge, 'line-width': 0.6, 'line-opacity': fade(16, 17) } },

      { id: 'pedestrian-street', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14.5,
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'subclass'], 'pedestrian']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': C.road, 'line-width': zoom([14.5, 1, 16, 4, 19, 16]) } },
      { id: 'path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 16,
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['match', ['get', 'subclass'], ['path', 'track', 'bridleway', 'steps'], true, false]],
        paint: { 'line-color': C.path, 'line-width': zoom([16, 0.8, 19, 2]), 'line-dasharray': [2.5, 2] } },
      ...roadPair('road-minor', ['minor', 'service'], { color: C.road, casing: C.roadCase, widths: [12, 0.4, 14, 1.6, 16, 6, 19, 22], caseFade: [14, 15] }),
      ...roadPair('road-mid', ['tertiary', 'secondary'], { color: C.road, casing: C.majorCase, widths: [10, 0.6, 14, 3.2, 16, 9, 19, 30] }),
      ...roadPair('road-major', ['primary', 'trunk'], { color: C.road, casing: C.majorCase, widths: [8, 0.8, 14, 4.6, 16, 12, 19, 36] }),
      ...roadPair('road-highway', ['motorway'], { color: C.highway, casing: C.highwayCase, widths: [6, 0.8, 14, 5.5, 16, 13, 19, 38] }),
      { id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
        filter: ['all', ['==', ['get', 'class'], 'rail'], ['!=', ['get', 'brunnel'], 'tunnel']],
        paint: { 'line-color': C.rail, 'line-width': zoom([12, 0.8, 18, 2.5]) } },
      { id: 'boundary-city', type: 'line', source: 'omt', 'source-layer': 'boundary', maxzoom: 13,
        filter: ['==', ['get', 'admin_level'], 8],
        paint: { 'line-color': '#C9C3BA', 'line-width': 1, 'line-dasharray': [3, 2] } },

      ...['Point', 'LineString'].map((g) => ({
        id: `water-name-${g === 'Point' ? 'point' : 'line'}`, type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        filter: ['==', ['geometry-type'], g],
        layout: { 'text-field': NAME, 'text-font': FONT.italic, 'text-size': zoom([12, 12, 16, 15]), 'text-letter-spacing': 0.08,
                  'symbol-placement': g === 'Point' ? 'point' : 'line' },
        paint: { 'text-color': C.waterLabel, 'text-halo-color': 'rgba(255,255,255,0.6)', 'text-halo-width': 1 } })),
      { id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
        layout: { 'symbol-placement': 'line', 'text-field': NAME, 'text-font': FONT.regular,
                  'text-size': zoom([14, 10.5, 17, 13, 19, 15]), 'text-max-angle': 28, 'symbol-spacing': 320,
                  'text-letter-spacing': 0.02 },
        paint: { 'text-color': C.roadLabel, 'text-halo-color': C.halo, 'text-halo-width': 1.6 } },

      // Lieux : pastille colorée à pictogramme blanc, nom de la même teinte.
      { id: 'poi', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 14.5,
        filter: ['all', ['has', 'name'], ['match', ['get', 'subclass'], ALL_CLASSES, true, false],
                 ['<=', ['get', 'rank'], ['step', ['zoom'], 10, 15.5, 30, 16.3, 999]]],
        layout: { 'icon-image': POI_ICON, 'icon-size': zoom([14.5, 0.8, 17, 1]),
                  'text-field': NAME, 'text-font': FONT.semibold, 'text-size': 12, 'text-anchor': 'left',
                  'text-offset': [1.15, 0], 'text-max-width': 8, 'text-line-height': 1.15,
                  'text-optional': true, 'symbol-sort-key': ['get', 'rank'] },
        paint: { 'text-color': POI_TEXT, 'text-halo-color': C.halo, 'text-halo-width': 1.6, 'icon-opacity': fade(14.5, 15) } },
      // Autres lieux (banques, bureaux, services) : seulement de très près.
      { id: 'poi-other', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 17.5,
        filter: ['all', ['has', 'name'], ['!', ['match', ['get', 'subclass'], ALL_CLASSES, true, false]],
                 ['!', ['match', ['get', 'class'], ['bus', 'railway', 'entrance', 'ferry_terminal', 'school', 'college'], true, false]]],
        layout: { 'icon-image': 'poi-dot', 'icon-size': 0.85, 'text-field': NAME, 'text-font': FONT.semibold, 'text-size': 11.5,
                  'text-anchor': 'left', 'text-offset': [1.05, 0], 'text-max-width': 8, 'text-optional': true, 'symbol-sort-key': ['get', 'rank'] },
        paint: { 'text-color': '#5F656C', 'text-halo-color': C.halo, 'text-halo-width': 1.6 } },
      // Lieux mis en avant par un raccourci de catégorie (filtre posé par l'app).
      { id: 'poi-hit', type: 'symbol', source: 'omt', 'source-layer': 'poi', filter: ['==', ['get', 'subclass'], '__none__'],
        layout: { 'icon-image': POI_ICON, 'icon-size': 1.15, 'icon-allow-overlap': true,
                  'text-field': NAME, 'text-font': FONT.bold, 'text-size': 12.5, 'text-anchor': 'left',
                  'text-offset': [1.3, 0], 'text-max-width': 8, 'text-optional': true },
        paint: { 'text-color': POI_TEXT, 'text-halo-color': C.halo, 'text-halo-width': 1.8 } },

      // Stations de métro et RER : pastille « M », nom à partir du zoom 14,5.
      { id: 'metro', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 13.8,
        filter: ['all', ['==', ['get', 'class'], 'railway'], ['match', ['get', 'subclass'], ['subway', 'station', 'halt'], true, false]],
        layout: { 'icon-image': 'metro', 'icon-size': zoom([13.8, 0.7, 16, 1]),
                  'text-field': ['step', ['zoom'], '', 14.5, NAME], 'text-font': FONT.semibold,
                  'text-size': 12, 'text-anchor': 'left', 'text-offset': [1.15, 0], 'text-optional': true },
        paint: { 'text-color': '#2B4793', 'text-halo-color': C.halo, 'text-halo-width': 1.6 } },

      { id: 'place-small', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 12, maxzoom: 17,
        filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false],
        layout: { 'text-field': NAME, 'text-font': FONT.semibold, 'text-size': zoom([12, 10.5, 16, 13]),
                  'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 7 },
        paint: { 'text-color': C.labelSoft, 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1.4 } },
      { id: 'place-city', type: 'symbol', source: 'omt', 'source-layer': 'place', maxzoom: 13,
        filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
        layout: { 'text-field': NAME, 'text-font': FONT.bold, 'text-size': zoom([6, 13, 12, 22]) },
        paint: { 'text-color': C.label, 'text-halo-color': C.halo, 'text-halo-width': 2 } },
      { id: 'housenumber', type: 'symbol', source: 'omt', 'source-layer': 'housenumber', minzoom: 18,
        layout: { 'text-field': ['get', 'housenumber'], 'text-font': FONT.regular, 'text-size': 10.5 },
        paint: { 'text-color': '#A2A6AB' } }
    ]
  };
}

// ——— Pictogrammes (dessins originaux, grille 24×24) ———
const GLYPHS = {
  utensils: 'M7 3v7.5a2 2 0 0 0 1.5 1.9V21h1.6v-8.6a2 2 0 0 0 1.5-1.9V3h-1.3v6H9.6V3H8.4v6H7.7V3zM15.5 3c-1.6 0-2.6 2.6-2.6 5.6v4.2h2V21h1.6V3z',
  cup: 'M5 7h11v5.5A4.5 4.5 0 0 1 11.5 17h-2A4.5 4.5 0 0 1 5 12.5zM16 8.5h1.2a2.6 2.6 0 0 1 0 5.2H15.6v-1.7h1.6a.9.9 0 0 0 0-1.8H16zM4 18.5h13V20H4z',
  glass: 'M5 4h14l-6 7.3V18h3.5v2h-9v-2H11v-6.7zM8.5 6l2.2 2.6h2.6L15.5 6z',
  bread: 'M6.5 8C4.5 8 3 9.3 3 11c0 1.1.6 2 1.5 2.5V18h15v-4.5c.9-.5 1.5-1.4 1.5-2.5 0-1.7-1.5-3-3.5-3zM8 11.4l1.4-1.4 1 1-1.4 1.4zm3.3 0 1.4-1.4 1 1-1.4 1.4zm3.3 0 1.4-1.4 1 1-1.4 1.4z',
  bag: 'M6 8h12l1 12H5zM9 8V7a3 3 0 0 1 6 0v1h-1.6V7a1.4 1.4 0 0 0-2.8 0v1z',
  columns: 'M12 3 3.5 7.5V9h17V7.5zM5.5 10.2h2.2v6.6H5.5zm5.4 0h2.2v6.6h-2.2zm5.4 0h2.2v6.6h-2.2zM4 18h16v2H4z',
  star: 'M12 3.2l2.6 5.5 6 .7-4.5 4.1 1.2 5.9L12 16.4l-5.3 3 1.2-5.9L3.4 9.4l6-.7z',
  tree: 'M12 2.8 6.6 10h2.6l-3.7 5h5.3v5.2h2.4V15h5.3l-3.7-5h2.6z',
  cross: 'M9.6 4h4.8v5.6H20v4.8h-5.6V20H9.6v-5.6H4V9.6h5.6z',
  bed: 'M3 6h2v6.5h6V9h6.5a3.5 3.5 0 0 1 3.5 3.5V19h-2v-2.5H5V19H3zM8 8.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z',
  dot: 'M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z'
};

// Pastille : disque coloré, liseré blanc, ombre douce, pictogramme blanc. Rendu en 2× pour l'écran.
export function poiImage(color, glyph, px = 22) {
  const s = 2, size = (px + 6) * s;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = (px / 2) * s, cx = size / 2, cy = size / 2;
  g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = 3 * s; g.shadowOffsetY = 0.8 * s;
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.arc(cx, cy, r + 1.4 * s, 0, Math.PI * 2); g.fill();
  g.shadowColor = 'transparent';
  g.fillStyle = color;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  const scale = (r * 1.25) / 24;
  g.save();
  g.translate(cx - 12 * scale, cy - 12 * scale);
  g.scale(scale, scale);
  g.fillStyle = '#FFFFFF';
  g.fill(new Path2D(GLYPHS[glyph] || GLYPHS.dot), 'evenodd');
  g.restore();
  return { data: g.getImageData(0, 0, size, size), pixelRatio: s };
}

// Pastille métro : disque bleu, liseré blanc, « M » blanc.
export function metroImage(px = 18) {
  const s = 2, size = (px + 4) * s;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = (px / 2) * s, cx = size / 2;
  g.fillStyle = '#FFFFFF';
  g.beginPath(); g.arc(cx, cx, r + 1.4 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2B4793';
  g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#FFFFFF';
  g.font = `700 ${Math.round(r * 1.25)}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('M', cx, cx + r * 0.08);
  return { data: g.getImageData(0, 0, size, size), pixelRatio: s };
}

// Fournit à la carte toute image demandée par le style.
export function provideImage(map, id) {
  if (map.hasImage(id)) return;
  if (id === 'metro') {
    const { data, pixelRatio } = metroImage();
    return map.addImage(id, data, { pixelRatio });
  }
  if (id.startsWith('poi-')) {
    const glyph = id.slice(4);
    const fam = Object.values(FAMILIES).find((f) => f.icon === glyph) || OTHER;
    const { data, pixelRatio } = poiImage(fam.color, glyph);
    map.addImage(id, data, { pixelRatio });
  }
}

// Identifiant de tuile → élément OSM (planetiler : id OSM × 10 + type).
export function osmRef(featureId) {
  if (featureId == null) return null;
  const type = { 1: 'node', 2: 'way', 3: 'relation' }[featureId % 10];
  return type ? { osmType: type, osmId: Math.floor(featureId / 10) } : null;
}
