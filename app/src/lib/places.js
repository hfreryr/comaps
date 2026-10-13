// Lieux : détails d'un lieu et lieux d'une catégorie, lus dans les tuiles préparées à l'avance (placestore.js).
// Aucun service tiers n'est interrogé lieu par lieu. La recherche par texte est dans geocode.js.
import { kindOf, expectsHours, practical, goodToKnow } from './placeinfo.js';
import { placeById, placesInBounds } from './placestore.js';
import { city } from './cities/index.js';

export const PARIS = city.center;

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

/** Détails d'un lieu (fiche) : ses étiquettes OSM, lues dans la tuile de sa position. */
export async function details(place) {
  if (!place.osmType) return {};
  const hit = await placeById(place.osmType, place.osmId, place.lat, place.lon).catch(() => null);
  if (!hit) return { covered: false };
  return { ...fromTags(hit.tags), facade: hit.facade || null };
}

export function fromTags(t) {
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return {
    covered: true,
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
    good: goodToKnow(t),
    fee: t.fee,
    wikidata: t.wikidata,
    wikipedia: t.wikipedia
  };
}

/**
 * Lieux d'une catégorie dans une zone, lus dans les tuiles préparées (complète ceux lus dans la carte,
 * utile pour les catégories rares : cimetières, piscines…). `include` : ['osm.shop.florist', …] ; `q` : un mot
 * à chercher dans le nom (« piscine »). Rendu comme les lieux de la carte : { id, properties, geometry, tags }.
 */
const fold = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export async function searchCategory(include, bounds, q = null) {
  const wanted = include.map((c) => c.replace(/^osm\./, '').split('.'));
  const word = q ? fold(q) : null;
  const all = await placesInBounds(bounds).catch(() => []);
  return all.filter((p) => {
    const t = p.tags;
    if (!t.name || !wanted.some(([k, v]) => t[k] === v)) return false;
    return !word || fold(t.name).includes(word);
  }).map((p) => {
    const kind = { 1: 'node', 2: 'way', 3: 'relation' }[p.id % 10];
    const t = p.tags;
    const sub = t.shop || t.amenity || t.tourism || t.leisure || t.craft || t.office || t.healthcare;
    return { id: `pl${p.id}`, properties: { name: t.name, subclass: sub, osm: `${kind}/${Math.floor(p.id / 10)}` },
      geometry: { coordinates: [p.lon, p.lat] }, tags: t, facade: p.facade || null };
  });
}
