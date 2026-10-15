from match import *
from collections import Counter
D=json.load(open('annuaire75.json')); st=Counter(); types=Counter(); gained=Counter()
for r in D:
    ad=[a for a in json.loads(r['adresse'] or '[]') if a.get('type_adresse')=='Adresse' and a.get('code_postal','').startswith('75') and a.get('latitude')]
    if not ad: continue
    st['paris_avec_horaires']+=1
    p=json.loads(r['pivot']) if r.get('pivot') else []
    t=p[0].get('type_service_local') if p else r.get('type_organisme')
    types[t]+=1
    m=match(float(ad[0]['latitude']),float(ad[0]['longitude']),r['nom'],r=120)
    if not m: st['non_apparie']+=1; continue
    if 'opening_hours' not in OSM[m[1]]['tags']: st['horaires_gagnes']+=1; gained[t]+=1
print(dict(st)); print(types.most_common(12)); print('gagnés :',gained.most_common(10))
