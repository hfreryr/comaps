#!/usr/bin/env python3
"""
Compléments aux lieux OSM, tirés de sources ouvertes, pour les fiches qui n'ont pas l'information dans OSM.

Décision du porteur du projet (15/10/2026) : le prototype doit être aussi complet que possible sans contribution
des utilisateurs. Mesures et licences : docs/sources-donnees.md.

Règles :
  - un complément ne remplace jamais une valeur d'OSM, il ne fait que combler un manque ;
  - chaque complément garde sa source, affichée dans la fiche (étiquette `_src` de la tuile) ;
  - rien de ce fichier n'est envoyé dans OSM.

Sources branchées :
  - overture : site web et téléphone (Overture Maps Foundation, CDLA-Permissive 2.0), lus par HTTPS sans identifiants.

Sortie : extras.json = {"<id codé comme dans les tuiles>": {"website": [valeur, source], "phone": [valeur, source]}, …}
Usage :  python app/scripts/build_extras.py paris.osm.pbf --out extras.json [--overture-release 2026-09-23.1]
"""
import argparse, json, math, re, sys, time, unicodedata, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_places import Places  # mêmes lieux et mêmes identifiants que les tuiles

OVERTURE = "https://overturemaps-us-west-2.s3.amazonaws.com"
# Plateformes et sites génériques : pas le site du lieu (et rien de Google)
NOT_A_SITE = re.compile(r"google\.|goo\.gl|tripadvisor|thefork|lafourchette|ubereats|deliveroo|just-?eat|pagesjaunes|yelp\.|"
                        r"privateaser|4sq\.com|foursquare|eater\.space|menuonline|wiicmenu|cityvox|yespark|zenpark|"
                        r"ratp\.fr|paris\.fr|booking\.com|airbnb|groupon", re.I)
# Mots trop courants pour identifier un lieu à eux seuls (« Centre culturel », « Grands Boulevards »)
GENERIC = {"centre", "culturel", "grand", "grands", "boulevard", "boulevards", "eglise", "saint", "sainte", "place", "rue", "avenue",
           "gare", "metro", "station", "parking", "hotel", "jardin", "square", "pharmacie", "boulangerie", "tabac", "pressing",
           "laverie", "coiffure", "coiffeur", "epicerie", "superette", "cave", "librairie", "maison", "atelier", "galerie", "france"}
# Lieux qu'on complète : commerces, services, restauration, hôtels, musées (pas les gares, églises, parkings, monuments)
SKIP_AMENITY = {"place_of_worship", "parking", "parking_entrance", "bicycle_parking", "bicycle_rental", "atm", "toilets",
                "drinking_water", "charging_station", "fountain", "bench", "waste_basket", "recycling", "post_box", "taxi", "grave_yard"}
STOP = {"le", "la", "les", "de", "du", "des", "paris", "the", "et", "l", "d", "chez", "au", "aux", "a", "en", "sur", "restaurant", "cafe", "bar"}


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def tokens(s):
    return {t for t in norm(s).split() if t not in STOP and len(t) > 1}


def same_name(a, b):
    """Même lieu par le nom : identiques une fois normalisés, ou au moins 2 mots en commun couvrant 60 % du plus court,
    dont un mot distinctif (pas « centre », « saint », « hôtel »…)."""
    if norm(a) and norm(a) == norm(b):
        return True
    ta, tb = tokens(a), tokens(b)
    common = ta & tb
    return len(common) >= 2 and len(common) >= 0.6 * min(len(ta), len(tb)) and bool(common - GENERIC)


def completable(tags):
    """Lieux qu'on complète : commerces et services, pas les gares, lieux de culte, parkings ni monuments."""
    if any(k in tags for k in ("railway", "public_transport", "place", "historic", "man_made")):
        return False
    if tags.get("amenity") in SKIP_AMENITY:
        return False
    return any(k in tags for k in ("shop", "amenity", "craft", "office", "healthcare")) or tags.get("tourism") in (
        "hotel", "hostel", "guest_house", "apartment", "museum", "gallery")


def site_of(name, url):
    """Le site porte le nom du lieu (« Loca Images » → loca-images.com) : écarte les sites d'un voisin ou d'un annuaire."""
    host = re.sub(r"^https?://(www\.)?", "", url.lower()).split("/")[0]
    flat = re.sub(r"[^a-z0-9]", "", host)
    words = [t for t in tokens(name) if len(t) >= 3]
    joined = re.sub(r"[^a-z0-9]", "", norm(name))
    return bool(words) and (any(w in flat for w in words) or (len(joined) >= 5 and joined in flat))


def meters(lat1, lon1, lat2, lon2):
    return math.hypot((lat1 - lat2) * 111320, (lon1 - lon2) * 111320 * math.cos(math.radians(lat1)))


def phone_fr(p):
    """Numéro au format affiché en France (+33 1 23 45 67 89), ou None s'il n'est pas reconnu."""
    d = re.sub(r"[^\d+]", "", p or "")
    if d.startswith("0033"):
        d = "+33" + d[4:]
    if d.startswith("0") and len(d) == 10:
        d = "+33" + d[1:]
    if not re.fullmatch(r"\+33[1-9]\d{8}", d):
        return None
    return f"+33 {d[3]} {d[4:6]} {d[6:8]} {d[8:10]} {d[10:12]}"


def latest_release():
    xml = urllib.request.urlopen(f"{OVERTURE}/?list-type=2&prefix=release/&delimiter=/", timeout=60).read().decode()
    return sorted(re.findall(r"release/([0-9.-]+)/", xml))[-1]


def overture_places(release, bbox):
    import duckdb
    xml = urllib.request.urlopen(f"{OVERTURE}/?list-type=2&prefix=release/{release}/theme=places/type=place/", timeout=60).read().decode()
    files = re.findall(r"<Key>([^<]+\.parquet)</Key>", xml)
    if not files:
        raise SystemExit(f"Overture {release} : aucun fichier de lieux trouvé")
    urls = ",".join(f"'{OVERTURE}/{f}'" for f in files)
    c = duckdb.connect()
    c.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    w, s, e, n = bbox
    return c.sql(f"""
        SELECT names.primary AS name, ST_Y(geometry) AS lat, ST_X(geometry) AS lon, websites, phones, confidence
        FROM read_parquet([{urls}])
        WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}
          AND confidence >= 0.6 AND names.primary IS NOT NULL AND (websites IS NOT NULL OR phones IS NOT NULL)
    """).fetchall()


def match_overture(items, rows):
    """Associe chaque lieu Overture au lieu OSM le plus proche portant le même nom (40 m au plus)."""
    grid = defaultdict(list)
    for i, (oid, lon, lat, tags) in enumerate(items):
        if tags.get("name") and completable(tags):
            grid[(int(lat * 1000), int(lon * 1000))].append(i)
    found = {}
    for name, lat, lon, websites, phones, conf in rows:
        best = None
        gi, gj = int(lat * 1000), int(lon * 1000)
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for i in grid.get((gi + a, gj + b), ()):
                    oid, olon, olat, tags = items[i]
                    d = meters(lat, lon, olat, olon)
                    if d <= 40 and same_name(name, tags["name"]) and (best is None or d < best[0]):
                        best = (d, i)
        if best:
            found.setdefault(best[1], []).append((best[0], websites or [], phones or []))
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pbf")
    ap.add_argument("--out", default="extras.json")
    ap.add_argument("--overture-release", help="version d'Overture (par défaut : la plus récente)")
    args = ap.parse_args()
    t0 = time.time()

    h = Places(14)
    h.apply_file(args.pbf, locations=True)
    items = [it for tile in h.tiles.values() for it in tile]
    lons = [it[1] for it in items]
    lats = [it[2] for it in items]
    bbox = (min(lons), min(lats), max(lons), max(lats))
    print(f"{len(items)} lieux OSM", file=sys.stderr)

    extras = defaultdict(dict)
    stats = Counter()
    release = args.overture_release or latest_release()
    rows = overture_places(release, bbox)
    print(f"Overture {release} : {len(rows)} lieux dans la zone", file=sys.stderr)
    found = match_overture(items, rows)
    # un même site attribué à plusieurs lieux sans rapport : site d'un réseau ou d'un centre commercial, on l'écarte
    site_use = Counter(w for cands in found.values() for _, ws, _ in cands for w in ws[:1])
    for i, cands in found.items():
        oid, lon, lat, tags = items[i]
        cands.sort(key=lambda c: c[0])
        _, websites, phones = cands[0]
        has_site = tags.get("website") or tags.get("contact:website")
        has_phone = tags.get("phone") or tags.get("contact:phone")
        site = next((w for w in websites if not NOT_A_SITE.search(w) and site_use[w] <= 3 and site_of(tags["name"], w)), None)
        if site and not has_site:
            extras[str(oid)]["website"] = [site, "overture"]
            stats["site"] += 1
        tel = next((p for p in map(phone_fr, phones) if p), None)
        if tel and not has_phone:
            extras[str(oid)]["phone"] = [tel, "overture"]
            stats["tel"] += 1

    Path(args.out).write_text(json.dumps({"v": 1, "built": time.strftime("%Y-%m-%d"), "overture": release, "places": extras},
                                         ensure_ascii=False, separators=(",", ":")))
    print(f"compléments : {stats['site']} sites, {stats['tel']} téléphones, pour {len(extras)} lieux, en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
