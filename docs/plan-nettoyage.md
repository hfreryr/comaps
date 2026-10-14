# Plan de nettoyage : tests, sécurité, rangement, textes

Décidé le 14/10/2026 avec le porteur du projet : nettoyer **maintenant**, avant d'ajouter d'autres fonctions.
Chaque session (Claude, Le Koala ou un repreneur) reprend ce plan là où il s'est arrêté et coche les cases.
Durées : estimations de temps de travail, pas des mesures.

**Règles pour toute la durée du plan**
- L'app reste en ligne et fonctionne après chaque étape. Une étape = un ou plusieurs commits, publiés par `bash app/scripts/publish.sh`.
- Rien ne doit changer pour l'utilisateur pendant les étapes 1, 3 et 4.
- Vérification à chaque étape :
  - tests automatiques (`npm run e2e`, plus les tests unitaires dès l'étape 1) ;
  - captures d'écran avant/après comparées pixel par pixel ;
  - une ligne dans le README pour ce qui change.

---

## Étape 0 : règles permanentes (15 min)
- [x] Ajouter à `CLAUDE.md` :
  - toute nouvelle fonction de l'app va dans son propre fichier (`src/lib/ui/` pour l'écran, `src/lib/` pour la logique), jamais dans `+page.svelte` ;
  - toute nouvelle fonction arrive avec son test ;
  - tout nouveau texte affiché va dans le fichier de textes (dès l'étape 4).
- [x] Ranger le script de captures avant/après dans le dépôt (`app/tests/visual/`). Il vivait jusqu'ici dans un dossier temporaire.

## Étape 1 : tests (2 à 3 h)
Aujourd'hui : 6 tests de bout en bout (fiche lieu, adresse, « restaurant ce soir 8e », liste de catégorie, transports, rechargement de liste). **Aucun test unitaire.** Le pipeline Python n'a **aucun test**, alors que `CLAUDE.md` en exige pour la logique de comparaison.

**Tests unitaires** (lanceur intégré de Node, `node --test` : aucune dépendance ajoutée)
- [x] `hours.js` : ouvert / fermé / ouvre à, jours fériés, horaires après minuit.
- [x] `intent.js` et `categories.js` : « restaurant ce soir 8e », « métro le plus proche »…
- [x] `myplaces.js` : empaquetage et dépaquetage d'une liste partagée, sauvegarde chiffrée et non chiffrée, fusion.
- [x] `importgoogle.js` : un fichier d'export Google Maps type.
- [x] `routeview.js`, `rame.js` (sortie la plus proche), `placestore.js` (calcul des tuiles).

**Tests de bout en bout à ajouter**
- [x] Mes lieux : ajouter un favori, créer, renommer et supprimer une liste, épingler.
- [x] Sauvegarde puis restauration, avec et sans mot de passe.
- [x] Ouvrir un lien de liste partagée, ouvrir un lien de transfert.
- [x] Raccourcis Maison et Travail, personnalisation des raccourcis.
- [x] Fiche d'une station : prochains passages, sorties.
- [x] Guidage : démarrer puis terminer.
- [x] Mode sombre et grand écran (captures).

**Bug trouvé par ces tests et corrigé** : dans Mes lieux, le champ « Nouvelle liste… » faisait 0 pixel de large (un style destiné aux lignes de listes s'appliquait aussi au bouton « Créer »). Il était impossible de créer une liste depuis l'accueil de Mes lieux.

**Pipeline**
- [x] Tests `pytest` de `pipeline/compare.py` sur un petit jeu de données fixe.

## Étape 2 : sécurité (2 à 4 h)
Surface d'attaque réduite (site statique, ni serveur, ni comptes, données sur le téléphone), mais :
- [ ] **Politique de sécurité du contenu (CSP)** dans la page : n'autoriser que nos fournisseurs documentés (OpenFreeMap, Photon, Géoplateforme, Valhalla, Transitous, Wikimedia, Panoramax). Vérifier ensuite que tous les parcours marchent.
- [ ] **Liens entrants** (`#liste=`, `#transfert=`, `#lieu=`) et **fichiers importés** (sauvegarde, export Google) : limiter la taille, vérifier la forme, refuser ce qui est inattendu. Tester avec des données piégées.
- [ ] **Liens sortants** venus d'OSM (site web, téléphone) : n'accepter que `https:`, `http:` et `tel:`.
- [ ] **Actions GitHub** :
  - désigner `actions/checkout` et `actions/setup-python` par leur empreinte, plus par `@v4` / `@v5` ;
  - réduire les permissions au strict nécessaire ;
  - vérifier ce qui est téléchargé (extrait OSM, Panoramax).
- [ ] **Dépendances** : `npm audit` (0 faille le 14/10), versions figées, contrôle régulier.
- [ ] **Côté porteur du projet** (je ne peux pas le faire) :
  - [ ] double authentification sur le compte GitHub ;
  - [ ] double authentification et verrou de transfert chez le registraire de `untrackedmaps.app` ;
  - [ ] protection de la branche `main` (pas de suppression, pas de réécriture d'historique).
- [ ] Page « Qui voit quoi » : y ajouter une ligne « Sécurité » (ce qui est protégé, comment signaler une faille).

## Étape 3 : rangement du code (4 à 6 h)
Déjà fait le 14/10 :
- fiche itinéraire (`ui/RouteSheet.svelte`) ;
- guidage (`ui/NavView.svelte`) ;
- couches de carte (`maplayers.js`) ;
- styles partagés (`ui/base.css`).

Le fichier principal est passé de 3 770 à 3 340 lignes.
- [ ] **État commun** : regrouper les données de l'app (lieu ouvert, catégorie, itinéraire, Mes lieux…) dans `src/lib/state.svelte.js`. Chaque partie de l'écran le lit au lieu de tout recevoir de la page.
- [ ] Sortir la **fiche lieu** (`ui/PlaceSheet.svelte`, avec la fiche station).
- [ ] Sortir **Mes lieux** (accueil, listes, sauvegarde, transfert, import).
- [ ] Sortir la **recherche** (barre, résultats, raccourcis).
- [ ] Sortir la **visionneuse** de photos et de vue de la rue.
- [ ] Objectif : `+page.svelte` sous 800 lignes, réduit à la carte et à l'assemblage.

## Étape 4 : textes à part (3 à 4 h)
- [ ] Un fichier de textes français (`src/lib/i18n/fr.js`) et une fonction d'accès. Tous les textes affichés y passent, accords (pluriels) compris.
- [ ] Un test qui échoue si un texte affiché n'est pas dans le fichier.
- [ ] Pas de traduction pour l'instant : la question se posera si l'on vise un lancement hors de France.

---

## Suivi
| Étape | État | Date |
|---|---|---|
| 0. Règles | fait (proposition de changement) | 14/10 |
| 1. Tests | fait : 39 tests unitaires, 12 de bout en bout, 5 pipeline ; un bug trouvé et corrigé | 14/10 |
| 2. Sécurité | à faire | |
| 3. Rangement | commencé (3 parties sorties) | 14/10 |
| 4. Textes | à faire | |
