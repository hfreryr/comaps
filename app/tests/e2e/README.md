# Tests de bout en bout

`npm run e2e` construit rien : lancer `npm run build` d'abord. Le script sert `build/` en local, ouvre Chromium (Playwright) et vérifie les parcours clés :
- fiche lue dans les tuiles, sans Overpass ;
- adresse via Géoplateforme ;
- « restaurant ce soir 8e » ;
- liste de catégorie en aperçu ;
- Mes lieux (favori, nouvelle liste, renommer, supprimer) ;
- Maison et raccourcis personnalisés ;
- sauvegarde chiffrée puis restauration ;
- liens de liste partagée et de transfert (et lien abîmé) ;
- fiche de station ;
- guidage démarré puis terminé ;
- transports avec sortie conseillée ;
- rechargement de la liste au déplacement.

Un seul test : `E2E_ONLY=sauvegarde npm run e2e`.

Les tests appellent les vrais services publics : à lancer à la main avant une publication, pas en intégration continue. Chromium : `npx playwright install chromium` la première fois.

Derrière un proxy HTTPS (variable `HTTPS_PROXY`), Chromium doit exclure l'adresse locale : le script passe `bypass: '<-loopback>,localhost'` (sans `<-loopback>`, Chromium envoie quand même localhost au proxy et la page ne charge pas).
