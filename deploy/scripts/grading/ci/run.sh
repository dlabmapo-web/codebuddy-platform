#!/usr/bin/env bash
# Disposable CI only. Production activation, credentials and publication absent.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/../../../.."
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${GRADING_DISPOSABLE_CI:-}" == 1 ]] || exit 1
node_source="$(command -v node)"
[[ "$node_source" == /* && -f "$node_source" && -x "$node_source" ]] || exit 1
# Fresh directory, owned by the runner. sudo never opens a caller output path.
mkdir -p test-results
[[ ! -L test-results ]] || exit 1
mkdir test-results/disposable-native-kernel
diagnostics=test-results/disposable-native-kernel
summary=$diagnostics/collected.json
stage=guard
admin() {
  python3 deploy/scripts/grading/ci/evidence.py invoke --stage "$1" --diagnostics "$diagnostics" -- sudo -n env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 \
    GITHUB_ACTIONS=true RUNNER_ENVIRONMENT=github-hosted GRADING_DISPOSABLE_CI=1 \
    "${@:2}"
}
finish() {
  primary=$?
  trap - EXIT INT TERM
  set +e
  # Observation is diagnostic and cannot suppress the original kernel failure.
  admin observe-after python3 deploy/scripts/grading/ci/provision.py observe
  observation=$?
  # Capture exact owned service journals before cleanup removes the accounts.
  sudo -n env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 \
    GITHUB_ACTIONS=true RUNNER_ENVIRONMENT=github-hosted GRADING_DISPOSABLE_CI=1 \
    python3 deploy/scripts/grading/ci/evidence.py snapshot >/dev/null
  infrastructure=$?
  admin cleanup python3 deploy/scripts/grading/ci/provision.py cleanup
  cleanup=$?
  sudo -n env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin LANG=C.UTF-8 \
    GITHUB_ACTIONS=true RUNNER_ENVIRONMENT=github-hosted GRADING_DISPOSABLE_CI=1 \
    python3 deploy/scripts/grading/ci/evidence.py collect --primary "$primary" \
    --observation "$observation" --cleanup "$cleanup" --infrastructure "$infrastructure" --stage "$stage" >"$summary"
  collection=$?
  python3 deploy/scripts/grading/ci/evidence.py finalize --directory "$diagnostics" --collection "$collection" --primary "$primary" --observation "$observation" --cleanup "$cleanup" --infrastructure "$infrastructure"
  finalization=$?
  printf 'Disposable CI exits: primary=%s observation=%s cleanup=%s infrastructure=%s collection=%s finalization=%s\n' "$primary" "$observation" "$cleanup" "$infrastructure" "$collection" "$finalization"
  if (( primary != 0 )); then exit "$primary"; fi
  if (( observation != 0 )); then exit "$observation"; fi
  if (( cleanup != 0 )); then exit "$cleanup"; fi
  if (( collection != 0 )); then exit "$collection"; fi
  exit "$finalization"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Read-only exact host guard before dependencies or host mutation.
admin guard python3 -c 'import sys; sys.path.insert(0,"deploy/scripts/grading/ci"); import provision; provision.check_host()'
stage=dependencies
pnpm prepare:grading
stage=build
bash deploy/scripts/build-grading-images.sh ci linux/amd64
stage=prepare
admin prepare GRADING_CI_NODE_SOURCE="$node_source" python3 deploy/scripts/grading/ci/provision.py prepare "$PWD" >/dev/null
stage=observe-before
admin observe-before python3 deploy/scripts/grading/ci/provision.py observe
stage=kernel
admin kernel python3 deploy/scripts/grading/ci/kernel.py run
stage=complete
