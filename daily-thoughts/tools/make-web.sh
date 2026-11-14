#!/usr/bin/env bash
# Builds the web app for iPhone / iPad (Safari "Add to Home Screen") from the same assets/www as the Android app,
# plus web/ (manifest, service worker, icons). Output: build/web/ and build/outputs/sr-daily-thoughts-<version>-web.zip.
# docs/ is published by GitHub Pages: commit and push it after each build. Standing rule: every update ships to Android AND web.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V="${VERSION_NAME:-$(grep -o "DT.VERSION = '[^']*'" "$ROOT/app/src/main/assets/www/js/core.js" | cut -d"'" -f2)}"
OUT="$ROOT/build/web"; rm -rf "${OUT:?}"; mkdir -p "$OUT"
cp -r "$ROOT/app/src/main/assets/www/." "$OUT/"
cp -r "$ROOT/web/icons" "$ROOT/web/manifest.webmanifest" "$OUT/"
touch "$OUT/.nojekyll"   # GitHub Pages: serve files as they are
FILES=$(cd "$OUT" && find . -type f ! -name sw.js ! -name .nojekyll ! -name '*.txt' | sed 's#^\./##' | sort | python3 -c 'import sys,json;print(json.dumps(["./"]+[l.strip() for l in sys.stdin]))')
python3 - "$ROOT/web/sw.js" "$OUT/sw.js" "$V-$(date -u +%Y%m%d%H%M)" "$FILES" <<'PY'
import sys
s=open(sys.argv[1]).read().replace("'__VERSION__'",repr(sys.argv[3])).replace('__FILES__',sys.argv[4])
open(sys.argv[2],'w').write(s)
PY
mkdir -p "$ROOT/build/outputs"
ZIP="$ROOT/build/outputs/sr-daily-thoughts-$V-web.zip"; rm -f "$ZIP"
(cd "$OUT" && zip -qr "$ZIP" . )
# docs/ = what GitHub Pages serves (https://datawizmanuel.github.io/daily_thoughts/): replace it with this build
# only when publishing (Manuel says when): PUBLISH=1 → docs/ for GitHub Pages
if [ "${PUBLISH:-0}" = 1 ]; then rm -rf "${ROOT:?}/docs"; cp -r "$OUT" "$ROOT/docs"; fi
echo "$OUT ($(du -sh "$OUT" | cut -f1)), $ZIP$([ "${PUBLISH:-0}" = 1 ] && echo ', docs/ updated')"
