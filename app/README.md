# App — prototype *(nom de code : Projet Paris)*

Carte de Paris, recherche de lieux, fiche lieu avec horaires lisibles, raccourcis de catégories, itinéraires à pied, à vélo et en transports en commun.

En ligne : https://hfreryr.github.io/comaps/

## Lancer

```bash
cd app
npm install
npm run dev      # développement
npm run build    # site statique dans app/build/
```

## Briques utilisées (prototype)

| Brique | Service | Remarque |
|---|---|---|
| Fond de carte | Tuiles [OpenFreeMap](https://openfreemap.org), **style maison** (`src/lib/mapstyle.js`) | Gratuit, sans clé, données OSM |
| Police de la carte | Open Sans, glyphes [OpenMapTiles fonts](https://github.com/openmaptiles/fonts) hébergés avec l'app (`static/fonts/`) | Licence libre |
| Itinéraire à pied / vélo | [Valhalla](https://valhalla1.openstreetmap.de) (serveur public FOSSGIS) | Usage léger uniquement |
| Transports en commun | [Transitous](https://transitous.org) (MOTIS 2) | Réservé aux projets libres non commerciaux ; **prévenir les mainteneurs avant un usage large** |
| Recherche | [Photon](https://photon.komoot.io) (serveur public komoot) | Usage raisonnable uniquement |
| Détails d'un lieu | API OpenStreetMap (lecture d'un élément) | À remplacer par une source dédiée avant tout lancement |
| Horaires | bibliothèque `opening_hours` | Calcul local, dans le navigateur |
| Police de l'interface | Police système du téléphone | Aucun appel à Google Fonts |

Aucune donnée personnelle collectée. La position de l'utilisateur ne quitte pas son appareil.
