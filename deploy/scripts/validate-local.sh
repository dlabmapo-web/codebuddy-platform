#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command docker
require_command python3

validation_root="$(mktemp -d)"
cleanup() {
  [[ "$validation_root" == /tmp/* || "$validation_root" == /var/folders/* ]] \
    && rm -rf -- "$validation_root"
}
trap cleanup EXIT

cp -R "$deploy_root/." "$validation_root/"
cp "$validation_root/deployment.env.example" "$validation_root/deployment.env"
for example in "$validation_root"/secrets/*.example; do
  cp "$example" "${example%.example}"
done
chmod 600 "$validation_root"/deployment.env "$validation_root"/secrets/*

validation_sha="sha-0000000000000000000000000000000000000000"
python3 - "$validation_root/deployment.env" "$validation_sha" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
path.write_text(
    path.read_text()
    .replace("sha-replace", sys.argv[2])
    .replace("operator@example.com", "operations@coveedu.com")
)
PY

COVE_DEPLOY_ROOT="$validation_root" "$validation_root/scripts/render-monitoring-config.sh"
docker compose \
  --project-directory "$validation_root" \
  --env-file "$validation_root/deployment.env" \
  -f "$validation_root/compose.production.yml" \
  config --quiet

docker run --rm \
  -e ACME_EMAIL=operations@coveedu.com \
  -v "$validation_root/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2.10.0-alpine caddy validate --config /etc/caddy/Caddyfile

docker run --rm \
  --entrypoint /bin/promtool \
  -v "$validation_root/monitoring:/etc/prometheus:ro" \
  prom/prometheus:v3.5.0 \
  check config /etc/prometheus/prometheus.yml

docker run --rm \
  --entrypoint /bin/amtool \
  -v "$validation_root/generated/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  prom/alertmanager:v0.28.1 \
  check-config /etc/alertmanager/alertmanager.yml

python3 -m json.tool \
  "$validation_root/monitoring/grafana/dashboards/cove-host.json" >/dev/null

for script in "$deploy_root"/scripts/*.sh; do
  bash -n "$script"
done
python3 - "$deploy_root/scripts/render-monitoring-config.py" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
compile(path.read_text(), str(path), "exec")
PY

printf 'Deployment configuration validation passed.\n'
