# Untracked Maps — l'app (prototype)

Carte de Paris centrée sur vous à l'ouverture, recherche de lieux et de types de lieux (« pharmacie », « resto près de moi »), fiche lieu avec horaires lisibles et prochains passages en station, listes par catégorie triées depuis votre position (distance, ouvert / fermé), favoris et lieux récents (gardés sur l'appareil uniquement), mode sombre automatique, itinéraires à pied, à vélo et en transports en commun.

En ligne : https://untrackedmaps.app

## Lancer

```bash
cd app
npm install
npm run dev      # développement
npm run build    # site statique dans app/build/
```

## Couches maison (`static/data/`)

Générées depuis l'extrait OpenStreetMap de Paris (`data/paris.osm.pbf`) :

```bash
python app/scripts/build_overlays.py data/paris.osm.pbf
```

- `landmarks.geojson` : ~7 300 lieux affichés jusqu'au zoom 18 : monuments, musées, parcs et gares, plus les adresses du quotidien (restaurants, cafés, boutiques, hôtels). Chaque lieu a un score de notoriété (traductions du nom, Wikidata, fiche OSM complète ; les enseignes de chaîne ne profitent pas de leurs traductions automatiques) et un **zoom d'apparition** `z`, calculé pour garder un écart régulier à l'écran (plus serré pour les lieux très connus). Au-delà du zoom 17, le fond de carte complète avec tous les lieux.
- `hours.json` : horaires OSM des restaurants, cafés, bars, boulangeries, commerces alimentaires, pharmacies et musées (~12 500 lieux), indexés par identifiant de tuile, pour afficher « Ouvert / Fermé » dans les listes sans interroger OSM lieu par lieu.
- `traffic-paris.json` : trafic habituel de Paris, généré par `python app/scripts/build_traffic.py` depuis les comptages routiers permanents de la Ville de Paris (ODbL) : pour chaque jour et chaque heure, la vitesse mesurée (débit ÷ taux d'occupation) rapportée à l'heure la plus rapide de la semaine. Ce ralentissement mesuré (de 1,0 la nuit à 1,96 le jeudi à 18 h) allonge directement le temps « route libre » de Valhalla : aucun coefficient fixé à la main. Seule hypothèse restante : que le temps Valhalla corresponde à la circulation de nuit ; à vérifier par comparaisons manuelles. Ordres de grandeur cohérents avec le TomTom Traffic Index 2025 (Paris, pointe du soir : +73 %).
- `transit-lines.geojson` : lignes de métro, RER et tram à leurs couleurs officielles (mode « Transports »).

## Briques utilisées (prototype)

| Brique | Service | Remarque |
|---|---|---|
| Fond de carte | Tuiles [OpenFreeMap](https://openfreemap.org), **style maison** (`src/lib/mapstyle.js`) | Gratuit, sans clé, données OSM |
| Police de la carte | Open Sans, glyphes [OpenMapTiles fonts](https://github.com/openmaptiles/fonts) hébergés avec l'app (`static/fonts/`) | Licence libre |
| Itinéraire à pied / vélo / voiture | [Valhalla](https://valhalla1.openstreetmap.de) (serveur public FOSSGIS) | Usage léger uniquement |
| Transports en commun (itinéraires et prochains passages en station) | [Transitous](https://transitous.org) (MOTIS 2) | Réservé aux projets libres non commerciaux ; **prévenir les mainteneurs avant un usage large** |
| Recherche | [Photon](https://photon.komoot.io) (serveur public komoot) | Usage raisonnable uniquement |
| Détails d'un lieu | API OpenStreetMap (lecture d'un élément) | À remplacer par une source dédiée avant tout lancement |
| Horaires | bibliothèque `opening_hours` | Calcul local, dans le navigateur |
| Police de l'interface | Police système du téléphone | Aucun appel à Google Fonts |

Aucune donnée personnelle collectée. La position de l'utilisateur ne quitte pas son appareil.

## Retours des premiers tests (12/10/2026)
- **Métro** : raccourci « Métro » (stations les plus proches, prochains passages directement dans la liste) ; la recherche comprend « métro », « station », « métro le plus proche » ; les stations restent toujours visibles sur la carte dès le zoom 13.
- **Distributeurs, Banques, Stations-service** : nouveaux raccourcis et pictogrammes.
- **Sorties de métro** : fiche station (« Sorties ») et « sortie conseillée » dans les trajets en transport. Index `static/data/exits.json` construit depuis OSM par `scripts/build_overlays.py`. **Place dans la rame** : jeu « Positionnement dans la rame » (RATP / Île-de-France Mobilités, Licence Ouverte 2.0), converti par `python app/scripts/build_rame.py` en `static/data/rame.json` ; le quai est retrouvé grâce à l'identifiant IDFM donné par Transitous. Conseil affiché pour la sortie choisie (si son nom correspond) et pour les correspondances.
- **Maison / Travail** : raccourcis en tête de la recherche (itinéraire en un geste), définissables depuis la fiche d'un lieu.
- **Import Google Maps** : archive Google Takeout « Maps (vos adresses) » lue sur le téléphone (`src/lib/importgoogle.js`), lieux enregistrés → favoris, adresses « Domicile / Travail » → raccourcis.
- **Raccourcis personnalisables** : affichage, ordre et nom, gardés sur l'appareil.
- **Promesse visible** à la première ouverture et en bas de la recherche ; explication sous « Horaires non renseignés » ; libellé vélo explicite.
- **Fiches dans l'ordre de l'utile** : station → prochains passages et sorties avant la photo ; commerce → horaires, téléphone, site avant le texte Wikipédia ; monument → photo et histoire d'abord.
- **59 raccourcis de catégories** (11 affichés d'origine, les autres activables dans « Personnaliser les raccourcis ») : fleuristes, cimetières, piscines, toilettes, cavistes, coiffeurs, vétérinaires, bornes de recharge… Les lieux de la carte sont complétés par la recherche Photon par catégorie (`include=osm.shop.florist`) pour les lieux hors de la vue ; tous sont posés sur la carte.
- **Arrêt intermédiaire** dans les itinéraires (« Ajouter un arrêt ») : à pied, vélo, voiture via Valhalla (plusieurs points) ; en transport, deux recherches Transitous enchaînées (`transitWithStop`).
