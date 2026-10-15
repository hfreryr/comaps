# Chantier « horaires manquants » (15/10/2026)

Retour des tests (P1, P4) : « beaucoup de fiches sans horaires ». Mesuré dans nos données (extrait OSM de Paris du 15/10) :

| Restaurants, cafés, bars, boulangeries | Nombre | Part |
|---|---|---|
| Total | 19 104 | 100 % |
| **Sans horaires** | **9 996** | **52 %** |
| … dont avec un site web dans OSM | 927 | 5 % du total, **9 % des lieux sans horaires** |
| … dont avec un téléphone | 1 785 | 9 % |

**Conséquence** : lire les horaires sur les sites des commerçants (la piste prévue : Playwright + modèle local 7-8B) ne comblerait au mieux que 9 % du manque. Ce n'est pas le levier principal.

## Trois voies, par ordre d'impact attendu

1. **Demander aux utilisateurs, dans la fiche** (le levier le plus fort, et la promesse du projet) : sur une fiche sans horaires, une micro-question « Vous connaissez les horaires ? » ; sur une fiche avec horaires anciens, « Toujours ouvert le dimanche ? ». Réponse en 3 secondes, envoyée à OSM **par le compte OSM de l'utilisateur**, après l'annonce à la communauté (forum France, 2 semaines avant, voir `contribution-osm.md`). Mesure attendue : dépend de l'usage ; P4 « oui, mais sans compte », P3 « non » → la question doit être possible sans créer de compte (une **note OSM** anonyme, que des contributeurs reprennent, est la seule voie sans compte).
2. **Sites web trouvés ailleurs** : Overture Maps donne souvent un site ou un réseau social pour un lieu. Overture ne sert alors qu'à **trouver l'adresse du site** ; les horaires viennent du site du commerçant. ⚠️ À vérifier avant : licence d'Overture Places (CDLA-Permissive 2.0 annoncée, à relire) et position de la communauté OSM sur l'usage des sites officiels comme source d'horaires (*non vérifié*).
3. **Sites web présents dans OSM (927 lieux)** : extraction en deux temps, d'abord les données structurées que beaucoup de sites publient déjà (balises `openingHours` de schema.org, sans modèle de langue), puis le modèle local 7-8B pour le reste. Résultat = **candidats**, jamais une modification : chaque horaire proposé est vérifié par une personne avant d'aller dans OSM (règle du projet).

## Ce qui ne bouge pas
- Aucune modification automatique d'OSM, aucun import (règles du projet).
- Rien de Google.
- Le résultat publié dans l'app reste ce qu'il y a dans OSM ; un horaire « candidat » n'est pas affiché comme vérifié.

## Proposition d'ordre
1. Mesurer la voie 3 sur un échantillon de 100 sites (part avec schema.org, part lisible par le modèle) : un script dans `pipeline/`, lancé par GitHub (le serveur de développement ne peut pas joindre les sites des commerçants).
2. Rédiger l'annonce au forum OSM France pour la voie 1 (micro-question), puisque c'est elle qui compte le plus, et la mise en relecture de 2 semaines.
3. Vérifier licence et usages pour la voie 2.

## Mise à jour du 15/10 (soir)

- Décision du porteur : **ne compter sur aucune contribution** pour le prototype ; toutes les sources ouvertes au coût faible sont à prendre.
- Mesures de toutes les sources : [`sources-donnees.md`](sources-donnees.md). Overture **n'a pas d'horaires**, mais donne des sites web : les restos sans horaires avec un site passent de 927 à 4 316, dont ≈ 32 % affichent leurs horaires en page d'accueil.
- L'annonce au forum du 13/10 couvre déjà les questions sur place avec compte OSM (à partir du 27/10). Un compte partagé pour tous les utilisateurs est exclu (précédent de Bing Map Builder, bloqué ; règle du projet). Les notes OSM anonymes n'ajoutent rien tant qu'un bénévole ne les traite pas.
