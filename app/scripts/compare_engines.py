import json, time, urllib.request, urllib.parse, math, statistics as st
"""Compare Valhalla (FOSSGIS) et MOTIS (Transitous) sur 10 trajets parisiens × voiture, vélo, marche. Voir docs/comparaison-moteurs.md.
Usage : python app/scripts/compare_engines.py   (≈ 2 min, 1 requête/s)"""
UA={'User-Agent':'UntrackedMaps/0.2 (https://untrackedmaps.app; comparaison moteurs)'}
TRIPS=[("Gare du Nord","Tour Eiffel",(48.8809,2.3553),(48.8584,2.2945)),
("Bastille","La Défense",(48.8532,2.3691),(48.8920,2.2380)),
("Montmartre","Place d'Italie",(48.8867,2.3431),(48.8313,2.3557)),
("Opéra","Bercy",(48.8710,2.3317),(48.8386,2.3826)),
("Porte Maillot","Porte de Vincennes",(48.8781,2.2826),(48.8471,2.4107)),
("Odéon","Belleville",(48.8520,2.3387),(48.8722,2.3767)),
("Gare de Lyon","Montparnasse",(48.8443,2.3744),(48.8412,2.3205)),
("Trocadéro","République",(48.8629,2.2876),(48.8674,2.3636)),
("Châtelet","Porte d'Orléans",(48.8584,2.3470),(48.8233,2.3254)),
("Batignolles","Nation",(48.8875,2.3170),(48.8484,2.3958))]
def get(url):
    t=time.time(); r=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=60); d=json.load(r); return d, time.time()-t
def dec(s,p=6):
    c=[];i=lat=lon=0;f=10**p
    while i<len(s):
        for k in (0,1):
            sh=res=0
            while True:
                b=ord(s[i])-63;i+=1;res|=(b&31)<<sh;sh+=5
                if b<32:break
            v=~(res>>1) if res&1 else res>>1
            if k==0: lat+=v
            else: lon+=v
        c.append((lat/f,lon/f))
    return c
def near(a,B):
    return min(math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*0.66) for b in B)
def overlap(A,B):
    A=A[::max(1,len(A)//150)]; B=B[::max(1,len(B)//600)] if len(B)>600 else B
    return sum(near(a,B)<30 for a in A)/len(A)
VC={'car':'auto','bike':'bicycle','walk':'pedestrian'}; MM={'car':'CAR','bike':'BIKE','walk':'WALK'}
rows=[]
for name1,name2,a,b in TRIPS:
  for mode in ('car','bike','walk'):
    body={'locations':[{'lat':a[0],'lon':a[1]},{'lat':b[0],'lon':b[1]}],'costing':VC[mode],'language':'fr-FR','units':'km','alternates':2}
    try:
        v,tv=get('https://valhalla1.openstreetmap.de/route?json='+urllib.parse.quote(json.dumps(body)))
        trips=[v['trip']]+[x['trip'] for x in v.get('alternates',[])]
        vs=[(t['summary']['time'],t['summary']['length']*1000) for t in trips]
        vshape=[p for l in v['trip']['legs'] for p in dec(l['shape'])]
        vsteps=sum(len(l['maneuvers']) for l in v['trip']['legs'])
    except Exception as e: vs=[];vshape=[];vsteps=0;tv=None;print('V err',e)
    time.sleep(1.1)
    q=urllib.parse.urlencode({'fromPlace':f'{a[0]},{a[1]}','toPlace':f'{b[0]},{b[1]}','directModes':MM[mode],'transitModes':'','maxDirectTime':14400})
    try:
        m,tm=get('https://api.transitous.org/api/v5/plan?'+q)
        ms=[(x['duration'],sum(l.get('distance') or 0 for l in x['legs'])) for x in m.get('direct',[])]
        mshape=[p for l in m['direct'][0]['legs'] for p in dec(l['legGeometry']['points'],l['legGeometry'].get('precision',6))] if m.get('direct') else []
        msteps=sum(len(l.get('steps') or []) for l in m['direct'][0]['legs']) if m.get('direct') else 0
    except Exception as e: ms=[];mshape=[];msteps=0;tm=None;print('M err',e)
    time.sleep(1.1)
    ov=overlap(mshape,vshape) if mshape and vshape else None
    r=dict(trip=f'{name1} → {name2}',mode=mode,v=vs,m=ms,vsteps=vsteps,msteps=msteps,tv=tv,tm=tm,overlap=ov)
    rows.append(r); print(json.dumps(r,ensure_ascii=False))
json.dump(rows,open('docs/mesures/valhalla-motis.json','w'),ensure_ascii=False,indent=1)
