#!/usr/bin/env bash
# Builds a signed debug APK without Gradle/AGP (for environments without the Android SDK manager).
# Needs: JDK 17+, and in $TOOLS: android.jar (API 34), aapt2, d8.jar, apksigner.jar, ecj-3.45.0.jar.
# Without d8.jar the Ubuntu dx is used (apt install aapt apksigner dalvik-exchange; link aapt2 and apksigner.jar).
# On a normal PC use Android Studio / ./gradlew assembleDebug instead (see README).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${TOOLS:-/home/user/tools}"
OUT="$ROOT/build/manual"; rm -rf "$OUT"; mkdir -p "$OUT"/{res,gen,classes,dex}
M="$ROOT/app/src/main"
"$TOOLS/aapt2" compile --dir "$M/res" -o "$OUT/res/res.zip"
# AGP keeps the package id in build.gradle; aapt2 needs it in the manifest
sed 's#<manifest xmlns:android="http://schemas.android.com/apk/res/android">#<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="at.rangebook.app">#; s#\${applicationId}#at.rangebook.app#g' "$M/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"
"$TOOLS/aapt2" link -o "$OUT/base.apk" -I "$TOOLS/android.jar" --manifest "$OUT/AndroidManifest.xml" \
   -A "$M/assets" --java "$OUT/gen" --min-sdk-version 26 --target-sdk-version 34 \
   --version-code "${VERSION_CODE:-10}" --version-name "${VERSION_NAME:-1.1.0}" --debug-mode \
   -0 woff2 -0 png -0 jpg "$OUT/res/res.zip"
# Eclipse compiler: this D8 build trips over some javac 21 class files
java -jar "$TOOLS/ecj-3.45.0.jar" -nowarn -8 -cp "$TOOLS/android.jar" -d "$OUT/classes" \
   $(find "$M/java" "$OUT/gen" -name '*.java')
test -f "$OUT/classes/at/rangebook/app/MainActivity.class"
if [ -f "$TOOLS/d8.jar" ]; then
  java -cp "$TOOLS/d8.jar" com.android.tools.r8.D8 --debug --min-api 26 --lib "$TOOLS/android.jar" \
     --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
else
  dalvik-exchange --dex --min-sdk-version=26 --output="$OUT/dex/classes.dex" "$OUT/classes"
fi
cp "$OUT/base.apk" "$OUT/unaligned.apk"
(cd "$OUT/dex" && zip -q -0 ../unaligned.apk classes.dex)
python3 "$ROOT/tools/zipalign.py" "$OUT/unaligned.apk" "$OUT/aligned.apk"
KS="${KEYSTORE:-$ROOT/debug.keystore}"
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey \
   -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
mkdir -p "$ROOT/build/outputs"
APK="$ROOT/build/outputs/stoic-ranger-${VERSION_NAME:-1.1.0}-debug.apk"
java -jar "$TOOLS/apksigner.jar" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
   --ks-key-alias androiddebugkey --min-sdk-version 26 --out "$APK" "$OUT/aligned.apk"
java -jar "$TOOLS/apksigner.jar" verify --min-sdk-version 26 "$APK"
echo "$APK"
