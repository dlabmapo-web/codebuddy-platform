#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

require_command docker
require_command python3

validation_root="$(mktemp -d)"
validation_project="cove-validation-$$"

validation_compose() {
  docker compose \
    --project-name "$validation_project" \
    --project-directory "$validation_root" \
    --env-file "$validation_root/deployment.env" \
    -f "$validation_root/compose.production.yml" \
    "$@"
}

cleanup() {
  if [[ -f "$validation_root/deployment.env" ]]; then
    validation_compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
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
validation_compose config --quiet

# Cloud VPS 6 has 12 GB RAM. Keep the sum of all always-on container limits at
# or below 9 GiB so Ubuntu, Docker, filesystem cache, and deployments retain
# roughly 3 GB of headroom. Profile-only operations containers are excluded by
# `docker compose config` unless their profile is explicitly enabled.
compose_json="$(validation_compose config --format json)"
python3 - "$compose_json" <<'PY'
import json
import sys

configuration = json.loads(sys.argv[1])
services = configuration.get("services", {})
limits = {
    name: service.get("mem_limit")
    for name, service in services.items()
    if service.get("mem_limit") is not None
}
missing = sorted(set(services) - set(limits))
if missing:
    raise SystemExit("services without memory limits: " + ", ".join(missing))

budget = 9 * 1024**3
allocated = sum(int(value) for value in limits.values())
if allocated > budget:
    raise SystemExit(
        f"always-on memory ceilings total {allocated / 1024**3:.2f} GiB; "
        "Cloud VPS 6 budget is 9.00 GiB"
    )
print(f"Always-on memory ceiling: {allocated / 1024**3:.2f} GiB / 9.00 GiB")
PY

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
  --user 0:0 \
  --entrypoint /bin/amtool \
  -v "$validation_root/generated/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  prom/alertmanager:v0.28.1 \
  check-config /etc/alertmanager/alertmanager.yml

# Exercise the same protected-copy path used in production, then prove that the
# non-root Alertmanager user can read the resulting private configuration.
validation_compose run --rm alertmanager-config
validation_compose run --rm --no-deps \
  --entrypoint /bin/amtool \
  alertmanager \
  check-config /alertmanager/config/alertmanager.yml

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
