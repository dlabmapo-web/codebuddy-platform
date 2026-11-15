#!/usr/bin/env bash
set -euo pipefail
presence_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$presence_root"
presence_build="$(mktemp -d "$presence_root/packages/api/.presence-e2e-XXXXXX")"
trap 'rm -rf -- "$presence_build"' EXIT
export COVE_DLAB_API_BUILD_DIR="file://$presence_build"
bash packages/api/scripts/test-class-feedback.sh --config e2e/cross-material-presence.playwright.config.ts "$@"
