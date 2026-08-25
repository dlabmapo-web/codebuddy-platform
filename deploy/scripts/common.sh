#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deploy_root="${COVE_DEPLOY_ROOT:-$(cd -- "$script_dir/.." && pwd)}"
compose_file="$deploy_root/compose.production.yml"
deployment_env="$deploy_root/deployment.env"

compose() {
  docker compose \
    --project-directory "$deploy_root" \
    --env-file "$deployment_env" \
    -f "$compose_file" \
    "$@"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
}

require_file() {
  [[ -f "$1" ]] || fail "required file is missing: $1"
}

assert_safe_tag() {
  [[ "$1" =~ ^sha-[0-9a-f]{40}$ ]] || fail "image tag must be sha- followed by a 40-character lowercase commit SHA"
}
