#!/usr/bin/env python3
"""Non-destructive resource smoke check for the dedicated guest Docker daemon."""
import json
import re
import subprocess
import sys

socket, image = sys.argv[1:]
assert re.fullmatch(r"unix:///run/user/\d+/cove-turtle/docker.sock", socket)
assert re.fullmatch(r"ghcr.io/[a-z0-9_.-]+/cove-gui-runtime@sha256:[a-f0-9]{64}", image)
cli = ["docker", "--host", socket]
info = json.loads(subprocess.check_output([*cli, "info", "--format", "{{json .}}"], text=True))
assert "name=rootless" in info["SecurityOptions"]
assert info["CgroupDriver"] == "systemd" and info["CgroupVersion"] == "2"
subprocess.run([*cli, "pull", image], check=True)
source = '''import json, pathlib, socket
root = pathlib.Path('/sys/fs/cgroup')
limits = {name: (root / name).read_text().strip() for name in ['memory.max', 'cpu.max', 'pids.max']}
assert limits['memory.max'] == '536870912', limits
assert limits['cpu.max'] == '100000 100000', limits
assert limits['pids.max'] == '64', limits
try:
 socket.create_connection(('1.1.1.1', 443), timeout=1)
except OSError:
 pass
else:
 raise AssertionError('Student network was reachable')
try:
 pathlib.Path('/forbidden').write_text('test')
except OSError:
 pass
else:
 raise AssertionError('Student filesystem was writable')
print(json.dumps(limits))
print('ROOTLESS_RESOURCE_SMOKE_OK')
'''
subprocess.run([
    *cli, "run", "--rm", "--network", "none", "--read-only", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges", "--memory", "512m", "--memory-swap", "512m",
    "--cpus", "1", "--pids-limit", "64", "--entrypoint", "python3", image, "-c", source,
], check=True)
