// Vérifie qu'aucun nom n'est utilisé sans avoir été défini (variable oubliée, faute de frappe) dans le code de l'app.
// Ce type d'erreur ne se voit qu'au moment où la ligne s'exécute : le 13/10, une variable manquante a cassé
// en silence les extraits Wikipédia et les photos des fiches. Usage : npm run check
import { execSync } from 'node:child_process';
let out = '';
try { out = execSync('npx svelte-check --output machine', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
catch (e) { out = e.stdout || ''; }
const bad = out.split('\n').filter((l) => / ERROR /.test(l) && /Cannot find name|is not defined|Could not find a declaration/.test(l));
// Les composants et modules lisent l'état de l'écran par l'objet « app » (bloc généré dans +page.svelte) :
// chaque app.nom utilisé doit y être déclaré, sinon il vaut « undefined » sans aucune erreur.
import fs from 'node:fs';
const page = fs.readFileSync('src/routes/+page.svelte', 'utf8');
const block = /\/\/ <app>([\s\S]*?)\/\/ <\/app>/.exec(page)?.[1] || '';
const declared = new Set([...block.matchAll(/get (\w+)\(\)/g)].map((m) => m[1]));
const writable = new Set([...block.matchAll(/set (\w+)\(v\)/g)].map((m) => m[1]));
const files = ['src/lib/ui', 'src/lib'].flatMap((d) => fs.readdirSync(d).filter((f) => /\.(svelte|js)$/.test(f)).map((f) => `${d}/${f}`));
for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  if (!/getContext\('app'\)|\(app\)/.test(code)) continue;
  for (const m of code.matchAll(/(?<![\w$.])app\.(\w+)/g)) if (!declared.has(m[1])) bad.push(`${f} : app.${m[1]} absent du bloc « app » de la page`);
  // écriture (app.x = …, bind:value={app.x}) vers un nom en lecture seule : erreur à l'exécution
  for (const m of code.matchAll(/(?<![\w$.])app\.(\w+)\s*(?:=(?!=)|\+=|-=|\+\+|--|\|\|=|\?\?=)|bind:\w+=\{app\.(\w+)\}/g)) {
    const n = m[1] || m[2];
    if (declared.has(n) && !writable.has(n)) bad.push(`${f} : app.${n} est modifié mais n'a pas de « set » dans le bloc « app »`);
  }
}
if (bad.length) { console.log([...new Set(bad)].join('\n')); console.log(`${bad.length} nom(s) non défini(s)`); process.exit(1); }
console.log('Aucun nom non défini.');
