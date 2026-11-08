#!/usr/bin/env bash
set -euo pipefail

# The upstream installer currently uses get.trivy.dev, which can fail DNS on
# fresh runners. Use the same official release binary with its published digest.
# Keep this version/digest pair together when upgrading the scanner.
trivy_version=0.70.0
trivy_sha256=8b4376d5d6befe5c24d503f10ff136d9e0c49f9127a4279fd110b727929a5aa9
trivy_bin_dir="${1:-${RUNNER_TEMP:?RUNNER_TEMP or an explicit install directory is required}/cove-trivy/bin}"
trivy_work_dir="$(mktemp -d)"
trap 'rm -rf -- "$trivy_work_dir"' EXIT
trivy_archive="$trivy_work_dir/trivy.tar.gz"

curl --fail --location --silent --show-error --retry 3 --retry-all-errors \
  --connect-timeout 15 --max-time 180 \
  "https://github.com/aquasecurity/trivy/releases/download/v${trivy_version}/trivy_${trivy_version}_Linux-64bit.tar.gz" \
  --output "$trivy_archive"
printf '%s  %s\n' "$trivy_sha256" "$trivy_archive" | sha256sum --check --status
tar -xzf "$trivy_archive" -C "$trivy_work_dir" trivy
install -d "$trivy_bin_dir"
install -m 755 "$trivy_work_dir/trivy" "$trivy_bin_dir/trivy"
if [[ -n "${GITHUB_PATH:-}" ]]; then
  printf '%s\n' "$trivy_bin_dir" >> "$GITHUB_PATH"
fi
"$trivy_bin_dir/trivy" --version
