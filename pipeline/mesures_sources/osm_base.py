# Lieux nommés de l'extrait OSM de Paris : point, clés utiles (sert de base aux mesures de sources)
import osmium, json, sys
KEYS=('amenity','shop','tourism','leisure','office','craft','healthcare')
out=[]
class H(osmium.SimpleHandler):
    def add(self,kind,id,tags,lat,lon):
        if 'name' not in tags or not any(k in tags for k in KEYS): return
        t={k:v for k,v in tags}
        out.append({'id':f'{kind}/{id}','lat':lat,'lon':lon,'tags':t})
    def node(self,n): self.add('node',n.id,n.tags,n.location.lat,n.location.lon)
    def way(self,w):
        try:
            xs=[n.lon for n in w.nodes]; ys=[n.lat for n in w.nodes]
        except osmium.InvalidLocationError: return
        if xs: self.add('way',w.id,w.tags,sum(ys)/len(ys),sum(xs)/len(xs))
H().apply_file(sys.argv[1],locations=True)
json.dump(out,open('osm_paris.json','w'))
print(len(out))
