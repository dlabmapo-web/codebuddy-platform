#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
deploy_root="${COVE_DEPLOY_ROOT:-$(cd -- "$script_dir/.." && pwd)}"
compose_file="$deploy_root/compose.production.yml"
deployment_env="$deploy_root/deployment.env"

compose() {
  local profiles=()
  if feature_enabled VIDEO_LESSONS_ENABLED; then
    profiles+=(--profile video)
  fi
  if feature_enabled GUI_ENABLED; then
    profiles+=(--profile gui)
  fi
  docker compose \
    --project-directory "$deploy_root" \
    --env-file "$deployment_env" \
    -f "$compose_file" \
    ${profiles[@]+"${profiles[@]}"} \
    "$@"
}

# Admission is part of the release manifest so application rollback also stops
# newly enabled runtimes. Never source secret environment files into the shell.
feature_enabled() {
  [[ -f "$deployment_env" ]] &&
    python3 - "$deployment_env" "$1" <<'PY'
import pathlib, sys
values = {}
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    key, separator, value = line.strip().partition("=")
    if separator and not key.startswith("#"):
        values[key.strip()] = value.strip().strip("\"'")
sys.exit(0 if values.get(sys.argv[2]) == "true" else 1)
PY
}

stop_learning_services() {
  # Rollback must restore the application promptly. Forced encoder shutdown is
  # recovered by its persisted lease; it never deletes the original source.
  if feature_enabled GUI_ENABLED; then
    compose stop --timeout 30 gui-service || true
  fi
  if feature_enabled VIDEO_LESSONS_ENABLED; then
    compose stop --timeout 30 video-worker || true
  fi
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
