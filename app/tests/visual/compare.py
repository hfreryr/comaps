"""Compare deux dossiers de captures (tests/visual/capture.mjs) pixel par pixel.
Usage : python3 tests/visual/compare.py avant/ apres/
Un écart limité aux heures ou aux horaires en temps réel est normal ; tout le reste doit être expliqué."""
import sys, os
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
for f in sorted(os.listdir(a)):
    if not f.endswith('.png') or not os.path.exists(f'{b}/{f}'): continue
    x = Image.open(f'{a}/{f}').convert('RGB'); y = Image.open(f'{b}/{f}').convert('RGB')
    if x.size != y.size: print(f'{f:28} TAILLE {x.size} -> {y.size}'); continue
    d = ImageChops.difference(x, y).convert('L').point(lambda v: 255 if v > 24 else 0)
    n = sum(d.histogram()[255:]); print(f'{f:28} {n:7d} px différents ({100*n/(x.size[0]*x.size[1]):.2f} %) zone {d.getbbox()}')
