"""Confronte chaque lieu OSM aux lieux Overture voisins.

Signaux utilisés (aucun ne suffit seul — voir la colonne `signaux`) :
  - absence de correspondant Overture à proximité avec un nom proche ;
  - correspondant Overture avec un score d'existence faible ;
  - correspondant Overture marqué fermé (`operating_status`, rarement renseigné).
"""
import csv
import math

from rapidfuzz import fuzz

from common import OUT, normalize_name

RADIUS_M = 75          # distance max entre un lieu OSM et son correspondant Overture
NAME_MIN = 80          # similarité de nom minimale (0-100)
LOW_CONFIDENCE = 0.4   # en dessous : Overture doute de l'existence du lieu


def dist_m(lat1, lon1, lat2, lon2):
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    y = math.radians(lat2 - lat1)
    return 6_371_000 * math.hypot(x, y)


def best_match(poi, overture, cell):
    """Meilleur correspondant Overture (nom le plus proche dans le rayon)."""
    name = normalize_name(poi["name"])
    if not name:
        return None, 0, None
    cx, cy = cell(poi["lon"], poi["lat"])
    best, best_score, best_d = None, 0, None
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for p in overture.get((cx + dx, cy + dy), ()):
                d = dist_m(poi["lat"], poi["lon"], p["lat"], p["lon"])
                if d > RADIUS_M:
                    continue
                s = fuzz.token_set_ratio(name, p["_norm"])
                if s > best_score or (s == best_score and best_d is not None and d < best_d):
                    best, best_score, best_d = p, s, d
    return best, best_score, best_d


def run(arrondissement: int, osm_pois, overture_places):
    # Index spatial grossier : cases d'environ 100 m.
    cell = lambda lon, lat: (int(lon / 0.0013), int(lat / 0.0009))
    grid = {}
    for p in overture_places:
        p["_norm"] = normalize_name(p["name"])
        grid.setdefault(cell(p["lon"], p["lat"]), []).append(p)

    rows = []
    for poi in osm_pois:
        m, score, d = best_match(poi, grid, cell)
        matched = m is not None and score >= NAME_MIN
        signals = []
        if not matched:
            signals.append("absent d'Overture")
        else:
            conf = m.get("confidence")
            if conf is not None and conf < LOW_CONFIDENCE:
                signals.append(f"existence douteuse selon Overture ({conf:.2f})")
            if m.get("operating_status") in ("permanently_closed", "temporarily_closed"):
                signals.append(f"Overture : {m['operating_status']}")
        strong = matched and len(signals) > 0
        rows.append({
            "niveau": "fort" if strong else ("faible" if signals else ""),
            "statut": "à vérifier" if signals else "confirmé par Overture",
            "signaux": " ; ".join(signals),
            "nom_osm": poi["name"],
            "categorie_osm": poi["category"],
            "lien_osm": f"https://www.openstreetmap.org/{poi['osm_type']}/{poi['osm_id']}",
            "check_date_osm": poi.get("check_date") or "",
            "nom_overture": m["name"] if matched else "",
            "similarite_nom": score if matched else "",
            "distance_m": round(d) if matched else "",
            "confiance_overture": m.get("confidence") if matched else "",
            "sources_overture": " | ".join(m.get("sources") or []) if matched else "",
            "lat": round(poi["lat"], 6), "lon": round(poi["lon"], 6),
        })

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"arr{arrondissement}_candidats.csv"
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]), delimiter=";")
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: ({"fort": 0, "faible": 1}.get(r["niveau"], 2), r["nom_osm"])))
    fort = sum(r["niveau"] == "fort" for r in rows)
    faible = sum(r["niveau"] == "faible" for r in rows)
    print(f"Comparaison sur {len(rows)} lieux OSM : {fort} signaux forts, "
          f"{faible} signaux faibles → {path}")
    return rows
