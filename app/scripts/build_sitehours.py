#!/usr/bin/env python3
"""
Horaires lus sur le site web des lieux qui n'en ont pas dans OSM (restaurants, cafés, bars, boulangeries…).

On ne lit que les données structurées que le site publie lui-même pour les moteurs de recherche (schema.org :
`openingHours` ou `openingHoursSpecification`), pas le texte de la page : c'est précis, et sans interprétation.
Mesure du 15/10/2026 (docs/sources-donnees.md) : ≈ 21 % des sites joignables en publient.

Politesse : une seule page par site (la page indiquée), robots.txt respecté, identifiant explicite, délai court.
Prudence : le nom publié par le site doit ressembler au nom du lieu (sinon ce sont peut-être les horaires du
siège d'une chaîne ou d'un autre établissement) ; les horaires doivent être au format OSM valide.

Entrée : l'extrait OSM et extras.json (build_extras.py, pour les sites trouvés ailleurs qu'OSM).
Sortie : extras.json complété en place : "opening_hours": [horaires, "site"] (relu chaque semaine).
Usage :  python app/scripts/build_sitehours.py paris.osm.pbf --extras out/extras.json [--limit 200]
"""
import argparse, concurrent.futures as cf, json, re, ssl, sys, time, urllib.request, urllib.robotparser
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent))
from build_places import Places
from build_extras import NOT_A_SITE, tokens, valid_hours, GENERIC

UA = "UntrackedMapsBot/0.1 (+https://untrackedmaps.app/confidentialite ; lecture hebdomadaire des horaires publiés)"
FOOD = ("restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "biergarten")
SHOPS = ("bakery", "pastry", "confectionery", "chocolate", "deli", "butcher", "cheese", "wine", "florist", "books", "hairdresser", "beauty")
LDJSON = re.compile(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", re.S | re.I)
DAYS_EN = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
OSM_DAYS = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")
HM = re.compile(r"^(\d{1,2}):(\d{2})")


def wanted(tags):
    """Lieux dont on cherche les horaires sur leur site : restauration et commerces de bouche ou de quartier."""
    return "opening_hours" not in tags and (tags.get("amenity") in FOOD or tags.get("shop") in SHOPS)


def week_to_osm(week):
    """[[« 09:00-18:00 », …] × 7 jours] → « Mo-Fr 09:00-18:00; Sa 10:00-17:00 » (jours sans plage : fermés)."""
    groups = []
    for d, spans in enumerate(week):
        v = ",".join(spans)
        if groups and groups[-1][2] == v and groups[-1][1] == d - 1:
            groups[-1][1] = d
        else:
            groups.append([d, d, v])
    out = []
    for a, b, v in groups:
        if not v:
            continue
        days = OSM_DAYS[a] if a == b else (f"{OSM_DAYS[a]},{OSM_DAYS[b]}" if b == a + 1 else f"{OSM_DAYS[a]}-{OSM_DAYS[b]}")
        out.append(f"{days} {v}")
    return "; ".join(out) or None


def hm(t):
    m = HM.match(str(t or "").strip())
    return f"{int(m[1]):02d}:{m[2]}" if m else None


def from_spec(specs):
    """openingHoursSpecification → horaires OSM (None si incomplet ou daté : horaires exceptionnels)."""
    week = [[] for _ in range(7)]
    for s in specs if isinstance(specs, list) else [specs]:
        if not isinstance(s, dict) or s.get("validFrom") or s.get("validThrough"):
            continue  # horaires exceptionnels (jour férié, vacances) : pas la semaine habituelle
        days = s.get("dayOfWeek")
        days = days if isinstance(days, list) else [days]
        o, c = hm(s.get("opens")), hm(s.get("closes"))
        if not (o and c) or o == c:
            continue
        for d in days:
            k = DAYS_EN.get(str(d or "").rstrip("/").split("/")[-1].lower())
            if k is None:
                return None
            span = f"{o}-{'24:00' if c == '00:00' else c}"
            if span not in week[k]:
                week[k].append(span)
    for spans in week:
        spans.sort()
    return week_to_osm(week) if any(week) else None


def from_text(oh):
    """openingHours schema.org (« Mo-Fr 09:00-18:00 », chaîne ou liste) → horaires OSM."""
    parts = oh if isinstance(oh, list) else [oh]
    rules = [re.sub(r"\s+", " ", str(p)).strip() for p in parts if p]
    return "; ".join(rules) or None


def businesses(node):
    """Objets schema.org d'une page (y compris dans @graph et les listes)."""
    if isinstance(node, list):
        for n in node:
            yield from businesses(n)
    elif isinstance(node, dict):
        if "@graph" in node:
            yield from businesses(node["@graph"])
        if "openingHours" in node or "openingHoursSpecification" in node:
            yield node


def similar(osm_name, site_name):
    """Le nom publié par le site partage un mot distinctif avec le nom du lieu (évite les horaires d'un autre)."""
    a, b = tokens(osm_name) - GENERIC, tokens(site_name or "") - GENERIC
    return bool(a & b)


def hours_in(html, name):
    """Horaires du lieu trouvés dans les données structurées d'une page, ou None."""
    for block in LDJSON.findall(html):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        for b in businesses(data):
            if not similar(name, b.get("name")):
                continue
            oh = from_spec(b["openingHoursSpecification"]) if b.get("openingHoursSpecification") else from_text(b.get("openingHours"))
            if oh and valid_hours(oh):
                return oh
    return None


_robots = {}


def allowed(url):
    host = urlparse(url)
    root = f"{host.scheme}://{host.netloc}"
    if root not in _robots:
        rp = urllib.robotparser.RobotFileParser()
        try:
            req = urllib.request.Request(root + "/robots.txt", headers={"User-Agent": UA})
            rp.parse(urllib.request.urlopen(req, timeout=8).read().decode("utf-8", "ignore").splitlines())
        except Exception:
            rp.parse([])  # pas de robots.txt lisible : rien d'interdit
        _robots[root] = rp
    return _robots[root].can_fetch(UA, url)


def fetch(url):
    if not url.startswith("http"):
        url = "http://" + url
    if NOT_A_SITE.search(url) or not allowed(url):
        return None
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "fr"})
    with urllib.request.urlopen(req, timeout=12, context=ssl.create_default_context()) as r:
        if "html" not in (r.headers.get("Content-Type") or ""):
            return None
        return r.read(1_500_000).decode("utf-8", "ignore")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pbf")
    ap.add_argument("--extras", required=True, help="extras.json, complété en place")
    ap.add_argument("--limit", type=int, default=0, help="nombre de sites à lire (essai)")
    args = ap.parse_args()
    t0 = time.time()
    data = json.loads(Path(args.extras).read_text())
    extras = data.setdefault("places", {})

    h = Places(14)
    h.apply_file(args.pbf, locations=True)
    todo = []
    for oid, lon, lat, tags in (it for tile in h.tiles.values() for it in tile):
        ex = extras.get(str(oid), {})
        if not wanted(tags) or "opening_hours" in ex:
            continue
        site = tags.get("website") or tags.get("contact:website") or (ex.get("website") or [None])[0]
        if site and tags.get("name"):
            todo.append((str(oid), tags["name"], site))
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(todo)} sites à lire", file=sys.stderr)

    stats = Counter()
    today = time.strftime("%Y-%m-%d")

    def one(job):
        oid, name, site = job
        try:
            html = fetch(site)
        except Exception:
            return oid, "injoignable", None
        if html is None:
            return oid, "refusé ou pas une page", None
        oh = hours_in(html, name)
        return oid, "horaires" if oh else "sans horaires", oh

    with cf.ThreadPoolExecutor(16) as ex:
        for oid, status, oh in ex.map(one, todo):
            stats[status] += 1
            if oh:
                extras.setdefault(oid, {})["opening_hours"] = [oh, "site"]
    Path(args.extras).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print("sites : " + ", ".join(f"{k} {v}" for k, v in stats.most_common()) + f", en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
