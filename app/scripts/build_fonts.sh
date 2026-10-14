#!/usr/bin/env bash
# Glyphes de la carte (format PBF de MapLibre) à partir de la police Inter (SIL Open Font License 1.1).
# Inter est la police libre la plus proche des polices système des téléphones (SF Pro, Roboto).
# Outils : npm (paquet inter-ui), Python + fonttools + brotli (woff2 → ttf), build_pbf_glyphs (cargo install build_pbf_glyphs).
# Usage :  bash app/scripts/build_fonts.sh      → app/static/fonts/Inter {Regular,Medium,SemiBold,Bold,Italic}/
set -euo pipefail
OUT="$(cd "$(dirname "$0")/.." && pwd)/static/fonts"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
cd "$W"
npm pack -q inter-ui@4.1.1 >/dev/null && tar xzf inter-ui-4.1.1.tgz
mkdir ttf pbf
python3 - <<'PY'
from fontTools.ttLib import TTFont
for w in ['Regular', 'Medium', 'SemiBold', 'Bold', 'Italic']:
    f = TTFont(f'package/web/Inter-{w}.woff2'); f.flavor = None; f.save(f'ttf/Inter-{w}.ttf')
PY
build_pbf_glyphs ttf pbf
mkdir -p "$OUT"
for w in Regular Medium SemiBold Bold Italic; do rm -rf "$OUT/Inter $w"; mv "pbf/Inter-$w" "$OUT/Inter $w"; done
cp package/LICENSE.txt "$OUT/Inter-OFL.txt"
echo "glyphes Inter dans $OUT"
