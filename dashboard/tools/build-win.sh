#!/bin/bash
# Builds Stoic Ranger Dashboard for Windows (x64) on Linux, no wine needed. Needs in $TOOLS (default /home/user/tools/winapp):
#   npm i electron@33.2.1 @electron/packager@18 resedit@2   (+ electron-v33.2.1-win32-x64.zip in $ZIPDIR, SHA-256 checked)
# Runs the tests first (a failing test stops the build).
# Output: $OUT (default dashboard/dist/vX.Y.Z): Install.cmd, install.ps1, uninstall.ps1, SRDashboard-app.zip.001… (20 MB parts), README.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${TOOLS:-/home/user/tools/winapp}"; ZIPDIR="${ZIPDIR:-$HOME/.cache/electron/win}"
VER=$(node -p "require('$HERE/package.json').version")
OUT="${OUT:-$HERE/dist/v$VER}"
node "$HERE/tools/test-data.mjs"
TOOLS="$TOOLS" xvfb-run -a node "$HERE/tools/test-desktop.mjs"
STAGE="$HERE/dist/stage"; PACK="$HERE/dist/pack"
rm -rf "$STAGE" "$PACK" "$OUT"; mkdir -p "$STAGE" "$PACK" "$OUT"
cp "$HERE/main.js" "$HERE/preload.js" "$HERE/package.json" "$STAGE/"
cp -r "$HERE/res" "$HERE/www" "$STAGE/"
echo "c325a6d905c67107e166267813ea2151ae7fd316c0a88de0081db0b9851a9946  $ZIPDIR/electron-v33.2.1-win32-x64.zip" | sha256sum -c -
NODE_PATH="$TOOLS/node_modules" node "$HERE/tools/pack.js" "$STAGE" "$PACK" "$ZIPDIR"
APP="$PACK/Stoic Ranger Dashboard-win32-x64"
ls "$APP/locales" | grep -v -E '^(en-US|en-GB|de)\.pak$' | sed "s#^#$APP/locales/#" | tr '\n' '\0' | xargs -0 rm -f
NODE_PATH="$TOOLS/node_modules" node "$HERE/tools/res.js" "$APP/SRDashboard.exe" "$HERE/res/icon.ico" "$VER"
(cd "$APP" && python3 -c "
import zipfile,os
z=zipfile.ZipFile('$OUT/app.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)
for r,d,fs in os.walk('.'):
    for f in sorted(fs):
        p=os.path.join(r,f); z.write(p,os.path.relpath(p,'.'))
z.close()")
SHA=$(sha256sum "$OUT/app.zip" | cut -d' ' -f1)
(cd "$OUT" && split -b 20m -d -a 3 --numeric-suffixes=1 app.zip SRDashboard-app.zip. && rm app.zip)
sed "s/__VERSION__/$VER/; s/__SHA256__/$SHA/" "$HERE/installer/install.ps1" | sed 's/$/\r/' > "$OUT/install.ps1"
sed 's/$/\r/' "$HERE/installer/uninstall.ps1" > "$OUT/uninstall.ps1"
sed 's/$/\r/' "$HERE/installer/Install.cmd" > "$OUT/Install.cmd"
cp "$HERE/README.md" "$OUT/README.md"
echo "$OUT  app.zip sha256 $SHA"; ls -la "$OUT"
