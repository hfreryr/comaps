#!/usr/bin/env python3
"""
Test (piste A) : l'image que le site web d'un lieu propose lui-même pour les partages (og:image) est-elle
une photo d'ambiance présentable ? On mesure sur une zone avant de décider.

Pour chaque restaurant / café / bar ayant un `website` dans la zone : page d'accueil → <meta property="og:image">
→ téléchargement → dimensions. Heuristique « présentable » : ≥ 600 px de large, format paysage ou carré,
pas un PNG/SVG (logos), URL sans « logo ». La planche-contact permet de juger à l'œil.

Usage : python app/scripts/test_ogimage.py --bbox 2.318,48.838,2.345,48.857 --out data/ogimage
"""
import argparse, concurrent.futures as cf, glob, html, io, json, re, sys, time, urllib.request
from PIL import Image

UA = "Mozilla/5.0 (compatible; UntrackedMaps/0.2; +https://untrackedmaps.app)"
KINDS = {"restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "bistro"}


def get(url, binary=False, limit=3_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = r.read(limit)
        return (data, r.geturl()) if binary else (data.decode("utf-8", "replace"), r.geturl())


def og_image(page, base):
    m = re.search(r'<meta[^>]+(?:property|name)=["\'](?:og:image|og:image:secure_url|twitter:image)["\'][^>]+content=["\']([^"\']+)', page, re.I) \
        or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']', page, re.I)
    if not m:
        return None
    u = html.unescape(m.group(1)).strip()
    if u.startswith("//"):
        u = "https:" + u
    elif u.startswith("/"):
        u = re.match(r"https?://[^/]+", base).group(0) + u
    return u


def one(pid, name, site):
    out = {"id": pid, "name": name, "site": site, "status": "no_site"}
    if not site.startswith("http"):
        site = "https://" + site
    try:
        page, base = get(site)
    except Exception as e:
        out["status"] = f"site_down:{type(e).__name__}"
        return out
    img = og_image(page, base)
    if not img:
        out["status"] = "no_og"
        return out
    out["img"] = img
    try:
        data, _ = get(img, binary=True)
        im = Image.open(io.BytesIO(data))
        w, h = im.size
        out.update(w=w, h=h, fmt=im.format, bytes=len(data))
        logo = "logo" in img.lower() or im.format in ("PNG", "SVG", "GIF") or w < 600 or h > w * 1.3
        out["status"] = "logo_or_small" if logo else "ok"
        if out["status"] == "ok":
            im.thumbnail((320, 320))
            out["thumb"] = im.convert("RGB")
    except Exception as e:
        out["status"] = f"img_fail:{type(e).__name__}"
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--places", default="app/static/data/places")
    ap.add_argument("--bbox", required=True)
    ap.add_argument("--out", default="data/ogimage")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    w, s, e, n = map(float, a.bbox.split(","))
    places = []
    for f in glob.glob(f"{a.places}/*/*/*.json"):
        for pid, lon, lat, tags, *_ in json.load(open(f))["t"]:
            if w < lon < e and s < lat < n and tags.get("amenity") in KINDS and (tags.get("website") or tags.get("contact:website")):
                places.append((pid, tags.get("name", ""), tags.get("website") or tags.get("contact:website")))
    if a.limit:
        places = places[: a.limit]
    print(f"{len(places)} lieux avec site web dans la zone", file=sys.stderr)
    t0 = time.time()
    with cf.ThreadPoolExecutor(12) as ex:
        res = list(ex.map(lambda p: one(*p), places))
    import os
    os.makedirs(a.out, exist_ok=True)
    counts = {}
    for r in res:
        k = r["status"].split(":")[0]
        counts[k] = counts.get(k, 0) + 1
    print(json.dumps(counts), f"en {time.time()-t0:.0f} s")
    oks = [r for r in res if r["status"] == "ok"]
    # planche-contact : 6 par ligne, 200 px
    cell, cols = 200, 6
    rows = (len(oks) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, max(1, rows) * cell), "white")
    for i, r in enumerate(oks):
        th = r.pop("thumb")
        th.thumbnail((cell - 8, cell - 8))
        sheet.paste(th, ((i % cols) * cell + 4, (i // cols) * cell + 4))
    sheet.save(f"{a.out}/planche.jpg", quality=80)
    for r in res:
        r.pop("thumb", None)
    json.dump(res, open(f"{a.out}/resultats.json", "w"), ensure_ascii=False, indent=1)
    print(f"{len(oks)} présentables ({100*len(oks)/max(1,len(res)):.0f} %) → {a.out}/planche.jpg", file=sys.stderr)


if __name__ == "__main__":
    main()
