# Untracked

Une carte aussi agréable que Google Maps, qui ne vous piste pas. Pour celles et ceux qui ont déjà choisi Signal, Proton ou Brave. Bâtie sur OpenStreetMap et des moteurs libres.

**Ville pilote : Paris** (vérifications terrain d'abord sur un arrondissement).

Rendre les cartes libres basées sur OpenStreetMap (OSM) **aussi fiables et aussi agréables** que Google Maps.

## Deux chantiers

### 1. 🔍 Fraîcheur des lieux (`pipeline/`)
Repérer automatiquement les lieux d'OSM qui ne sont plus à jour — en commençant par les **commerces fermés** — en comparant OSM avec [Overture Maps](https://overturemaps.org).

- Aucune modification automatique d'OSM sans accord préalable de la communauté.
- Toute amélioration repart dans OSM : toutes les apps libres en profitent.

### 2. 🗺️ L'app (`app/`)
Concevoir et tester une expérience à la hauteur de Google Maps, d'abord sur le parcours **« faire un itinéraire »**.

- Prototypes testés avec de vrais utilisateurs, comparés à Google Maps.
- Notre propre app web, branchée sur des moteurs libres : https://untrackedmaps.app

## Feuille de route

| Étape | Objectif | Réussite si… |
|---|---|---|
| 0. Installation ✅ | Dépôt prêt | Premier script exécuté |
| 1. Cadrage | Ville : Paris ✅ — 6e arrondissement ✅ | Périmètre écrit ici |
| 2. Détection ✅ | Lister les lieux OSM peut-être fermés (voir `pipeline/README.md`) | Liste reproductible + carte |
| 3. Mesure | Vérifier 30 à 50 cas sur le terrain | Taux de fiabilité chiffré |
| 4. App : carte, recherche, fiche lieu ✅ | Prototype en ligne (`app/`) | Testé sur téléphone |
| 5. App : itinéraires ✅ | À pied, à vélo, en transports | Testé par 5 personnes face à Google Maps |
| 6. Communauté OSM | Présenter les résultats du pipeline | Accord ou retour constructif |
| 7. Bot | Corriger automatiquement les cas très sûrs | Corrections non annulées |

## Valeurs

- **Communs** : tout repart dans OSM, aucun silo
- **Frugalité** : coût minimal, auto-hébergeable, pas de dépendance propriétaire
- **Zéro pistage** : aucune donnée personnelle collectée
- **Exigence UX** : la frugalité n'excuse pas une mauvaise expérience

## Licences

- Code : [AGPL-3.0](LICENSE)
- Données produites : ODbL (comme OSM)
- Documentation : CC-BY-SA 4.0
