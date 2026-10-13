# Valhalla ou MOTIS pour la voiture, le vélo et la marche ? (mesuré le 13/10/2026)

**Pourquoi** : en P2 on installe nos propres serveurs. MOTIS (déjà nécessaire pour les transports) sait aussi calculer voiture, vélo et marche. Si il suffisait, on aurait un seul moteur au lieu de deux.

**Méthode** : 10 trajets dans Paris × 3 modes, même départ et arrivée, serveurs publics (Valhalla FOSSGIS, MOTIS Transitous), 1 requête par seconde.
Script : `app/scripts/compare_engines.py` · données brutes : `docs/mesures/valhalla-motis-2026-10-13.json`.

| Mode | Durée médiane Valhalla / MOTIS | Itinéraires de rechange (moy.) | Tracés communs (médiane) | Étapes (médiane) | Réponse (médiane) |
|---|---|---|---|---|---|
| Voiture (9 trajets*) | 21 / 12 min | 1,9 / **0** | 22 % | 13 / 229 | 0,6 / 1,5 s |
| Vélo | 25 / 27 min | 1,5 / **0** | 50 % | 19 / 225 | 0,7 / 0,9 s |
| Marche | 77 / 84 min | 1,7 / **0** | 63 % | 86 / 409 | 0,8 / 1,0 s |

\* MOTIS n'a pas trouvé de trajet voiture Montmartre → Place d'Italie.

## Ce qui est établi
- **MOTIS ne propose qu'un itinéraire** (aucune alternative) : on perdrait les choix « 7 min / 8 min » de l'écran itinéraire.
- **MOTIS ne donne pas de consignes rédigées** (« Tournez à gauche rue du Four ») : seulement une direction relative par tronçon (`CONTINUE`, `LEFT`…), plus de 200 tronçons par trajet. Il faudrait écrire nous-mêmes la fusion des tronçons et le texte en français ; Valhalla le fournit.
- **En voiture, les deux moteurs ne prennent pas le même chemin** (22 % du tracé en commun) et MOTIS annonce des durées ~40 % plus courtes.

## Ce qui n'est pas établi
- **Lequel a raison en voiture.** Il faut une référence : des trajets mesurés (ou relevés dans Google Maps, permis pour comparer, rien n'en est publié). C'est la « grille Google » à remplir.

## Décision proposée
Garder **Valhalla pour voiture, vélo et marche**, **MOTIS pour les transports** : deux moteurs en P2. Raison suffisante sans trancher la question des durées : alternatives et consignes en français sont des fonctions de l'app que MOTIS ne fournit pas.
