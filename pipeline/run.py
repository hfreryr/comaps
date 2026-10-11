"""Point d'entrée unique.

Usage :  python pipeline/run.py --arrondissement 6

Prérequis : le fichier data/paris.osm.pbf
  (https://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris.osm.pbf)
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import compare  # noqa: E402
import osm_extract  # noqa: E402
import overture_extract  # noqa: E402
import report  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arrondissement", type=int, default=6)
    a = ap.parse_args()
    zone, pois = osm_extract.run(a.arrondissement)
    places = overture_extract.run(a.arrondissement, zone)
    rows = compare.run(a.arrondissement, pois, places)
    report.run(a.arrondissement, rows, zone)


if __name__ == "__main__":
    main()
