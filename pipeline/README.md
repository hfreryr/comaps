# Pipeline — fraîcheur des lieux

Repère les lieux d'OpenStreetMap (commerces, restaurants, services…) qui ont peut-être fermé, en les confrontant à [Overture Maps](https://overturemaps.org).

## Lancer

```bash
pip install -r requirements.txt
curl -o data/paris.osm.pbf https://download.openstreetmap.fr/extracts/europe/france/ile_de_france/paris.osm.pbf
python pipeline/run.py --arrondissement 6
```

Résultats dans `data/out/` :

| Fichier | Contenu |
|---|---|
| `arrN_candidats.csv` | Tous les lieux OSM de l'arrondissement, avec signaux et niveau |
| `arrN_carte.html` | Carte des lieux à vérifier |
| `arrN_verification.csv` | 50 lieux tirés au hasard, à vérifier sur le terrain |
| `arrN_verification_cle.csv` | Niveau de signal de chaque lieu de l'échantillon — **à ouvrir seulement après la vérification** |

## Méthode

Pour chaque lieu OSM, on cherche un lieu Overture à moins de 75 m avec un nom proche (similarité ≥ 80/100).

| Niveau | Signal | Logique |
|---|---|---|
| **Fort** | Overture connaît le lieu mais doute de son existence (score < 0,4), ou le dit fermé | Indice positif de disparition |
| **Faible** | Aucun lieu correspondant dans Overture | Peut aussi venir d'un trou dans Overture ou d'un nom différent |

Aucun signal ne suffit seul. Aucune modification d'OSM n'est faite.

## Premiers résultats — Paris 6e (12 octobre 2026)

- OSM (extrait du 11/10/2026) : **2 915** lieux nommés
- Overture (version 2026-09-23.1) : **5 066** lieux
- **76** signaux forts (2,6 %) · **931** signaux faibles (32 %)

### ⚠️ Constat : `operating_status` est quasi vide
Seuls **11 lieux Overture sur 5 066** ont un statut d'ouverture renseigné, dont 2 fermés. L'hypothèse de départ (« Overture sait ce qui est fermé ») ne tient pas dans le 6e. Le pipeline s'appuie donc sur le **score d'existence** d'Overture et sur l'**absence** de correspondance.

### Étape suivante
Vérifier sur le terrain les 50 lieux de la fiche pour mesurer la fiabilité réelle de chaque niveau.

## Sources et licences
- OpenStreetMap © contributeurs OSM, ODbL
- Overture Maps : licences par source (voir le champ `sources` des données)
