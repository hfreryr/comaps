"""Construit, depuis l'extrait OpenStreetMap de Paris, deux couches légères servies avec l'app :

  static/data/landmarks.geojson      lieux remarquables (monuments, musées, parcs, gares, hôpitaux)
                                     classés par notoriété ;
  static/data/transit-lines.geojson  lignes de métro, RER et tram, à leurs couleurs officielles.

La notoriété est estimée par le nombre de traductions du nom (name:xx) dans OSM :
le Louvre en a plus de cent, un square de quartier aucune.

Usage :  python app/scripts/build_overlays.py data/paris.osm.pbf
Données © contributeurs OpenStreetMap, licence ODbL.
"""
import json
import sys
from pathlib import Path

import osmium
from shapely import wkb
from shapely.geometry import LineString, MultiLineString, mapping
from shapely.ops import linemerge

OUT = Path(__file__).resolve().parent.parent / "static" / "data"

# Catégories retenues → (famille d'icône de l'app, poids)
def classify(t):
    tourism, historic, amenity, leisure = t.get("tourism"), t.get("historic"), t.get("amenity"), t.get("leisure")
    if t.get("railway") == "station" and t.get("train") == "yes" and t.get("station") != "subway":
        return "train", 3
    if tourism in ("museum", "gallery"):
        return "culture", 2
    if tourism in ("attraction", "viewpoint") or historic in ("monument", "castle", "memorial", "palace", "building"):
        return "sight", 2
    if amenity == "place_of_worship":
        return "sight", 1
    if amenity in ("theatre", "cinema", "arts_centre", "library"):
        return "culture", 1
    if leisure in ("park", "garden") or t.get("landuse") == "recreation_ground":
        return "nature", 1
    if amenity == "hospital":
        return "health", 1
    if t.get("shop") in ("department_store", "mall"):
        return "shop", 1
    if t.get("place") == "square":
        return "nature", 1
    return None


def fame(t):
    return sum(1 for tag in t if tag.k.startswith("name:") and len(tag.k) <= 10)


class Landmarks(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.items = {}
        self.fab = osmium.geom.WKBFactory()

    def _add(self, ref, tags, geom_fn):
        if "name" not in tags:
            return
        c = classify(tags)
        if not c:
            return
        family, weight = c
        f = fame(tags)
        if family != "train" and f < 3 and "wikidata" not in tags:
            return
        try:
            pt, area = geom_fn()
        except Exception:
            return
        # Notoriété : traductions, présence Wikidata, catégorie, taille (parcs)
        score = f + (8 if "wikidata" in tags else 0) + weight * 4 + min(area * 1e7, 25)
        name = tags.get("name:fr") or tags["name"]
        prev = self.items.get(name)
        if prev and prev["score"] >= score:
            return
        self.items[name] = {"name": name, "family": family, "score": round(score, 1), "osm": ref,
                            "lon": round(pt.x, 6), "lat": round(pt.y, 6)}

    def node(self, n):
        if n.location.valid():
            from shapely.geometry import Point
            self._add(f"node/{n.id}", n.tags, lambda: (Point(n.location.lon, n.location.lat), 0))

    def area(self, a):
        def g():
            geom = wkb.loads(self.fab.create_multipolygon(a), hex=True)
            return geom.representative_point(), geom.area
        self._add(f"{'way' if a.from_way() else 'relation'}/{a.orig_id()}", a.tags, g)


# ——— Lignes de transport ———
def line_mode(t):
    r = t.get("route")
    ref = (t.get("ref") or "").strip()
    net = (t.get("network") or "") + " " + (t.get("name") or "")
    if r == "subway":
        return "metro"
    if r == "tram":
        return "tram"
    if r == "train" and ("RER" in net or ref in ("A", "B", "C", "D", "E")) and len(ref) == 1:
        return "rer"
    if r == "light_rail" and "RER" in net:
        return "rer"
    return None


class Routes(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.lines = {}   # (mode, ref) -> {colour, name, ways:set}

    def relation(self, r):
        t = r.tags
        if t.get("type") != "route":
            return
        mode = line_mode(t)
        ref = (t.get("ref") or "").strip()
        if not mode or not ref:
            return
        key = (mode, ref)
        entry = self.lines.setdefault(key, {"colour": None, "ways": set(), "relations": []})
        entry["colour"] = entry["colour"] or t.get("colour")
        ways = [m.ref for m in r.members if m.type == "w" and m.role in ("", "forward", "backward")]
        entry["relations"].append(ways)
        entry["ways"].update(ways)


class Ways(osmium.SimpleHandler):
    def __init__(self, wanted):
        super().__init__()
        self.wanted = wanted
        self.geoms = {}

    def way(self, w):
        if w.id in self.wanted:
            try:
                self.geoms[w.id] = [(n.lon, n.lat) for n in w.nodes]
            except osmium.InvalidLocationError:
                pass


def chaikin(coords, iterations=3):
    """Arrondit une ligne brisée (découpe des angles de Chaikin), extrémités conservées."""
    for _ in range(iterations):
        if len(coords) < 3:
            return coords
        out = [coords[0]]
        for (x0, y0), (x1, y1) in zip(coords, coords[1:]):
            out.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
            out.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
        out.append(coords[-1])
        coords = out
    return coords


def line_geometry(relations, geoms):
    """Une seule voie par tronçon : chaque sens de circulation (relation) n'ajoute que ce qui
    n'est pas déjà dessiné à moins de ~25 m. Puis simplification et arrondi des courbes."""
    drawn = None
    parts = []
    rels = []
    for ways in relations:
        segs = [LineString(geoms[w]) for w in ways if w in geoms and len(geoms[w]) > 1]
        if segs:
            rels.append(linemerge(MultiLineString(segs)))
    for g in sorted(rels, key=lambda g: -g.length):
        new = g if drawn is None else g.difference(drawn.buffer(0.00032))
        if new.is_empty or new.length < 0.0008:
            continue
        parts.append(new)
        drawn = new.buffer(0.00001) if drawn is None else drawn.union(new.buffer(0.00001))
    if not parts:
        return None
    lines = []
    for p in parts:
        for l in getattr(p, "geoms", [p]):
            if l.geom_type == "LineString":
                lines.append(l)
    merged = linemerge(MultiLineString(lines)).simplify(0.00006, preserve_topology=False)
    smooth = [LineString(chaikin(list(l.coords))) for l in getattr(merged, "geoms", [merged]) if l.length > 0.0004]
    return MultiLineString(smooth) if len(smooth) > 1 else (smooth[0] if smooth else None)


DEFAULT_COLOURS = {"metro": "#5B6573", "rer": "#5B6573", "tram": "#5B6573"}


def main(pbf):
    OUT.mkdir(parents=True, exist_ok=True)

    lm = Landmarks()
    lm.apply_file(str(pbf), locations=True)
    items = sorted(lm.items.values(), key=lambda x: -x["score"])[:1500]  # les 1500 plus connus
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [i["lon"], i["lat"]]},
              "properties": {"name": i["name"], "family": i["family"], "rank": k + 1, "osm": i["osm"]}}
             for k, i in enumerate(items)]
    (OUT / "landmarks.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats},
                                                      ensure_ascii=False, separators=(",", ":")))
    print(f"{len(feats)} lieux remarquables ; en tête : {[i['name'] for i in items[:12]]}")

    rt = Routes()
    rt.apply_file(str(pbf))
    wanted = set().union(*(e["ways"] for e in rt.lines.values())) if rt.lines else set()
    wy = Ways(wanted)
    wy.apply_file(str(pbf), locations=True)
    lines = []
    for (mode, ref), e in sorted(rt.lines.items()):
        merged = line_geometry(e["relations"], wy.geoms)
        if merged is None:
            continue
        geom = mapping(merged)
        geom["coordinates"] = json.loads(json.dumps(geom["coordinates"]), parse_float=lambda v: round(float(v), 5))
        colour = e["colour"] or DEFAULT_COLOURS[mode]
        if not colour.startswith("#"):
            colour = "#" + colour
        lines.append({"type": "Feature", "geometry": geom,
                      "properties": {"mode": mode, "ref": ref, "colour": colour.upper()}})
    (OUT / "transit-lines.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": lines},
                                                          separators=(",", ":")))
    print(f"{len(lines)} lignes : {[(l['properties']['mode'], l['properties']['ref'], l['properties']['colour']) for l in lines]}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "data/paris.osm.pbf"))
