# Instructions pour Claude Code

## Avec qui tu travailles
**Le porteur du projet**, product designer et chef de projet, **non développeur**. Il pilote seul pour l'instant.
- Explique simplement ce que tu fais, sans jargon, et dis-lui comment vérifier le résultat.
- Avant toute tâche non triviale, propose un plan court et attends sa validation.
- Une tâche = une branche = une proposition de changement qu'il valide.
- Réponds en français.

## Le projet
Rendre les cartes libres basées sur OpenStreetMap (OSM) aussi fiables et agréables que Google Maps. Deux chantiers :

1. **`pipeline/`** (Python) — détecter les lieux OSM obsolètes, d'abord les commerces fermés, en comparant avec Overture Maps (`operating_status`) via DuckDB.
2. **`design/`** — prototypes d'interface, d'abord le parcours « faire un itinéraire », destinés à être proposés à l'app libre CoMaps.

Ville pilote : **Paris** ; vérifications terrain sur un arrondissement.
Nom du projet : **A designer for CoMaps** — projet indépendant, ne jamais se présenter comme l'équipe CoMaps.

Voir `README.md` pour la feuille de route.

## Règles non négociables
- **Ne jamais écrire dans OSM** (ni API d'édition, ni bot) sans accord explicite du porteur du projet **et** de la communauté OSM.
- **Ne jamais extraire de données de Google Maps** : illégal et contraire au projet. Les comparaisons avec Google se font à la main.
- **Aucune source seule ne suffit** à déclarer un lieu fermé : toujours garder la trace des signaux utilisés et leur niveau de confiance.
- **SIRENE** n'est qu'un générateur de candidats : délai pouvant atteindre 18 mois.
- **Pas de dépendance propriétaire** ni de service centralisé payant. Hébergement statique dès que possible.
- **Zéro pistage** : aucune donnée personnelle collectée, pas d'analytics.
- **Licences** : code AGPL-3.0, données ODbL, documentation CC-BY-SA 4.0. Vérifier la compatibilité de licence de toute nouvelle source de données avant de l'utiliser.

## Pratiques techniques
- Données brutes dans `data/` (ignoré par Git). Ne jamais enregistrer de gros fichiers dans le dépôt.
- Scripts reproductibles : une seule commande documentée pour tout relancer.
- Ajouter des tests pour la logique de comparaison.
- Garder le `README.md` à jour à chaque étape franchie.
- Préférer les outils simples et répandus (Python, DuckDB, MapLibre) à des choix exotiques.
- LLM local de 7-8B si un jour nécessaire (extraction d'horaires) ; le vrai goulot sera Playwright, pas le modèle.

## Design
- Test du couloir : quelqu'un qui n'a jamais entendu parler d'OSM doit comprendre en 5 secondes.
- La frugalité n'excuse jamais une expérience médiocre.
