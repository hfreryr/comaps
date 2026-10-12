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

const stripTags = (html = '') => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/**
 * Extrait Wikipédia (français) et photo Commons d'un lieu.
 * @returns {Promise<{extract?:string, url?:string, photo?:{src:string, credit:string, page:string}}|null>}
 */
export async function wikiInfo({ wikidata, wikipedia }, signal) {
  let title = null;
  let file = null;
  const m = /^fr:(.+)$/.exec(wikipedia || '');
  if (m) title = m[1];
  if (wikidata && /^Q\d+$/.test(wikidata)) {
    const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${wikidata}.json`, { signal }).catch(() => null);
    const e = r?.ok ? (await r.json()).entities?.[wikidata] : null;
    title ||= e?.sitelinks?.frwiki?.title || null;
    file = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;   // image choisie par la communauté Wikidata
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
  if (file) {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&titles=${encodeURIComponent('File:' + file)}`;
    const r = await fetch(api, { signal }).catch(() => null);
    const page = r?.ok ? Object.values((await r.json()).query?.pages || {})[0] : null;
    const ii = page?.imageinfo?.[0];
    if (ii?.thumburl) {
      const meta = ii.extmetadata || {};
      const artist = stripTags(meta.Artist?.value).slice(0, 60);
      const licence = stripTags(meta.LicenseShortName?.value);
      out.photo = { src: ii.thumburl, page: ii.descriptionurl, credit: [artist, licence].filter(Boolean).join(' · ') };
    }
  }
  return out.extract || out.photo ? out : null;
}
