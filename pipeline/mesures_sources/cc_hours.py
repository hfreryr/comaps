# Mesure ponctuelle (15/10/2026) : horaires lisibles dans les pages archivées par Common Crawl, sans visiter les sites. Voir docs/sources-donnees.md.
import json, duckdb, random, gzip, sys, time, urllib.request
from collections import defaultdict
from urllib.parse import urlparse
sys.path.insert(0, __import__('os').path.join(__import__('os').path.dirname(__file__), '../../app/scripts'))
from build_sitehours import hours_in
from build_extras import NOT_A_SITE
S = json.load(open('sites_sans_horaires.json'))
def dom(u):
    h = urlparse(u if '://' in u else 'http://' + u).netloc.lower().split(':')[0]
    return h[4:] if h.startswith('www.') else h
names = {}
for s in S:
    if not NOT_A_SITE.search(s['url']) and not any(p in s['url'] for p in ('instagram', 'facebook', 'linktr')):
        names.setdefault('.'.join(dom(s['url']).split('.')[-2:]), s['name'])
hit = json.load(open('cc_dom.json'))
cand = [d for d in hit if d in names]
random.seed(4); sample = random.sample(cand, min(150, len(cand)))
byfile = defaultdict(list)
for d in sample:
    for f in hit[d]: byfile[f].append(d)
c = duckdb.connect(); c.sql("LOAD httpfs")
best = {}
for f, ds in byfile.items():
    lst = ','.join("'" + d.replace("'", "") + "'" for d in ds)
    for d, path, wf, o, l in c.sql(f"""SELECT url_host_registered_domain, url_path, warc_filename, warc_record_offset, warc_record_length
        FROM read_parquet('{f}') WHERE url_host_registered_domain IN ({lst}) AND fetch_status = 200 AND content_mime_detected = 'text/html'""").fetchall():
        if d not in best or len(path or '') < len(best[d][0] or ''):
            best[d] = (path, wf, o, l)
res = {'echantillon': len(sample), 'page_html_trouvee': 0, 'accueil': 0, 'horaires': 0}
UA = 'UntrackedMapsBot/0.1 (+https://untrackedmaps.app/confidentialite ; mesure ponctuelle)'
for d, (path, wf, o, l) in best.items():
    res['page_html_trouvee'] += 1; res['accueil'] += path in ('/', '')
    try:
        raw = urllib.request.urlopen(urllib.request.Request('https://data.commoncrawl.org/' + wf, headers={'User-Agent': UA, 'Range': f'bytes={o}-{o+l-1}'}), timeout=60).read()
        html = gzip.decompress(raw).decode('utf-8', 'ignore')
    except Exception:
        continue
    res['horaires'] += bool(hours_in(html, names[d]))
print(json.dumps(res))
