#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

timeout_seconds="${HEALTH_TIMEOUT_SECONDS:-300}"
deadline=$((SECONDS + timeout_seconds))
services=(redis api judge-worker home studio mvp caddy prometheus alertmanager grafana node-exporter cadvisor)

while (( SECONDS < deadline )); do
  pending=()
  failed=()

  for service in "${services[@]}"; do
    container_id="$(compose ps -q "$service")"
    if [[ -z "$container_id" ]]; then
      pending+=("$service:not-running")
      continue
    fi

    read -r state health < <(
      docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id"
    )
    if [[ "$state" == "exited" || "$state" == "dead" ]]; then
      failed+=("$service:$state")
    elif [[ "$health" == "unhealthy" ]]; then
      failed+=("$service:unhealthy")
    elif [[ "$state" != "running" || "$health" == "starting" ]]; then
      pending+=("$service:$state/$health")
    fi
  done

  if (( ${#failed[@]} > 0 )); then
    printf 'Failed services: %s\n' "${failed[*]}" >&2
    compose ps >&2
    exit 1
  fi
  if (( ${#pending[@]} == 0 )); then
    printf 'All production services are running and healthy.\n'
    exit 0
  fi

  printf 'Waiting for health: %s\n' "${pending[*]}"
  sleep 5
done

compose ps >&2
fail "services did not become healthy within ${timeout_seconds} seconds"
