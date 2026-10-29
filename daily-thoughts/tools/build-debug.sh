#!/usr/bin/env bash
# Builds a signed debug APK without Gradle/AGP (for environments without the Android SDK manager).
# Needs JDK 17+ and an API 34 android.jar in $TOOLS. Uses from $TOOLS when present, else from the PATH:
#   aapt2; d8.jar (else `dalvik-exchange`, the Debian dx); apksigner.jar (else `apksigner`); ecj-3.45.0.jar.
# On Ubuntu: apt install aapt apksigner dalvik-exchange. On a normal PC use Android Studio / ./gradlew assembleDebug.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${TOOLS:-/home/user/tools}"
PKG=at.stoicranger.dailythoughts
OUT="$ROOT/build/manual"; rm -rf "$OUT"; mkdir -p "$OUT"/{res,gen,classes,dex}
M="$ROOT/app/src/main"
AAPT2="$TOOLS/aapt2"; [ -x "$AAPT2" ] || AAPT2=aapt2
"$AAPT2" compile --dir "$M/res" -o "$OUT/res/res.zip"
# AGP keeps the package id in build.gradle; aapt2 needs it in the manifest
sed "s#<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">#<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\" package=\"$PKG\">#; s#\${applicationId}#$PKG#g" "$M/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"
"$AAPT2" link -o "$OUT/base.apk" -I "$TOOLS/android.jar" --manifest "$OUT/AndroidManifest.xml" \
   -A "$M/assets" --java "$OUT/gen" --min-sdk-version 26 --target-sdk-version 34 \
   --version-code "${VERSION_CODE:-4}" --version-name "${VERSION_NAME:-0.2.0}" --debug-mode \
   -0 woff2 -0 png -0 jpg "$OUT/res/res.zip"
# Eclipse compiler: D8 builds trip over some javac 21 class files
java -jar "$TOOLS/ecj-3.45.0.jar" -nowarn -8 -cp "$TOOLS/android.jar" -d "$OUT/classes" \
   $(find "$M/java" "$OUT/gen" -name '*.java')
test -f "$OUT/classes/at/stoicranger/dailythoughts/MainActivity.class"
if [ -f "$TOOLS/d8.jar" ]; then
  java -cp "$TOOLS/d8.jar" com.android.tools.r8.D8 --debug --min-api 26 --lib "$TOOLS/android.jar" \
     --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
else
  (cd "$OUT/classes" && dalvik-exchange --dex --min-sdk-version=26 --output="$OUT/dex/classes.dex" .)
fi
cp "$OUT/base.apk" "$OUT/unaligned.apk"
(cd "$OUT/dex" && zip -q -0 ../unaligned.apk classes.dex)
python3 "$ROOT/tools/zipalign.py" "$OUT/unaligned.apk" "$OUT/aligned.apk"
KS="${KEYSTORE:-$ROOT/debug.keystore}"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey \
   -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
mkdir -p "$ROOT/build/outputs"
APK="$ROOT/build/outputs/sr-daily-thoughts-${VERSION_NAME:-0.2.0}-debug.apk"
if [ -f "$TOOLS/apksigner.jar" ]; then SIGN=(java -jar "$TOOLS/apksigner.jar"); else SIGN=(apksigner); fi
"${SIGN[@]}" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
   --ks-key-alias androiddebugkey --min-sdk-version 26 --out "$APK" "$OUT/aligned.apk"
"${SIGN[@]}" verify --min-sdk-version 26 "$APK"
echo "$APK"
