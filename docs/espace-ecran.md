# Place laissée à la carte, étape par étape (enquête du 14/10/2026)

## Mesures

**Untracked** : écran de 390 × 844 points (taille d'un iPhone), Chromium, sans les barres de Safari. Le script `esp.mjs` (hors dépôt) relève le bas des éléments posés en haut de l'écran et le haut de la fiche.
**Références** : captures d'écran iPhone envoyées par le porteur du projet, mesurées en proportion de la hauteur.

| Étape | Untracked : carte visible | Référence |
|---|---|---|
| Accueil | 86 % | — |
| Recherche en cours | 45 % (liste de résultats) | — |
| Fiche lieu (ouverte à mi-hauteur) | **40 %** | ❓ pas de capture de référence |
| Liste d'une catégorie (aperçu) | 68 % | — |
| Itinéraire | **31 %** dans Chromium ; **18 %** sur la capture iPhone/Safari | Plans **≈ 43 %** · Google Maps **≈ 48 %** |

Sur la capture iPhone, Untracked occupe :
- en haut : 33 % de l'écran (carte départ/arrivée sur 3 lignes, puis rangée de pastilles des modes posée sur la carte) ;
- en bas : la fiche à partir de 51 %, puis la barre de Safari (dernier 10 %).

## Ce que font les références (d'après les captures)

**Plans**
- Rien en haut de l'écran.
- La fiche contient tout :
  - titre « Itinéraire » ;
  - modes en ligne d'icônes ;
  - départ, arrivée et « Ajouter un arrêt » ;
  - un seul résumé (29 min · arrivée · distance) avec le bouton « Aller ».
- Les autres itinéraires sont des **étiquettes sur la carte** (« 30 min, Moins d'émissions »).

**Google Maps**
- En haut : départ et arrivée sur **2 lignes**. L'ajout d'étape est passé dans la fiche (« Ajouter des étapes »).
- Les **modes sont des onglets dans la fiche**, chacun avec son temps.
- La fiche montre **un seul résumé** (43 min, arrivée, distance, « via », escaliers) avec « Démarrer ».
- Les autres itinéraires sont des **étiquettes de temps sur la carte**.
- Textes et boutons plus petits que les nôtres.

**Points communs**
- Un seul itinéraire décrit dans la fiche ; les autres sur la carte.
- Pas de rangée de boutons flottants au-dessus de la carte.

## Propositions (à valider avant de coder)

1. **Écran itinéraire** (gain attendu : de 18 % à ≈ 45 % de carte sur iPhone)
   - En haut : départ et arrivée sur 2 lignes, plus compactes. « Ajouter un arrêt » passe dans la fiche.
   - Les modes deviennent des onglets avec leur temps, en tête de fiche. Plus de pastilles flottantes.
   - La fiche s'ouvre sur **le résumé de l'itinéraire choisi** : temps, arrivée, distance, « via », bouton Aller.
   - Les variantes sont des étiquettes de temps sur la carte, à toucher pour choisir. On les retrouve aussi en liste en tirant la fiche vers le haut.
   - En transport : même principe. La proposition choisie est en résumé ; les autres et les étapes s'affichent en tirant la fiche.
2. **Barre de catégories masquée** quand une fiche lieu ou un itinéraire est ouvert : elle ne sert pas à ce moment-là.
3. **Densité générale** : textes secondaires, marges et boutons ramenés vers les tailles de Google Maps. Une seule échelle de tailles pour toute l'app, pas des retouches au cas par cas.
4. **Fiche lieu** : l'ouvrir plus bas (nom, état, boutons), pas à mi-hauteur. *À confirmer avec une capture d'une fiche lieu dans Google Maps ou Plans.*

## Résultat (14/10/2026, mêmes mesures dans Chromium 390 × 844)

| Étape | Avant | Après |
|---|---|---|
| Itinéraire (à pied, en transport) | 31 % | **65 %** |
| Fiche lieu | 40 % | **47 %** (raccourcis masqués) |
| Liste d'une catégorie | 68 % | 69 % |
| Accueil | 86 % | 87 % |

Propositions 1, 2 et 3 appliquées.

Proposition 4 (ouvrir la fiche lieu plus bas) : **abandonnée après mesure.** Captures du 14/10, fiche telle qu'elle s'ouvre en touchant un lieu :

| | Haut de la fiche | Hauteur de la fiche | Carte visible |
|---|---|---|---|
| Plans | 56 % de l'écran | 44 % | ≈ 50 % (rien en haut) |
| Google Maps | 53 % | 47 % | ≈ 40 % (barre de recherche en haut) |
| Untracked (Chromium) | 54 % | 46 % | 47 % |

Notre hauteur d'ouverture est donc la même que celle des références. Ce que montrent leurs fiches à l'ouverture : nom, type, état, boutons, puis une bande d'infos (Plans) ou « Bon à savoir » (Google), puis des photos.

Constat utile, vu sur les deux captures : **une vignette de vue de la rue posée sur la carte**, en bas à gauche, juste au-dessus de la fiche (jumelles « Look Around » chez Apple, Street View chez Google). C'est l'emplacement naturel de nos photos de devanture Panoramax, au lieu d'une section dans la fiche. → proposition 5.

## Hors de notre main
La barre de Safari prend environ 10 % de l'écran. L'app installée sur l'écran d'accueil la supprime, mais la localisation y est bloquée par un bug d'iOS 26/27.
