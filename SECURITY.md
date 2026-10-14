# Sécurité

Untracked Maps est un site statique (GitHub Pages) : ni serveur applicatif, ni base de données, ni comptes. Les données des utilisateurs (lieux, listes, Maison et Travail) restent sur leur appareil.

## Signaler une faille
Merci de **ne pas ouvrir de ticket public**. Utilisez le signalement privé de GitHub : onglet **Security** → **Report a vulnerability**. Réponse visée sous 7 jours.

## Ce qui est en place
- **Politique de sécurité du contenu (CSP)** posée dans la page :
  - seuls nos scripts s'exécutent (empreintes calculées à la construction) ;
  - le navigateur ne contacte que les fournisseurs documentés sur la page « Qui voit quoi ».

  Elle est définie dans `app/vite.config.js`.
- **Données reçues de l'extérieur vérifiées champ par champ**, avec des tailles bornées (`app/src/lib/myplaces.js`, `importgoogle.js`) :
  - liens de liste partagée et de transfert ;
  - fichiers de sauvegarde ;
  - exports Google.

  Les textes sont toujours affichés comme du texte, jamais interprétés.
- **Liens vers les sites des lieux** (saisis dans OpenStreetMap par n'importe qui) : les schémas qui exécutent du code (`javascript:`, `data:`…) sont neutralisés (`app/src/lib/links.js`).
- **Sauvegardes chiffrables** : AES-GCM 256 bits, clé dérivée du mot de passe (PBKDF2, 310 000 itérations). Le mot de passe n'est jamais envoyé.
- **Actions GitHub** :
  - outils tiers désignés par leur empreinte, et non par leur version ;
  - permissions minimales ;
  - extrait OSM vérifié par sa somme de contrôle ;
  - garde-fou avant de publier les tuiles de lieux.
- **Tests automatiques** à chaque proposition de changement. Les tests de bout en bout échouent si la CSP bloque quoi que ce soit.

## Limites connues
- GitHub Pages ne permet pas d'envoyer des en-têtes HTTP de sécurité. Restent donc impossibles :
  - interdire l'affichage du site dans un cadre (`frame-ancestors`) ;
  - imposer HTTPS par en-tête (HSTS) ;
  - nos propres règles de cache.

  À régler avec notre propre hébergement.
- Les fournisseurs tiers (tuiles, recherche, itinéraires) voient l'adresse IP des utilisateurs : voir la page « Qui voit quoi ».
