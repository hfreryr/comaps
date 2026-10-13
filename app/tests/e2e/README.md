# Tests de bout en bout

`npm run e2e` construit rien : lancer `npm run build` d'abord. Le script sert `build/` en local, ouvre Chromium (Playwright) et vérifie les parcours clés : fiche lue dans les tuiles sans Overpass, adresse via Géoplateforme, « restaurant ce soir 8e », devantures, transports avec sortie conseillée, rechargement de la liste au déplacement.

Les tests appellent les vrais services publics : à lancer à la main avant une publication, pas en intégration continue. Chromium : `npx playwright install chromium` la première fois.
