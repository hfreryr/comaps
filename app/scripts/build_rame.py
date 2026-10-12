"""Où se placer dans la rame pour sortir (ou changer de ligne) au plus près, métro et RER A/B.

Source : « Positionnement dans la rame », RATP / Île-de-France Mobilités, Licence Ouverte 2.0
https://www.data.gouv.fr/datasets/positionnement-dans-la-rame

Chaque ligne du fichier : quai d'arrivée (identifiant IDFM, propre à une direction), ligne, sortie
(« access_point », par son nom) ou quai de correspondance (« stop_point », par son identifiant),
et la position conseillée : Avant / Milieu / Arrière, voiture n sur N.

Sortie : static/data/rame.json = { idQuai: { "a:<nom de sortie normalisé>" | "s:<idQuai>": [n, N, "Avant"] } }
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
    out, n = {}, 0
    for r in rows:
        if r["position_average"] not in ("Avant", "Milieu", "Arrière"):
            continue
        try:
            pos, mx = int(r["position"]), int(r["position_max"])
        except ValueError:
            continue
        key = ("a:" + norm(r["to_name"])) if r["to_type"] == "access_point" else ("s:" + r["to_id"])
        out.setdefault(r["from_id"], {})[key] = [pos, mx, r["position_average"]]
        n += 1
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{n} conseils de placement, {len(out)} quais → {OUT.name} ({OUT.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
