#!/usr/bin/env bash
# Real-Nextcloud vault test: Nextcloud 35 in Docker + the WebAppPassword app (allowed origin https://stoic-ranger.com),
# then tools/test-vault-nextcloud.mjs (app → Nextcloud → decrypt page). Needs Docker and git.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pgrep dockerd >/dev/null || (sudo dockerd >/tmp/dockerd.log 2>&1 &) ; sleep 5
sudo docker rm -f fk-nc >/dev/null 2>&1 || true
sudo docker run -d --name fk-nc -p 8080:80 -e SQLITE_DATABASE=nc -e NEXTCLOUD_ADMIN_USER=admin -e NEXTCLOUD_ADMIN_PASSWORD=Admin-Test-123 -e NEXTCLOUD_TRUSTED_DOMAINS=localhost nextcloud:apache >/dev/null
for i in $(seq 1 60); do sleep 5; curl -s localhost:8080/status.php | grep -q '"installed":true' && break; done
W=/tmp/webapppassword; [ -d "$W" ] || git clone -q --depth 1 https://github.com/digital-blueprint/webapppassword "$W"
sudo docker cp "$W" fk-nc:/var/www/html/custom_apps/webapppassword
sudo docker exec fk-nc chown -R www-data:www-data /var/www/html/custom_apps/webapppassword
sudo docker exec -u www-data fk-nc php occ app:enable webapppassword
sudo docker exec -u www-data fk-nc php occ config:app:set webapppassword origins --value=https://stoic-ranger.com
NO_PROXY=localhost,127.0.0.1 node "$ROOT/tools/test-vault-nextcloud.mjs"
