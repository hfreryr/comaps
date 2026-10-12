// Recherche de lieux (Photon) et détails d'un lieu (OpenStreetMap).
import { kindOf, expectsHours, practical } from './placeinfo.js';
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
  cemetery: 'Cimetière', grave_yard: 'Cimetière', florist: 'Fleuriste', tobacco: 'Tabac', newsagent: 'Presse',
  kiosk: 'Kiosque', laundry: 'Laverie', dry_cleaning: 'Pressing', bicycle_rental: 'Vélos en libre-service',
  bicycle: 'Magasin de vélos', parcel_locker: 'Consigne à colis', playground: 'Aire de jeux', clinic: 'Clinique',
  veterinary: 'Vétérinaire', pet: 'Animalerie', sports_centre: 'Centre sportif', fitness_centre: 'Salle de sport',
  swimming_pool: 'Piscine', toilets: 'Toilettes', drinking_water: "Point d'eau", charging_station: 'Borne de recharge',
  parking: 'Parking', police: 'Police', hardware: 'Quincaillerie', doityourself: 'Bricolage', mobile_phone: 'Téléphonie',
  computer: 'Informatique', electronics: 'Électronique', stationery: 'Papeterie', copyshop: 'Reprographie',
  townhall: 'Mairie', musical_instrument: 'Instruments de musique', music: 'Disquaire', nightclub: 'Boîte de nuit',
  escape_game: 'Escape game', coworking: 'Coworking', chocolate: 'Chocolatier', confectionery: 'Confiserie',
  greengrocer: 'Primeur', deli: 'Traiteur', alcohol: 'Caviste', beverages: 'Boissons', cosmetics: 'Cosmétiques',
  perfumery: 'Parfumerie', bag: 'Maroquinerie', atm: 'Distributeur', fuel: 'Station-service', yoga: 'Yoga',
  climbing: 'Escalade', viewpoint: 'Point de vue', memorial: 'Mémorial', castle: 'Château', guest_house: "Chambre d'hôtes",
  christian: 'Église', jewish: 'Synagogue', muslim: 'Mosquée', buddhist: 'Temple bouddhiste', paint: 'Peinture',
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
  // Photon renvoie parfois deux fois le même lieu : on n'en garde qu'un (sinon la liste plante).
  const seen = new Set();
  return data.features.filter((f) => {
    const id = `${f.properties.osm_type}${f.properties.osm_id}`;
    return !seen.has(id) && seen.add(id);
  }).map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const isAddress = !p.name;
    return {
      id: `${p.osm_type}${p.osm_id}`,
      osmType: { N: 'node', W: 'way', R: 'relation' }[p.osm_type],
      osmId: p.osm_id,
      name: p.name || address(p),
      type: isAddress ? 'Adresse' : typeLabel(p.osm_key, p.osm_value),
      subclass: isAddress ? null : p.osm_value,
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

/** Adresse postale d'un point touché sur la carte : « 57 Rue de Rennes, 75006 Paris ». */
export async function reverseAddress(lat, lon) {
  const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=fr&limit=1&layer=house&layer=street`);
  if (!res.ok) return null;
  const p = (await res.json()).features?.[0]?.properties;
  if (!p) return null;
  const line = p.housenumber ? [p.housenumber, p.street].filter(Boolean).join(' ') : p.street || p.name;
  const where = [p.postcode, p.city].filter(Boolean).join(' ');
  return line ? [line, where].filter(Boolean).join(', ') : null;
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
    checkDate: t.check_date || t['check_date:opening_hours'],
    kind: kindOf(t),
    expectsHours: expectsHours(t),
    practical: practical(t),
    wikidata: t.wikidata,
    wikipedia: t.wikipedia
  };
}

/**
 * Lieux d'une catégorie autour d'un point (Photon, filtre « include », ex. osm.shop.florist).
 * Complète les lieux lus dans la carte, utile pour les catégories rares (cimetières, piscines…).
 * Rendu sous la forme des lieux de la carte : { id, properties: { name, subclass, osm }, geometry }.
 */
export async function searchCategory(include, near, signal, q = null) {
  const url = new URL(PHOTON);
  const params = new URLSearchParams({
    lang: 'fr', limit: '20', lat: String(near.lat), lon: String(near.lon), location_bias_scale: '0.1',
    bbox: '2.15,48.75,2.55,48.95'
  });
  // Avec un mot (« piscine ») : recherche texte limitée aux étiquettes OSM ; sinon : par catégorie seule.
  if (q) { params.set('q', q); for (const c of include) params.append('osm_tag', c.replace(/^osm\./, '').replace('.', ':')); }
  else params.set('include', include.join(','));
  url.search = params;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = await res.json();
  return data.features.filter((f) => f.properties.name).map((f) => {
    const p = f.properties;
    const type = { N: 'node', W: 'way', R: 'relation' }[p.osm_type];
    return { id: `ph${p.osm_type}${p.osm_id}`, properties: { name: p.name, subclass: p.osm_value, osm: `${type}/${p.osm_id}` },
      geometry: { coordinates: f.geometry.coordinates } };
  });
}
