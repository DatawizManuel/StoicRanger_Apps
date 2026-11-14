#!/usr/bin/env bash
# Checks the data the SR Field Kit link returns (LinkProvider.ballistics) on the desktop JVM.
# Needs in $TOOLS: android.jar (compile only), ecj-3.45.0.jar, json-20240303.jar (org.json from Maven Central).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS="${TOOLS:-/home/user/tools}"
OUT="$(mktemp -d)"
J="$ROOT/app/src/main/java/at/rangebook/app"
java -jar "$TOOLS/ecj-3.45.0.jar" -nowarn -8 -cp "$TOOLS/json-20240303.jar:$TOOLS/android.jar" -d "$OUT" \
  "$J/LinkProvider.java" "$J/Nextcloud.java" "$J/DavHttp.java" "$J/MainActivity.java" "$J/SharedFileProvider.java" "$ROOT/tools/link-test/LinkProviderTest.java" >/dev/null
# org.json first: android.jar only has stubs of it
java -cp "$TOOLS/json-20240303.jar:$OUT:$TOOLS/android.jar" LinkProviderTest
