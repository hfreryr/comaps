#!/usr/bin/env python3
"""Temps de réponse des services extérieurs de l'app, avec les mêmes paramètres que l'app (une ligne CSV par mesure).
Lancé toutes les 15 minutes par .github/workflows/sonde.yml. Résumé : python app/scripts/sonde_services.py --resume services.csv"""
import csv, sys, time, urllib.request, urllib.parse
from collections import defaultdict

UA = "UntrackedMapsBot/0.1 (+https://untrackedmaps.app/confidentialite ; sonde de disponibilité)"
P = "lat=48.85&lon=2.34&location_bias_scale=0.4&bbox=2.224,48.815,2.47,48.902"
TESTS = [
    ("photon", "grand palais", f"https://photon.komoot.io/api/?q=grand+palais&lang=fr&limit=7&{P}"),
    ("photon", "gare de lyon", f"https://photon.komoot.io/api/?q=gare+de+lyon&lang=fr&limit=7&{P}"),
    ("photon", "elysee", f"https://photon.komoot.io/api/?q=elysee&lang=fr&limit=7&{P}"),
    ("geoplateforme", "57 rue de rennes", "https://data.geopf.fr/geocodage/search?q=57+rue+de+rennes&index=address&limit=5&lat=48.85&lon=2.34"),
    ("transitous", "odeon-pantheon", "https://api.transitous.org/api/v5/plan?fromPlace=48.8521,2.3394&toPlace=48.8462,2.3460&numItineraries=3"),
    ("valhalla", "pied", "https://valhalla1.openstreetmap.de/route?json=" + urllib.parse.quote(
        '{"locations":[{"lat":48.8521,"lon":2.3394},{"lat":48.8462,"lon":2.3460}],"costing":"pedestrian"}')),
]


def measure():
    w = csv.writer(sys.stdout)
    for service, q, url in TESTS:
        t0 = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                r.read()
                code = r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception:
            code = 0  # pas de réponse en 30 s, ou connexion refusée
        w.writerow([time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), service, q, code, f"{time.time() - t0:.2f}"])


def resume(path):
    """Médiane et part des réponses > 4 s (le délai d'attente de l'app pour Photon), par service et heure de Paris."""
    by = defaultdict(list)
    for row in csv.DictReader(open(path)):
        h = (int(row["date_utc"][11:13]) + 2) % 24     # heure de Paris (été)
        by[(row["service"], h)].append(float(row["secondes"]) if row["code"] == "200" else 99.0)
    print("service,heure_paris,mesures,mediane_s,part_plus_de_4s")
    for (s, h), v in sorted(by.items()):
        v.sort()
        print(f"{s},{h:02d}h,{len(v)},{v[len(v)//2]:.1f},{sum(x > 4 for x in v) / len(v):.0%}")


if __name__ == "__main__":
    resume(sys.argv[2]) if sys.argv[1:2] == ["--resume"] else measure()
