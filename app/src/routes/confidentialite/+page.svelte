<script>
  // Page « Qui voit quoi » : ce que l'app envoie, à qui, et ce que chaque service en fait (vérifié le 13/10/2026).
  const rows = [
    ['Fond de carte', 'OpenFreeMap (projet indépendant, financé par dons)', 'Votre adresse IP et la zone de carte affichée', 'Journaux anonymisés sans IP, effacés sous 7 jours ; IP possible dans les journaux d’erreur (7 j) ou en cas d’incident (30 j max) ; peut passer par Cloudflare', 'https://openfreemap.org/privacy/'],
    ['Détails des lieux, listes, horaires, devantures', 'Nos propres fichiers, préparés chaque nuit depuis OpenStreetMap et Panoramax', 'Rien : ce sont des fichiers servis avec le site', 'Hébergés par GitHub Pages pour l’instant', 'https://docs.github.com/en/pages'],
    ['Photos de devanture', 'Panoramax (Ville de Paris / IGN, OSM France)', 'Votre IP et la photo demandée', 'Service public ; images servies depuis un stockage OVH', 'https://panoramax.fr'],
    ['Adresses', 'Géoplateforme (IGN, service public)', 'Votre IP et l’adresse tapée', 'Service public français', 'https://www.data.gouv.fr/dataservices/api-geoplateforme-geocodage'],
    ['Noms de lieux', 'Photon (instance publique de komoot)', 'Votre IP et le texte tapé', 'Aucune politique publiée ; à remplacer par notre propre serveur', 'https://photon.komoot.io'],
    ['Itinéraires à pied, vélo, voiture', 'Valhalla (serveur public FOSSGIS, association allemande)', 'Votre IP, le départ (souvent votre position) et l’arrivée', 'Aucune politique publiée ; à remplacer par notre propre serveur', 'https://routing.openstreetmap.de/about.html'],
    ['Transports en commun', 'Transitous (projet libre)', 'Votre IP, le départ et l’arrivée, la station consultée', 'Aucune politique publiée ; à remplacer par notre propre serveur', 'https://transitous.org'],
    ['Photos et textes des monuments', 'Wikimedia (Wikidata, Wikipédia, Commons)', 'Votre IP et le lieu consulté', 'Fondation à but non lucratif, sans publicité', 'https://foundation.wikimedia.org/wiki/Policy:Privacy_policy']
  ];
</script>

<svelte:head><title>Qui voit quoi · Untracked Maps</title></svelte:head>

<main>
  <a class="back" href="/">‹ Retour à la carte</a>
  <h1>Qui voit quoi</h1>
  <p class="lead">Untracked Maps ne collecte rien sur vous : pas de compte, pas de mesure d’audience, pas de publicité. Vos lieux enregistrés, vos listes et votre position restent sur votre téléphone.</p>
  <p>Mais une carte a besoin de services pour afficher le fond de carte, chercher une adresse ou calculer un trajet. <strong>Ces services reçoivent votre adresse IP et votre demande</strong>, comme n’importe quel site que vous visitez. Voici lesquels, et ce qu’ils en font, d’après leurs politiques publiées (vérifiées le 13 octobre 2026). Là où rien n’est publié, nous le disons.</p>
  <table>
    <thead><tr><th>Pour</th><th>Service</th><th>Ce qu’il reçoit</th><th>Ce qu’il en fait</th></tr></thead>
    <tbody>
      {#each rows as [what, who, gets, does, url]}
        <tr><td>{what}</td><td><a href={url} target="_blank" rel="noopener">{who}</a></td><td>{gets}</td><td>{does}</td></tr>
      {/each}
    </tbody>
  </table>
  <h2>Ce qui ne quitte jamais votre téléphone</h2>
  <ul>
    <li>Vos lieux enregistrés, vos listes, Maison et Travail, vos raccourcis.</li>
    <li>Votre position, sauf pour calculer un itinéraire (elle est alors le point de départ envoyé au service d’itinéraires) et pendant le guidage, qui tourne entièrement sur l’appareil.</li>
    <li>L’historique de vos recherches récentes.</li>
  </ul>
  <h2>Ce que nous changerons avant tout lancement public</h2>
  <p>La recherche, les itinéraires et les transports passeront par <strong>nos propres serveurs, sans journaux d’adresses IP</strong>. Cette page sera mise à jour à chaque changement de service.</p>
  <h2>Sécurité</h2>
  <ul>
    <li>L’app est un site sans serveur ni compte : il n’existe chez nous aucune base de données à pirater.</li>
    <li>Votre navigateur n’exécute que notre code et ne contacte que les services listés ci-dessus (politique de sécurité du contenu).</li>
    <li>Les liens de partage, les sauvegardes et les imports sont vérifiés champ par champ avant d’être lus. Une sauvegarde peut être chiffrée par un mot de passe que nous ne connaissons pas.</li>
    <li>Une faille ? Signalez-la sans la rendre publique : <a href="https://github.com/hfreryr/untracked/security" target="_blank" rel="noopener">page Sécurité du code source</a>.</li>
  </ul>
  <p class="foot">Code source libre (AGPL-3.0) : <a href="https://github.com/hfreryr/untracked" target="_blank" rel="noopener">github.com/hfreryr/untracked</a>. Données © contributeurs OpenStreetMap (ODbL).</p>
</main>

<style>
  :global(body) { margin: 0; background: #fff; color: #1c1d1f; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  @media (prefers-color-scheme: dark) { :global(body) { background: #1c1f24; color: #e8e9ec; } table { border-color: #3a3f47; } th, td { border-color: #3a3f47; } .back, a { color: #7ea2ff; } }
  main { max-width: 760px; margin: 0 auto; padding: 24px 20px 48px; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 12px 0 8px; }
  h2 { font-size: 19px; margin: 28px 0 8px; }
  .lead { font-size: 18px; }
  .back, a { color: #2a5bd7; text-decoration: none; }
  table { border-collapse: collapse; width: 100%; font-size: 14.5px; margin-top: 12px; }
  th, td { text-align: left; vertical-align: top; padding: 8px 8px 8px 0; border-bottom: 1px solid #e3e5e8; }
  th { font-weight: 600; }
  @media (max-width: 600px) { thead { display: none; } tr { display: block; padding: 10px 0; } td { display: block; border: 0; padding: 2px 0; } td:first-child { font-weight: 700; } }
  .foot { margin-top: 32px; font-size: 13.5px; color: #6c7077; }
</style>
