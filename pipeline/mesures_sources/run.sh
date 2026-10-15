#!/usr/bin/env bash
# Mesure, pour les lieux OSM de Paris, ce que chaque source ouverte apporterait (horaires, sites, téléphones).
# Ne modifie rien, ni dans OSM ni dans l'app : produit des chiffres (voir docs/sources-donnees.md).
# Usage (depuis la racine du dépôt) : bash pipeline/mesures_sources/run.sh     (≈ 1 h, 3 Go téléchargés)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
mkdir -p "$ROOT/data/mesures" && cd "$ROOT/data/mesures"
export PYTHONPATH="$HERE"
python3 "$HERE/osm_base.py" "$ROOT/data/paris.osm.pbf"
# All The Places (CC0) : dernière exécution
RUN=$(curl -s https://data.alltheplaces.xyz/runs/latest.json | python3 -c "import json,sys; print(json.load(sys.stdin)['output_url'])")
[ -f atp.zip ] || curl -s -o atp.zip "$RUN"
python3 "$HERE/atp_paris.py" && python3 "$HERE/mesure_atp.py"
# Overture (lecture par HTTPS, sans identifiants)
REL=$(curl -s "https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/" | grep -o 'release/[0-9.-]*/' | sort | tail -1)
curl -s "https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=${REL}theme=places/type=place/" | grep -o '<Key>[^<]*' | sed 's/<Key>//' > ov_files.txt
python3 "$HERE/ov_paris.py" && python3 "$HERE/mesure_ov.py" && python3 "$HERE/mesure_sites.py"
# Ville de Paris (ODbL) et annuaire de l'administration (Licence Ouverte)
for d in ilots-de-fraicheur-espaces-verts-frais ilots-de-fraicheur-equipements-activites; do
  curl -s "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/$d/exports/json" -o "$d.json"; done
python3 "$HERE/mesure_paris.py"
curl -s "https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json?where=plage_ouverture%20is%20not%20null%20and%20search(adresse%2C%22Paris%22)&select=nom,type_organisme,pivot,adresse,plage_ouverture" -o annuaire75.json
python3 "$HERE/mesure_annuaire.py"
# Common Crawl : présence des sites dans la dernière copie, puis horaires lisibles dans les pages archivées (≈ 10 min)
CRAWL=$(curl -s https://index.commoncrawl.org/collinfo.json | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
curl -s "https://data.commoncrawl.org/crawl-data/$CRAWL/cc-index-table.paths.gz" | gunzip | grep subset=warc > cc_files.txt
python3 "$HERE/cc_dom.py" && python3 "$HERE/cc_hours.py"
