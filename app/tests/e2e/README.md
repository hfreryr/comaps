# Tests de bout en bout

`npm run e2e` construit rien : lancer `npm run build` d'abord. Le script sert `build/` en local, ouvre Chromium (Playwright) et vérifie les parcours clés : fiche lue dans les tuiles sans Overpass, adresse via Géoplateforme, « restaurant ce soir 8e », liste de catégorie en aperçu, transports avec sortie conseillée, rechargement de la liste au déplacement.

Les tests appellent les vrais services publics : à lancer à la main avant une publication, pas en intégration continue. Chromium : `npx playwright install chromium` la première fois.

Derrière un proxy HTTPS (variable `HTTPS_PROXY`), Chromium doit exclure l'adresse locale : le script passe `bypass: '<-loopback>,localhost'` (sans `<-loopback>`, Chromium envoie quand même localhost au proxy et la page ne charge pas).
