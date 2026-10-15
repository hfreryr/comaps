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
  - overture : site web et téléphone (Overture Maps Foundation, CDLA-Permissive 2.0), lus par HTTPS sans identifiants ;
  - paris : horaires des parcs, squares, piscines, bibliothèques, musées et mairies (Ville de Paris, ODbL), seulement
    pour la période en vigueur (horaires d'été, d'hiver…).

Sortie : extras.json = {"places": {"<id codé comme dans les tuiles>": {"website": [valeur, source],
                                     "opening_hours": [valeur, source, fin de validité AAAA-MM-JJ], …}, …}}
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


def match_rows(items, rows, radius, keep):
    """Associe chaque ligne (nom, lat, lon, …) au lieu OSM le plus proche portant le même nom, à `radius` m au plus,
    parmi les lieux retenus par `keep`. Renvoie {index du lieu OSM : [(distance, ligne), …]}."""
    grid = defaultdict(list)
    for i, (oid, lon, lat, tags) in enumerate(items):
        if tags.get("name") and keep(tags):
            grid[(int(lat * 1000), int(lon * 1000))].append(i)
    reach = max(1, math.ceil(radius / 70))  # une case de la grille ≈ 74 m de large, 111 m de haut
    found = {}
    for row in rows:
        name, lat, lon = row[0], row[1], row[2]
        best = None
        gi, gj = int(lat * 1000), int(lon * 1000)
        for a in range(-reach, reach + 1):
            for b in range(-reach, reach + 1):
                for i in grid.get((gi + a, gj + b), ()):
                    oid, olon, olat, tags = items[i]
                    d = meters(lat, lon, olat, olon)
                    if d <= radius and same_name(name, tags["name"]) and (best is None or d < best[0]):
                        best = (d, i)
        if best:
            found.setdefault(best[1], []).append((best[0], row))
    return found


def match_overture(items, rows):
    """Lieux Overture (nom, lat, lon, sites, téléphones, confiance) : même nom à 40 m au plus."""
    found = match_rows(items, rows, 40, completable)
    return {i: [(d, r[3] or [], r[4] or []) for d, r in c] for i, c in found.items()}


# ——— Ville de Paris : horaires des parcs, squares, piscines, bibliothèques, musées, mairies (ODbL) ———
PARIS_API = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/{}/exports/json"
PARIS_SETS = ("ilots-de-fraicheur-espaces-verts-frais", "ilots-de-fraicheur-equipements-activites")
PARIS_TYPES = {"Promenades ouvertes", "Bois", "Jardinets décoratifs", "Jardins grandes institutions", "Piscine", "Bibliothèque",
               "Musée", "Mairie d'arrondissement", "Bains-douches", "Baignade extérieure"}
DAYS = (("lundi", "Mo"), ("mardi", "Tu"), ("mercredi", "We"), ("jeudi", "Th"), ("vendredi", "Fr"), ("samedi", "Sa"), ("dimanche", "Su"))
SPAN = re.compile(r"(\d{1,2})\s*[h:H]\s*(\d{2})?\s*[-–]\s*(\d{1,2})\s*[h:H]\s*(\d{2})?")


def paris_keep(tags):
    """Lieux OSM que la Ville décrit : parcs et jardins, piscines, bibliothèques, musées, mairies, bains-douches."""
    return tags.get("leisure") in ("park", "garden", "sports_centre", "swimming_pool", "nature_reserve") or tags.get("amenity") in (
        "library", "townhall", "public_bath", "shower") or tags.get("tourism") == "museum"


def day_hours(text):
    """« 07h00 - 08h30 / 11h30 - 13h30 » → « 07:00-08:30,11:30-13:30 » ; « - » ou « Fermé » → « off » ; illisible → None."""
    t = (text or "").strip()
    if t in ("-", "–") or t.lower().startswith("ferm"):
        return "off"
    parts = [p.strip() for p in t.split("/")]
    spans = []
    for p in parts:
        m = SPAN.fullmatch(p)
        if not m:
            return None
        h1, m1, h2, m2 = int(m[1]), int(m[2] or 0), int(m[3]), int(m[4] or 0)
        if h1 > 24 or h2 > 24:
            return None
        spans.append(f"{h1:02d}:{m1:02d}-{h2:02d}:{m2:02d}")
    return ",".join(spans) or None


def paris_opening_hours(rec):
    """Horaires de la semaine au format OSM (« Mo-Fr 08:00-21:30; Sa,Su 09:00-21:30 »), ou None si incomplets."""
    if rec.get("ouvert_24h") == "Oui":
        return "24/7"
    week = []
    for fr, osm in DAYS:
        v = day_hours(rec.get(f"horaires_{fr}"))
        if v is None:
            return None
        week.append((osm, v))
    if all(v == "off" for _, v in week):
        return None
    groups = []  # jours consécutifs aux mêmes horaires
    for osm, v in week:
        if groups and groups[-1][2] == v:
            groups[-1][1] = osm
        else:
            groups.append([osm, osm, v])
    out = []
    for a, b, v in groups:
        if v == "off":
            continue
        days = a if a == b else (f"{a},{b}" if [d for _, d in DAYS].index(b) - [d for _, d in DAYS].index(a) == 1 else f"{a}-{b}")
        out.append(f"{days} {v}")
    return "; ".join(out)


def paris_period(text, today):
    """Période de validité « du 01/10/26 au 24/10/26 » → date de fin (AAAA-MM-JJ) si elle couvre aujourd'hui ;
    None si la période est passée ou à venir ; "" s'il n'y a pas de période."""
    m = re.search(r"du (\d\d)/(\d\d)/(\d\d) au (\d\d)/(\d\d)/(\d\d)", text or "")
    if not m:
        return ""
    start = f"20{m[3]}-{m[2]}-{m[1]}"
    end = f"20{m[6]}-{m[5]}-{m[4]}"
    return end if start <= today <= end else None


def paris_rows(records, today):
    """Lignes (nom, lat, lon, horaires, fin de validité) des lieux de la Ville aux horaires lisibles et en vigueur."""
    rows = []
    for r in records:
        if r.get("type") not in PARIS_TYPES or not r.get("geo_point_2d") or not r.get("nom"):
            continue
        until = paris_period(r.get("horaires_periode"), today)
        hours = paris_opening_hours(r)
        if until is None or not hours:
            continue
        g = r["geo_point_2d"]
        rows.append((r["nom"], g["lat"], g["lon"], hours, until))
    return rows


def paris_records():
    out = []
    for name in PARIS_SETS:
        out += json.load(urllib.request.urlopen(PARIS_API.format(name), timeout=120))
    return out


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

    today = time.strftime("%Y-%m-%d")
    try:
        prows = paris_rows(paris_records(), today)
    except Exception as e:  # une source en panne ne bloque pas les autres
        print("Ville de Paris ignorée :", e, file=sys.stderr)
        prows = []
    for i, cands in match_rows(items, prows, 150, paris_keep).items():
        oid, lon, lat, tags = items[i]
        if "opening_hours" in tags:
            continue
        _, (name, _, _, hours, until) = min(cands, key=lambda c: c[0])
        extras[str(oid)]["opening_hours"] = [hours, "paris", until] if until else [hours, "paris"]
        stats["horaires"] += 1

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps({"v": 1, "built": today, "overture": release, "places": extras},
                                         ensure_ascii=False, separators=(",", ":")))
    print(f"compléments : {stats['site']} sites, {stats['tel']} téléphones, {stats['horaires']} horaires, "
          f"pour {len(extras)} lieux, en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
