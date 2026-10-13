"""Où se placer dans la rame pour sortir (ou changer de ligne) au plus près, métro et RER A/B.

Source : « Positionnement dans la rame », RATP / Île-de-France Mobilités, Licence Ouverte 2.0
https://www.data.gouv.fr/datasets/positionnement-dans-la-rame

Chaque ligne du fichier : quai d'arrivée (identifiant IDFM, propre à une direction), ligne, sortie
(« access_point », par son nom) ou quai de correspondance (« stop_point », par son identifiant),
et la position conseillée : Avant / Milieu / Arrière, voiture n sur N.

Les sorties sont situées grâce au « Référentiel des arrêts : Accès » d'IDFM (Licence Ouverte 2.0) :
numéro (« Sortie 1 »), nom de rue et coordonnées de chaque accès. L'app choisit ainsi, parmi les sorties
que la RATP renseigne pour ce quai, la plus proche de la destination : plus besoin de rapprocher des noms.

Sortie : static/data/rame.json = { idQuai: { "s:<idQuai>": [n, N, "Avant"],            (correspondance)
                                             "x": [[lon, lat, numéro, rue, n, N, "Avant"], …] } }   (sorties)
L'app retrouve le quai grâce à l'identifiant IDFM que Transitous donne pour chaque arrêt.

Usage :  python app/scripts/build_rame.py [fichier.csv]   (sans fichier : téléchargement, ~0,5 Mo)
"""
import csv
import io
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

URL = "https://www.data.gouv.fr/api/1/datasets/r/03092c2d-a291-497d-acb2-c9975e6ef5bc"
ACCES = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/acces/exports/json?select=accid,accname,accshortname,accgeopoint"
OUT = Path(__file__).resolve().parent.parent / "static" / "data" / "rame.json"


def norm(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def main():
    if len(sys.argv) > 1:
        raw = Path(sys.argv[1]).read_bytes()
    else:
        raw = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": "UntrackedMaps-build"}), timeout=120).read()
    rows = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";")
    acces = {}
    try:
        for a in json.load(urllib.request.urlopen(urllib.request.Request(ACCES, headers={"User-Agent": "UntrackedMaps-build"}), timeout=120)):
            g = a.get("accgeopoint") or {}
            if g.get("lon") is not None:
                acces[str(a["accid"])] = (round(g["lon"], 6), round(g["lat"], 6), str(a.get("accshortname") or ""), a.get("accname") or "")
    except Exception as e:  # sans les accès, seules les correspondances restent utilisables
        print("accès IDFM indisponibles :", e, file=sys.stderr)
    out, n, located, seen = {}, 0, 0, set()
    for r in rows:
        if r["position_average"] not in ("Avant", "Milieu", "Arrière"):
            continue
        try:
            pos, mx = int(r["position"]), int(r["position_max"])
        except ValueError:
            continue
        q = out.setdefault(r["from_id"], {})
        if r["to_type"] == "access_point":
            a = acces.get(r["to_id"])
            if not a or (r["from_id"], r["to_id"]) in seen:
                continue
            seen.add((r["from_id"], r["to_id"]))
            q.setdefault("x", []).append([*a, pos, mx, r["position_average"]])
            located += 1
        else:
            q["s:" + r["to_id"]] = [pos, mx, r["position_average"]]
        n += 1
    print(f"{located} sorties situées sur {len(acces)} accès IDFM")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{n} conseils de placement, {len(out)} quais → {OUT.name} ({OUT.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
