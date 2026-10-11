# A designer for CoMaps

Projet indépendant au service de l'app libre [CoMaps](https://www.comaps.app). Nous ne sommes pas l'équipe CoMaps.

**Ville pilote : Paris** (vérifications terrain d'abord sur un arrondissement).

Rendre les cartes libres basées sur OpenStreetMap (OSM) **aussi fiables et aussi agréables** que Google Maps.

## Deux chantiers

### 1. 🔍 Fraîcheur des lieux (`pipeline/`)
Repérer automatiquement les lieux d'OSM qui ne sont plus à jour — en commençant par les **commerces fermés** — en comparant OSM avec [Overture Maps](https://overturemaps.org).

- Aucune modification automatique d'OSM sans accord préalable de la communauté.
- Toute amélioration repart dans OSM : toutes les apps libres en profitent.

### 2. 🎨 Labo design (`design/`)
Concevoir et tester une expérience à la hauteur de Google Maps, d'abord sur le parcours **« faire un itinéraire »**.

- Prototypes testés avec de vrais utilisateurs, comparés à Google Maps.
- Les améliorations sont proposées à l'app libre [CoMaps](https://www.comaps.app) plutôt que de créer une app concurrente.

## Feuille de route

| Étape | Objectif | Réussite si… |
|---|---|---|
| 0. Installation | Dépôt prêt | Premier script exécuté |
| 1. Cadrage | Ville : Paris ✅ — choisir l'arrondissement de test | Périmètre écrit ici |
| 2. Détection | Lister les lieux fermés selon Overture mais présents dans OSM | Liste reproductible + carte |
| 3. Mesure | Vérifier 30 à 50 cas sur le terrain | Taux de fiabilité chiffré |
| 4. Prototype itinéraire | Maquette interactive | Testée par 5 personnes face à Google Maps |
| 5. Contribution CoMaps | Proposer une amélioration codée | Réponse de l'équipe CoMaps |
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
