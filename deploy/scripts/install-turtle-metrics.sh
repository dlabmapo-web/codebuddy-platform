#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" -ne 0 ]] || { echo 'Run as the deployment user.' >&2; exit 1; }
trial_metrics_root="$HOME/.local/share/cove-turtle/metrics"
trial_metrics_config="$HOME/.config/cove-turtle"
mkdir -p "$trial_metrics_root" "$trial_metrics_config" "$HOME/.config/systemd/user"
chmod 755 "$trial_metrics_root"
install -m 600 "$(dirname "$0")/turtle-resource-envelope.py" "$trial_metrics_config/metrics.py"
cat > "$HOME/.config/systemd/user/cove-turtle-metrics.service" <<'UNIT'
[Unit]
Description=Public Turtle cgroup metrics
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 %h/.config/cove-turtle/metrics.py --collect %h/.local/share/cove-turtle/metrics
NoNewPrivileges=yes
UNIT
cat > "$HOME/.config/systemd/user/cove-turtle-metrics.timer" <<'UNIT'
[Unit]
Description=Collect public Turtle resource usage every 20 seconds
[Timer]
OnBootSec=20
OnUnitActiveSec=20
Unit=cove-turtle-metrics.service
[Install]
WantedBy=timers.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now cove-turtle-metrics.timer
systemctl --user start cove-turtle-metrics.service
echo 'Turtle resource textfile collector installed.'
