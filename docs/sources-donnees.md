# Sources ouvertes pour compléter les lieux (mesure du 15/10/2026)

Décision du porteur du projet (15/10) : le prototype doit être le plus complet possible **sans contribution des utilisateurs** ; toute source au coût d'intégration faible est bonne à prendre.

Mesures faites sur l'extrait OSM de Paris (73 441 lieux nommés), scripts dans `pipeline/mesures_sources/` (`bash pipeline/mesures_sources/run.sh`). Appariement simple : même enseigne à 80 m ou mots du nom en commun à 50 m. Contrôle à l'œil de 15 paires par source : ≈ 13/15 justes pour Overture, ≈ 11/15 pour All The Places (erreurs dues aux parkings, retirés du compte ci-dessous).

## Point de départ

| Lieux OSM à Paris | Total | Sans horaires |
|---|---|---|
| Restaurants, cafés, bars, restauration rapide | 17 412 | 9 343 |
| Commerces | 28 861 | 14 389 |
| Parcs | 605 | 508 |
| Médecins, dentistes | 681 | 468 |
| Pharmacies | 976 | 268 |

## Ce que chaque source apporte

| Source | Licence | Apport mesuré | Coût d'intégration |
|---|---|---|---|
| **Overture** (sites et téléphones) | CDLA-Permissive 2.0, mention « © Overture Maps Foundation » | **14 597 sites** et **17 420 téléphones** pour des lieux OSM qui n'en ont pas ; fait passer les restos sans horaires *qui ont un site* de 927 à **4 316**. ⚠️ Overture **n'a pas de champ horaires** (vérifié dans le schéma de la version 2026-09-23.1). Statut « fermé » : 1 seul lieu à Paris, inutilisable. | Faible : DuckDB est déjà dans le pipeline, lecture par HTTPS |
| **Sites des commerçants** (horaires) | Faits non protégés ; à afficher avec la source (« selon le site du lieu ») | Échantillon de 200 sites (plateformes exclues) : 114 joignables depuis notre environnement, dont **36 (32 %) affichent les horaires sur la page d'accueil**, 24 en données structurées (schema.org). Extrapolé : **≈ 700 à 1 100 restos**, soit 8 à 12 % du manque | Moyen : passage hebdomadaire poli (≈ 3 800 sites), lecture schema.org puis des textes (règles simples d'abord, modèle local ensuite) |
| **All The Places** (sites des enseignes) | CC0 | **378 horaires** (266 par enseigne, 112 par nom), 980 sites, 1 787 téléphones. Lieux sans correspondance dans OSM : 2 267 commerces, 496 banques… (appariement faible : borne haute, à vérifier) | Faible à moyen : 2,7 Go par semaine dans GitHub Actions |
| **Ville de Paris** (« îlots de fraîcheur » : parcs, piscines, musées, bibliothèques) | ODbL | **345 parcs et squares** et **39 équipements** (25 piscines) ; horaires mis à jour par la Ville, y compris les horaires d'été | Faible : 2 fichiers JSON |
| **Annuaire de l'administration** (service-public.fr) | Licence Ouverte 2.0 | 389 services parisiens avec horaires (PMI, CPAM, commissariats, France Services, mairies…), **56 gagnés** avec l'appariement actuel (jusqu'à ≈ 150 en l'améliorant) | Faible |
| **La Poste** (horaires jour par jour) | ODbL | 18 bureaux de poste seulement sans horaires dans OSM ; intérêt : fermetures exceptionnelles | Faible ; non mesuré (data.gouv.fr injoignable depuis notre environnement) |
| **Foursquare OS Places** | Apache 2.0 | Pas d'horaires ; une date de fermeture (utile pour les commerces fermés) | ⛔ Compte et jeton d'accès nécessaires sur le portail Foursquare (l'ancien accès public a été fermé) |

## Ce que ça donne au total

- **Horaires** : ≈ 1 500 à 1 900 lieux de plus, dont ≈ 800 à 1 200 restos et cafés. Ça réduit le manque, ça ne le comble pas : **aucune source ouverte ne couvre les restaurants indépendants**.
- **Sites et téléphones** : la plus grosse avancée (≈ 15 000 à 17 000 lieux), et la condition pour aller lire les horaires sur les sites.
- **Lieux absents d'OSM** : Overture compte 6 261 restos et cafés (confiance ≥ 0,8) sans correspondance dans OSM. Chiffre **non fiable** en l'état (variantes de nom, lieux fermés) : à contrôler sur un échantillon avant toute idée d'affichage.

## Règles qui ne bougent pas

- Rien de ces sources n'entre dans OSM (pas d'import, pas de modification automatique).
- Dans l'app, une donnée qui ne vient pas d'OSM est **affichée avec sa source** (« Horaires selon le site du lieu », « Téléphone : Overture ») ; elle n'est jamais présentée comme vérifiée.
- Données préparées chaque nuit ou chaque semaine dans les tuiles de lieux, jamais demandées lieu par lieu depuis le téléphone.
- Rien de Google, ni des plateformes (TheFork, Tripadvisor, Uber Eats, Deliveroo, Pages Jaunes, Instagram, Facebook) : exclues des sites lus.

## Ordre proposé

1. Overture : sites et téléphones (gain le plus gros, coût le plus faible).
2. Ville de Paris : parcs et piscines.
3. All The Places et annuaire de l'administration.
4. Sites des commerçants : données structurées d'abord, textes ensuite.

Décision attendue du porteur : afficher dans l'app des informations qui ne viennent pas d'OSM, avec leur source (condition de tout ce qui précède).
