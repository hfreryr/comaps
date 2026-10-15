from match import *
from collections import Counter
V=json.load(open('ov_paris.json'))
RESTO=('restaurant','cafe','bar','fast_food','pub')
st=Counter(); sites=[]
for v in V:
    if (v['conf'] or 0)<0.5: continue
    st['ov_conf>=0.5']+=1
    m=match(v['lat'],v['lon'],v['name'] or '')
    if not m: continue
    st['apparie']+=1; o=OSM[m[1]]; t=o['tags']
    w=v['websites'] if isinstance(v['websites'],list) else (json.loads(v['websites'].replace("'",'"')) if v['websites'] not in (None,'None') else [])
    ph=v['phones'] if isinstance(v['phones'],list) else ([] if v['phones'] in (None,'None') else [1])
    has_w=t.get('website') or t.get('contact:website'); has_p=t.get('phone') or t.get('contact:phone')
    if w and not has_w:
        st['site_gagne']+=1
        if 'opening_hours' not in t and (t.get('amenity') in RESTO or t.get('shop')=='bakery'): st['site_gagne_resto_sans_horaires']+=1; sites.append({'osm':o['id'],'name':t.get('name'),'url':w[0],'src':'overture'})
    if ph and not has_p: st['tel_gagne']+=1
    if v['status'] in ('permanently_closed','temporarily_closed'): st['ferme_selon_overture']+=1
print(dict(st))
# sites OSM eux-mêmes pour les restos sans horaires
for o in OSM:
    t=o['tags']
    if 'opening_hours' not in t and (t.get('amenity') in RESTO or t.get('shop')=='bakery') and (t.get('website') or t.get('contact:website')):
        sites.append({'osm':o['id'],'name':t.get('name'),'url':t.get('website') or t.get('contact:website'),'src':'osm'})
json.dump(sites,open('sites_sans_horaires.json','w')); print('sites candidats (restos sans horaires) :',len(sites), Counter(s['src'] for s in sites))
