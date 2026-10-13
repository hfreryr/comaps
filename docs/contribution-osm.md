# Contribuer à OpenStreetMap depuis Untracked Maps

*Brouillon du 13/10/2026 — à valider par le porteur du projet avant toute publication.*

## 1. Les règles qui s'appliquent (vérifiées le 13/10/2026)

| Règle | Ce qu'elle impose | Nous concerne ? |
|---|---|---|
| [Copyright OSM](https://wiki.openstreetmap.org/wiki/Copyright) | « Do not use data from copyrighted maps or any other proprietary data! » | **Oui, toujours.** Aucune info tirée de Google Maps ne doit entrer dans OSM, même recopiée à la main par un utilisateur. |
| [Organised Editing Guidelines](https://osmfoundation.org/wiki/Organised_Editing_Guidelines) (OSMF, 2018) | Annonce publique au moins 2 semaines avant ; page wiki listée dans *Organised Editing/Activities* ; hashtag dans les commentaires de modification ; plan de vérification des modifs des nouveaux contributeurs. Pas d'autorisation formelle : le silence vaut accord, mais une critique justifiée ignorée peut entraîner l'arrêt et l'annulation. | **Probablement**, dès qu'on *pousse* nos utilisateurs à modifier (micro-questions, campagnes). Le texte ne tranche pas pour les apps ; il dit « en cas de doute, contactez la communauté locale ». On applique donc ces règles. |
| [Automated Edits code of conduct](https://wiki.openstreetmap.org/wiki/Automated_Edits_code_of_conduct) | Pour toute modification faite « sans revue individuelle par la personne qui la contrôle » : page wiki, discussion sur le forum, compte dédié, `mechanical=yes`, démarrage sur un petit nombre. | **Non**, tant que chaque modification est confirmée par une personne. **Oui** si le pipeline écrivait lui-même → on s'interdit ce cas. |
| [Import/Guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines) | Processus d'import complet, vérification de licence. | **Non**, on n'importe rien (Overture sert à repérer, pas à écrire). |
| [Politique d'usage de l'API](https://operations.osmfoundation.org/policies/api/) | User-Agent identifiant l'app ; l'API d'édition **n'est pas faite pour la lecture seule** ; discuter avec les administrateurs au préalable. | **Oui.** ⚠️ Aujourd'hui, la fiche lieu *lit* les détails via cette API : à remplacer par une source de lecture. |

## 2. Principes retenus pour Untracked Maps

1. **Une personne confirme chaque modification**, avec son propre compte OSM (connexion OAuth 2.0 depuis l'app, sans serveur).
2. **Le pipeline ne modifie jamais OSM.** Il repère les lieux douteux ; l'app pose la question aux gens qui sont sur place.
3. **Les questions portent sur ce qu'on constate sur place** (« Ce lieu est-il ouvert ? », « Ouvert le dimanche ? »), jamais sur ce qu'on lit ailleurs. L'app rappelle de ne pas recopier Google Maps.
4. **Transparence** : modifications signées `created_by=Untracked Maps <version>` et hashtag `#untrackedmaps` ; page wiki publique ; contact joignable.
5. **Prudence** : démarrage limité au 6e arrondissement, petit nombre de questions, revue des premières modifications avec la communauté.
6. **Opt-out** : un contributeur OSM peut demander qu'on ne pose plus de questions sur un lieu ou un type de donnée.

## 3. Brouillon du message pour le forum OSM France

*À publier dans la catégorie France de community.openstreetmap.org, au moins 2 semaines avant d'ouvrir la contribution dans l'app.*

> **Titre : Untracked Maps — une app de carte grand public qui invite ses utilisateurs à vérifier les lieux sur place (avis bienvenus)**
>
> Bonjour à toutes et à tous,
>
> Je m'appelle Guy, je porte bénévolement **Untracked Maps** (untrackedmaps.app), une carte web grand public pour Paris, construite sur OSM : tuiles OpenFreeMap, recherche Photon, itinéraires Valhalla et Transitous. Le code est sous AGPL-3.0. L'app ne collecte aucune donnée personnelle et n'utilise aucune mesure d'audience.
>
> Notre public : des gens qui n'ont jamais entendu parler d'OSM et qui veulent quitter Google Maps. Nous aimerions qu'une partie d'entre eux deviennent contributeurs, **sans dégrader la qualité des données ni charger les bénévoles**. Avant d'écrire la moindre ligne de code d'édition, nous voulons votre avis.
>
> **Ce que nous envisageons**
> - Dans la fiche d'un lieu, une question courte sur ce que la personne voit sur place, par exemple : « Ce commerce est-il toujours ouvert ? », « Ouvert le dimanche ? », « Accessible en fauteuil ? ». Réponse en un geste, à la manière de StreetComplete.
> - La modification part **avec le compte OSM de la personne** (OAuth), jamais avec un compte de l'app. Elle est signée `created_by=Untracked Maps` et porte le hashtag `#untrackedmaps`.
> - Une réponse « c'est bien ça » met à jour `check_date`. C'est l'info que nous affichons en tête de fiche (« Infos vérifiées en sept. 2026 »).
> - Les lieux à vérifier en priorité sont repérés en croisant OSM avec Overture Maps (lieux absents ou au score faible). **Ce croisement ne modifie jamais OSM** : il sert seulement à choisir à qui poser quelle question.
>
> **Garde-fous prévus**
> - Pas de modification automatique, pas d'import.
> - Rappel explicite : on indique ce qu'on constate sur place, on ne recopie pas Google Maps.
> - Démarrage limité au 6e arrondissement, avec un petit nombre de types de questions.
> - Page wiki publique (*Organised Editing/Activities*) avec contact, objectifs, questions posées et bilan mensuel.
> - Revue des premières modifications avec celles et ceux d'entre vous qui le souhaitent, et possibilité de demander l'arrêt d'une question.
>
> **Nos questions**
> 1. Quelles questions vous semblent utiles, et lesquelles risquent de produire des données de mauvaise qualité ?
> 2. Pour un lieu signalé fermé : faut-il modifier directement (`disused:shop=*`…), ou créer une note pour qu'un contributeur confirmé tranche ?
> 3. Y a-t-il des personnes à Paris prêtes à relire les premières modifications ?
>
> Merci d'avance pour vos retours, même critiques.
>
> Guy — contact : [à compléter]

## 4. Page wiki (à créer après le retour du forum)

Titre proposé : `Organised Editing/Activities/Untracked Maps`. Contenu requis par les lignes directrices :
- coordinateur et contact ;
- hashtag `#untrackedmaps` ;
- objectif et raison ;
- calendrier ;
- outils (Untracked Maps, code source) et sources (aucune donnée externe copiée ; Overture sert seulement à choisir les questions) ;
- mesures de réussite : nombre de lieux vérifiés, calculé depuis les données publiques d'OSM ;
- instructions données aux utilisateurs (textes des questions) ;
- plan de vérification des modifications des nouveaux contributeurs ;
- bilan mensuel.

## 5. Étapes

1. ☐ Porteur : créer un compte OSM pour le projet (contact public).
2. ☐ Porteur : relire puis publier le message du forum.
3. ☐ Attendre au moins 2 semaines et intégrer les retours.
4. ☐ Créer la page wiki.
5. ☐ Enregistrer l'app sur openstreetmap.org (OAuth 2.0, client public).
6. ☐ Coder les micro-questions (6e arrondissement seulement).
7. ☐ Bilan avec la communauté après le premier mois.
