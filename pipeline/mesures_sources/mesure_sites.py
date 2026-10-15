import json, random, re, concurrent.futures as cf, urllib.request, ssl
from urllib.parse import urlparse
PLAT=re.compile(r'instagram|facebook|privateaser|lafourchette|thefork|tripadvisor|ubereats|deliveroo|pagesjaunes|4sq|linktr|eater\.space|menuonline|wiicmenu|cityvox|yespark|google|yelp|justeat|prvt\.re')
S=[s for s in json.load(open('sites_sans_horaires.json')) if not PLAT.search(s['url'])]
random.seed(15); sample=random.sample(S,200)
UA='UntrackedMaps-mesure/0.1 (+https://untrackedmaps.app; mesure ponctuelle de couverture)'
ctx=ssl.create_default_context()
JL=re.compile(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>',re.S|re.I)
DAYS=re.compile(r'(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday)',re.I)
HOUR=re.compile(r'\b([01]?\d|2[0-3])\s?(h|:)\s?([0-5]\d)?\b')
def get(u):
    if '://' not in u: u='http://'+u
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':UA,'Accept-Language':'fr'}),timeout=12,context=ctx)
        return r.read(2_000_000).decode('utf-8','ignore')
    except Exception as e: return None
def probe(s):
    h=get(s['url'])
    if h is None: return {'ok':False}
    ld=any(re.search(r'openingHours',b) for b in JL.findall(h))
    micro='itemprop="openingHours' in h
    text=bool(re.search(r'horaire',h,re.I)) and len(DAYS.findall(h))>=2 and len(HOUR.findall(h))>=2
    return {'ok':True,'schema':ld or micro,'texte':text}
with cf.ThreadPoolExecutor(16) as ex: R=list(ex.map(probe,sample))
ok=[r for r in R if r['ok']]
print('échantillon',len(R),'joignables',len(ok),'schema.org horaires',sum(r['schema'] for r in ok),'horaires lisibles dans la page (jours + heures)',sum(r['texte'] for r in ok),'au moins un des deux',sum(r['schema'] or r['texte'] for r in ok))
print('sites non plateformes', len(S))
