"""Produit :
  - une carte HTML autonome des lieux à vérifier ;
  - une fiche de vérification terrain (échantillon aléatoire, à remplir à la main).
"""
import csv
import json
import random

from shapely.geometry import mapping

from common import OUT

SAMPLE_STRONG = 25
SAMPLE_WEAK = 25

PAGE = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lieux à vérifier — Paris {arr}e</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
 html,body,#map{{height:100%;margin:0;font-family:system-ui,sans-serif}}
 .panel{{position:absolute;z-index:1000;top:12px;left:12px;right:12px;max-width:360px;
   background:#fff;padding:12px 14px;border-radius:10px;box-shadow:0 2px 12px #0003;font-size:14px}}
 .panel h1{{font-size:16px;margin:0 0 6px}} .dot{{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}}
 label{{display:block;margin-top:4px;cursor:pointer}} .muted{{color:#666;font-size:12px;margin-top:8px}}
</style></head><body><div id="map"></div>
<div class="panel"><h1>Paris {arr}e — lieux OSM peut-être fermés</h1>
<label><input type="checkbox" id="fort" checked> <span class="dot" style="background:#d7301f"></span>Signal fort ({n_fort}) — Overture doute de leur existence</label>
<label><input type="checkbox" id="faible"> <span class="dot" style="background:#fdae61"></span>Signal faible ({n_faible}) — absents d'Overture</label>
<div class="muted">Aucun de ces lieux n'est confirmé fermé. Données © contributeurs OpenStreetMap (ODbL) et Overture Maps.</div></div>
<script>
const rows = {rows};
const zone = {zone};
const map = L.map('map').setView([48.849, 2.333], 15);
L.tileLayer('https://tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{maxZoom: 19,
  attribution: '© contributeurs OpenStreetMap'}}).addTo(map);
L.geoJSON(zone, {{style: {{color: '#555', weight: 2, fill: false, dashArray: '4 4'}}}}).addTo(map);
const layers = {{fort: L.layerGroup(), faible: L.layerGroup()}};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]));
for (const r of rows) {{
  const color = r.niveau === 'fort' ? '#d7301f' : '#fdae61';
  L.circleMarker([r.lat, r.lon], {{radius: 6, color: '#fff', weight: 1, fillColor: color, fillOpacity: .9}})
   .bindPopup(`<b>${{esc(r.nom_osm)}}</b><br>${{esc(r.categorie_osm)}}<br><i>${{esc(r.signaux)}}</i><br>` +
              `<a href="${{esc(r.lien_osm)}}" target="_blank" rel="noopener">Voir dans OSM</a>`)
   .addTo(layers[r.niveau]);
}}
layers.fort.addTo(map);
for (const k of ['fort', 'faible']) document.getElementById(k).onchange = e =>
  e.target.checked ? layers[k].addTo(map) : map.removeLayer(layers[k]);
</script></body></html>
"""


def run(arrondissement: int, rows, zone, seed: int = 42):
    flagged = [r for r in rows if r["niveau"]]
    slim = [{k: r[k] for k in ("niveau", "nom_osm", "categorie_osm", "signaux",
                               "lien_osm", "lat", "lon")} for r in flagged]
    html = PAGE.format(
        arr=arrondissement,
        n_fort=sum(r["niveau"] == "fort" for r in flagged),
        n_faible=sum(r["niveau"] == "faible" for r in flagged),
        rows=json.dumps(slim, ensure_ascii=False),
        zone=json.dumps(mapping(zone)),
    )
    carte = OUT / f"arr{arrondissement}_carte.html"
    carte.write_text(html, encoding="utf-8")

    # Échantillon aléatoire et reproductible pour la vérification terrain.
    rnd = random.Random(seed)
    fort = [r for r in flagged if r["niveau"] == "fort"]
    faible = [r for r in flagged if r["niveau"] == "faible"]
    sample = (rnd.sample(fort, min(SAMPLE_STRONG, len(fort)))
              + rnd.sample(faible, min(SAMPLE_WEAK, len(faible))))
    rnd.shuffle(sample)  # ne pas savoir le niveau en vérifiant, pour éviter le biais
    fiche = OUT / f"arr{arrondissement}_verification.csv"
    with fiche.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["n", "nom", "categorie", "lien_osm", "lat", "lon",
                    "verdict (ouvert / fermé / remplacé / introuvable)",
                    "comment vérifié (sur place / site / téléphone)", "date", "remarque"])
        for i, r in enumerate(sample, 1):
            w.writerow([i, r["nom_osm"], r["categorie_osm"], r["lien_osm"], r["lat"], r["lon"],
                        "", "", "", ""])
    # Le niveau de signal est mis à part : ne le consulter qu'après la vérification.
    cle = OUT / f"arr{arrondissement}_verification_cle.csv"
    with cle.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["n", "niveau"])
        w.writerows([i, r["niveau"]] for i, r in enumerate(sample, 1))
    print(f"Carte : {carte}\nFiche de vérification : {fiche} ({len(sample)} lieux)")
