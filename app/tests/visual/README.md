# Captures avant/après

Pour vérifier qu'un changement ne modifie pas l'écran (rangement du code) ou ne modifie que ce qui est voulu.

```bash
cd app && npm run build
node tests/visual/capture.mjs /tmp/avant      # avant le changement
# … changement, puis npm run build
node tests/visual/capture.mjs /tmp/apres
python3 tests/visual/compare.py /tmp/avant /tmp/apres
```

Parcours capturés, en mode clair et sombre :
- recherche ;
- fiche lieu ;
- itinéraire en transport (aperçu et fiche dépliée) ;
- itinéraire en voiture ;
- écran d'itinéraire entier ;
- guidage ;
- liste de catégorie ;
- fiche ouverte depuis la liste ;
- sur grand écran : fiche lieu et itinéraire.

Les écarts dus aux heures et aux horaires en temps réel sont attendus.
