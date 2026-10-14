// Vérifie qu'aucun nom n'est utilisé sans avoir été défini (variable oubliée, faute de frappe) dans le code de l'app.
// Ce type d'erreur ne se voit qu'au moment où la ligne s'exécute : le 13/10, une variable manquante a cassé
// en silence les extraits Wikipédia et les photos des fiches. Usage : npm run check
import { execSync } from 'node:child_process';
let out = '';
try { out = execSync('npx svelte-check --output machine', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { out = e.stdout || ''; }
const bad = out.split('\n').filter((l) => / ERROR /.test(l) && /Cannot find name|is not defined|Could not find a declaration/.test(l));
if (bad.length) { console.log(bad.join('\n')); console.log(`${bad.length} nom(s) non défini(s)`); process.exit(1); }
console.log('Aucun nom non défini.');
