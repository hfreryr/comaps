"""Télécharge, depuis le stockage public d'Overture Maps, les lieux situés dans
l'emprise de l'arrondissement, avec leur statut d'ouverture et leurs sources."""
import json
import os

import duckdb
from shapely.geometry import Point
from shapely.prepared import prep

from common import DATA

RELEASE = "2026-09-23.1"  # dernière version publiée au 2026-10-12


def run(arrondissement: int, zone, release: str = RELEASE):
    # Les données Overture sont publiques : on force un accès anonyme.
    for k in [k for k in os.environ if k.upper().startswith("AWS_")]:
        del os.environ[k]
    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
    con.sql("CREATE OR REPLACE SECRET anon (TYPE s3, PROVIDER config, "
            "KEY_ID '', SECRET '', REGION 'us-west-2');")

    xmin, ymin, xmax, ymax = zone.bounds
    rows = con.sql(f"""
        SELECT id,
               names.primary                    AS name,
               operating_status,
               basic_category,
               taxonomy.primary                 AS taxonomy,
               confidence,
               websites,
               ST_X(geometry) AS lon, ST_Y(geometry) AS lat,
               [s.dataset || ' (' || coalesce(s.update_time, '?') || ')'
                  FOR s IN sources]             AS sources
        FROM read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*',
                          hive_partitioning = 1)
        WHERE bbox.xmin BETWEEN {xmin} AND {xmax}
          AND bbox.ymin BETWEEN {ymin} AND {ymax}
    """).fetchall()
    cols = ["id", "name", "operating_status", "basic_category", "taxonomy",
            "confidence", "websites", "lon", "lat", "sources"]

    inside = prep(zone)
    places = [dict(zip(cols, r)) for r in rows]
    places = [p for p in places if inside.contains(Point(p["lon"], p["lat"]))]

    (DATA / f"arr{arrondissement}_overture.json").write_text(
        json.dumps(places, ensure_ascii=False, default=str))
    print(f"Overture {release} : {len(places)} lieux dans l'arrondissement")
    return places
