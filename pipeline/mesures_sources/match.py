# Appariement simple OSM ↔ autre source : même enseigne (brand:wikidata) à 80 m, ou mots du nom en commun à 50 m.
import json, math, re, unicodedata
from collections import defaultdict
def norm(s):
    s=unicodedata.normalize('NFD',s or '').encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+',' ',s).strip()
STOP={'le','la','les','de','du','des','paris','cafe','restaurant','bar','the','et','l','d','chez','au','aux'}
def toks(s): return {t for t in norm(s).split() if t not in STOP and len(t)>1}
def dist(a,b,c,d): return math.hypot((a-c)*111320,(b-d)*111320*math.cos(math.radians(48.86)))
OSM=json.load(open('osm_paris.json'))
grid=defaultdict(list)
for i,o in enumerate(OSM): grid[(int(o['lat']*1000),int(o['lon']*1000))].append(i)
def near(lat,lon,r):
    gi,gj=int(lat*1000),int(lon*1000)
    for a in (-1,0,1):
        for b in (-1,0,1):
            for i in grid.get((gi+a,gj+b),[]):
                o=OSM[i]; d=dist(lat,lon,o['lat'],o['lon'])
                if d<=r: yield d,i
def match(lat,lon,name,wd=None,r=80):
    best=None; tn=toks(name)
    for d,i in near(lat,lon,r):
        t=OSM[i]['tags']
        ok = (wd and t.get('brand:wikidata')==wd and d<=r) or (tn and len(tn & toks(t.get('name','')))>=max(1,min(len(tn),2)) and d<=50) or (norm(name) and norm(name)==norm(t.get('name','')) and d<=r)
        if ok and (best is None or d<best[0]): best=(d,i)
    return best
