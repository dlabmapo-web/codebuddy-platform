#!/usr/bin/env bash
# Install-only. Never enables/starts services or changes accounts/Turtle/host limits.
set -Eeuo pipefail
[[ "$(uname -s)" == Linux && "$EUID" -ne 0 && "$(id -un)" == cove-grading ]] || { echo 'Requires dedicated Linux cove-grading account.' >&2; exit 1; }
[[ "$(id -gn)" == cove-grading-control ]] || { echo 'Primary group must be cove-grading-control; restart the user manager after provisioning it.' >&2; exit 1; }
for prerequisite in docker dockerd-rootless.sh rootlesskit newuidmap newgidmap slirp4netns python3 systemctl node; do
  command -v "$prerequisite" >/dev/null || { echo "Missing prerequisite: $prerequisite" >&2; exit 1; }
done
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo 'Pinned Node 22 host runtime required.' >&2; exit 1; }
[[ "$(loginctl show-user cove-grading -p Linger --value)" == yes ]] || { echo 'Administrator must provision linger first.' >&2; exit 1; }
[[ -d /sys/fs/cgroup && -f /sys/fs/cgroup/cgroup.controllers ]] || exit 1
[[ "${XDG_RUNTIME_DIR:-}" == "/run/user/$EUID" ]] || exit 1
python3 "$(dirname "$0")/grading/install.py"
# Loading unit definitions does not start them or consume the execution allocation.
systemctl --user daemon-reload
printf '%s\n' 'Installed only. Review units, collect acceptance, then use explicit drained handover. No service was started.'
