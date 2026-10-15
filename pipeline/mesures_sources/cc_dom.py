# Mesure ponctuelle (15/10/2026) : sites des lieux parisiens présents dans la dernière copie de Common Crawl (index en colonnes). Voir docs/sources-donnees.md.
import json, duckdb, time
from urllib.parse import urlparse
S = json.load(open('sites_sans_horaires.json'))
def dom(u):
    h = urlparse(u if '://' in u else 'http://' + u).netloc.lower().split(':')[0]
    return h[4:] if h.startswith('www.') else h
reg = sorted({'.'.join(dom(s['url']).split('.')[-2:]) for s in S if '.' in dom(s['url'])})
files = [l.strip() for l in open('cc_files.txt') if l.strip()]
c = duckdb.connect(); c.sql("LOAD httpfs")
t0 = time.time()
urls = ','.join(f"'https://data.commoncrawl.org/{f}'" for f in files)
c.sql(f"CREATE TABLE doms AS SELECT DISTINCT url_host_registered_domain d, filename f FROM read_parquet([{urls}], filename=true)")
c.execute("CREATE TABLE want(d VARCHAR)"); c.executemany("INSERT INTO want VALUES (?)", [[d] for d in reg])
hit = c.sql("SELECT d, list(f) FROM doms WHERE d IN (SELECT d FROM want) GROUP BY d").fetchall()
json.dump({d: fs for d, fs in hit}, open('cc_dom.json', 'w'))
print(len(reg), 'domaines ;', len(hit), 'présents dans CC-MAIN-2026-39 ;', round(time.time() - t0), 's')
