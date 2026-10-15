"""Compléments hors OSM : appariement prudent, sites plausibles, numéros normalisés, jamais de remplacement d'OSM."""
from build_extras import same_name, completable, site_of, phone_fr, match_overture, NOT_A_SITE
from build_places import add_extras


def test_meme_nom():
    assert same_name("La Casa di Anna", "La casa di Anna paris")
    assert same_name("Café de Flore", "Cafe de Flore")
    # deux mots en commun, mais aucun distinctif : pas le même lieu
    assert not same_name("Grands Boulevards", "Holiday Inn Grands Boulevards")
    assert not same_name("Centre Culturel", "Centre culturel russe")
    assert not same_name("Chez Paul", "Chez Pierre")


def test_lieux_completes():
    assert completable({"amenity": "restaurant", "name": "X"})
    assert completable({"shop": "bakery"})
    assert completable({"tourism": "hotel"})
    assert not completable({"railway": "station", "name": "Grands Boulevards"})
    assert not completable({"amenity": "place_of_worship", "name": "Église Saint-Sulpice"})
    assert not completable({"amenity": "parking"})
    assert not completable({"tourism": "attraction"})


def test_site_du_lieu():
    assert site_of("Loca Images", "http://www.loca-images.com")
    assert site_of("Dinh Van", "http://www.dinhvan.com")
    assert site_of("5àsec", "https://www.5asec.fr/fr/magasin/pressing-paris-saint-antoine/")
    assert not site_of("Aubergine 3000", "http://www.lestendhal.net/")
    assert not site_of("Croccante", "http://www.linternaute.com/restaurant/11236/")
    assert NOT_A_SITE.search("https://www.tripadvisor.fr/Restaurant_Review")
    assert NOT_A_SITE.search("https://www.google.com/maps/place/x")


def test_numeros():
    assert phone_fr("+33142784979") == "+33 1 42 78 49 79"
    assert phone_fr("01 42 78 49 79") == "+33 1 42 78 49 79"
    assert phone_fr("0033 6 22 29 04 30") == "+33 6 22 29 04 30"
    assert phone_fr("+44 20 7946 0958") is None
    assert phone_fr("12") is None


def test_appariement():
    items = [[11, 2.3500, 48.8500, {"name": "Bistrot 38", "amenity": "pub"}],
             [21, 2.3501, 48.8501, {"name": "Gare du Nord", "railway": "station"}]]
    rows = [("Bistrot 38", 48.85002, 2.35002, ["http://www.bistrot38.fr/"], ["+33140380868"], 0.9),
            ("Bistrot 38", 48.8600, 2.3600, ["http://autre.fr"], [], 0.9),            # trop loin
            ("Gare du Nord", 48.8501, 2.3501, ["http://hotel.fr"], [], 0.9)]           # une gare n'est pas complétée
    found = match_overture(items, rows)
    assert list(found) == [0] and len(found[0]) == 1


def test_osm_jamais_remplace():
    tags = {"name": "X", "contact:phone": "+33 1 00 00 00 00"}
    assert add_extras(tags, {"phone": ["+33 1 11 11 11 11", "overture"], "website": ["https://x.fr", "overture"]})
    assert tags["contact:phone"] == "+33 1 00 00 00 00" and "phone" not in tags
    assert tags["website"] == "https://x.fr" and tags["_src"] == {"website": "overture"}
    assert not add_extras({"website": "https://osm.fr"}, {"website": ["https://x.fr", "overture"]})


# ——— Ville de Paris ———
from build_extras import day_hours, paris_opening_hours, paris_period, paris_rows, paris_keep


def test_horaires_du_jour():
    assert day_hours("07h00 - 08h30 / 11h30 - 13h30 / 16h45 - 22h00") == "07:00-08:30,11:30-13:30,16:45-22:00"
    assert day_hours("8h - 18h30") == "08:00-18:30"
    assert day_hours("10H - 19H") == "10:00-19:00"
    assert day_hours("08:00 - 20:30") == "08:00-20:30"
    assert day_hours("-") == "off" and day_hours("Fermé") == "off"
    assert day_hours("Accès libre") is None


def rec(**days):
    base = {f"horaires_{d}": "08h00 - 20h30" for d in ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")}
    base.update({f"horaires_{k}": v for k, v in days.items()})
    return base


def test_semaine_au_format_osm():
    assert paris_opening_hours(rec()) == "Mo-Su 08:00-20:30"
    assert paris_opening_hours(rec(samedi="09h00 - 20h30", dimanche="09h00 - 20h30")) == "Mo-Fr 08:00-20:30; Sa,Su 09:00-20:30"
    assert paris_opening_hours(rec(lundi="-")) == "Tu-Su 08:00-20:30"
    assert paris_opening_hours({"ouvert_24h": "Oui"}) == "24/7"
    assert paris_opening_hours(rec(mardi="Accès libre")) is None          # un jour illisible : rien plutôt que faux
    assert paris_opening_hours(rec(**{d: "-" for d in ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")})) is None


def test_periode_en_vigueur():
    assert paris_period("du 01/10/26 au 24/10/26", "2026-10-15") == "2026-10-24"
    assert paris_period("du 26/10/25 au 28/02/26", "2026-10-15") is None   # passée : horaires d'une autre saison
    assert paris_period("", "2026-10-15") == ""


def test_lignes_de_la_ville():
    recs = [dict(rec(), nom="SQUARE DU TEMPLE - ELIE WIESEL", type="Promenades ouvertes", horaires_periode="du 01/10/26 au 24/10/26",
                 geo_point_2d={"lat": 48.864, "lon": 2.360}),
            dict(rec(), nom="Ombrière", type="Ombrière pérenne", geo_point_2d={"lat": 48.8, "lon": 2.3}),
            dict(rec(), nom="Jardin X", type="Bois", horaires_periode="du 26/10/25 au 28/02/26", geo_point_2d={"lat": 48.8, "lon": 2.3})]
    assert paris_rows(recs, "2026-10-15") == [("SQUARE DU TEMPLE - ELIE WIESEL", 48.864, 2.360, "Mo-Su 08:00-20:30", "2026-10-24")]
    assert paris_keep({"leisure": "park"}) and paris_keep({"tourism": "museum"}) and not paris_keep({"amenity": "restaurant"})


def test_complement_perime_ignore():
    tags = {"name": "Square"}
    assert not add_extras(tags, {"opening_hours": ["Mo-Su 08:00-20:30", "paris", "2026-10-24"]}, today="2026-10-25")
    assert add_extras(tags, {"opening_hours": ["Mo-Su 08:00-20:30", "paris", "2026-10-24"]}, today="2026-10-15")
    assert tags["_src"] == {"opening_hours": "paris"}


# ——— Enseignes et annuaire ———
from build_extras import valid_hours, annuaire_hours, annuaire_keep


def test_horaires_valides():
    assert valid_hours("Mo-Fr 10:00-19:30; Sa 10:00-19:00")
    assert valid_hours("Mo closed; Tu-Fr 09:30-13:00,14:00-18:00; Su off")
    assert valid_hours("24/7")
    assert not valid_hours("Mo 14:00-18:30; Su clos")                       # « clos » n'est pas du format OSM
    assert not valid_hours("Fr 08:30-16:15,09:00-15:30")                    # plages qui se chevauchent
    assert not valid_hours("")


def test_annuaire():
    p = lambda a, b, h1, h2, h3="", h4="", c="": {"nom_jour_debut": a, "nom_jour_fin": b, "valeur_heure_debut_1": h1,
                                                  "valeur_heure_fin_1": h2, "valeur_heure_debut_2": h3, "valeur_heure_fin_2": h4, "commentaire": c}
    assert annuaire_hours([p("Lundi", "Vendredi", "08:30:00", "12:30:00", "13:30:00", "17:30:00")]) == "Mo-Fr 08:30-12:30,13:30-17:30"
    assert annuaire_hours([p("Lundi", "Vendredi", "09:00:00", "12:45:00", c="Uniquement sur rendez-vous.")]) is None
    assert annuaire_keep({"amenity": "townhall"}) and not annuaire_keep({"amenity": "school"}) and not annuaire_keep({"leisure": "park"})


def test_annuaire_permanence_ecartee():
    p = {"nom_jour_debut": "Jeudi", "nom_jour_fin": "Jeudi", "valeur_heure_debut_1": "09:00:00", "valeur_heure_fin_1": "17:00:00"}
    assert annuaire_hours([p]) is None
