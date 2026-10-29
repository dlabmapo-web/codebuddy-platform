#!/usr/bin/env python3
"""Fixed disposable CI checks. Administrator faults never cross into the worker.

run starts a bounded system.slice controller; every worker phase runs as the
separate account in the existing exact worker slice. Unsupported kernel tracing,
identity drift, first case failure, missing evidence or uncertain removal fails.
"""
import argparse
import json
import os
from pathlib import Path
import re
import select
import signal
import stat
import subprocess
import sys
import time

import provision as host
from exec_observer import Observer, cgroup_id

PHASES = ('functional', 'isolation', 'limits', 'cancellation', 'recovery')
FUNCTIONAL = ('unicode-include', 'unicode-ignore', 'stdin-consumed', 'stdin-unconsumed',
              'program-error', 'timeout', 'output-exact', 'output-over')
NATIVE = ('isolation', 'memory', 'pids', 'cancel', 'retained', 'active-restart', 'parent-oom', 'control-oom')
REQUIRED = {(engine, name) for engine in ('cpython', 'pyodide') for name in FUNCTIONAL} | {('cpython', name) for name in NATIVE}
KERNEL_SERVICE = 'cove-grading-ci-kernel.service'
RESERVE = dict(memoryBytes=512 * 2**20, cpus=.5, pids=128, swapBytes=0)
MAX_JSON = 256 * 1024
HEX = re.compile(r'[0-9a-f]{64}')
UUID = re.compile(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}')


def require(condition, message):
    if not condition: raise ValueError(message)


def validate_observation(value):
    require(value.get('rootless') is True and value.get('cgroupDriver') == 'systemd' and value.get('cgroupVersion') == '2', 'Rootless cgroup v2 proof absent')
    require(value.get('family') == host.FAMILY_LIMITS and value.get('worker') == host.WORKER_LIMITS, 'Effective family/worker ceilings differ')
    require({'cpu', 'memory', 'pids'} <= set(value.get('controllers', [])), 'Delegated controllers absent')
    envelope = value.get('hostEnvelope', {})
    require(envelope.get('unreservedMemoryBytes', 0) >= RESERVE['memoryBytes'] + 256 * 2**20 and envelope.get('unreservedCpus', 0) >= RESERVE['cpus'], 'Observer/system reserve unfunded')


def validate_exec(event, identity):
    require(event.get('kind') == 'EXEC' and all(event.get(k) == identity.get(k) for k in ('pid', 'uid', 'cgroupId')), 'Pre-interpreter leaf identity unproved')
    require(event.get('executable') in ('/usr/local/bin/python3', '/usr/local/bin/node'), 'Interpreter executable differs')
    require(type(event.get('pid')) is int and event['pid'] > 0 and event.get('uid', 0) > 0 and event.get('cgroupId', 0) > 0, 'Invalid kernel identity')


def validate_identity(before, after):
    require(before and all(k in before and after.get(k) == before[k] for k in ('id', 'pid', 'startTime')), 'Owned container/PID incarnation changed')


def validate_oom(value, victim):
    before, after = value.get('before', {}), value.get('after', {})
    require(all(type(v.get(k)) is int for v in (before, after) for k in ('oom', 'oom_kill')), 'Actual local OOM counters absent')
    require(after['oom'] > before['oom'], 'No local kernel OOM delta')
    victim_before, victim_after = value.get('victimBefore', {}), value.get('victimAfter', {})
    require(type(victim_before.get('oom_kill')) is int and type(victim_after.get('oom_kill')) is int and victim_after['oom_kill'] > victim_before['oom_kill'], 'No victim-local OOM kill delta')
    require(value.get('victimPid') == victim and victim in value.get('kernelVictims', []) and value.get('observedBeforeRemoval') is True and value.get('pidfdHeld') is True, 'OOM victim/removal identity unproved')
    require(isinstance(value.get('victimStartTime'), str) and value['victimStartTime'].isdigit() and value.get('cgroupId', 0) > 0, 'OOM incarnation unproved')


def validate_recovery(before, after):
    require(all(k in before and after.get(k) == before[k] for k in ('receiptHash', 'sourceHash', 'context', 'reservationId')), 'Recovered receipt/source identity differs')


def validate_results(value):
    require(value.get('version') == 1 and value.get('success') is True, 'Kernel run incomplete')
    cases = value.get('cases', [])
    require(len(cases) == len(REQUIRED) and {(x.get('engine'), x.get('name')) for x in cases} == REQUIRED, 'Missing or duplicate required native case')
    seen = set()
    for case in cases:
        require(case.get('cleanup') == 'removed' and HEX.fullmatch(case.get('sourceHash', '')), 'Case cleanup/source proof missing')
        context = case.get('context', {})
        require(UUID.fullmatch(context.get('caseId', '')) and context['caseId'] not in seen, 'Reused case identity')
        seen.add(context['caseId'])
        if case['name'] in ('cancel', 'active-restart', 'parent-oom', 'control-oom'):
            require(case.get('nonScoring') is True and case.get('outcome') in ('CANCELLED', 'UNCERTAIN', 'INFRASTRUCTURE'), 'Fault became scoring result')
        else:
            expected = {'memory': 'MEMORY_LIMIT', 'timeout': 'TIME_LIMIT', 'program-error': 'RUNTIME_ERROR'}.get(case['name'], 'PASSED')
            require(case.get('outcome') == expected, 'Unexpected outcome')
            for stream, limit in [('stdout', 8388608), ('stderr', 262144)]:
                capture = case.get(stream, {})
                require(type(capture.get('bytes')) is int and 0 <= capture['bytes'] <= limit and HEX.fullmatch(capture.get('sha256', '')), 'Unbounded capture projection')
    validate_observation(value.get('before', {})); validate_observation(value.get('after', {}))
    require(value.get('systemReserve') == RESERVE, 'Host observer reserve mismatch')
    proof = value.get('hostProof', {})
    allocations = proof.get('allocations', [])
    require(len(allocations) == len(REQUIRED) and len({a.get('containerId') for a in allocations}) == len(REQUIRED), 'Missing/reused source guest allocation')
    for case in cases:
        matches = [a for a in allocations if a.get('caseId') == case['context']['caseId']]
        require(len(matches) == 1, 'Case allocation binding absent')
        allocation = matches[0]
        require(all(allocation.get(k) == case.get(k) for k in ('engine', 'name', 'sourceHash', 'context', 'reservationId')), 'Source/lease allocation differs')
        require(HEX.fullmatch(allocation.get('containerId', '')), 'Invalid container identity')
        event = allocation.get('exec', {})
        validate_exec(event, allocation.get('learner', {}))
        require(event in value.get('kernelEvents', []) and {**event, 'kind':'GATE'} in value.get('kernelEvents', []), 'Actual gate/exec events absent')
    require(set(proof.get('preInitEngines', [])) == {'cpython', 'pyodide'}, 'Pre-init engine proof absent')
    for name in ('memory', 'parent-oom', 'control-oom'):
        fault = proof.get('cases', {}).get(name, {})
        validate_oom(fault.get('oom', {}), fault.get('oom', {}).get('victimPid'))
    require(proof.get('cases', {}).get('pids', {}).get('pidsLimitReached') is True, 'Actual PID ceiling not exercised')
    for name in ('isolation', 'memory', 'pids', 'cancel', 'active-restart', 'parent-oom', 'control-oom'):
        item = proof.get('cases', {}).get(name, {})
        require(item.get('removed') is True and item.get('markerObserved') is True, 'Source release/removal not observed')
        validate_exec(item.get('exec', {}), item.get('learner', {}))
    retained = proof.get('cases', {}).get('retained', {})
    validate_recovery(retained.get('before', {}), retained.get('after', {}))
    require(retained.get('noReplay') is True, 'Retained source replay unproved')


def read_bounded(path, owner=None, maximum=MAX_JSON):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_size <= maximum and (owner is None or info.st_uid == owner), 'Untrusted evidence file')
        data = os.read(fd, maximum + 1)
        require(len(data) <= maximum, 'Evidence overflow')
        return json.loads(data)
    finally: os.close(fd)


def counters(path, filename='memory.events.local'):
    return {k: int(v) for k, v in (line.split() for line in (Path(path) / filename).read_text().splitlines())}


def start_time(pid):
    # comm may contain spaces/parentheses. Fields after the final ')' begin at 3.
    return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]


def process_identity(item):
    pid = item['State']['Pid']
    require(item['State']['Running'] and type(pid) is int and pid > 0, 'Guest not running')
    return dict(id=item['Id'], pid=pid, startTime=start_time(pid))


def live_guest(state, item, observer):
    identity = process_identity(item)
    parent = host.group(identity['pid'])
    require(item.get('HostConfig', {}).get('ReadonlyRootfs') is True and item['HostConfig'].get('NetworkMode') == 'none' and not item['HostConfig'].get('Binds') and all(x.get('Type') != 'bind' for x in item.get('Mounts', [])), 'Guest root/network/mount isolation changed')
    require(parent.name == 'docker-' + item['Id'] + '.scope' and Path(state['cgroupParent']) in parent.parents, 'Guest escaped exact family')
    learner = parent / 'learner'; control = parent / 'control'
    pids = [int(p) for p in (learner / 'cgroup.procs').read_text().split()]
    # Called for warm guests or source marker; the interpreter is the exec-observed PID.
    observer.drain()
    matches = [p for p in pids if p in observer.execs]
    require(len(matches) == 1, 'Missing or ambiguous gated interpreter')
    pid = matches[0]; event = observer.execs[pid]; gate = observer.gates.get(pid, {})
    mounts = [line.split() for line in Path(f'/proc/{pid}/mountinfo').read_text().splitlines()]
    for mountpoint in ('/', '/sys/fs/cgroup'):
        rows = [row for row in mounts if row[4] == mountpoint]
        require(len(rows) == 1 and 'ro' in rows[0][5].split(','), 'Root/cgroup mount is not actually readonly')
    for mountpoint in ('/tmp', '/dev/shm'):
        rows = [row for row in mounts if row[4] == mountpoint]
        require(len(rows) == 1 and rows[0][rows[0].index('-')+1] == 'tmpfs' and {'nosuid','nodev','noexec'} <= set(rows[0][5].split(',')), 'Scratch mount is not private restricted tmpfs')
    namespaces = {name:os.readlink(f'/proc/{pid}/ns/{name}') for name in ('pid','net','user','mnt','cgroup')}
    require(all(value != os.readlink('/proc/1/ns/'+name) for name,value in namespaces.items()), 'Host namespace shared')
    actual_uid = int(re.search(r'^Uid:\s+(\d+)', Path(f'/proc/{pid}/status').read_text(), re.M)[1])
    facts = dict(pid=pid, uid=actual_uid, cgroupId=cgroup_id(learner), startTime=start_time(pid))
    validate_exec(event, facts)
    require(gate == {**event, 'kind': 'GATE'}, 'Gate-to-exec cgroup/UID identity changed')
    expected_exe = '/usr/local/bin/python3' if item['Image'] == state['images'][0]['configId'] else '/usr/local/bin/node'
    require(event['executable'] == expected_exe, 'Engine executable differs')
    uid_map = [list(map(int, row.split())) for row in Path(f'/proc/{pid}/uid_map').read_text().splitlines()]
    require(any(a <= 1000 < a + length and b + 1000 - a == actual_uid for a, b, length in uid_map), 'Learner UID is not mapped guest UID1000')
    require((parent/'pids.max').read_text().strip() == '32' and (parent/'memory.swap.max').read_text().strip() == '0', 'Guest PID/swap cap changed')
    engine = 'cpython' if expected_exe.endswith('python3') else 'pyodide'
    require(int((parent/'memory.max').read_text()) == (256 if engine == 'cpython' else 448) * 2**20, 'Guest hard memory cap changed')
    require((learner/'memory.swap.max').read_text().strip() == '0', 'Learner swap ceiling absent')
    leaf_max = (learner/'memory.max').read_text().strip()
    if engine == 'cpython':
        require(128 * 2**20 < int(leaf_max) <= 192 * 2**20, 'Native baseline plus semantic allowance exceeds funding')
    else:
        require(leaf_max == 'max', 'Compatibility sampled-growth policy changed')
    return dict(identity=identity, parent=str(parent), control=str(control), leaf=str(learner), learner=facts,
                exec=event, namespaces=namespaces, engine=engine, memoryPolicy='kernel-baseline-growth' if engine == 'cpython' else 'sampled-growth-hard-ancestor', leafMax=leaf_max, pidns=os.readlink(f'/proc/{pid}/ns/pid'),
                shmemBefore=counters(learner, 'memory.stat')['shmem'], before={name: counters(path) for name, path in [('learner', learner), ('parent', parent), ('control', control), ('family', state['cgroupParent'])]})


def marker_at(item, token):
    # Open each component relative to the exact live init root; never follow a
    # student-selected symlink. A marker cannot select a host path or fault target.
    pid = item['State']['Pid']
    root = os.open(f'/proc/{pid}/root', os.O_RDONLY | os.O_DIRECTORY)
    tmp = marker = None
    try:
        tmp = os.open('tmp', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
        marker = os.open('cove-ci-marker', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=tmp)
        info = os.fstat(marker)
        require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= 2048, 'Invalid scratch marker')
        value = json.loads(os.read(marker, 2049))
        if value.get('token') != token: return None
        require(type(value.get('pid')) is int and isinstance(value.get('children'), list) and len(value['children']) < 32 and all(type(p) is int for p in value['children']), 'Invalid marker process identities')
        return value
    except FileNotFoundError: return None
    finally:
        for fd in (marker, tmp, root):
            if fd is not None: os.close(fd)


def verify_removed(state, guest):
    require(all(item['Id'] != guest['identity']['id'] for item in host.census(state)), 'Owned guest remains in daemon census')
    require(not Path(guest['parent']).exists(), 'Owned guest cgroup remains')
    for process in Path('/proc').iterdir():
        if not process.name.isdigit(): continue
        try:
            require(os.readlink(process/'ns/pid') != guest['pidns'], 'Guest namespace survivor remains')
        except (FileNotFoundError, ProcessLookupError): pass
    try:
        require(start_time(guest['identity']['pid']) != guest['identity']['startTime'], 'Original init incarnation survived')
    except (FileNotFoundError, ProcessLookupError): pass


def source_hash(request):
    phase = next((p for p, names in dict(functional=FUNCTIONAL, isolation=('isolation',), limits=('memory', 'pids'), cancellation=('cancel',), recovery=('retained', 'active-restart', 'parent-oom', 'control-oom')).items() if request['name'] in names), None)
    code = "import {fixtures,sourceFor} from '/opt/cove/grading/ci/linux-kernel-smoke.mjs'; import {createHash} from 'node:crypto'; const [phase,engine,name,token]=process.argv.slice(1); const f=fixtures(phase,engine).find(x=>x.name===name); if(!f)throw Error('Unknown case'); console.log(createHash('sha256').update(sourceFor(f,token)).digest('hex'));"
    return host.command(['/opt/cove/bin/node', '--input-type=module', '-e', code, phase, request['engine'], request['name'], request['token']])


def journal_case(state, request):
    # Production Journal performs its own private-owner/schema/quota checks.
    # Only allocation/context and receipt hash leave the grading account.
    code = "import {Journal} from '/opt/cove/grading/current/dist/journal.js'; import {createHash} from 'node:crypto'; const [directory,reservation,caseId]=process.argv.slice(1); const d=await new Journal(directory).read(); const r=d?.records.find(r=>r.id===reservation); const c=r?.cases.find(c=>c.context.caseId===caseId); console.log(JSON.stringify(c ? {context:c.context, allocation:c.allocation, state:c.state, uncertain:c.uncertain===true, receiptHash:c.receipt?createHash('sha256').update(JSON.stringify(c.receipt)).digest('hex'):null}:null));"
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        value = json.loads(host.user_command(state, '/opt/cove/bin/node', '--input-type=module', '-e', code, state['journalDirectory'], request['reservationId'], request['context']['caseId']))
        if value and value.get('allocation'):
            require(value['context'] == request['context'], 'Journal context differs')
            return value
        time.sleep(.05)
    raise ValueError('Original case journal allocation absent')


def restart_broker(state, crash=False):
    old = host.service_pid(state, 'cove-grading-broker.service')
    before = start_time(old)
    if crash:
        host.user_command(state, 'systemctl', '--user', 'kill', '--kill-whom=main', '--signal=SIGKILL', 'cove-grading-broker.service')
    host.user_command(state, 'systemctl', '--user', 'restart', 'cove-grading-broker.service', timeout=90)
    host.wait_for(lambda: host.health(state), 90, 'Broker did not recover real mixed warm pool')
    new = host.service_pid(state, 'cove-grading-broker.service')
    require((new, start_time(new)) != (old, before), 'Broker restart incarnation unchanged')
    # Never refresh the daemon attestation to hide daemon death/restart.
    host.attest_daemon(state)


def pressure(state, guest, local, observer):
    require(local in ('parent', 'control'), 'Unknown fixed pressure scope')
    # Only the selected disposable guest/control can change. No daemon path,
    # unit, arbitrary process, code or limit is accepted from the coordinator.
    parent = Path(guest['parent'])
    require(parent.is_dir(), 'Fault target disappeared')
    current = next((x for x in host.census(state) if x['Id'] == guest['identity']['id']), None)
    require(current is not None, 'Fault guest missing')
    validate_identity(guest['identity'], process_identity(current))
    target = Path(guest['control']) if local == 'control' else parent/'ci-pressure'
    if local == 'control':
        require((target/'memory.max').read_text().strip() == 'max', 'Control leaf already constrained')
        (target/'memory.max').write_text(str(64 * 2**20))
    else: target.mkdir()
    # The child blocks on a pipe before allocation; parent places and verifies
    # it first. Drop groups/UID/GID, set NNP and remove every trusted FD before
    # fixed allocation. Child has no daemon/socket/home capability.
    code = '''import os,ctypes,time
assert os.read(0,1)==b'I'
os.setgroups([]); os.setgid(65534); os.setuid(65534)
assert ctypes.CDLL(None).prctl(38,1,0,0,0)==0
os.write(1,b'READY')
assert os.read(0,1)==b'A'
for fd in range(0,1024):
 try: os.close(fd)
 except OSError: pass
x=[]
for i in range(40):
 x.append(bytearray(16*1024*1024)); time.sleep(.01)
time.sleep(5)
'''
    child = subprocess.Popen(['/usr/bin/python3', '-I', '-c', code], stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             env={'PATH': '/usr/bin:/bin'}, close_fds=True)
    try:
        (target/'cgroup.procs').write_text(str(child.pid))
        Path(f'/proc/{child.pid}/oom_score_adj').write_text('1000')
        require(host.group(child.pid) == target, 'Pressure escaped fixed target')
        identity = dict(pid=child.pid, startTime=start_time(child.pid), cgroupId=cgroup_id(target), leaf=str(target), before=counters(target), pidfd=os.pidfd_open(child.pid,0))
        child.stdin.write(b'I'); child.stdin.flush()
        require(select.select([child.stdout], [], [], 5)[0] and os.read(child.stdout.fileno(),5) == b'READY', 'Pressure privilege drop failed')
        status = Path(f'/proc/{child.pid}/status').read_text()
        require(re.search(r'^Uid:\s+65534\s+65534\s+65534\s+65534$', status, re.M) and re.search(r'^CapEff:\s+0+$',status,re.M) and re.search(r'^NoNewPrivs:\s+1$',status,re.M), 'Pressure retained privilege')
        child.stdout.close()
        observer.watch_victim(child.pid)
        child.stdin.write(b'A'); child.stdin.close()
        return child, identity, target
    except BaseException:
        child.kill(); child.wait(timeout=5)
        if 'identity' in locals(): os.close(identity['pidfd'])
        raise


class Controller:
    def __init__(self, state, observer):
        self.state = state; self.observer = observer
        self.proof = dict(preInitEngines=[], cases={}, workerPhases=[]); self.cleanup_failures = []
        self.current = None; self.seen = set(); self.used_guests = set(); self.last_stage = None; self.expected = []; self.candidates = {}
        self.proof['allocations'] = []

    def warm_proof(self):
        engines = set()
        for item in host.census(self.state):
            guest = live_guest(self.state, item, self.observer)
            engines.add(guest['engine'])
        require(engines == {'cpython', 'pyodide'}, 'Mixed pre-init kernel proof missing')
        self.proof['preInitEngines'] = sorted(engines)

    def wait_marker(self, request):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            self.observer.drain()
            for item in host.census(self.state):
                if not item['State']['Running']: continue
                initial = process_identity(item)
                marker = marker_at(item, request['token'])
                if marker is None: continue
                validate_identity(initial, process_identity(item))
                guest = live_guest(self.state, item, self.observer)
                learner_pid = guest['learner']['pid']
                ns_pid = int(re.search(r'^NSpid:\s+(.+)$', Path(f'/proc/{learner_pid}/status').read_text(), re.M)[1].split()[-1])
                require(ns_pid == marker['pid'], 'Marker does not bind interpreter')
                guest['markerObserved'] = True
                guest['markerChildren'] = marker['children']
                if request['name'] in ('pids', 'cancel', 'active-restart'):
                    actual = [int(x) for x in (Path(guest['leaf'])/'cgroup.procs').read_text().split()]
                    namespace_pids = {int(re.search(r'^NSpid:\s+(.+)$', Path(f'/proc/{p}/status').read_text(), re.M)[1].split()[-1]) for p in actual}
                    require(set(marker['children']) <= namespace_pids and len(actual) <= 31, 'Descendants escaped learner/PID ceiling')
                    require(counters(guest['parent'], 'pids.events')['max'] > 0, 'No actual PID limit event')
                    guest['pidsLimitReached'] = True
                return guest
            time.sleep(.025)
        raise ValueError('Actual source release marker absent')

    def monitor_oom(self, guest, local, child=None, victim=None):
        target = guest['leaf'] if local == 'learner' else guest[local]
        before = guest['before'][local]
        victim = victim or {**guest['learner'], 'leaf':guest['leaf'], 'before':guest['before']['learner']}
        self.observer.watch_victim(victim['pid'])
        pidfd = victim.pop('pidfd', None)
        if pidfd is None: pidfd = os.pidfd_open(victim['pid'], 0)
        deadline = time.monotonic() + 12
        try:
            while time.monotonic() < deadline:
                self.observer.drain()
                after = counters(target)
                victim_after = counters(victim['leaf'])
                if after['oom'] > before['oom'] and victim_after['oom_kill'] > victim['before']['oom_kill'] and victim['pid'] in self.observer.victims:
                    proof = dict(before=before, after=after, victimBefore=victim['before'], victimAfter=victim_after, victimPid=victim['pid'], victimStartTime=victim['startTime'],
                                 cgroupId=cgroup_id(target), victimCgroupId=victim['cgroupId'],
                                 kernelVictims=list(self.observer.victims), pidfdHeld=True, observedBeforeRemoval=Path(target).is_dir(), scope=local)
                    validate_oom(proof, victim['pid'])
                    if local == 'learner':
                        for level in ('parent', 'control', 'family'):
                            require(counters(guest[level])['oom'] == guest['before'][level]['oom'], 'Learner OOM accompanied by parent/control/family OOM')
                    elif local == 'parent':
                        require(counters(guest['family'])['oom'] == guest['before']['family']['oom'], 'Parent fault escaped to family OOM')
                    else:
                        for level in ('parent', 'family'):
                            require(counters(guest[level])['oom'] == guest['before'][level]['oom'], 'Control fault escaped its local cgroup')
                    guest['oom'] = proof
                    return
                time.sleep(.002)
            raise ValueError('Actual victim/local OOM counter proof absent')
        finally:
            os.close(pidfd)
            if child is not None:
                if child.poll() is None: child.kill()
                child.wait(timeout=5)

    def handle(self, request):
        state = self.state
        name = request.get('name'); engine = request.get('engine'); stage = request.get('stage')
        require((engine, name) in REQUIRED and stage in ('armed', 'pending', 'retained', 'recovered', 'removed'), 'Unknown fixed case/stage')
        require(UUID.fullmatch(request.get('token', '')) and HEX.fullmatch(request.get('sourceHash', '')), 'Invalid source identity')
        if stage == 'armed':
            require(self.current is None and (engine, name) not in self.seen, 'Repeated failed/completed case refused')
            require(self.expected and self.expected[0] == (engine, name), 'Unexpected case/phase order')
            require(UUID.fullmatch(request.get('context', {}).get('caseId', '')) and UUID.fullmatch(request.get('reservationId', '')), 'Invalid case lease')
            self.last_stage = 'armed'
            self.current = {k: request[k] for k in ('name', 'engine', 'context', 'reservationId', 'sourceHash', 'token')}
            require(source_hash(request) == request['sourceHash'], 'Source differs from fixed case')
            self.seen.add((engine, name))
            host.wait_for(lambda: host.health(state), 90, 'Fresh mixed warm guests unavailable')
            self.candidates = {x['Id']: live_guest(state, x, self.observer) for x in host.census(state)}
            return
        require(self.current is not None and all(request.get(k) == v for k, v in self.current.items()), 'Phase source/lease changed')
        expected_stage = {'armed':'pending', 'pending':'retained' if name == 'retained' else 'removed', 'retained':'recovered', 'recovered':'removed'}.get(self.last_stage)
        require(stage == expected_stage, 'Invalid/repeated host fault transition')
        self.last_stage = stage
        if stage == 'pending':
            allocation = journal_case(state, request)['allocation']
            cid = allocation.get('containerId')
            require(cid in self.candidates and cid not in self.used_guests, 'Missing or reused fresh source guest')
            require(allocation.get('hostInitPid') == self.candidates[cid]['identity']['pid'] and allocation.get('cgroupPath') == self.candidates[cid]['parent'], 'Journal/PID/cgroup identity differs')
            self.used_guests.add(cid)
            self.bound_guest = self.candidates[cid]
            self.proof['allocations'].append(dict(engine=engine, name=name, caseId=request['context']['caseId'], sourceHash=request['sourceHash'], context=request['context'], reservationId=request['reservationId'], containerId=cid, learner=self.bound_guest['learner'], exec=self.bound_guest['exec']))
        if stage == 'pending' and name in NATIVE and name != 'retained':
            guest = self.wait_marker(request)
            validate_identity(self.bound_guest['identity'], guest['identity'])
            guest['family'] = state['cgroupParent']
            if name == 'isolation':
                shmem = counters(guest['leaf'], 'memory.stat')['shmem']
                require(shmem - self.bound_guest['shmemBefore'] >= 2*2**20, 'Private tmpfs pages were not charged to learner')
                guest['scratchCharge'] = dict(before=self.bound_guest['shmemBefore'], after=shmem)
            self.proof['cases'][name] = guest
            if name == 'memory': self.monitor_oom(guest, 'learner')
            elif name == 'active-restart':
                require(journal_case(state, request)['state'] == 'RUNNING', 'Active restart journal was not running')
                restart_broker(state, crash=True); verify_removed(state, guest); guest['removed'] = True
            elif name in ('parent-oom', 'control-oom'):
                local = 'parent' if name == 'parent-oom' else 'control'
                child, victim, target = pressure(state, guest, local, self.observer)
                self.monitor_oom(guest, local, child, victim)
                if local == 'parent' and target.exists(): target.rmdir()
        elif stage == 'retained':
            require(name == 'retained' and HEX.fullmatch(request.get('receiptHash', '')), 'Invalid retained receipt')
            # No active native source now: only fresh unused guests may exec on
            # restart. Original receipt/context/hash must be identical afterward.
            require(journal_case(state, request).get('receiptHash') == request['receiptHash'], 'Retained receipt differs from durable journal')
            self.proof['cases'][name] = dict(before=request, beforeContainers=sorted(x['Id'] for x in host.census(state)))
            restart_broker(state)
            self.proof['cases'][name]['restartContainers'] = sorted(x['Id'] for x in host.census(state))
        elif stage == 'recovered':
            proof = self.proof['cases'].get(name, {})
            validate_recovery(proof.get('before', {}), request)
            require(journal_case(state, request).get('receiptHash') == request['receiptHash'], 'Recovered journal receipt differs')
            require(sorted(x['Id'] for x in host.census(state)) == proof['restartContainers'], 'Recovery created a source guest')
            proof.update(after=request, noReplay=True)
        elif stage == 'removed':
            durable = journal_case(state, request)
            require(durable['state'] == 'REMOVED', 'Journal cleanup not confirmed')
            if name in ('cancel', 'active-restart', 'parent-oom', 'control-oom'):
                require(durable.get('uncertain') is True and durable.get('receiptHash') is None, 'Fault produced a scoring receipt')
            verify_removed(state, self.bound_guest)
            guest = self.proof['cases'].get(name)
            if guest and name != 'retained':
                verify_removed(state, guest); guest['removed'] = True
                if name == 'isolation':
                    facts = request.get('isolation', {})
                    scratch = facts.get('scratch', {})
                    require(scratch.get('/tmp') == 16*2**20 and type(scratch.get('/dev/shm')) is int and 0 < scratch['/dev/shm'] <= 64*2**20, 'Private scratch mount bound differs')
                    guest['scratchMountBytes'] = scratch
                    require(facts.get('pidns') == guest['pidns'] and all(facts.get(ns) != os.readlink('/proc/1/ns/'+ns.removesuffix('ns')) for ns in ('pidns', 'netns', 'userns')), 'Host namespace exposed')
                if name in ('parent-oom', 'control-oom'): restart_broker(state)
            self.current = None
            self.expected.pop(0)

    def phase(self, phase):
        state = self.state; directory = host.EVIDENCE
        manifest = read_bounded(state['manifestPath'], 0)
        names = dict(functional=FUNCTIONAL, isolation=('isolation',), limits=('memory', 'pids'), cancellation=('cancel',), recovery=('retained', 'active-restart', 'parent-oom', 'control-oom'))[phase]
        self.expected = [(runtime['engine'], name) for runtime in manifest['capabilities']['runtimes'] for name in names if phase == 'functional' or runtime['engine'] == 'cpython']
        result = directory/(phase+'.json'); request_path = directory/(phase+'.request.json'); reply_path = directory/(phase+'.reply.json')
        require(not any(path.exists() or path.is_symlink() for path in (result, request_path, reply_path)), 'Phase evidence already exists')
        args = ['systemd-run', '--quiet', '--unit='+state['workerService'], '--property=User=cove-grading-ci-worker',
                '--property=Group=cove-grading-ci-worker', '--property=SupplementaryGroups=cove-grading-control',
                '--property=Slice='+state['workerSlice'], '--property=MemoryMax=768M', '--property=MemorySwapMax=0',
                '--property=CPUQuota=75%', '--property=TasksMax=256', '--property=NoNewPrivileges=yes',
                '--property=RuntimeMaxSec=600', '--property=RemainAfterExit=yes', '--property=UMask=0077', '--property=Environment=HOME=/home/cove-grading-ci-worker',
                '/opt/cove/bin/node', '/opt/cove/grading/ci/linux-kernel-smoke.mjs', '--phase', phase,
                '--config', str(host.PUBLIC), '--result', str(result)]
        host.command(args)
        serial = 0; deadline = time.monotonic() + 610
        try:
            group = Path('/sys/fs/cgroup'+host.command(['systemctl', 'show', state['workerService'], '-p', 'ControlGroup', '--value']))
            require(Path(state['workerCgroup']) in group.parents and host.limits(group) == host.WORKER_LIMITS, 'Coordinator escaped effective budget')
            worker_pid = int(host.command(['systemctl', 'show', state['workerService'], '-p', 'MainPID', '--value']))
            worker_status = Path(f'/proc/{worker_pid}/status').read_text()
            worker_uids = list(map(int,re.search(r'^Uid:\s+(.+)$',worker_status,re.M)[1].split()))
            worker_groups = set(map(int,re.search(r'^Groups:\s*(.*)$',worker_status,re.M)[1].split()))
            require(worker_uids == [state['workerUid']]*4 and worker_groups <= {state['controlGid'],state['workerGid']} and state['controlGid'] in worker_groups and host.group(worker_pid) == group, 'Coordinator authority differs')
            self.proof['workerPhases'].append(dict(phase=phase,uid=worker_uids[0],cgroup=str(group),limits=host.limits(group)))
            while time.monotonic() < deadline:
                self.observer.drain()
                if request_path.exists():
                    request = read_bounded(request_path, state['workerUid'])
                    if request.get('serial') != serial:
                        require(request.get('serial') == serial + 1, 'Skipped/replayed host request')
                        self.handle(request); serial += 1
                        host.atomic_json(reply_path, dict(serial=serial, ok=True), mode=0o644)
                status = host.command(['systemctl', 'show', state['workerService'], '-p', 'SubState', '--value'])
                if status in ('exited', 'failed'):
                    require(host.command(['systemctl', 'show', state['workerService'], '-p', 'ExecMainStatus', '--value']) == '0', 'Coordinator phase failed')
                    value = read_bounded(result, state['workerUid'])
                    require(value.get('success') is True and self.current is None and not self.expected, 'Coordinator incomplete')
                    require(value.get('phase') == phase, 'Coordinator phase mismatch')
                    return value['cases']
                time.sleep(.025)
            raise ValueError('Phase runtime budget exhausted')
        finally:
            primary = sys.exc_info()[0]
            try:
                host.command(['systemctl', 'stop', state['workerService']])
                if host.command(['systemctl', 'show', state['workerService'], '-p', 'LoadState', '--value']) != 'not-found':
                    host.command(['systemctl', 'reset-failed', state['workerService']])
            except Exception as error:
                self.cleanup_failures.append(type(error).__name__)
                if primary is None: raise


def reserve_observation(path):
    return dict(cgroup=str(path), limits=host.limits(path),
                memoryCurrentBytes=int((path/'memory.current').read_text()),
                memoryPeakBytes=int((path/'memory.peak').read_text()),
                pids=int((path/'pids.current').read_text()),
                events=counters(path), cpu=counters(path, 'cpu.stat'))


def controller():
    host.check_host(); state = host.load_state()
    for path, snapshot in state.get('kernelFiles', {}).items(): host.validate_owned(path, snapshot)
    require(len(state.get('kernelFiles', {})) == 5, 'Installed kernel harness identity absent')
    own = host.group(os.getpid())
    require(own.name == KERNEL_SERVICE and own.parent.name == 'system.slice' and host.limits(own) == RESERVE, 'Host controller reserve absent')
    before = host.observe(state); validate_observation(before)
    report = dict(version=1, success=False, cases=[], productionEquivalent=False, nativeAcceptanceExecuted=False,
                  systemReserve=RESERVE, systemReserveBefore=reserve_observation(own), before=before)
    observer = None
    try:
        # Docker rootless maps container UID0 to grading UID; guest UID1000 maps
        # to subordinateStart+999. Each event is rechecked against /proc/uid_map.
        observer = Observer(state['subordinateStart'] + 999)
        restart_broker(state)
        control = Controller(state, observer); control.warm_proof()
        for phase in PHASES:
            report['cases'].extend(control.phase(phase))
        observer.drain(); report['hostProof'] = control.proof
        report['kernelEvents'] = observer.events
        report['systemReserveAfter'] = reserve_observation(own)
        require(report['systemReserveAfter']['events']['oom'] == report['systemReserveBefore']['events']['oom'], 'Host observer reserve OOM')
        report['after'] = host.observe(state); validate_observation(report['after'])
        report['success'] = True
        validate_results(report)
    except BaseException as error:
        report['success'] = False
        report['failure'] = dict(category='infrastructure-or-kernel-contract', type=type(error).__name__, message=str(error)[:300])
        if observer is not None:
            report['kernelEvents'] = observer.events
            if 'control' in locals():
                report['hostProof'] = control.proof
                report['shutdownFailures'] = control.cleanup_failures
        raise
    finally:
        try:
            if observer is not None: observer.close()
        except Exception as error:
            report['success'] = False
            report.setdefault('failure', dict(category='observer-shutdown', type=type(error).__name__))
        require(len(json.dumps(report).encode()) <= 2*1024*1024, 'Kernel report bound exceeded')
        host.atomic_json(host.STATE_DIR/'kernel.json', report, mode=0o600)
        # Collection convenience only: root-owned state-parent copy is authority.
        host.atomic_json(host.EVIDENCE/'kernel.json', report, mode=0o644)
    require(report['success'], 'Kernel observer shutdown failed')


def install_copy(state, path, content):
    require(path.is_relative_to(host.OPT) and not path.exists() and not path.is_symlink(), 'Harness staging target occupied')
    with path.open('x') as file: file.write(content)
    path.chmod(0o644)
    state.setdefault('kernelFiles', {})[str(path)] = host.snapshot(path)
    host.save(state)


def official_observer_candidate(policy):
    match = re.search(r'^\s*Candidate: ([A-Za-z0-9.+:~_-]+)$', policy, re.M)
    require(match is not None, 'Official Ubuntu bpftrace candidate absent')
    candidate = match[1]
    version = re.search(r'^[ \t]*(?:\*\*\* )?'+re.escape(candidate)+r' \d+\n((?:[ \t]{6,}[^\n]+\n?)*)', policy, re.M)
    require(version is not None, 'Candidate repository unavailable')
    urls = re.findall(r'https?://[^\s]+', version[1])
    require(urls and all(re.fullmatch(r'https?://(?:[a-z0-9-]+\.)*ubuntu\.com/ubuntu/?', url) for url in urls), 'Unofficial bpftrace candidate refused')
    return candidate


def run():
    host.check_host(); state = host.load_state()
    before = host.observe(state); validate_observation(before)
    require(not state.get('kernelAttempt') and not (host.STATE_DIR/'kernel.json').exists(), 'Kernel run already attempted; do not select successful reruns')
    state['kernelAttempt'] = True; host.save(state)
    # Official Ubuntu package only; no script downloads or repository additions.
    policy = host.command(['apt-cache', 'policy', 'bpftrace'])
    package = 'bpftrace=' + official_observer_candidate(policy)
    simulation = host.command(['apt-get', '--simulate', '--no-install-recommends', 'install', package])
    require(not re.search(r'^(?:Remv|Inst (?:docker|containerd|runc))', simulation, re.M), 'Observer install would alter daemon packages')
    host.command(['apt-get', 'install', '-y', '--no-install-recommends', package], timeout=180)
    require(Path('/usr/bin/bpftrace').is_file(), 'Official kernel observer unavailable')
    root = Path(__file__).resolve().parents[4]
    ci = host.OPT/'scripts/grading/ci'; ci.mkdir(exist_ok=False)
    for name in ('kernel.py', 'exec_observer.py', 'provision.py'):
        install_copy(state, ci/name, (Path(__file__).parent/name).read_text())
    install_copy(state, host.OPT/'grading/ci/linux-kernel-smoke.mjs', (root/'packages/grading-runtime/test/linux-kernel-smoke.mjs').read_text())
    # Canary is fixed and owned; no external application data is required.
    # Keep canary under already-owned /opt rather than widen Task1 cleanup roots.
    install_copy(state, host.OPT/'ci-host-canary', state['runId']+'\n')
    require(host.command(['systemctl', 'show', KERNEL_SERVICE, '-p', 'LoadState', '--value']) == 'not-found', 'Controller unit already exists')
    try:
        host.command(['systemd-run', '--quiet', '--wait', '--unit='+KERNEL_SERVICE,
                      '--property=Slice=system.slice', '--property=MemoryMax=512M', '--property=MemorySwapMax=0',
                      '--property=CPUQuota=50%', '--property=TasksMax=128', '--property=RuntimeMaxSec=1800',
                      '--property=UMask=0077', '--setenv=GITHUB_ACTIONS=true', '--setenv=RUNNER_ENVIRONMENT=github-hosted',
                      '--setenv=GRADING_DISPOSABLE_CI=1', '/usr/bin/python3', str(ci/'kernel.py'), '_controller'], timeout=1830)
    finally:
        primary = sys.exc_info()[0]
        try:
            if host.command(['systemctl', 'show', KERNEL_SERVICE, '-p', 'LoadState', '--value']) != 'not-found':
                host.command(['systemctl', 'stop', KERNEL_SERVICE], timeout=30)
        except Exception:
            if primary is None: raise
    value = read_bounded(host.STATE_DIR/'kernel.json', 0, 2*1024*1024)
    validate_results(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('run', '_controller'))
    args = parser.parse_args()
    def interrupted(signum, frame):
        raise InterruptedError('Kernel harness interrupted')
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
    try:
        (run if args.command == 'run' else controller)()
    except Exception as error:
        try:
            host.check_host()
            failed_state = host.load_state()
            if failed_state.get('kernelAttempt') and not (host.STATE_DIR/'kernel.json').exists():
                host.atomic_json(host.STATE_DIR/'kernel.json', dict(version=1, success=False, cases=[], failure=dict(category='kernel-setup-or-interruption', type=type(error).__name__, message=str(error)[:300])), mode=0o600)
        except Exception: pass
        print('Disposable kernel checks failed: '+type(error).__name__+': '+str(error)[:300], file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__': sys.exit(main())
