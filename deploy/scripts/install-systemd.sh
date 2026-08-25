#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  printf 'Run install-systemd.sh as root.\n' >&2
  exit 1
fi

deploy_user="${1:-}"
[[ "$deploy_user" =~ ^[a-z_][a-z0-9_-]{2,31}$ ]] || {
  printf 'usage: install-systemd.sh DEPLOY_USER\n' >&2
  exit 2
}
id "$deploy_user" >/dev/null 2>&1 || {
  printf 'Unknown deployment user: %s\n' "$deploy_user" >&2
  exit 2
}

for unit in cove-backup.service cove-backup.timer cove-restore-test.service cove-restore-test.timer; do
  sed "s/__COVE_DEPLOY_USER__/$deploy_user/g" "/opt/cove/systemd/$unit" \
    > "/etc/systemd/system/$unit"
  chmod 0644 "/etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable --now cove-backup.timer cove-restore-test.timer
systemctl list-timers 'cove-*' --no-pager
