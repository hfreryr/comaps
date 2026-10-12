"""Profil de trafic « habituel » de Paris, pour estimer les temps de trajet en voiture sans pister personne.

Source : « Comptage routier - Données trafic issues des capteurs permanents », Ville de Paris
(plus de 3 000 tronçons, une mesure par heure, 13 mois glissants), licence ODbL.
https://opendata.paris.fr/explore/dataset/comptages-routiers-permanents/

Pour chaque jour de la semaine et chaque heure, on calcule la part des tronçons dont l'état est
« pré-saturé », « saturé » ou « bloqué » (les mesures « inconnu » sont ignorées).
L'app en déduit un facteur de ralentissement à l'heure du départ (voir src/lib/routing.js).

Usage :  python app/scripts/build_traffic.py
"""
import json
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "data" / "traffic-paris.json"
API = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents/exports/json"
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
DENSE = {"Pré-saturé", "Saturé", "Bloqué"}


def main():
    params = {
        "select": "date_format(t_1h,'EEEE') as jour, hour(t_1h) as heure, etat_trafic, count(*) as n",
        "group_by": "date_format(t_1h,'EEEE'), hour(t_1h), etat_trafic",
        "timezone": "Europe/Paris",
    }
    req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}",
                                 headers={"User-Agent": "UntrackedMaps-build (https://github.com/hfreryr/untracked)"})
    rows = json.load(urllib.request.urlopen(req, timeout=300))
    total, dense = defaultdict(int), defaultdict(int)
    for r in rows:
        # l'API renvoie les colonnes sous leur expression (les alias ne sont pas toujours appliqués)
        jour = r.get("jour") or r.get("date_format(t_1h,'EEEE')")
        heure = r.get("heure") if r.get("heure") is not None else r.get("hour(t_1h)")
        etat = r.get("etat_trafic")
        if jour not in JOURS or heure is None or etat in (None, "Inconnu"):
            continue
        total[(jour, int(heure))] += r["n"]
        if etat in DENSE:
            dense[(jour, int(heure))] += r["n"]
    profil = {j: [round(dense[(j, h)] / total[(j, h)], 3) if total[(j, h)] else 0 for h in range(24)] for j in JOURS}
    OUT.write_text(json.dumps({
        "source": "Ville de Paris, comptages routiers permanents (ODbL)",
        "genere": date.today().isoformat(),
        "mesure": "part des tronçons en circulation dense, pré-saturée, saturée ou bloquée",
        "jours": profil,
    }, ensure_ascii=False, separators=(",", ":")))
    for j in JOURS:
        print(f"{j:9}", " ".join(f"{100 * v:3.0f}" for v in profil[j]))


if __name__ == "__main__":
    main()
