from match import *
from collections import Counter
A=json.load(open('atp_paris.json'))
st=Counter(); gain=Counter(); new=Counter(); spiders=Counter()
for a in A:
    p=a['p']; name=p.get('name') or p.get('brand') or ''
    cat=p.get('shop') and 'shop' or p.get('amenity') or p.get('tourism') or p.get('leisure') or 'autre'
    st['total']+=1
    if p.get('opening_hours'): st['avec_horaires']+=1
    m=match(a['lat'],a['lon'],name,p.get('brand:wikidata'))
    if m:
        st['apparie']+=1; t=OSM[m[1]]['tags']
        if p.get('opening_hours') and 'opening_hours' not in t:
            gain['horaires']+=1; gain['horaires_'+('resto' if t.get('amenity') in ('restaurant','cafe','bar','fast_food','pub') else 'commerce' if 'shop' in t else 'autre')]+=1; spiders[p['_spider'].split('/')[-1]]+=1
        if (p.get('website') ) and not (t.get('website') or t.get('contact:website')): gain['site']+=1
        if p.get('phone') and not (t.get('phone') or t.get('contact:phone')): gain['tel']+=1
    else:
        if cat in ('atm','charging_station','vending_machine','parcel_locker','bicycle_rental','post_box','fuel'): new['equipements_'+cat]+=1
        else: new[cat]+=1
print('ATP Paris :',dict(st)); print('Gains sur OSM :',dict(gain)); print('Non appariés (lieux absents d OSM ?) :',new.most_common(15)); print('Enseignes qui apportent des horaires :',spiders.most_common(15))
