#!/usr/bin/env bash
# Daily Thoughts 0.3.1 — the Nextcloud sync against a REAL Nextcloud (Docker), not a mock (like SR Shooting 1.3.1).
#   bash tools/test-nextcloud.sh [database.xlsx from the PC dashboard]
# Starts Nextcloud 30 (SQLite) on :8080 and an https proxy on :8443 (self-signed certificate), then runs the app's
# Android WebDAV code (WebDav.java, NcFile.java) on the JVM behind tools/nc-test/NcBridge.java, and the app page's sync
# through it: tools/test-nextcloud-real.js. Needs docker, java, node + playwright, python3 + openpyxl.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
XLSX="${1:-/mnt/project-files/stoic-ranger-apps/02_shared/pc-dashboard/03_registry/database.xlsx}"
W="$(mktemp -d)"; export NO_PROXY="localhost,127.0.0.1"; export no_proxy="$NO_PROXY"
D=docker; $D info >/dev/null 2>&1 || D="sudo docker"
$D info >/dev/null 2>&1 || { (sudo dockerd >"$W/dockerd.log" 2>&1 &); sleep 8; }
if ! curl -sf http://127.0.0.1:8080/status.php | grep -q '"installed":true'; then
  $D rm -f dt-nc >/dev/null 2>&1 || true
  $D run -d --name dt-nc -p 8080:80 -e SQLITE_DATABASE=nc -e NEXTCLOUD_ADMIN_USER=tester -e NEXTCLOUD_ADMIN_PASSWORD=test-pass-123 \
    -e NEXTCLOUD_TRUSTED_DOMAINS="localhost 127.0.0.1" nextcloud:30-apache >/dev/null
  for _ in $(seq 1 60); do curl -sf http://127.0.0.1:8080/status.php | grep -q '"installed":true' && break; sleep 5; done
fi
curl -sf -u tester:test-pass-123 -X DELETE "http://127.0.0.1:8080/remote.php/dav/files/tester/Stoic%20Ranger" >/dev/null || true   # a clean folder
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$W/key.pem" -out "$W/cert.pem" -days 2 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
cat >"$W/proxy.js" <<'JS'
const https=require('https'),http=require('http'),fs=require('fs'),d=process.argv[2];
https.createServer({key:fs.readFileSync(d+'/key.pem'),cert:fs.readFileSync(d+'/cert.pem')},(q,s)=>{const h=Object.assign({},q.headers);
 if(h.destination)h.destination=h.destination.replace('https://localhost:8443','http://127.0.0.1:8080');
 const p=http.request({host:'127.0.0.1',port:8080,method:q.method,path:q.url,headers:h},r=>{s.writeHead(r.statusCode,r.headers);r.pipe(s);});
 p.on('error',e=>{s.writeHead(502);s.end(String(e));});q.pipe(p);}).listen(8443);
JS
node "$W/proxy.js" "$W" & PROXY=$!
keytool -importcert -noprompt -alias nc -file "$W/cert.pem" -keystore "$W/trust.jks" -storepass changeit >/dev/null 2>&1
J="$ROOT/app/src/main/java/at/stoicranger/dailythoughts"
javac -nowarn -d "$W/cls" "$J/WebDav.java" "$J/NcFile.java" "$ROOT/tools/nc-test/NcBridge.java"
java -Djavax.net.ssl.trustStore="$W/trust.jks" -Djavax.net.ssl.trustStorePassword=changeit -cp "$W/cls" \
  NcBridge https://localhost:8443 tester test-pass-123 "/Stoic Ranger/" database.xlsx > "$W/port" &
BRIDGE=$!
trap 'kill $PROXY $BRIDGE 2>/dev/null || true' EXIT
for _ in $(seq 50); do [ -s "$W/port" ] && break; sleep 0.2; done
node "$ROOT/tools/test-nextcloud-real.js" "$(head -1 "$W/port")" "$XLSX"
