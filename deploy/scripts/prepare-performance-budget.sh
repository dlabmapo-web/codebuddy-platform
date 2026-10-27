#!/usr/bin/env bash
# Administrator-only, temporary test ceiling. Does not stop or change the app.
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]] || { printf 'Run from the VPS administrator console.\n' >&2; exit 1; }
unit=cove-performance-benchmark.slice
unit_file="/run/systemd/system/$unit"
if [[ "${1:-}" == --remove ]]; then
  grep -q '^Description=Temporary isolated grading performance fixture budget$' "$unit_file" || { printf 'Not the fixture unit; refusing removal.\n' >&2; exit 1; }
  group="$(systemctl show --property=ControlGroup --value "$unit")"
  if [[ -n "$group" && -f "/sys/fs/cgroup$group/cgroup.events" ]] && grep -q '^populated 1$' "/sys/fs/cgroup$group/cgroup.events"; then
    printf 'Test processes still exist; refusing to remove their budget.\n' >&2
    exit 1
  fi
  systemctl stop "$unit"
  rm -f -- "$unit_file"
  systemctl daemon-reload
  exit 0
fi
[[ $# == 0 ]] || { printf 'Only --remove is supported.\n' >&2; exit 1; }
[[ ! -e "$unit_file" ]] || { printf 'Budget unit already exists; inspect it before proceeding.\n' >&2; exit 1; }
cat > "$unit_file" <<'UNIT'
[Unit]
Description=Temporary isolated grading performance fixture budget

[Slice]
MemoryMax=2147483648
MemorySwapMax=0
CPUQuota=350%
TasksMax=512
UNIT
systemctl daemon-reload
systemctl start "$unit"
systemctl show "$unit" --property=ControlGroup --property=MemoryMax --property=MemorySwapMax --property=CPUQuotaPerSecUSec --property=TasksMax
printf 'Budget prepared; production is unchanged. Native tests still require drained/stopped production grading.\n'
