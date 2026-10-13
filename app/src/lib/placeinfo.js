// Fiche lieu : type précis, horaires attendus ou non, détails pratiques, et « Informations »
// (extrait Wikipédia + photo Wikimedia Commons, source et auteur cités).
//
// Confidentialité : la photo et l'extrait sont demandés à Wikimedia (fondation à but non lucratif,
// sans publicité) au moment où l'on ouvre la fiche d'un lieu qui a une page Wikipédia ou Wikidata.
// Rien d'autre n'est envoyé que le nom de la page demandée.


/** Type de lieu en français, le plus précis possible d'après les étiquettes OSM. */
export function kindOf(t) {
  const { amenity, historic, tourism, leisure, building, shop } = t;
  if (amenity === 'fountain') return 'Fontaine';
  if (amenity === 'drinking_water') return "Point d'eau potable";
  if (amenity === 'place_of_worship') {
    if (building === 'cathedral' || t['church:type'] === 'cathedral') return 'Cathédrale';
    if (building === 'chapel') return 'Chapelle';
    if (building === 'basilica' || /basilique/i.test(t.name || '')) return 'Basilique';
    return { christian: 'Église', muslim: 'Mosquée', jewish: 'Synagogue', buddhist: 'Temple bouddhiste' }[t.religion] || 'Lieu de culte';
  }
  if (tourism === 'artwork') {
    return { statue: 'Statue', sculpture: 'Sculpture', mural: 'Fresque', fountain: 'Fontaine', bust: 'Buste' }[t.artwork_type] || "Œuvre d'art";
  }
  if (historic === 'memorial') {
    return { statue: 'Statue', plaque: 'Plaque commémorative', war_memorial: 'Monument aux morts', bust: 'Buste', stele: 'Stèle' }[t.memorial] || 'Mémorial';
  }
  const H = { monument: 'Monument', castle: 'Château', palace: 'Palais', church: 'Église', ruins: 'Vestiges', archaeological_site: 'Site archéologique',
    city_gate: 'Porte de ville', building: 'Bâtiment historique', tomb: 'Tombe', wayside_cross: 'Croix' };
  if (H[historic]) return H[historic];
  const T = { museum: 'Musée', gallery: "Galerie d'art", viewpoint: 'Point de vue', zoo: 'Zoo', theme_park: "Parc d'attractions", aquarium: 'Aquarium' };
  if (T[tourism]) return T[tourism];
  const A = { theatre: 'Théâtre', cinema: 'Cinéma', library: 'Bibliothèque', arts_centre: 'Centre culturel', hospital: 'Hôpital',
    townhall: 'Mairie', university: 'Université', marketplace: 'Marché', post_office: 'Bureau de poste', concert_hall: 'Salle de concert' };
  if (A[amenity]) return A[amenity];
  const L = { park: 'Parc', garden: 'Jardin', playground: 'Aire de jeux', stadium: 'Stade', swimming_pool: 'Piscine', sports_centre: 'Centre sportif' };
  if (L[leisure]) return L[leisure];
  if (t.place === 'square') return 'Place';
  if (t.man_made === 'tower') return 'Tour';
  if (t.man_made === 'bridge' || t.bridge === 'yes' && t.name) return 'Pont';
  if (building === 'cathedral') return 'Cathédrale';
  if (building === 'church') return 'Église';
  if (tourism === 'attraction') return 'Lieu touristique';
  return null;   // on garde le type déjà connu (restaurants, boutiques…)
}

/** Un horaire a-t-il du sens pour ce lieu ? (pas pour une fontaine, une statue, une place…) */
export function expectsHours(t) {
  if (t.shop) return true;
  if (['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'ice_cream', 'pharmacy', 'bank', 'post_office', 'library', 'cinema',
    'theatre', 'marketplace', 'townhall', 'doctors', 'dentist', 'clinic', 'arts_centre', 'concert_hall'].includes(t.amenity)) return true;
  if (['museum', 'gallery', 'zoo', 'theme_park', 'aquarium', 'hotel'].includes(t.tourism)) return true;
  if (['sports_centre', 'swimming_pool', 'fitness_centre'].includes(t.leisure)) return true;
  return false;
}

/** Détails pratiques affichés en bas de fiche. */
export function practical(t) {
  const out = [];
  if (t.heritage || t['heritage:operator'] === 'mhs' || t['ref:mhs']) out.push({ icon: 'heritage', text: 'Monument historique' });
  if (t.fee === 'no') out.push({ icon: 'ticket', text: 'Accès gratuit' });
  else if (t.fee === 'yes') out.push({ icon: 'ticket', text: 'Accès payant' });
  const wc = { yes: 'Accessible en fauteuil roulant', limited: 'Accès partiel en fauteuil roulant', no: 'Non accessible en fauteuil roulant' }[t.wheelchair];
  if (wc) out.push({ icon: 'wheelchair', text: wc });
  return out;
}

/**
 * « Bon à savoir » : ce que les contributeurs d'OpenStreetMap ont noté sur le lieu
 * (paiement, terrasse, régimes, chiens…). Rien n'est déduit : seules les infos présentes s'affichent.
 */
export function goodToKnow(t) {
  const out = [];
  const add = (text, ok = true) => out.push({ text, ok });
  const yes = (k) => ['yes', 'only', 'designated'].includes(t[k]);
  if (t.heritage || t['heritage:operator'] === 'mhs' || t['ref:mhs']) add('Monument historique');
  if (yes('payment:contactless')) add('Paiement sans contact');
  if (yes('payment:credit_cards') || yes('payment:cards') || yes('payment:debit_cards')) add('Cartes bancaires acceptées');
  else if (t['payment:credit_cards'] === 'no' || t['payment:cards'] === 'no') add('Cartes bancaires refusées', false);
  if (t['payment:cash'] === 'no') add('Espèces refusées', false);
  if (t['payment:meal_voucher'] === 'yes' || t['payment:cheque_dejeuner'] === 'yes') add('Titres-restaurant acceptés');
  if (t.outdoor_seating === 'yes') add('Terrasse');
  if (t['diet:vegan'] === 'only') add('100 % végétalien');
  else if (t['diet:vegetarian'] === 'only') add('100 % végétarien');
  else if (yes('diet:vegan')) add('Options végétaliennes');
  else if (yes('diet:vegetarian')) add('Options végétariennes');
  if (yes('diet:gluten_free')) add('Options sans gluten');
  if (yes('takeaway')) add(t.takeaway === 'only' ? 'Uniquement à emporter' : 'À emporter');
  if (t.delivery === 'yes') add('Livraison');
  if (t.reservation === 'required') add('Réservation obligatoire', false);
  else if (t.reservation === 'recommended') add('Réservation conseillée');
  else if (t.reservation === 'yes') add('Réservation possible');
  else if (t.reservation === 'no') add('Sans réservation');
  if (['wlan', 'yes', 'wifi'].includes(t.internet_access)) add(t['internet_access:fee'] === 'no' ? 'Wi-Fi gratuit' : 'Wi-Fi');
  if (t.air_conditioning === 'yes') add('Climatisé');
  if (t.toilets === 'yes') add(t['toilets:wheelchair'] === 'yes' ? 'Toilettes accessibles' : 'Toilettes');
  if (t.changing_table === 'yes') add('Table à langer');
  if (t.dog === 'yes' || t.dog === 'leashed') add(t.dog === 'leashed' ? 'Chiens acceptés en laisse' : 'Chiens acceptés');
  else if (t.dog === 'no') add('Chiens interdits', false);
  if (t.self_service === 'yes') add('Libre-service');
  if (t.second_hand === 'only') add("Seconde main");
  if (t.organic === 'only') add('100 % bio');
  else if (t.organic === 'yes') add('Produits bio');
  return out;
}

const stripTags =(html = '') => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/**
 * Extrait Wikipédia (français) et photo Commons d'un lieu.
 * @returns {Promise<{extract?:string, url?:string, photo?:{src:string, credit:string, page:string}}|null>}
 */
export async function wikiInfo({ wikidata, wikipedia }, signal) {
  let title = null;
  let file = null;
  let category = null;   // catégorie Commons du lieu (P373) : d'autres photos
  const m = /^fr:(.+)$/.exec(wikipedia || '');
  if (m) title = m[1];
  if (wikidata && /^Q\d+$/.test(wikidata)) {
    const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${wikidata}.json`, { signal }).catch(() => null);
    const e = r?.ok ? (await r.json()).entities?.[wikidata] : null;
    title ||= e?.sitelinks?.frwiki?.title || null;
    file = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;   // image choisie par la communauté Wikidata
    category = e?.claims?.P373?.[0]?.mainsnak?.datavalue?.value || null;
  }
  const out = {};
  if (title) {
    const r = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { signal }).catch(() => null);
    const s = r?.ok ? await r.json() : null;
    if (s?.extract && s.type !== 'disambiguation') {
      out.extract = s.extract;
      out.url = s.content_urls?.mobile?.page || s.content_urls?.desktop?.page;
      if (!file && s.originalimage?.source?.includes('/commons/')) file = decodeURIComponent(s.originalimage.source.split('/').pop());
    }
  }
  // Photos : l'image principale (Wikidata) d'abord, puis jusqu'à 11 autres de la catégorie Commons du lieu.
  const photos = [];
  const toPhoto = (page) => {
    const ii = page?.imageinfo?.[0];
    if (!ii?.thumburl || !/\.(jpe?g|png|webp)$/i.test(page.title)) return null;
    const meta = ii.extmetadata || {};
    const artist = stripTags(meta.Artist?.value).slice(0, 60);
    const licence = stripTags(meta.LicenseShortName?.value);
    return { src: ii.thumburl, full: ii.responsiveUrls?.['2'] || ii.thumburl, page: ii.descriptionurl, title: page.title,
      credit: [artist, licence].filter(Boolean).join(' · ') };
  };
  const API = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200';
  if (file) {
    const r = await fetch(`${API}&titles=${encodeURIComponent('File:' + file)}`, { signal }).catch(() => null);
    const ph = toPhoto(r?.ok ? Object.values((await r.json()).query?.pages || {})[0] : null);
    if (ph) photos.push(ph);
  }
  if (category) {
    const r = await fetch(`${API}&generator=categorymembers&gcmtype=file&gcmlimit=20&gcmtitle=${encodeURIComponent('Category:' + category)}`, { signal }).catch(() => null);
    const pages = r?.ok ? Object.values((await r.json()).query?.pages || {}) : [];
    for (const pg of pages) {
      if (photos.length >= 12) break;
      const ph = toPhoto(pg);
      if (ph && !photos.some((x) => x.title === ph.title)) photos.push(ph);
    }
  }
  if (photos.length) { out.photos = photos; out.photo = photos[0]; }
  return out.extract || out.photo ? out : null;
}
