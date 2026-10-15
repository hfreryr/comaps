import zipfile, json, re
B=(48.81,48.91,2.22,2.475)
z=zipfile.ZipFile('atp.zip'); out=[]; n=0
coord=re.compile(rb'"coordinates":\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)')
for i in z.infolist():
    if not i.filename.endswith('.geojson'): continue
    n+=1
    with z.open(i) as f:
        for line in f:
            m=coord.search(line)
            if not m: continue
            lon,lat=float(m.group(1)),float(m.group(2))
            if not (B[0]<=lat<=B[1] and B[2]<=lon<=B[3]): continue
            s=line.strip().rstrip(b',')
            try: ft=json.loads(s)
            except Exception: continue
            p=ft.get('properties',{}); p['_spider']=i.filename
            out.append({'lat':lat,'lon':lon,'p':p})
json.dump(out,open('atp_paris.json','w')); print(n,'fichiers',len(out),'lieux à Paris')
