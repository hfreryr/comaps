from match import *
from collections import Counter
DAYS=['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
for f in ['ilots-de-fraicheur-espaces-verts-frais.json','ilots-de-fraicheur-equipements-activites.json']:
    D=json.load(open(f)); st=Counter(); types=Counter()
    for r in D:
        has=any(r.get('horaires_'+d) not in (None,'','None') for d in DAYS) or r.get('ouvert_24h')=='Oui'
        st['total']+=1; st['avec_horaires']+=has
        g=r.get('geo_point_2d') or {}
        if not has or not g: continue
        m=match(g['lat'],g['lon'],r.get('nom',''),r=150)
        if not m: st['non_apparie']+=1; continue
        t=OSM[m[1]]['tags']
        if 'opening_hours' not in t: st['horaires_gagnes']+=1; types[r.get('type')]+=1
    print(f, dict(st)); print('  gagnés par type :',types.most_common(8))
