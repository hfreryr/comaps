# App — prototype v0 *(nom de code : Projet Paris)*

Carte de Paris, recherche de lieux, fiche lieu avec horaires d'ouverture lisibles.

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
| Fond de carte | [OpenFreeMap](https://openfreemap.org) (style Liberty) | Gratuit, sans clé, données OSM |
| Recherche | [Photon](https://photon.komoot.io) (serveur public komoot) | Usage raisonnable uniquement |
| Détails d'un lieu | API OpenStreetMap (lecture d'un élément) | À remplacer par une source dédiée avant tout lancement |
| Horaires | bibliothèque `opening_hours` | Calcul local, dans le navigateur |
| Police | Instrument Sans, **hébergée avec l'app** | Pas d'appel à Google Fonts |

Aucune donnée personnelle collectée. La position de l'utilisateur ne quitte pas son appareil.
