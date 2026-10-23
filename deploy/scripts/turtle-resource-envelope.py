#!/usr/bin/env python3
"""Budget/preflight and host-only cgroup textfile collector. Never reads secrets."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

MIB = 1024 ** 2
EXPECTED = {'memory.max': 2048 * MIB, 'memory.high': 1536 * MIB, 'memory.swap.max': 0, 'pids.max': 256}

def read_slice(root):
    result = {key: int((root / key).read_text().strip()) for key in EXPECTED}
    quota, period = map(int, (root / 'cpu.max').read_text().split())
    result['cpu.quota'] = quota / period
    return result

def allocated_memory(configurations, course_mib, overlap_mib):
    allocated = 2048 * MIB + (course_mib + overlap_mib) * MIB
    if course_mib < 0 or overlap_mib < 0:
        raise ValueError('Budgets must be nonnegative')
    for configuration in configurations:
        for service in configuration['services'].values():
            limit = service.get('mem_limit')
            if not isinstance(limit, int) or isinstance(limit, bool) or limit <= 0:
                raise ValueError('Every enabled service requires an integer memory ceiling')
            allocated += limit
    return allocated

def envelope(configurations, course_mib, overlap_mib, host_memory, limits, image):
    allocated = allocated_memory(configurations, course_mib, overlap_mib)
    if host_memory - allocated < 3072 * MIB:
        raise ValueError('Combined allocations do not preserve 3 GiB host headroom; keep warm mode off')
    return {'version': 1, 'checkedAt': int(time.time() * 1000), 'budgetVerified': True,
            'verified': all(limits.get(k) == v for k, v in EXPECTED.items()) and limits.get('cpu.quota') == 1.5,
            'image': image, 'hostMemory': host_memory, 'allocatedMemory': allocated,
            'memoryMax': 2048 * MIB, 'memoryHigh': 1536 * MIB, 'swapMax': 0, 'cpuQuota': 1.5, 'tasksMax': 256}

def atomic_write(path, value, mode):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'w') as output:
            output.write(value)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def collect(root, directory):
    limits = read_slice(root)
    events = dict(line.split() for line in (root / 'memory.events').read_text().splitlines())
    cpu = dict(line.split() for line in (root / 'cpu.stat').read_text().splitlines())
    values = {'collected_at_seconds': time.time(), 'memory_bytes': int((root / 'memory.current').read_text()),
              'memory_limit_bytes': limits['memory.max'], 'oom_total': int(events['oom']),
              'oom_kill_total': int(events['oom_kill']), 'cpu_throttled_seconds_total': int(cpu.get('throttled_usec', 0)) / 1e6,
              'tasks': int((root / 'pids.current').read_text())}
    atomic_write(directory / 'cove-turtle.prom', ''.join(f'cove_turtle_slice_{k} {v}\n' for k, v in values.items()), 0o644)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--collect', type=Path, help='Write non-secret node-exporter textfiles here')
    parser.add_argument('--compose-json', action='append', type=Path, default=[])
    parser.add_argument('--course-guest-memory-mib', type=int)
    parser.add_argument('--deployment-overlap-mib', type=int)
    parser.add_argument('--image')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--plan', action='store_true', help='Validate budget before migrating the slice; not an enablement attestation')
    args = parser.parse_args()
    relative = subprocess.check_output(['systemctl', '--user', 'show', 'cove-turtle.slice', '-p', 'ControlGroup', '--value'], text=True).strip()
    if not relative.startswith('/user.slice/') or not relative.endswith('/cove-turtle.slice') or '..' in relative:
        raise ValueError('Expected the deployment user Turtle slice')
    root = Path('/sys/fs/cgroup') / relative.lstrip('/')
    if args.collect:
        collect(root, args.collect)
        return
    if len(args.compose_json) != 2 or args.course_guest_memory_mib is None or args.deployment_overlap_mib is None or not args.image or not args.output:
        parser.error('Supply exactly two rendered Compose JSON files (enabled main stack and trial broker), course/overlap budgets, image and output')
    if '@sha256:' not in args.image:
        raise ValueError('Use the approved immutable runtime digest')
    host_memory = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemTotal:'))) * 1024
    document = envelope([json.loads(p.read_text()) for p in args.compose_json], args.course_guest_memory_mib,
                        args.deployment_overlap_mib, host_memory, read_slice(root), args.image)
    if not args.plan and not document['verified']:
        raise ValueError('Actual slice limits do not match the warm envelope')
    if args.plan:
        document['verified'] = False
    atomic_write(args.output, json.dumps(document, indent=2) + '\n', 0o600)
    print('Budget plan saved; warm enablement still blocked.' if args.plan else 'Warm resource envelope verified.')

if __name__ == '__main__':
    main()
