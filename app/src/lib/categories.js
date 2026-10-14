// Catégories de lieux (raccourcis), mots de recherche associés et préférences d'affichage.
// « key » ne change jamais ; intitulé, ordre et visibilité sont personnalisables et gardés sur l'appareil.
import { tx } from '#lib/i18n/index.js';

// Raccourcis de catégories. « key » ne change jamais ; intitulé, ordre et affichage sont personnalisables.
// on : affiché d'origine (les autres s'ajoutent dans « Personnaliser les raccourcis ») ;
// classes : sous-classes des lieux de la carte ; inc : catégories Photon pour compléter avec les lieux hors de la vue.
export const ALL_CATEGORIES = [
  { key: 'saved', label: tx('resultats.mes_lieux'), saved: true, color: '#D63A7A', icon: 'heart', on: true },
  { key: "resto", label: tx('categories.restaurants'), classes: ["restaurant", "fast_food"], inc: ["osm.amenity.restaurant"], family: "food", on: true },
  { key: "cafe", label: tx('categories.cafes'), classes: ["cafe"], inc: ["osm.amenity.cafe"], family: "cafe", on: true },
  { key: 'metro', label: tx('itin.metro'), transit: true, color: '#2B4793', icon: 'train', on: true },
  { key: "pharmacie", label: tx('categories.pharmacies'), classes: ["pharmacy"], inc: ["osm.amenity.pharmacy"], family: "health", on: true },
  { key: "courses", label: tx('categories.courses'), classes: ["supermarket", "convenience", "grocery"], inc: ["osm.shop.supermarket", "osm.shop.convenience"], family: "shop", on: true },
  { key: "distributeur", label: tx('categories.distributeurs'), classes: ["atm"], inc: ["osm.amenity.atm"], family: "money", on: true, unnamed: tx('categories.distributeur_de_billets') },
  { key: "boulangerie", label: tx('categories.boulangeries'), classes: ["bakery", "pastry"], inc: ["osm.shop.bakery", "osm.shop.pastry"], family: "bakery", on: true },
  { key: "bar", label: tx('categories.bars'), classes: ["bar", "pub", "beer"], inc: ["osm.amenity.bar", "osm.amenity.pub"], family: "bar", on: true },
  { key: "musee", label: tx('categories.musees'), classes: ["museum", "art_gallery", "gallery"], inc: ["osm.tourism.museum", "osm.tourism.gallery"], family: "culture", on: true },
  { key: "banque", label: tx('categories.banques'), classes: ["bank"], inc: ["osm.amenity.bank"], family: "money", on: true },
  { key: "essence", label: tx('categories.stations_service'), classes: ["fuel"], inc: ["osm.amenity.fuel"], family: "fuel", on: true },
  { key: "fleuriste", label: tx('categories.fleuristes'), classes: ["florist"], inc: ["osm.shop.florist"], color: "#C9497E", icon: "flower", on: false },
  { key: "cimetiere", label: tx('categories.cimetieres'), classes: ["cemetery", "grave_yard"], inc: ["osm.landuse.cemetery", "osm.amenity.grave_yard"], color: "#6E8B74", icon: "tree", on: false },
  { key: "parc", label: tx('categories.parcs_et_jardins'), classes: ["park", "garden"], inc: ["osm.leisure.park", "osm.leisure.garden"], family: "nature", on: false },
  { key: "jeux", label: tx('categories.aires_de_jeux'), classes: ["playground"], inc: ["osm.leisure.playground"], family: "nature", on: false },
  { key: "glacier", label: tx('categories.glaciers'), classes: ["ice_cream"], inc: ["osm.amenity.ice_cream"], family: "food", icon: "cup", on: false },
  { key: "rapide", label: tx('categories.restauration_rapide'), classes: ["fast_food"], inc: ["osm.amenity.fast_food"], family: "food", on: false },
  { key: "caviste", label: tx('categories.cavistes'), classes: ["wine", "alcohol", "beverages"], inc: ["osm.shop.wine", "osm.shop.alcohol"], family: "bar", on: false },
  { key: "chocolat", label: tx('categories.chocolatiers'), classes: ["chocolate", "confectionery"], inc: ["osm.shop.chocolate", "osm.shop.confectionery"], family: "bakery", on: false },
  { key: "fromagerie", label: tx('categories.fromageries'), classes: ["cheese"], inc: ["osm.shop.cheese"], family: "shop", on: false },
  { key: "boucherie", label: tx('categories.boucheries'), classes: ["butcher"], inc: ["osm.shop.butcher"], family: "shop", on: false },
  { key: "primeur", label: tx('categories.primeurs'), classes: ["greengrocer"], inc: ["osm.shop.greengrocer"], family: "shop", on: false },
  { key: "traiteur", label: tx('categories.traiteurs'), classes: ["deli"], inc: ["osm.shop.deli"], family: "shop", on: false },
  { key: "marche", label: tx('categories.marches'), classes: ["marketplace"], inc: ["osm.amenity.marketplace"], family: "shop", on: false },
  { key: "librairie", label: tx('categories.librairies'), classes: ["books"], inc: ["osm.shop.books"], color: "#4169D8", icon: "book", on: false },
  { key: "presse", label: tx('categories.tabac_et_presse'), classes: ["tobacco", "newsagent", "kiosk"], inc: ["osm.shop.tobacco", "osm.shop.newsagent", "osm.shop.kiosk"], color: "#4169D8", icon: "book", on: false },
  { key: "vetements", label: tx('categories.vetements'), classes: ["clothes", "bag", "shoes"], inc: ["osm.shop.clothes", "osm.shop.shoes"], family: "shop", on: false },
  { key: "coiffeur", label: tx('categories.coiffeurs'), classes: ["hairdresser"], inc: ["osm.shop.hairdresser"], color: "#A0569F", icon: "scissors", on: false },
  { key: "beaute", label: tx('categories.beaute_et_parfumerie'), classes: ["beauty", "cosmetics", "perfumery"], inc: ["osm.shop.beauty", "osm.shop.cosmetics", "osm.shop.perfumery"], color: "#A0569F", icon: "flower", on: false },
  { key: "opticien", label: tx('categories.opticiens'), classes: ["optician"], inc: ["osm.shop.optician"], family: "shop", on: false },
  { key: "laverie", label: tx('categories.laveries_et_pressings'), classes: ["laundry", "dry_cleaning"], inc: ["osm.shop.laundry", "osm.shop.dry_cleaning"], color: "#5F7D95", icon: "drop", on: false },
  { key: "velo", label: tx('categories.velos'), classes: ["bicycle_rental", "bicycle"], inc: ["osm.amenity.bicycle_rental", "osm.shop.bicycle"], color: "#1E8E3E", icon: "bike", on: false },
  { key: "poste", label: tx('categories.la_poste'), classes: ["post_office"], inc: ["osm.amenity.post_office"], color: "#C7972B", icon: "envelope", on: false },
  { key: "cinema", label: tx('categories.cinemas'), classes: ["cinema"], inc: ["osm.amenity.cinema"], family: "culture", icon: "ticket", on: false },
  { key: "theatre", label: tx('categories.theatres'), classes: ["theatre"], inc: ["osm.amenity.theatre"], family: "culture", icon: "ticket", on: false },
  { key: "bibliotheque", label: tx('categories.bibliotheques'), classes: ["library"], inc: ["osm.amenity.library"], family: "culture", icon: "book", on: false },
  { key: "monument", label: tx('categories.monuments'), classes: ["attraction", "monument", "viewpoint", "castle", "memorial"], inc: ["osm.tourism.attraction", "osm.historic.monument"], family: "sight", on: false },
  { key: "culte", label: tx('categories.lieux_de_culte'), classes: ["place_of_worship"], inc: ["osm.amenity.place_of_worship"], family: "sight", by: "class", on: false },
  { key: "hopital", label: tx('categories.hopitaux'), classes: ["hospital", "clinic"], inc: ["osm.amenity.hospital", "osm.amenity.clinic"], family: "health", on: false },
  { key: "medecin", label: tx('categories.medecins_et_dentistes'), classes: ["doctors", "dentist"], inc: ["osm.amenity.doctors", "osm.amenity.dentist"], family: "health", on: false },
  { key: "veto", label: tx('categories.veterinaires'), classes: ["veterinary"], inc: ["osm.amenity.veterinary"], color: "#8A6B4E", icon: "paw", on: false },
  { key: "animalerie", label: tx('categories.animaleries'), classes: ["pet"], inc: ["osm.shop.pet"], color: "#8A6B4E", icon: "paw", on: false },
  { key: "sport", label: tx('categories.salles_de_sport'), classes: ["sports_centre", "fitness_centre", "yoga", "climbing"], inc: ["osm.leisure.fitness_centre", "osm.leisure.sports_centre"], color: "#E0662F", icon: "dumbbell", on: false },
  { key: "piscine", label: tx('categories.piscines'), classes: ["swimming_pool", "swimming", "water_park"], inc: ["osm.leisure.swimming_pool", "osm.leisure.sports_centre"], q: "piscine", color: "#2C86C9", icon: "drop", on: false },
  { key: "hotel", label: tx('categories.hotels'), classes: ["hotel", "hostel", "guest_house"], inc: ["osm.tourism.hotel", "osm.tourism.hostel"], family: "stay", on: false },
  { key: "toilettes", label: tx('categories.toilettes'), classes: ["toilets"], inc: ["osm.amenity.toilets"], color: "#5F7D95", icon: "drop", on: false, unnamed: tx('categories.toilettes_publiques') },
  { key: "eau", label: tx('categories.points_eau'), classes: ["drinking_water"], inc: ["osm.amenity.drinking_water"], color: "#2C86C9", icon: "drop", on: false, unnamed: tx('categories.point_eau_potable') },
  { key: "recharge", label: tx('categories.bornes_de_recharge'), classes: ["charging_station"], inc: ["osm.amenity.charging_station"], color: "#1E8E3E", icon: "bolt", on: false, unnamed: tx('categories.borne_de_recharge') },
  { key: "parking", label: tx('categories.parkings'), classes: ["parking"], inc: ["osm.amenity.parking"], color: "#3F63B5", icon: "parking", on: false, unnamed: tx('categories.parking') },
  { key: "police", label: tx('categories.police'), classes: ["police"], inc: ["osm.amenity.police"], color: "#2D3E73", icon: "shield", on: false },
  { key: "mairie", label: tx('categories.mairies'), classes: ["townhall"], inc: ["osm.amenity.townhall"], color: "#2D3E73", icon: "columns", on: false },
  { key: "bricolage", label: tx('categories.bricolage'), classes: ["hardware", "doityourself", "paint"], inc: ["osm.shop.hardware", "osm.shop.doityourself"], color: "#7A6A58", icon: "wrench", on: false },
  { key: "telephone", label: tx('categories.telephonie_et_informatique'), classes: ["mobile_phone", "computer", "electronics"], inc: ["osm.shop.mobile_phone", "osm.shop.computer", "osm.shop.electronics"], color: "#4169D8", icon: "phone", on: false },
  { key: "jouets", label: tx('categories.jouets'), classes: ["toys"], inc: ["osm.shop.toys"], color: "#4169D8", icon: "bag", on: false },
  { key: "papeterie", label: tx('categories.papeterie_et_reprographie'), classes: ["stationery", "copyshop"], inc: ["osm.shop.stationery", "osm.shop.copyshop"], color: "#4169D8", icon: "book", on: false },
  { key: "musique", label: tx('categories.musique'), classes: ["musical_instrument", "music"], inc: ["osm.shop.musical_instrument", "osm.shop.music"], color: "#4169D8", icon: "music", on: false },
  { key: "nuit", label: tx('categories.boites_de_nuit'), classes: ["nightclub"], inc: ["osm.amenity.nightclub"], family: "bar", on: false },
  { key: "escape", label: tx('categories.escape_games'), classes: ["escape_game"], inc: ["osm.leisure.escape_game"], color: "#E0662F", icon: "ticket", on: false },
  { key: "coworking", label: tx('categories.coworking'), classes: ["coworking"], inc: ["osm.office.coworking", "osm.amenity.coworking_space"], color: "#5F7D95", icon: "laptop", on: false },
];
// Taper un type de lieu (« pharmacie », « métro le plus proche », « fleuriste ») propose la liste triée par proximité.
export const CATEGORY_WORDS = Object.fromEntries(Object.entries({
  saved: "favoris favori enregistres enregistre mes lieux liste listes",
  resto: "restaurant restaurants resto restos manger dejeuner diner brasserie brasseries",
  cafe: "cafe cafes coffee cafeteria",
  metro: "metro metros station stations rer subway transport transports arret",
  pharmacie: "pharmacie pharmacies pharma medicament medicaments",
  courses: "courses supermarche supermarches epicerie epiceries superette supermarket magasin alimentaire",
  distributeur: "distributeur distributeurs dab atm retirer retrait argent liquide cash billets billet",
  boulangerie: "boulangerie boulangeries boulanger pain patisserie patisseries viennoiseries",
  bar: "bar bars boire verre pub pubs apero",
  musee: "musee musees expo expos exposition expositions galerie galeries",
  banque: "banque banques agence agences bancaire",
  essence: "essence carburant gazole diesel fuel pompe station service stations services",
  fleuriste: "fleur fleurs fleuriste fleuristes bouquet",
  cimetiere: "cimetiere cimetieres tombe",
  parc: "parc parcs jardin jardins square squares espace vert",
  jeux: "aire aires jeux enfants toboggan",
  glacier: "glace glaces glacier glaciers",
  rapide: "fast food rapide kebab burger burgers snack sandwich",
  caviste: "caviste cavistes vin vins cave",
  chocolat: "chocolat chocolats chocolatier chocolatiers confiserie bonbons",
  fromagerie: "fromage fromages fromagerie fromageries",
  boucherie: "boucher boucherie boucheries viande charcuterie",
  primeur: "primeur primeurs fruits legumes",
  traiteur: "traiteur traiteurs",
  marche: "marche marches",
  librairie: "livre livres librairie librairies bd",
  presse: "tabac tabacs presse journal journaux kiosque cigarettes",
  vetements: "vetements vetement habits chaussures mode boutique boutiques",
  coiffeur: "coiffeur coiffeurs coiffure barbier barber",
  beaute: "beaute institut parfum parfumerie cosmetiques manucure",
  opticien: "opticien opticiens lunettes",
  laverie: "laverie laveries pressing linge",
  velo: "velo velos velib bicyclette",
  poste: "poste postes colis courrier lettre",
  cinema: "cinema cinemas film films seance",
  theatre: "theatre theatres spectacle spectacles piece",
  bibliotheque: "bibliotheque bibliotheques mediatheque mediatheques",
  monument: "monument monuments visiter visite touristique",
  culte: "eglise eglises mosquee mosquees synagogue synagogues temple culte messe",
  hopital: "hopital hopitaux urgence urgences clinique",
  medecin: "medecin medecins docteur generaliste dentiste dentistes",
  veto: "veterinaire veterinaires veto",
  animalerie: "animalerie animaleries animaux chien chat",
  sport: "sport salle gym fitness musculation yoga escalade",
  piscine: "piscine piscines nager natation",
  hotel: "hotel hotels auberge dormir chambre",
  toilettes: "toilettes wc sanisette",
  eau: "eau fontaine fontaines potable boire",
  recharge: "recharge borne bornes electrique",
  parking: "parking parkings garer stationnement",
  police: "police commissariat gendarmerie",
  mairie: "mairie mairies",
  bricolage: "bricolage quincaillerie outils",
  telephone: "telephone portable smartphone informatique ordinateur reparation",
  jouets: "jouet jouets",
  papeterie: "papeterie imprimerie photocopie impression",
  musique: "musique instrument instruments disque disques vinyle",
  nuit: "boite boites nuit club clubs danser",
  escape: "escape game games",
  coworking: "coworking travailler",
}).map(([k, v]) => [k, v.split(' ')]));
// Onglets personnalisés : [{ key, label?, hidden? }] dans l'ordre choisi, gardés sur l'appareil.
export const CHIPS_KEY = 'onglets';
export function loadChipPrefs() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(CHIPS_KEY) || '[]'); } catch { /* rien */ }
  const known = saved.filter((p) => ALL_CATEGORIES.some((c) => c.key === p.key));
  // « Mes lieux » arrive en tête chez ceux qui avaient déjà personnalisé leurs raccourcis
  if (saved.length && !known.some((p) => p.key === 'saved')) known.unshift({ key: 'saved' });
  // une catégorie ajoutée après coup apparaît à la fin
  return [...known, ...ALL_CATEGORIES.filter((c) => !known.some((p) => p.key === c.key)).map((c) => (c.on ? { key: c.key } : { key: c.key, hidden: true }))];
}
export const FILLER = new Set(['proche', 'proches', 'pres', 'de', 'd', 'moi', 'ici', 'ouvert', 'ouverte', 'ouverts', 'ouvertes',
  'autour', 'la', 'le', 'les', 'plus', 'un', 'une', 'des', 'du', 'a', 'cote', 'maintenant', 'pas', 'loin', 'nearby', 'near', 'me']);
const norm = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** La catégorie que désigne un texte (« pharmacie », « resto près de moi »), les raccourcis affichés d'abord. */
export function categoryFor(q, chipList = []) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return null;
  for (const c of chipList.length ? [...chipList, ...ALL_CATEGORIES.filter((a) => !chipList.some((x) => x.key === a.key))] : ALL_CATEGORIES) {
    const kws = CATEGORY_WORDS[c.key];
    if (words.some((w) => kws.includes(w)) && words.every((w) => kws.includes(w) || FILLER.has(w))) return c;
  }
  return null;
}

