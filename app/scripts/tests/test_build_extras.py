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
