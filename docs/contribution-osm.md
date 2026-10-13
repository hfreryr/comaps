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

## 3. Message d'annonce pour le forum OSM France

*Annonce (pas une demande d'autorisation) : les Organised Editing Guidelines demandent de prévenir au moins 2 semaines avant ; le silence vaut accord. À publier dans la catégorie France de community.openstreetmap.org.*

> **Titre : Untracked Maps — annonce : questions de vérification sur place à Paris (6e)**
>
> Bonjour,
>
> Je porte bénévolement **Untracked Maps** (untrackedmaps.app), une carte web grand public construite sur OSM, sans pistage, code sous AGPL-3.0. Notre public ne connaît pas OSM ; nous voulons qu'il y contribue proprement.
>
> **Ce qui arrivera, au plus tôt dans deux semaines :** dans la fiche d'un lieu, une question courte sur ce que la personne voit sur place (« Ce commerce existe-t-il toujours ? », « Ouvert le dimanche ? »…). La modification part **avec le compte OSM de la personne**, signée `created_by=Untracked Maps` et `#untrackedmaps`.
>
> **Nous reprenons les pratiques existantes** :
> - [Good practice](https://wiki.openstreetmap.org/wiki/Good_practice) : on cartographie ce qu'on voit sur place, et rien n'est copié d'autres cartes (l'app le rappelle) ;
> - [les règles des quêtes StreetComplete](https://github.com/streetcomplete/StreetComplete/blob/master/CONTRIBUTING_A_NEW_QUEST.md) : questions courtes, une information à la fois, `check_date` mis à jour quand la réponse confirme l'existant ;
> - [Organised Editing Guidelines](https://osmfoundation.org/wiki/Organised_Editing_Guidelines) : page wiki publique, bilan mensuel.
>
> Aucune modification automatique ni aucun import. Nous démarrons sur le 6e arrondissement uniquement.
>
> Remarques, critiques et envies de relire les premières modifications sont bienvenues ici ou à [contact].
>
> Guy

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
