#!/usr/bin/env bash
# Nextcloud client check (run before every release): WebDav.java + NcFile.java on the build machine's JVM against the
# WebDAV stand-in (tools/webdav-mock.js). Needs a JDK and node.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
J="$ROOT/app/src/main/java/at/stoicranger/dailythoughts"
javac -nowarn -d "$OUT" "$J/WebDav.java" "$J/NcFile.java" "$ROOT/tools/nc-test/NcFileTest.java"
PORT_FILE="$OUT/port"
node "$ROOT/tools/webdav-mock.js" > "$PORT_FILE" &
MOCK=$!
trap 'kill $MOCK 2>/dev/null || true' EXIT
for _ in $(seq 50); do [ -s "$PORT_FILE" ] && break; sleep 0.1; done
java -cp "$OUT" NcFileTest "$(cat "$PORT_FILE")"
