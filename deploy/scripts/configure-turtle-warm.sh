#!/usr/bin/env bash
# Explicit, reversible migration. Run only after draining the public trial pool.
set -Eeuo pipefail
[[ "$EUID" -ne 0 ]] || { echo 'Run as the deployment user.' >&2; exit 1; }
[[ "${1:-}" == --apply && -n "${2:-}" || "${1:-}" == --restore ]] || { echo 'Usage: configure-turtle-warm.sh --apply BUDGET_PLAN.json | --restore' >&2; exit 1; }
python3 - "$1" "${2:-}" <<'PY'
from pathlib import Path
import datetime, json, sys, time
path = Path.home() / '.config/systemd/user/cove-turtle.slice'
current = path.read_text()
old = 'MemoryHigh=768M\nMemoryMax=1G\n'
new = 'MemoryHigh=1536M\nMemoryMax=2G\n'
if sys.argv[1] == '--apply':
    plan = json.loads(Path(sys.argv[2]).read_text())
    assert plan.get('version') == 1 and plan.get('budgetVerified') is True
    assert 0 <= time.time() * 1000 - plan['checkedAt'] < 86400000
    assert plan['hostMemory'] - plan['allocatedMemory'] >= 3 * 1024**3
    assert plan['memoryMax'] == 2 * 1024**3 and plan['memoryHigh'] == 1536 * 1024**2
    before, after = old, new
else:
    before, after = new, old
assert 'MemorySwapMax=0\nCPUQuota=150%\nTasksMax=256\n' in current
if after not in current:
    assert before in current, 'Refusing to overwrite unexpected slice configuration'
    backup = Path.home() / '.config/cove-turtle/backups'
    backup.mkdir(mode=0o700, parents=True, exist_ok=True)
    saved = backup / ('cove-turtle.slice.' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    saved.write_text(current); saved.chmod(0o600)
    path.write_text(current.replace(before, after)); path.chmod(0o600)
PY
systemctl --user daemon-reload
# Apply to the active slice without restarting either Docker daemon.
if [[ "$1" == --apply ]]; then
  systemctl --user set-property --runtime cove-turtle.slice MemoryHigh=1536M MemoryMax=2G
else
  systemctl --user set-property --runtime cove-turtle.slice MemoryHigh=768M MemoryMax=1G
fi
echo 'Slice migrated. Run the resource preflight again before enabling warm mode.'
