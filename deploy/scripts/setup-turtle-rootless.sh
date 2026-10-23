#!/usr/bin/env bash
# Run as the deployment user after installing uidmap/slirp4netns and enabling linger.
set -Eeuo pipefail
[[ "$EUID" -ne 0 ]] || { echo 'Run as the deployment user, not root.' >&2; exit 1; }
for command in docker dockerd-rootless.sh rootlesskit newuidmap newgidmap slirp4netns python3 systemctl loginctl; do
  command -v "$command" >/dev/null || { echo "Missing prerequisite: $command" >&2; exit 1; }
done
[[ "$(loginctl show-user "$(id -un)" -p Linger --value)" == yes ]] || { echo 'Enable linger for this user first.' >&2; exit 1; }
trial_runtime="${XDG_RUNTIME_DIR:?Log in through SSH to initialize the user runtime directory}/cove-turtle"
trial_config="$HOME/.config/cove-turtle"
trial_units="$HOME/.config/systemd/user"
mkdir -p "$trial_config" "$trial_units"
chmod 700 "$trial_config"

# Refuse to overwrite a different setup. Re-running the same setup is safe.
python3 - "$trial_config" "$trial_units" "$trial_runtime" <<'PY'
import json, pathlib, sys
config, units, runtime = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
files = {
 config / 'restart-broker.sh': '''#!/usr/bin/env bash
set -Eeuo pipefail
# Rebind the new Unix socket after daemon restart; never restart course services.
unset DOCKER_HOST DOCKER_CONTEXT
broker=cove-turtle-trial-rootless-trial-broker-1
if /usr/bin/docker --host unix:///var/run/docker.sock container inspect "$broker" >/dev/null 2>&1; then
 /usr/bin/docker --host unix:///var/run/docker.sock restart --time 10 "$broker" >/dev/null
fi
''',
 config / 'daemon.json': json.dumps({
  'data-root': str(pathlib.Path.home() / '.local/share/cove-turtle/docker'),
  'exec-root': runtime + '/exec', 'pidfile': runtime + '/docker.pid',
  'hosts': ['unix://' + runtime + '/docker.sock'],
  'bridge': 'none', 'iptables': False, 'ip6tables': False,
  'exec-opts': ['native.cgroupdriver=systemd'], 'cgroup-parent': 'cove-turtle.slice',
  'log-driver': 'json-file', 'log-opts': {'max-size': '10m', 'max-file': '3'},
 }, indent=2) + '\n',
 units / 'cove-turtle.slice': '''[Unit]
Description=Public Turtle pilot resource budget
[Slice]
MemoryAccounting=yes
MemoryHigh=768M
MemoryMax=1G
MemorySwapMax=0
CPUQuota=150%
TasksMax=256
''',
 units / 'cove-turtle-docker.service': '''[Unit]
Description=Dedicated rootless Docker daemon for public Turtle
After=network.target
[Service]
Type=notify
NotifyAccess=all
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=DOCKERD_ROOTLESS_ROOTLESSKIT_NET=slirp4netns
Environment=DOCKERD_ROOTLESS_ROOTLESSKIT_STATE_DIR=%t/cove-turtle/rootlesskit
RuntimeDirectory=cove-turtle
RuntimeDirectoryMode=0700
ExecStart=/usr/bin/dockerd-rootless.sh --config-file=%h/.config/cove-turtle/daemon.json
ExecStartPost=/bin/bash %h/.config/cove-turtle/restart-broker.sh
Restart=on-failure
RestartSec=5
TimeoutStartSec=120
Delegate=yes
Slice=cove-turtle.slice
KillMode=mixed
[Install]
WantedBy=default.target
''',
}
for path, content in files.items():
 if path.name == 'cove-turtle.slice' and path.exists() and path.read_text() == content.replace('MemoryHigh=768M\nMemoryMax=1G\n', 'MemoryHigh=1536M\nMemoryMax=2G\n'):
  # Preserve only the exact envelope installed by configure-turtle-warm.sh.
  files[path] = path.read_text()
  continue
 if path.exists() and path.read_text() != content:
  raise SystemExit('Review existing configuration before replacing: ' + str(path))
for path, content in files.items():
 if not path.exists():
  path.write_text(content); path.chmod(0o600)
PY
systemctl --user daemon-reload
systemctl --user enable --now cove-turtle-docker.service
trial_socket="unix://$trial_runtime/docker.sock"
for attempt in {1..30}; do
  if docker --host "$trial_socket" info --format '{{json .}}' > "$trial_config/info.json" 2>/dev/null; then break; fi
  sleep 1
done
python3 - "$trial_config/info.json" <<'PY'
import json, pathlib, sys
info = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert 'name=rootless' in info.get('SecurityOptions', []), 'Expected rootless Docker'
assert info.get('CgroupDriver') == 'systemd' and info.get('CgroupVersion') == '2', 'Resource enforcement requires systemd and cgroup v2'
for key in ['MemoryLimit', 'CpuCfsQuota', 'PidsLimit']:
 assert info.get(key) is True, 'Missing enforced resource controller: ' + key
print('Dedicated rootless Turtle daemon is ready with resource controllers.')
PY
rm -f "$trial_config/info.json"
printf 'Turtle socket: %s\n' "$trial_runtime/docker.sock"
