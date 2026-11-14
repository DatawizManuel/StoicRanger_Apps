#!/usr/bin/env bash
# Stoic Ranger Shooting 1.3.1 — the Nextcloud sync against a REAL Nextcloud (Docker), not a mock.
#   bash stoic-ranger/tools/test-nextcloud.sh <database.xlsx made in Excel / by the PC dashboard>
# Starts Nextcloud 30 (SQLite) on :8080 and an https proxy on :8443 (self-signed certificate), then runs
#   1. tools/nc-test: the Android app's own WebDAV code (DavHttp.java) on the desktop JVM: MKCOL, PUT, HEAD, GET
#      (bytes identical), COPY to backups/, PROPFIND, If-Match / If-None-Match (412), wrong password (401);
#   2. test-nextcloud-real.mjs: the app page (hub.js, nextcloud.js, xlsxdb.js) syncing with that server.
# Needs docker, java, node + playwright, python3 + openpyxl; $TOOLS with ecj-3.45.0.jar and json-20240303.jar.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; TOOLS="${TOOLS:-/home/user/tools}"; XLSX="${1:?a database.xlsx made in Excel}"
W="$(mktemp -d)"; export NO_PROXY="localhost,127.0.0.1"; export no_proxy="$NO_PROXY"
docker info >/dev/null 2>&1 || { (sudo dockerd >"$W/dockerd.log" 2>&1 &); sleep 8; }
docker rm -f sr-nc >/dev/null 2>&1 || true
docker run -d --name sr-nc -p 8080:80 -e SQLITE_DATABASE=nc -e NEXTCLOUD_ADMIN_USER=tester -e NEXTCLOUD_ADMIN_PASSWORD=test-pass-123 \
  -e NEXTCLOUD_TRUSTED_DOMAINS="localhost 127.0.0.1" nextcloud:30-apache >/dev/null
for i in $(seq 1 60); do curl -sf http://127.0.0.1:8080/status.php | grep -q '"installed":true' && break; sleep 5; done
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$W/key.pem" -out "$W/cert.pem" -days 2 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
cat >"$W/proxy.js" <<'JS'
const https=require('https'),http=require('http'),fs=require('fs'),d=process.argv[2];
https.createServer({key:fs.readFileSync(d+'/key.pem'),cert:fs.readFileSync(d+'/cert.pem')},(q,s)=>{const h=Object.assign({},q.headers);
 if(h.destination)h.destination=h.destination.replace('https://localhost:8443','http://127.0.0.1:8080');
 const p=http.request({host:'127.0.0.1',port:8080,method:q.method,path:q.url,headers:h},r=>{s.writeHead(r.statusCode,r.headers);r.pipe(s);});
 p.on('error',e=>{s.writeHead(502);s.end(String(e));});q.pipe(p);}).listen(8443);
JS
node "$W/proxy.js" "$W" & PROXY=$!; trap 'kill $PROXY 2>/dev/null; docker rm -f sr-nc >/dev/null 2>&1' EXIT; sleep 1
keytool -importcert -noprompt -alias nc -file "$W/cert.pem" -keystore "$W/trust.jks" -storepass changeit >/dev/null 2>&1
java -jar "$TOOLS/ecj-3.45.0.jar" -nowarn -8 -cp "$TOOLS/json-20240303.jar" -d "$W/cls" "$ROOT/app/src/main/java/at/rangebook/app/DavHttp.java" "$ROOT/tools/nc-test/DavHttpProbe.java" "$ROOT/tools/nc-test/DavHttpTest.java"
echo "== Android WebDAV code (DavHttp) against Nextcloud"
java -Djavax.net.ssl.trustStore="$W/trust.jks" -Djavax.net.ssl.trustStorePassword=changeit -cp "$TOOLS/json-20240303.jar:$W/cls" DavHttpTest https://localhost:8443 tester test-pass-123 "$XLSX"
echo "== the app's sync against Nextcloud"
node "$ROOT/tools/test-nextcloud-real.mjs" https://localhost:8443 tester test-pass-123 "$XLSX"
