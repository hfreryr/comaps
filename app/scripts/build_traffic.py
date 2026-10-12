"""Profil de trafic « habituel » de Paris, pour estimer les temps de trajet en voiture sans pister personne.

Source : « Comptage routier - Données trafic issues des capteurs permanents », Ville de Paris
(plus de 3 000 tronçons, une mesure par heure, 13 mois glissants), licence ODbL.
https://opendata.paris.fr/explore/dataset/comptages-routiers-permanents/

Deux mesures par jour de la semaine et par heure :
- « ralentissement » : vitesse mesurée relative. Chaque capteur donne le débit q (véhicules/h) et le
  taux d'occupation k (% du temps où un véhicule est au-dessus du capteur). q / k est proportionnel à
  la vitesse moyenne (la longueur des véhicules s'annule dans un rapport). On divise la vitesse de
  l'heure la plus rapide de la semaine par celle de chaque heure : 1,0 = route libre, 1,9 = trajet
  1,9 fois plus long. C'est ce facteur que l'app applique (voir src/lib/routing.js).
- « dense » : part des tronçons en circulation pré-saturée, saturée ou bloquée (sert au libellé).

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


def fetch(params):
    req = urllib.request.Request(f"{API}?{urllib.parse.urlencode(params)}",
                                 headers={"User-Agent": "UntrackedMaps-build (https://github.com/hfreryr/untracked)"})
    return json.load(urllib.request.urlopen(req, timeout=300))


def col(r, alias, expr):
    """L'API renvoie les colonnes sous leur alias ou sous leur expression, selon les cas."""
    return r[alias] if r.get(alias) is not None else r.get(expr)


def speeds():
    rows = fetch({
        "select": "date_format(t_1h,'EEEE') as jour, hour(t_1h) as heure, sum(q) as sq, sum(k) as sk",
        "where": "q > 0 and k > 0 and k < 100",
        "group_by": "date_format(t_1h,'EEEE'), hour(t_1h)",
        "timezone": "Europe/Paris",
    })
    v = {}
    for r in rows:
        jour, heure = col(r, "jour", "date_format(t_1h,'EEEE')"), col(r, "heure", "hour(t_1h)")
        sq, sk = col(r, "sq", "sum(q)"), col(r, "sk", "sum(k)")
        if jour in JOURS and heure is not None and sq and sk:
            v[(jour, int(heure))] = sq / sk
    vmax = max(v.values())
    return {j: [round(vmax / v[(j, h)], 2) if (j, h) in v else 1 for h in range(24)] for j in JOURS}


def main():
    params = {
        "select": "date_format(t_1h,'EEEE') as jour, hour(t_1h) as heure, etat_trafic, count(*) as n",
        "group_by": "date_format(t_1h,'EEEE'), hour(t_1h), etat_trafic",
        "timezone": "Europe/Paris",
    }
    rows = fetch(params)
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
    ralenti = speeds()
    OUT.write_text(json.dumps({
        "source": "Ville de Paris, comptages routiers permanents (ODbL)",
        "genere": date.today().isoformat(),
        "ralentissement": "vitesse de l'heure la plus rapide ÷ vitesse mesurée (débit / taux d'occupation)",
        "dense": "part des tronçons en circulation pré-saturée, saturée ou bloquée",
        "jours": {j: {"ralentissement": ralenti[j], "dense": profil[j]} for j in JOURS},
    }, ensure_ascii=False, separators=(",", ":")))
    for j in JOURS:
        print(f"{j:9}", " ".join(f"{v:4.2f}" for v in ralenti[j]))


if __name__ == "__main__":
    main()
