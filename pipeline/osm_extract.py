"""Extrait, depuis un fichier OSM (.pbf), le contour d'un arrondissement de Paris
et les lieux nommés (commerces, restaurants, services…) qu'il contient."""
import json

import osmium
from shapely import wkb
from shapely.geometry import Point, shape, mapping
from shapely.prepared import prep

from common import DATA, insee_arrondissement

# Clés OSM qui désignent un lieu « commercial » susceptible de fermer.
POI_KEYS = ("shop", "craft", "office", "healthcare")
AMENITY_VALUES = {
    "restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "biergarten",
    "pharmacy", "bank", "bureau_de_change", "cinema", "theatre", "nightclub",
    "dentist", "doctors", "clinic", "veterinary", "language_school",
    "driving_school", "music_school", "car_rental", "marketplace",
}
TOURISM_VALUES = {"hotel", "hostel", "guest_house", "gallery", "museum", "apartment"}
LEISURE_VALUES = {"fitness_centre", "sports_centre", "dance", "escape_game"}


def category(tags) -> str | None:
    for k in POI_KEYS:
        if k in tags:
            return f"{k}={tags[k]}"
    if tags.get("amenity") in AMENITY_VALUES:
        return f"amenity={tags['amenity']}"
    if tags.get("tourism") in TOURISM_VALUES:
        return f"tourism={tags['tourism']}"
    if tags.get("leisure") in LEISURE_VALUES:
        return f"leisure={tags['leisure']}"
    return None


class BoundaryHandler(osmium.SimpleHandler):
    """Récupère le polygone de l'arrondissement (relation administrative)."""

    def __init__(self, insee: str):
        super().__init__()
        self.insee = insee
        self.geom = None
        self.fab = osmium.geom.WKBFactory()

    def area(self, a):
        t = a.tags
        if (t.get("boundary") == "administrative" and t.get("ref:INSEE") == self.insee
                and not a.from_way()):
            self.geom = wkb.loads(self.fab.create_multipolygon(a), hex=True)


class PoiHandler(osmium.SimpleHandler):
    """Lieux nommés : nœuds (points) et bâtiments/surfaces (centre)."""

    def __init__(self, zone):
        super().__init__()
        self.zone = prep(zone)
        self.pois = []
        self.fab = osmium.geom.WKBFactory()

    def _add(self, osm_type, osm_id, tags, pt):
        cat = category(tags)
        if not cat or "name" not in tags or not self.zone.contains(pt):
            return
        self.pois.append({
            "osm_type": osm_type, "osm_id": osm_id, "name": tags["name"],
            "category": cat, "lon": pt.x, "lat": pt.y,
            "website": tags.get("website") or tags.get("contact:website"),
            "check_date": tags.get("check_date"),
        })

    def node(self, n):
        if n.location.valid():
            self._add("node", n.id, n.tags, Point(n.location.lon, n.location.lat))

    def area(self, a):
        try:
            g = wkb.loads(self.fab.create_multipolygon(a), hex=True)
        except Exception:
            return
        osm_type = "way" if a.from_way() else "relation"
        self._add(osm_type, a.orig_id(), a.tags, g.representative_point())


def run(arrondissement: int, pbf=DATA / "paris.osm.pbf"):
    insee = insee_arrondissement(arrondissement)
    b = BoundaryHandler(insee)
    b.apply_file(str(pbf), locations=True)
    if b.geom is None:
        raise SystemExit(f"Contour de l'arrondissement {insee} introuvable dans {pbf}")

    h = PoiHandler(b.geom)
    h.apply_file(str(pbf), locations=True)

    (DATA / f"arr{arrondissement}_boundary.geojson").write_text(
        json.dumps({"type": "Feature", "properties": {"insee": insee},
                    "geometry": mapping(b.geom)}))
    (DATA / f"arr{arrondissement}_osm_pois.json").write_text(
        json.dumps(h.pois, ensure_ascii=False))
    print(f"OSM : {len(h.pois)} lieux nommés dans l'arrondissement {insee}")
    return b.geom, h.pois


def load_boundary(arrondissement: int):
    f = json.loads((DATA / f"arr{arrondissement}_boundary.geojson").read_text())
    return shape(f["geometry"])
