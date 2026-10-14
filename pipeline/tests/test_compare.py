"""Logique de comparaison OSM ↔ Overture : chaque signal, et la règle « aucune source seule ne suffit »."""
import csv

import compare
from common import normalize_name

BASE = dict(category="restaurant", osm_type="node")


def osm(i, name, lat, lon):
    return {**BASE, "osm_id": i, "name": name, "lat": lat, "lon": lon}


def ov(name, lat, lon, confidence=0.9, status=None):
    return {"name": name, "lat": lat, "lon": lon, "confidence": confidence, "operating_status": status, "sources": ["meta"]}


def run(tmp_path, monkeypatch, pois, places):
    monkeypatch.setattr(compare, "OUT", tmp_path)
    rows = compare.run(6, pois, places)
    return {r["nom_osm"]: r for r in rows}


def test_normalisation_des_noms():
    assert normalize_name("Le Café de l'Église") == "cafe eglise"
    assert normalize_name("CHEZ PAUL - SARL") == "paul"
    assert normalize_name(None) == ""


def test_distance():
    # 0,001° de latitude ≈ 111 m
    assert 110 < compare.dist_m(48.85, 2.34, 48.851, 2.34) < 112


def test_signaux(tmp_path, monkeypatch):
    pois = [
        osm(1, "Café de Flore", 48.8541, 2.3326),          # confirmé
        osm(2, "Le Fermé", 48.8500, 2.3400),               # Overture le dit fermé → fort
        osm(3, "Le Douteux", 48.8510, 2.3410),             # existence douteuse → fort
        osm(4, "Introuvable", 48.8520, 2.3420),            # absent d'Overture → faible seulement
        osm(5, "Trop Loin", 48.8530, 2.3430),              # homonyme à 150 m : pas un correspondant
    ]
    places = [
        ov("Cafe de Flore", 48.85412, 2.33262),
        ov("Le Fermé", 48.85001, 2.34001, status="permanently_closed"),
        ov("Le Douteux", 48.8510, 2.3410, confidence=0.2),
        ov("Trop Loin", 48.8530 + 0.00135, 2.3430),
    ]
    r = run(tmp_path, monkeypatch, pois, places)
    assert r["Café de Flore"]["statut"] == "confirmé par Overture" and r["Café de Flore"]["niveau"] == ""
    assert r["Le Fermé"]["niveau"] == "fort" and "permanently_closed" in r["Le Fermé"]["signaux"]
    assert r["Le Douteux"]["niveau"] == "fort" and "0.20" in r["Le Douteux"]["signaux"]
    assert r["Introuvable"]["niveau"] == "faible" and r["Introuvable"]["signaux"] == "absent d'Overture"
    assert r["Trop Loin"]["niveau"] == "faible"


def test_aucune_source_seule_ne_ferme_un_lieu(tmp_path, monkeypatch):
    """Le programme ne déclare jamais un lieu fermé : il produit des candidats « à vérifier » avec leurs signaux."""
    r = run(tmp_path, monkeypatch, [osm(1, "Le Fermé", 48.85, 2.34)], [ov("Le Fermé", 48.85, 2.34, status="permanently_closed")])
    assert r["Le Fermé"]["statut"] == "à vérifier"
    assert r["Le Fermé"]["signaux"]


def test_fichier_csv(tmp_path, monkeypatch):
    run(tmp_path, monkeypatch, [osm(1, "Alpha Bistrot", 48.85, 2.34), osm(2, "Beta Bar", 48.86, 2.35)], [ov("Alpha Bistrot", 48.85, 2.34)])
    with (tmp_path / "arr6_candidats.csv").open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f, delimiter=";"))
    assert [x["nom_osm"] for x in rows] == ["Beta Bar", "Alpha Bistrot"]      # les signaux d'abord
    assert rows[1]["lien_osm"] == "https://www.openstreetmap.org/node/1"
