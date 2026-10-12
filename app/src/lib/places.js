// Recherche de lieux (Photon) et détails d'un lieu (OpenStreetMap).
// Prototype : serveurs publics, à remplacer par des instances auto-hébergées.

const PHOTON = 'https://photon.komoot.io/api/';
const OSM_API = 'https://api.openstreetmap.org/api/0.6';
export const PARIS = { lat: 48.8566, lon: 2.3522 };

const TYPES = {
  restaurant: 'Restaurant', cafe: 'Café', bar: 'Bar', pub: 'Pub', fast_food: 'Restauration rapide',
  bakery: 'Boulangerie', pastry: 'Pâtisserie', supermarket: 'Supermarché', convenience: 'Épicerie',
  pharmacy: 'Pharmacie', books: 'Librairie', clothes: 'Vêtements', hairdresser: 'Coiffeur',
  museum: 'Musée', gallery: "Galerie d'art", cinema: 'Cinéma', theatre: 'Théâtre', hotel: 'Hôtel',
  park: 'Parc', garden: 'Jardin', station: 'Gare', subway_entrance: 'Entrée de métro',
  post_office: 'Bureau de poste', bank: 'Banque', library: 'Bibliothèque', school: 'École',
  hospital: 'Hôpital', doctors: 'Médecin', church: 'Église', place_of_worship: 'Lieu de culte',
  attraction: 'Lieu touristique', monument: 'Monument', florist: 'Fleuriste', butcher: 'Boucherie',
  cheese: 'Fromagerie', wine: 'Caviste', ice_cream: 'Glacier', marketplace: 'Marché',
  fast_food: 'Restauration rapide', supermarket: 'Supermarché', grocery: 'Épicerie',
  clothing_store: 'Vêtements', jewelry: 'Bijouterie', shoes: 'Chaussures', art_gallery: "Galerie d'art",
  subway: 'Station de métro', halt: 'Gare', hostel: 'Auberge de jeunesse', dentist: 'Dentiste',
  beauty: 'Institut de beauté', optician: 'Opticien', gift: 'Cadeaux', toys: 'Jouets',
  house: 'Adresse', street: 'Rue', residential: 'Rue', city: 'Ville', suburb: 'Quartier'
};

export function typeLabel(key, value) {
  if (key === 'railway' && value === 'station') return 'Station';
  return TYPES[value] || (key === 'highway' ? 'Rue' : key === 'place' ? 'Lieu' : null);
}

function address(p) {
  const line = [p.housenumber, p.street].filter(Boolean).join(' ');
  const where = p.postcode ? `${p.postcode} ${p.city || ''}`.trim() : p.district || p.city;
  return [line, where].filter(Boolean).join(', ');
}

export async function search(query, near = PARIS, signal) {
  const url = new URL(PHOTON);
  url.search = new URLSearchParams({
    q: query, lang: 'fr', limit: '7',
    lat: String(near.lat), lon: String(near.lon), location_bias_scale: '0.4',
    bbox: '2.15,48.75,2.55,48.95' // Paris et proche banlieue pour le prototype
  });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = await res.json();
  return data.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const isAddress = !p.name;
    return {
      id: `${p.osm_type}${p.osm_id}`,
      osmType: { N: 'node', W: 'way', R: 'relation' }[p.osm_type],
      osmId: p.osm_id,
      name: p.name || address(p),
      type: isAddress ? 'Adresse' : typeLabel(p.osm_key, p.osm_value),
      address: isAddress ? [p.postcode, p.city].filter(Boolean).join(' ') : address(p),
      lat, lon
    };
  });
}

/** Adresse la plus proche d'un point (pour un point choisi sur la carte). */
export async function reverse(lat, lon) {
  const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=fr&limit=1`);
  if (!res.ok) return null;
  const p = (await res.json()).features?.[0]?.properties;
  if (!p) return null;
  return p.name && !p.housenumber ? p.name : address(p) || p.name || null;
}

export async function details(place, signal) {
  if (!place.osmType) return {};
  const res = await fetch(`${OSM_API}/${place.osmType}/${place.osmId}.json`, { signal });
  if (!res.ok) return {};
  const data = await res.json();
  const t = data.elements?.[0]?.tags || {};
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return {
    name: t.name,
    address: street ? [street, t['addr:postcode']].filter(Boolean).join(', ') : null,
    cuisine: t.cuisine,
    hours: t.opening_hours,
    phone: t.phone || t['contact:phone'],
    website: t.website || t['contact:website'],
    wheelchair: t.wheelchair,
    checkDate: t.check_date || t['check_date:opening_hours']
  };
}
