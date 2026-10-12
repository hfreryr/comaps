# Instructions pour Claude Code

## Avec qui tu travailles
**Le porteur du projet**, product designer et chef de projet, **non développeur**. Il pilote seul pour l'instant.
- Explique simplement ce que tu fais, sans jargon, et dis-lui comment vérifier le résultat.
- Avant toute tâche non triviale, propose un plan court et attends sa validation.
- Une tâche = une branche = une proposition de changement qu'il valide.
- Réponds en français.

## Le projet
Rendre les cartes libres basées sur OpenStreetMap (OSM) aussi fiables et agréables que Google Maps. Deux chantiers :

1. **`app/`** (SvelteKit statique + MapLibre) — notre propre app web grand public, concurrente de Google Maps, branchée sur des moteurs libres existants (OpenFreeMap, Photon, puis Valhalla et Transitous). Public : le grand public inquiet de sa dépendance aux GAFAM, pas les militants du libre. Promesse : aussi bien que Google Maps, sans vous pister.
2. **`pipeline/`** (Python) — détecter les lieux OSM obsolètes (commerces fermés) en confrontant OSM à Overture Maps via DuckDB. Constat : `operating_status` d'Overture est quasi vide à Paris ; on s'appuie sur le score d'existence et l'absence.

Ville pilote : **Paris** (pipeline : 6e arrondissement).
Nom de code : **Projet Paris** (nom définitif en cours de choix ; finalistes Ruella, Clairue, Venelle).
Ne jamais se présenter comme lié à CoMaps ou à Cartes.app.

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
- Références visuelles : Google Maps et Plans d'Apple (sobriété, carte calme, lieux colorés par famille). S'en inspirer, ne jamais copier leurs icônes, logos ou éléments propres.
- Police système du téléphone ; aucune ressource chargée chez Google (pas de Google Fonts).
- Test du couloir : quelqu'un qui n'a jamais entendu parler d'OSM doit comprendre en 5 secondes.
- La frugalité n'excuse jamais une expérience médiocre.
