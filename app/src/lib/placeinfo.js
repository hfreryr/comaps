// Fiche lieu : type précis, horaires attendus ou non, détails pratiques, et « Informations »
// (extrait Wikipédia + photo Wikimedia Commons, source et auteur cités).
//
// Confidentialité : la photo et l'extrait sont demandés à Wikimedia (fondation à but non lucratif,
// sans publicité) au moment où l'on ouvre la fiche d'un lieu qui a une page Wikipédia ou Wikidata.
// Rien d'autre n'est envoyé que le nom de la page demandée.
import { tx } from '#lib/i18n/index.js';
import { APP_AGENT } from './config.js';

// En-tête demandé par Wikimedia pour identifier l'app (politique « User-Agent »). Commons l'accepte en CORS ;
// la page Special:EntityData de Wikidata le refuse (pas dans ses en-têtes autorisés) : elle est appelée sans.
const WM = { headers: { 'Api-User-Agent': APP_AGENT } };


/** Type de lieu en français, le plus précis possible d'après les étiquettes OSM. */
export function kindOf(t) {
  const { amenity, historic, tourism, leisure, building, shop } = t;
  if (amenity === 'fountain') return tx('types.fontaine');
  if (amenity === 'drinking_water') return tx('categories.point_eau_potable');
  if (amenity === 'place_of_worship') {
    if (building === 'cathedral' || t['church:type'] === 'cathedral') return tx('types.cathedrale');
    if (building === 'chapel') return tx('types.chapelle');
    if (building === 'basilica' || /basilique/i.test(t.name || '')) return tx('types.basilique');
    return { christian: tx('types.eglise'), muslim: tx('types.mosquee'), jewish: tx('types.synagogue'), buddhist: tx('types.temple_bouddhiste') }[t.religion] || tx('types.lieu_de_culte');
  }
  if (tourism === 'artwork') {
    return { statue: tx('types.statue'), sculpture: tx('types.sculpture'), mural: tx('types.fresque'), fountain: tx('types.fontaine'), bust: tx('types.buste') }[t.artwork_type] || tx('types.uvre_art');
  }
  if (historic === 'memorial') {
    return { statue: tx('types.statue'), plaque: tx('types.plaque_commemorative'), war_memorial: tx('types.monument_aux_morts'), bust: tx('types.buste'), stele: tx('types.stele') }[t.memorial] || tx('types.memorial');
  }
  const H = { monument: tx('types.monument'), castle: tx('types.chateau'), palace: tx('types.palais'), church: tx('types.eglise'), ruins: tx('types.vestiges'), archaeological_site: tx('types.site_archeologique'),
    city_gate: tx('types.porte_de_ville'), building: tx('types.batiment_historique'), tomb: tx('types.tombe'), wayside_cross: tx('types.croix') };
  if (H[historic]) return H[historic];
  const T = { museum: tx('types.musee'), gallery: tx('types.galerie_art'), viewpoint: tx('types.point_de_vue'), zoo: tx('types.zoo'), theme_park: tx('types.parc_attractions'), aquarium: tx('types.aquarium') };
  if (T[tourism]) return T[tourism];
  const A = { theatre: tx('types.theatre'), cinema: tx('types.cinema'), library: tx('types.bibliotheque'), arts_centre: tx('types.centre_culturel'), hospital: tx('carte.hopital'),
    townhall: tx('types.mairie'), university: tx('types.universite'), marketplace: tx('types.marche'), post_office: tx('types.bureau_de_poste'), concert_hall: tx('types.salle_de_concert') };
  if (A[amenity]) return A[amenity];
  const L = { park: tx('types.parc'), garden: tx('types.jardin'), playground: tx('types.aire_de_jeux'), stadium: tx('types.stade'), swimming_pool: tx('types.piscine'), sports_centre: tx('types.centre_sportif') };
  if (L[leisure]) return L[leisure];
  if (t.place === 'square') return tx('types.place');
  if (t.man_made === 'tower') return tx('types.tour');
  if (t.man_made === 'bridge' || t.bridge === 'yes' && t.name) return tx('types.pont');
  if (building === 'cathedral') return tx('types.cathedrale');
  if (building === 'church') return tx('types.eglise');
  if (tourism === 'attraction') return tx('types.lieu_touristique');
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
  if (t.heritage || t['heritage:operator'] === 'mhs' || t['ref:mhs']) out.push({ icon: 'heritage', text: tx('types.monument_historique') });
  if (t.fee === 'no') out.push({ icon: 'ticket', text: tx('types.acces_gratuit') });
  else if (t.fee === 'yes') out.push({ icon: 'ticket', text: tx('types.acces_payant') });
  const wc = { yes: tx('types.accessible_en_fauteuil_roulant'), limited: tx('types.acces_partiel_en_fauteuil_roulant'), no: tx('types.non_accessible_en_fauteuil_roulant') }[t.wheelchair];
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
  if (yes('takeaway')) add(t.takeaway === 'only' ? tx('types.uniquement_a_emporter') : tx('types.a_emporter'));
  if (t.delivery === 'yes') add('Livraison');
  if (t.reservation === 'required') add('Réservation obligatoire', false);
  else if (t.reservation === 'recommended') add('Réservation conseillée');
  else if (t.reservation === 'yes') add('Réservation possible');
  else if (t.reservation === 'no') add('Sans réservation');
  if (['wlan', 'yes', 'wifi'].includes(t.internet_access)) add(t['internet_access:fee'] === 'no' ? tx('types.wi_fi_gratuit') : 'Wi-Fi');
  if (t.air_conditioning === 'yes') add('Climatisé');
  if (t.toilets === 'yes') add(t['toilets:wheelchair'] === 'yes' ? tx('types.toilettes_accessibles') : tx('categories.toilettes'));
  if (t.changing_table === 'yes') add('Table à langer');
  if (t.dog === 'yes' || t.dog === 'leashed') add(t.dog === 'leashed' ? tx('types.chiens_acceptes_en_laisse') : tx('types.chiens_acceptes'));
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
    // plein écran : 1 200 px suffisent sur téléphone (la version 2 400 px s'affichait « bande par bande », test P3) ;
    // la grande version seulement sur grand écran
    const wide = typeof window !== 'undefined' && window.innerWidth > 800;
    return { src: ii.thumburl, full: (wide && ii.responsiveUrls?.['2']) || ii.thumburl, page: ii.descriptionurl, title: page.title,
      credit: [artist, licence].filter(Boolean).join(' · ') };
  };
  const API = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200';
  if (file) {
    const r = await fetch(`${API}&titles=${encodeURIComponent('File:' + file)}`, { signal, ...WM }).catch(() => null);
    const ph = toPhoto(r?.ok ? Object.values((await r.json()).query?.pages || {})[0] : null);
    if (ph) photos.push(ph);
  }
  if (category) {
    const r = await fetch(`${API}&generator=categorymembers&gcmtype=file&gcmlimit=20&gcmtitle=${encodeURIComponent('Category:' + category)}`, { signal, ...WM }).catch(() => null);
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
