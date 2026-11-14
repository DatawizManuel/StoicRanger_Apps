#!/usr/bin/env bash
# SR GunSafe — the Nextcloud sync against a REAL Nextcloud 30 (Docker), not a mock (same set-up as SR Shooting 1.3.1).
#   bash gun-safe/tools/test-nextcloud.sh <database.xlsx from SR Shooting / the PC dashboard>
# Starts Nextcloud (SQLite) on :8080 and an https proxy on :8443 (self-signed certificate), compiles the app's own
# WebDAV code (Nextcloud.java) for the desktop JVM and runs test-nextcloud-real.mjs: the app page syncing through it.
# Needs docker, java + ecj, node + playwright, python3 + openpyxl.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; XLSX="${1:?a database.xlsx}"
W="$(mktemp -d)"; export NO_PROXY="localhost,127.0.0.1"; export no_proxy="$NO_PROXY"
docker info >/dev/null 2>&1 || { (sudo dockerd >"$W/dockerd.log" 2>&1 &); sleep 8; }
if ! curl -sf http://127.0.0.1:8080/status.php | grep -q '"installed":true'; then
  docker rm -f gs-nc >/dev/null 2>&1 || true
  docker run -d --name gs-nc -p 8080:80 -e SQLITE_DATABASE=nc -e NEXTCLOUD_ADMIN_USER=tester -e NEXTCLOUD_ADMIN_PASSWORD=test-pass-123 \
    -e NEXTCLOUD_TRUSTED_DOMAINS="localhost 127.0.0.1" nextcloud:30-apache >/dev/null
  for i in $(seq 1 60); do curl -sf http://127.0.0.1:8080/status.php | grep -q '"installed":true' && break; sleep 5; done
fi
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$W/key.pem" -out "$W/cert.pem" -days 2 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
node "$ROOT/tools/nc-test/proxy.js" "$W" & PROXY=$!; trap 'kill $PROXY 2>/dev/null' EXIT; sleep 1
keytool -importcert -noprompt -alias nc -file "$W/cert.pem" -keystore "$W/trust.jks" -storepass changeit >/dev/null 2>&1
ecj -nowarn -8 -proc:none -d "$W/cls" "$ROOT/app/src/main/java/at/stoicranger/gunsafe/Nextcloud.java" "$ROOT"/tools/nc-test/android/util/Base64.java "$ROOT/tools/nc-test/NcCli.java"
cat >"$W/nc" <<SH
#!/bin/sh
exec java --add-opens java.base/java.net=ALL-UNNAMED --add-opens java.base/sun.net.www.protocol.https=ALL-UNNAMED -Djavax.net.ssl.trustStore="$W/trust.jks" -Djavax.net.ssl.trustStorePassword=changeit -cp "$W/cls" NcCli "\$@"
SH
chmod +x "$W/nc"
NC_CLI="$W/nc" node "$ROOT/tools/test-nextcloud-real.mjs" https://localhost:8443 tester test-pass-123 "$XLSX"
