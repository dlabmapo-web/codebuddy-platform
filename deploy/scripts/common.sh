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
  if native_enabled; then
    profiles+=(--profile native)
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

# The native grading node runs when the release pins its image.
native_enabled() {
  [[ -f "$deployment_env" ]] && grep -Eq '^NATIVE_IMAGE=ghcr\.io/' "$deployment_env"
}

# After restoring a release without the native node: its API no longer admits
# native work, so stopping the node (which first finishes queued native work)
# leaves nothing behind.
stop_native_without_image() {
  if ! native_enabled; then
    docker compose \
      --project-directory "$deploy_root" \
      --env-file "$deployment_env" \
      -f "$compose_file" \
      --profile native \
      stop --timeout 360 native-grader || true
  fi
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

# A pre-sync Prisma client rejects the new enum value in a feature-list read.
# The manifest key identifies releases that understand it, including those
# with draining disabled. Clear only rollout gates before restoring an older
# API; snapshots, jobs, baselines, decisions and academy content are retained.
prepare_library_rollback() {
  local target="$1"
  if ! grep -q '^LIBRARY_SYNC_ENABLED=' "$deployment_env" ||
     grep -q '^LIBRARY_SYNC_ENABLED=' "$target"; then
    return 0
  fi
  compose --profile operations run --rm --entrypoint node migrate \
    node_modules/tsx/dist/cli.mjs src/library-sync/prepare-production.ts --clear-academy-gates
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
