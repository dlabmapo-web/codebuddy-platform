import copy
import unittest
import kernel

class KernelContracts(unittest.TestCase):
    def test_missing_required_native_case_fails(self):
        with self.assertRaises(ValueError):
            kernel.validate_results({'version': 1, 'cases': []})

    def test_rootful_or_unbounded_parent_fails(self):
        with self.assertRaises(ValueError):
            kernel.validate_observation({'rootless': False})

    def test_wrong_effective_limits(self):
        for key in ('family', 'worker'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                kernel.validate_observation({'rootless': True, key: {'memoryBytes': 'max'}})

    def test_absent_preinit_proof(self):
        with self.assertRaises(ValueError):
            kernel.validate_exec({}, {'pid': 123, 'uid': 11000, 'cgroupId': 456})

    def test_pid_or_census_change(self):
        for changed in ({'id': 'a', 'pid': 2, 'startTime': '1'}, {'id': 'b', 'pid': 1, 'startTime': '1'}):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                kernel.validate_identity({'id': 'a', 'pid': 1, 'startTime': '1'}, changed)

    def test_absent_actual_oom(self):
        with self.assertRaises(ValueError):
            kernel.validate_oom({'before': {'oom': 0, 'oom_kill': 0}, 'after': {'oom': 0, 'oom_kill': 0}}, 123)

    def test_recovered_receipt_or_source_mismatch(self):
        old = {'receiptHash': 'a', 'sourceHash': 'b', 'context': {'caseId': '1'}, 'reservationId': 'r'}
        for key in old:
            new = copy.deepcopy(old); new[key] = 'different'
            with self.subTest(key=key), self.assertRaises(ValueError):
                kernel.validate_recovery(old, new)


# These are schema/transport refusal fixtures, never positive native evidence.
import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
from unittest.mock import Mock, patch
import uuid
import exec_observer


def observation():
    return dict(rootless=True, cgroupDriver='systemd', cgroupVersion='2',
                family=dict(kernel.host.FAMILY_LIMITS), worker=dict(kernel.host.WORKER_LIMITS),
                controllers=['memory', 'pids', 'cpu'],
                hostEnvelope=dict(unreservedMemoryBytes=1024**3, unreservedCpus=.75))


def oom():
    return dict(before=dict(oom=0, oom_kill=0), after=dict(oom=1, oom_kill=0),
                victimBefore=dict(oom_kill=0), victimAfter=dict(oom_kill=1),
                victimPid=123, victimStartTime='456', kernelVictims=[123],
                cgroupId=789, victimCgroupId=790, observedBeforeRemoval=True, pidfdHeld=True)


def event():
    return dict(kind='EXEC', pid=123, uid=101000, cgroupId=456, executable='/usr/local/bin/python3')


class EvidenceContracts(unittest.TestCase):
    def test_exact_observed_budget_and_headroom(self):
        kernel.validate_observation(observation())
        for group in ('family', 'worker'):
            for field in ('memoryBytes', 'cpus', 'pids', 'swapBytes'):
                value = observation(); value[group][field] += 1
                with self.subTest(group=group, field=field), self.assertRaises(ValueError):
                    kernel.validate_observation(value)
        for change in ({'controllers': ['memory']}, {'cgroupVersion': '1'}, {'hostEnvelope': {}}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                kernel.validate_observation({**observation(), **change})

    def test_preinit_requires_kernel_exec_identity_not_ready_boolean(self):
        identity = {k: event()[k] for k in ('pid', 'uid', 'cgroupId')}
        kernel.validate_exec(event(), identity)
        for key, changed in [('kind', 'READY'), ('pid', 124), ('uid', 0), ('cgroupId', 457), ('executable', '/bin/sh')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                kernel.validate_exec({**event(), key: changed}, identity)

    def test_parent_oom_uses_victim_leaf_kill_not_parent_kill(self):
        kernel.validate_oom(oom(), 123)  # Parent-local oom_kill is correctly zero.
        mutations = [('after', dict(oom=0, oom_kill=100)), ('victimAfter', dict(oom_kill=0)),
                     ('kernelVictims', [124]), ('victimStartTime', None),
                     ('observedBeforeRemoval', False), ('pidfdHeld', False), ('victimPid', 124), ('cgroupId', 0)]
        for key, changed in mutations:
            with self.subTest(key=key), self.assertRaises(ValueError):
                kernel.validate_oom({**oom(), key: changed}, 123)

    def test_bounded_reader_rejects_symlink_fifo_owner_and_overflow(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'data'; path.write_text('{}')
            self.assertEqual(kernel.read_bounded(path, os.getuid()), {})
            link = Path(folder)/'link'; link.symlink_to(path)
            with self.assertRaises(OSError): kernel.read_bounded(link)
            fifo = Path(folder)/'fifo'; os.mkfifo(fifo)
            with self.assertRaises(ValueError): kernel.read_bounded(fifo)
            with self.assertRaises(ValueError): kernel.read_bounded(path, os.getuid()+1)
            path.write_text('x'*65)
            with self.assertRaises(ValueError): kernel.read_bounded(path, maximum=64)

    def test_fault_rejects_unknown_case_order_and_duplicate_transition_before_admin(self):
        observer = Mock()
        control = kernel.Controller({}, observer)
        identity = dict(name='parent-oom', engine='cpython', token=str(uuid.uuid4()),
                        sourceHash='a'*64, context={'caseId':str(uuid.uuid4())}, reservationId=str(uuid.uuid4()))
        with patch.object(kernel.host, 'command') as command, patch.object(kernel.host, 'user_command') as user:
            with self.assertRaisesRegex(ValueError, 'case/phase order'):
                control.handle({**identity, 'stage':'armed'})
            control.current = identity; control.last_stage = 'pending'
            with self.assertRaisesRegex(ValueError, 'fault transition'):
                control.handle({**identity, 'stage':'pending'})
            command.assert_not_called(); user.assert_not_called()

    def test_changed_source_or_lease_is_refused_before_fault(self):
        control = kernel.Controller({}, Mock())
        identity = dict(name='active-restart', engine='cpython', token=str(uuid.uuid4()), sourceHash='a'*64,
                        context={'caseId':str(uuid.uuid4())}, reservationId=str(uuid.uuid4()))
        control.current = identity; control.last_stage = 'armed'
        for key in ('sourceHash', 'reservationId', 'token', 'context'):
            change = {'sourceHash':'b'*64, 'reservationId':str(uuid.uuid4()), 'token':str(uuid.uuid4()), 'context':{'caseId':'changed'}}[key]
            with self.subTest(key=key), patch.object(kernel, 'journal_case') as read, self.assertRaises(ValueError):
                control.handle({**identity, key:change, 'stage':'pending'})
            read.assert_not_called()

    def test_macos_refuses_before_any_mutation(self):
        with patch.object(kernel.host.platform, 'system', return_value='Darwin'), patch.object(kernel.host, 'command') as command:
            with self.assertRaisesRegex(ValueError, 'Disposable Ubuntu'): kernel.run()
            command.assert_not_called()

    def test_cgroup_id_uses_file_handle_refuses_untrusted_path(self):
        with self.assertRaises(ValueError): exec_observer.cgroup_id('/tmp/arbitrary')

    def test_observer_script_is_read_only_and_retains_no_argv_or_env(self):
        script = exec_observer.program(101000)
        self.assertIn('sys_enter_execve', script)
        self.assertIn('sched_process_exec', script)
        self.assertIn('oom:mark_victim', script)
        self.assertNotIn('args.argv', script); self.assertNotIn('args.env', script)
        self.assertNotIn('system(', script); self.assertNotIn('signal(', script)
        with self.assertRaises(ValueError): exec_observer.program(0)

    def test_observer_parser_rejects_failed_exec_and_discards_unrelated_victims(self):
        observer = exec_observer.Observer.__new__(exec_observer.Observer)
        observer.events=[]; observer.gates={}; observer.execs={}; observer.victims=[]; observer.watched_victims={123}
        observer.lines=queue.Queue(); observer.error=None; observer.process=Mock(); observer.process.poll.return_value=None
        for line in ('GATE 123 101000 456 /usr/local/bin/python3', 'EXEC 123 101000 456 /usr/local/bin/python3', 'OOM 999', 'OOM 123'):
            observer.lines.put(line)
        observer.drain()
        self.assertEqual(observer.victims,[123]); self.assertEqual(len(observer.events),3)
        self.assertEqual(observer.execs[123],event())
        observer.lines.put('FAILED 123')
        with self.assertRaisesRegex(ValueError, 'failed kernel'): observer.drain()
        observer.error='lost events'
        with self.assertRaises(ValueError): observer.check()


class CoordinatorContracts(unittest.TestCase):
    def node(self, code):
        root = Path(__file__).resolve().parents[4]
        result = subprocess.run(['node', '--input-type=module', '-e', code], cwd=root,
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr[:1000])
        return result.stdout

    def test_source_fixtures_and_exact_boundaries(self):
        self.node("""
import assert from 'node:assert/strict';
import {fixtures, sourceFor, capture, MAX} from './packages/grading-runtime/test/linux-kernel-smoke.mjs';
for(const engine of ['cpython','pyodide']) {
 const f=fixtures('functional',engine); assert.equal(f.length,8);
 assert.equal(f.find(x=>x.name==='timeout').timeLimitMs,1000);
 assert.equal(f.find(x=>x.name==='stdin-consumed').stdin.length,8388608);
 assert.equal(f.find(x=>x.name==='stdin-unconsumed').stdin.length,8388608);
 assert.equal(f.find(x=>x.name==='output-exact').expected.length,MAX);
 assert.equal(f.find(x=>x.name==='output-over').truncated,true);
 assert.equal(f.find(x=>x.name==='unicode-include').expected,'prompt:한😀\\n');
 assert.equal(f.find(x=>x.name==='unicode-ignore').expected,'한😀\\n');
}
const f=fixtures('cancellation','cpython')[0];
assert.notEqual(sourceFor(f,'a'),sourceFor(f,'b'));
assert(sourceFor(f,'a').includes("'/tmp/cove-ci-marker'"));
assert(sourceFor(f,'a').includes('os.setsid()'));
assert.deepEqual(Object.keys(capture('\\0'.repeat(MAX))).sort(),['bytes','sha256']);
assert.equal(JSON.stringify(capture('\\0'.repeat(MAX))).length < 120,true);
assert.throws(()=>fixtures('unknown','cpython'));
""")

    def test_only_pre_release_busy_retries_then_receipt_polling(self):
        self.node("""
import assert from 'node:assert/strict';
import {submitOnce,receiptOnly} from './packages/grading-runtime/test/linux-kernel-smoke.mjs';
const calls=[]; const replies=[{type:'error',code:'BUSY'},{type:'pending'},{type:'pending'},{type:'receipt'}];
const client={request:async r=>{calls.push(r.type); return replies.shift();}};
const pending=await submitOnce(client,{},{});
assert.equal((await receiptOnly(client,{},pending)).type,'receipt');
assert.deepEqual(calls,['run','run','receipt','receipt']);
let n=0;
const uncertain=await submitOnce({request:async()=>{n++;return {type:'error',code:'UNCERTAIN'}}},{},{});
assert.equal(uncertain.code,'UNCERTAIN'); assert.equal(n,1);
await assert.rejects(submitOnce({request:async()=>{throw Error('transport lost')}},{},{}),/transport lost/);
""")


def complete_report():
    report = dict(version=1, success=True, cases=[], before=observation(), after=observation(), systemReserve=dict(kernel.RESERVE),
                  hostProof=dict(preInitEngines=['cpython','pyodide'],cases={},allocations=[]), kernelEvents=[])
    for index, (engine, name) in enumerate(sorted(kernel.REQUIRED)):
        identity = dict(caseId=str(uuid.uuid4()))
        source = str(index).zfill(64)
        case = dict(engine=engine, name=name, cleanup='removed', sourceHash=source, context=identity, reservationId=str(uuid.uuid4()),
                    outcome={'memory':'MEMORY_LIMIT','program-error':'RUNTIME_ERROR','timeout':'TIME_LIMIT'}.get(name,'PASSED'))
        if name in ('cancel','active-restart','parent-oom','control-oom'):
            case.update(nonScoring=True,outcome='CANCELLED' if name=='cancel' else 'UNCERTAIN')
        else:
            case.update(stdout=dict(bytes=0,sha256='a'*64),stderr=dict(bytes=0,sha256='b'*64))
        report['cases'].append(case)
        kernel_event = {**event(), 'pid':1000+index, 'cgroupId':2000+index, 'executable':'/usr/local/bin/python3' if engine=='cpython' else '/usr/local/bin/node'}
        allocation = dict(engine=engine,name=name,caseId=identity['caseId'],sourceHash=source,context=identity,reservationId=case['reservationId'],containerId=str(index).zfill(64),learner=kernel_event,exec=kernel_event)
        report['hostProof']['allocations'].append(allocation)
        report['kernelEvents'].extend([{**kernel_event,'kind':'GATE'},kernel_event])
        if name in kernel.NATIVE and name != 'retained':
            report['hostProof']['cases'][name] = dict(removed=True,markerObserved=True,exec=kernel_event,learner=kernel_event)
    for name in ('memory','parent-oom','control-oom'): report['hostProof']['cases'][name]['oom'] = oom()
    report['hostProof']['cases']['pids']['pidsLimitReached']=True
    retained = dict(receiptHash='a'*64,sourceHash='b'*64,context={'caseId':'case'},reservationId='r')
    report['hostProof']['cases']['retained'] = dict(before=retained,after=dict(retained),noReplay=True)
    return report


class CompleteEvidenceContracts(unittest.TestCase):
    def test_complete_schema_fixture_and_required_case_mutations(self):
        value = complete_report(); kernel.validate_results(value)
        for mutation in ('missing','duplicate','fault-scoring','unbounded-capture','missing-oom','missing-preinit'):
            value=complete_report()
            if mutation=='missing': value['cases'].pop()
            elif mutation=='duplicate': value['cases'][-1]=value['cases'][0]
            elif mutation=='fault-scoring': next(c for c in value['cases'] if c['name']=='cancel')['outcome']='MEMORY_LIMIT'
            elif mutation=='unbounded-capture': next(c for c in value['cases'] if 'stdout' in c)['stdout']['bytes']=8388609
            elif mutation=='missing-oom': value['hostProof']['cases']['memory'].pop('oom')
            elif mutation=='missing-preinit': value['hostProof']['preInitEngines']=[]
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): kernel.validate_results(value)

    def test_final_validator_rejects_missing_allocation_or_changed_source_binding(self):
        for mutation in ('missing','reused','source','case','kernel-event','observation'):
            value=complete_report()
            if mutation=='missing': value['hostProof']['allocations'].pop()
            elif mutation=='reused': value['hostProof']['allocations'][1]['containerId']=value['hostProof']['allocations'][0]['containerId']
            elif mutation=='source': value['hostProof']['allocations'][0]['sourceHash']='f'*64
            elif mutation=='case': value['hostProof']['allocations'][0]['context']={'caseId':'other'}
            elif mutation=='kernel-event': value['kernelEvents'].pop(0)
            else: value['before']['rootless']=False
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): kernel.validate_results(value)


class ObserverStartupContracts(unittest.TestCase):
    def test_authenticated_native_attach_notification_required(self):
        self.assertTrue(exec_observer.attached_notification(b'READY=1\nSTATUS=attached', (123,0,0), 123))
        self.assertFalse(exec_observer.attached_notification(b'STATUS=starting', (123,0,0), 123))
        for sender in ((124,0,0),(123,1000,0),(123,0,1000)):
            with self.subTest(sender=sender), self.assertRaises(ValueError):
                exec_observer.attached_notification(b'READY=1',sender,123)
        self.assertNotIn('BEGIN', exec_observer.program(101000))

    def test_official_observer_candidate_is_pinned_to_ubuntu(self):
        policy='''bpftrace:
  Installed: (none)
  Candidate: 0.20.2-1ubuntu4
  Version table:
     0.20.2-1ubuntu4 500
        500 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 Packages
'''
        self.assertEqual(kernel.official_observer_candidate(policy),'0.20.2-1ubuntu4')
        for changed in (policy.replace('azure.archive.ubuntu.com','evil.example'),policy.replace('Candidate: 0.20.2-1ubuntu4','Candidate: 0.21'),policy.replace('azure.archive.ubuntu.com','ubuntu.com.evil.example')):
            with self.assertRaises(ValueError): kernel.official_observer_candidate(changed)


class GeneratedSourceContracts(unittest.TestCase):
    node = CoordinatorContracts.node
    def test_python_sources_parse_without_executing_any_guest(self):
        import ast
        sources=json.loads(self.node("""
import {fixtures,sourceFor,PHASES} from './packages/grading-runtime/test/linux-kernel-smoke.mjs';
console.log(JSON.stringify(PHASES.flatMap(phase=>fixtures(phase,'cpython').map(f=>sourceFor(f,'00000000-0000-4000-8000-000000000001')))));
"""))
        for source in sources: ast.parse(source)
        isolation=sources[8]
        literals=[node.value for node in ast.walk(ast.parse(isolation)) if isinstance(node,ast.Constant)]
        self.assertIn('NoNewPrivs:\t1',literals)
        self.assertIn('CapEff:\t0000000000000000',literals)


class ReadyLayoutContracts(unittest.TestCase):
    def guest(self, mutation=None):
        # Model production prepareLeaf's actual READY layout. This is a local
        # filesystem/API contract; it does not establish native containment.
        with tempfile.TemporaryDirectory() as folder:
            family=Path(folder)/'cove-grading.slice'
            cid='c'*64; scope=family/('docker-'+cid+'.scope')
            control=scope/'control'; learner=scope/'learner'
            control.mkdir(parents=True); learner.mkdir()
            for path in (family,scope,control,learner):
                (path/'memory.events.local').write_text('oom 0\noom_kill 0\n')
            for name,value in {'pids.max':'32','memory.swap.max':'0','memory.max':str(256*2**20)}.items():
                (scope/name).write_text(value)
            for name,value in {'cgroup.procs':'22','memory.swap.max':'0','memory.max':str(144*2**20),'memory.stat':'shmem 0\n'}.items():
                (learner/name).write_text(value)
            (control/'cgroup.procs').write_text('11')
            observed_control=control; observed_learner=learner
            if mutation=='wrong-leaf': observed_control=learner
            elif mutation=='unprepared-scope': observed_control=scope
            elif mutation=='wrong-container': observed_control=family/('docker-'+'d'*64+'.scope')/'control'
            elif mutation=='outside-family': observed_control=Path(folder)/'other'/scope.name/'control'
            elif mutation=='missing-init': (control/'cgroup.procs').write_text('33')
            elif mutation=='moved-learner': observed_learner=control
            item=dict(Id=cid,Image='native',State=dict(Pid=11,Running=True),
                      HostConfig=dict(ReadonlyRootfs=True,NetworkMode='none',Binds=[]),Mounts=[])
            state=dict(cgroupParent=str(family),images=[dict(configId='native')])
            observed_event={**event(),'pid':22}
            observer=Mock(); observer.execs={22:observed_event}; observer.gates={22:{**observed_event,'kind':'GATE'}}
            actual_read=Path.read_text
            proc={'/proc/22/status':'Uid: 101000 101000 101000 101000\n',
                  '/proc/22/uid_map':'0 100000 65536\n',
                  '/proc/22/mountinfo': '\n'.join(['1 0 0:1 / / ro - overlay overlay ro',
                    '2 1 0:2 / /sys/fs/cgroup ro - cgroup2 cgroup ro',
                    '3 1 0:3 / /tmp rw,nosuid,nodev,noexec - tmpfs tmpfs rw',
                    '4 1 0:4 / /dev/shm rw,nosuid,nodev,noexec - tmpfs shm rw'])}
            def read(path,*args,**kwargs):
                return proc[str(path)] if str(path) in proc else actual_read(path,*args,**kwargs)
            with patch.object(kernel.host,'group',side_effect=lambda pid: observed_control if pid==11 else observed_learner), \
                 patch.object(kernel,'start_time',return_value='1234'), \
                 patch.object(kernel,'cgroup_id',return_value=456), \
                 patch.object(Path,'read_text',read), \
                 patch.object(kernel.os,'readlink',side_effect=lambda path: ('host-' if '/proc/1/' in str(path) else 'guest-')+str(path).split('/')[-1]):
                value=kernel.live_guest(state,item,observer)
                self.assertEqual(value['parent'],str(scope))
                self.assertEqual(value['control'],str(control))
                self.assertEqual(value['leaf'],str(learner))
                self.assertEqual(value['learner']['pid'],22)

    def test_ready_init_control_and_interpreter_learner_are_accepted(self):
        self.guest()

    def test_changed_ready_layout_and_membership_are_rejected(self):
        for mutation in ('wrong-leaf','unprepared-scope','wrong-container','outside-family','missing-init','moved-learner'):
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): self.guest(mutation)


class DescendantPipeContracts(unittest.TestCase):
    node=CoordinatorContracts.node

    def test_live_detached_fixture_child_does_not_hold_output_pipes(self):
        # Execute only the generated trusted child branch with exactly one child,
        # no guest, cgroup, limits or fork-limit test. Proves pipe behavior only.
        import ast
        import signal
        import sys
        import textwrap
        source=json.loads(self.node("""
import {fixtures,sourceFor} from './packages/grading-runtime/test/linux-kernel-smoke.mjs';
console.log(JSON.stringify(sourceFor(fixtures('limits','cpython').find(x=>x.name==='pids'),'test-token')));
"""))
        branch=next(node for node in ast.walk(ast.parse(source)) if isinstance(node,ast.If) and ast.unparse(node.test)=='child == 0')
        for node in ast.walk(branch):
            if isinstance(node,ast.Call) and ast.unparse(node.func)=='time.sleep': node.args=[ast.Constant(value=5)]
        body='\n'.join(ast.unparse(node) for node in branch.body)
        with tempfile.TemporaryDirectory() as folder:
            identity=Path(folder)/'owned-child'
            script='import os,time\nchild=os.fork()\nif child==0:\n'
            script+=f" with open({str(identity)!r},'x') as f: f.write(str(os.getpid()))\n"
            script+=textwrap.indent(body,' ')+'\nprint("parent-exit",flush=True)\nos._exit(0)\n'
            process=subprocess.Popen([sys.executable,'-I','-c',script],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                stdout,stderr=process.communicate(timeout=2)
                self.assertEqual(process.returncode,0)
                self.assertEqual(stdout,b'parent-exit\n'); self.assertEqual(stderr,b'')
                child_pid=int(identity.read_text())
                os.kill(child_pid,0)  # EOF arrived while the detached child lives.
            finally:
                if identity.exists():
                    try: os.kill(int(identity.read_text()),signal.SIGKILL)
                    except ProcessLookupError: pass
                if process.poll() is None: process.kill()
                process.communicate(timeout=3)


if __name__ == "__main__": unittest.main()


# Task3 collection/workflow fixtures are local contracts, never Linux evidence.
import evidence
import shutil


class CollectorContracts(unittest.TestCase):
    def test_broker_preflight_is_optional_diagnostic_only_and_strictly_projected(self):
        diagnostic=dict(version=1,authority='diagnostic-only',success=False,stage='driver-verify',type='Error',code='EACCES',syscall='readlink',pathRole='daemon-proc-executable',reason='unclassified',path='/raw/secret',stack='RAW_SECRET_CANARY',environment='RAW_SECRET_CANARY')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();(root/'broker-preflight.json').write_text(json.dumps(diagnostic))
            value=evidence.collect(root,dict(primary=1,observation=1,cleanup=0),'prepare',owner=os.getuid())
        self.assertFalse(value['success'])
        retained=value['evidence']['broker-preflight.json']
        self.assertEqual(retained['pathRole'],'daemon-proc-executable')
        self.assertEqual(retained['code'],'EACCES')
        self.assertNotIn('RAW_SECRET_CANARY',json.dumps(value))
        self.assertNotIn('/raw/secret',json.dumps(value))
        for name in ('stage','type','code','syscall','pathRole','reason'):
            with self.subTest(name=name),self.assertRaises(ValueError): kernel.host.project_broker_preflight({**diagnostic,name:'RAW_SECRET_CANARY'})
        self.assertEqual(kernel.host.project_broker_preflight(dict(version=1,authority='diagnostic-only',success=True,stage='complete',payload='RAW_SECRET_CANARY')),dict(version=1,authority='diagnostic-only',success=True,stage='complete'))

    def test_prerequisite_failure_retains_only_bounded_package_transaction_diagnostics(self):
        version='5:28.5.1-1~ubuntu.24.04~noble'
        diagnostic=dict(version=1,authority='diagnostic-only',installedProtected={'docker-ce:amd64':version},selectedRootlessVersion=version,officialOrigin=True,simulation=dict(exitCode=100,transactions=[dict(action='Inst',package='docker-ce:amd64',previousVersion=version,version='5:29.0.0-1~ubuntu.24.04~noble',stderr='RAW_SECRET_CANARY')],stderr='RAW_SECRET_CANARY'),environment='RAW_SECRET_CANARY')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            (root/'prerequisite-packages.json').write_text(json.dumps(diagnostic))
            value=evidence.collect(root,dict(primary=1,observation=1,cleanup=0),'prepare',owner=os.getuid())
        self.assertFalse(value['success'])
        retained=value['evidence']['prerequisite-packages.json']
        self.assertEqual(retained['installedProtected'],diagnostic['installedProtected'])
        self.assertEqual(retained['simulation']['exitCode'],100)
        self.assertEqual(retained['simulation']['transactions'][0]['package'],'docker-ce:amd64')
        self.assertNotIn('RAW_SECRET_CANARY',json.dumps(value))

    def test_prerequisite_diagnostic_rejects_unbounded_or_nonidentity_values(self):
        import copy
        original=dict(version=1,authority='diagnostic-only',installedProtected={'docker-ce:amd64':'5:28.5.1'},selectedRootlessVersion='5:28.5.1',officialOrigin=False,simulation=None)
        evidence.project_prerequisites(original)
        changes=[dict(installedProtected={'unrelated:amd64':'1.0'}),dict(installedProtected={'docker-ce:amd64':'token=secret'}),dict(selectedRootlessVersion='raw payload'),dict(simulation=dict(exitCode=100,transactions=[dict(action='Inst',package='uidmap',previousVersion=None,version='1.0')]*129)),dict(simulation=dict(exitCode=100,transactions=[dict(action='Inst',package='../escape',version='1.0')]))]
        for change in changes:
            value=copy.deepcopy(original);value.update(change)
            with self.subTest(change=change),self.assertRaises(ValueError): evidence.project_prerequisites(value)

    def test_missing_authoritative_report_never_success(self):
        with tempfile.TemporaryDirectory() as directory:
            value = evidence.collect(Path(directory).resolve(), dict(primary=0, observation=0, cleanup=0), 'kernel', owner=os.getuid())
            self.assertFalse(value['success'])
            self.assertEqual(value['statuses']['collection'], 1)
            self.assertIn('kernel.json:missing', value['collectionFailures'])

    def test_reader_refuses_symlink_parent_path_escape_owner_and_overflow(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); (root/'safe.json').write_text('{}')
            (root/'link.json').symlink_to(root/'safe.json')
            (root/'linked').symlink_to(root, target_is_directory=True)
            for name in ('link.json','linked/safe.json','../safe.json','/etc/passwd'):
                with self.subTest(name=name), self.assertRaises((OSError, ValueError)):
                    evidence.read_json(root, name, os.getuid(), 128)
            with self.assertRaises(ValueError): evidence.read_json(root, 'safe.json', os.getuid()+1, 128)
            with self.assertRaises(ValueError): evidence.read_json(root, 'safe.json', os.getuid(), 1)

    def test_projection_discards_raw_payloads_and_preserves_kernel_proof(self):
        report = complete_report()
        report.update(productionEquivalent=False, nativeAcceptanceExecuted=False,
                      environment={'SECRET':'RAW_SECRET_CANARY'}, failure={'category':'kernel','type':'ValueError','message':'RAW_SECRET_CANARY'})
        next(c for c in report['cases'] if 'stdout' in c)['stdout']['data']='RAW_SECRET_CANARY'
        report['hostProof']['cases']['retained']['before']['source']='RAW_SECRET_CANARY'
        value=evidence.project_report(report)
        self.assertNotIn('RAW_SECRET_CANARY',json.dumps(value))
        self.assertEqual(len(value['cases']),24)
        self.assertEqual(len(value['hostProof']['allocations']),24)
        self.assertEqual(len(value['kernelEvents']),48)
        kernel.validate_results(value)

    def test_forbidden_files_and_internal_handshakes_are_never_read(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve(); worker=root/'evidence'; worker.mkdir()
            for name in ('state.json','broker.env','private.key'):
                (root/name).write_text('RAW_SECRET_CANARY')
            for name in ('functional.request.json','functional.reply.json','kernel.json','worker-host-proof.json'):
                (worker/name).write_text('RAW_SECRET_CANARY')
            value=evidence.collect(root, dict(primary=9,observation=4,cleanup=7), 'kernel', owner=os.getuid())
            self.assertNotIn('RAW_SECRET_CANARY',json.dumps(value))
            self.assertEqual(value['statuses'], dict(primary=9,observation=4,cleanup=7,collection=1))

    def test_artifact_total_bound_and_symlink_output_refusal(self):
        with self.assertRaises(ValueError): evidence.encode({'data':'x'*(20*2**20)})
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve(); target=root/'target'; target.write_text('original')
            link=root/'summary.json'; link.symlink_to(target)
            with self.assertRaises(OSError): evidence.write_summary(link, {})
            self.assertEqual(target.read_text(),'original')

    def test_zero_exit_status_without_kernel_proof_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            (root/'kernel.json').write_text(json.dumps(dict(version=1,success=True,cases=[])))
            (root/'kernel.json').chmod(0o600)
            value=evidence.collect(root, dict(primary=0,observation=0,cleanup=0), 'kernel', owner=os.getuid())
            self.assertFalse(value['success'])
            self.assertIn('kernel.json:invalid',value['collectionFailures'])


class WorkflowContracts(unittest.TestCase):
    node=CoordinatorContracts.node
    def test_structured_workflow_contract_and_duplicate_yaml_rejection(self):
        self.node("""
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const web=createRequire(new URL('./packages/web/package.json',import.meta.url));
const eslint=createRequire(web.resolve('eslint/package.json'));
const yaml=eslint('js-yaml');
const parse=s=>yaml.load(s,{schema:yaml.JSON_SCHEMA,json:false});
assert.throws(()=>parse('jobs: {}\\njobs: {}\\n'),/duplicated/);
const text=readFileSync('.github/workflows/native-grading-kernel.yml','utf8');
const w=parse(text);
assert.deepEqual(w.on,{push:{branches:['feat/production-native-grading']}});
assert.deepEqual(w.permissions,{contents:'read'});
assert.equal(w.concurrency['cancel-in-progress'],false);
assert(w.concurrency.group.includes('github.ref'));
assert.deepEqual(Object.keys(w.jobs),['kernel']);
const j=w.jobs.kernel;
assert.equal(j['runs-on'],'ubuntu-24.04'); assert.equal(j['timeout-minutes'],45);
assert.deepEqual(j.env,{GRADING_DISPOSABLE_CI:'1'});
assert.equal(j.environment,undefined); assert.equal(j.permissions,undefined);
assert(!text.includes('secrets.') && !text.includes('continue-on-error'));
assert(j.steps.some(s=>s.run==='pnpm install --frozen-lockfile'));
assert(j.steps.some(s=>s.uses==='actions/setup-node@v4' && s.with['node-version']===22));
assert(j.steps.some(s=>s.uses==='pnpm/action-setup@v4'));
const run=j.steps.find(s=>s.run==='bash deploy/scripts/grading/ci/run.sh'); assert(run);
const upload=j.steps.find(s=>s.uses==='actions/upload-artifact@v4');
assert.equal(upload.if,"always() && steps.evidence_summary.outputs.uploadable == 'true'"); assert.equal(upload.with['retention-days'],1);
assert.equal(upload.with.path,'test-results/disposable-native-kernel/summary.json');
assert.equal(upload.with['if-no-files-found'],'error');
""")

    def test_wrapper_keeps_primary_and_all_secondary_failures(self):
        root=Path(__file__).resolve().parents[4]
        for primary in (0,23):
            with self.subTest(primary=primary), tempfile.TemporaryDirectory() as directory:
                folder=Path(directory).resolve(); binpath=folder/'bin'; binpath.mkdir()
                # Only administrative calls are faked. The real wrapper/trap and
                # collector execute; no host mutation is possible via this stub.
                sudo=binpath/'sudo'
                # collector failure is separately controlled, with status record
                # captured before returning; no positive evidence is fabricated.
                sudo.write_text('#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALLS"\ncase "$*" in\n*"kernel.py run"*) exit '+str(primary)+';;\n*"provision.py observe"*) if [[ -f "$OBSERVED" ]]; then exit 31; fi; touch "$OBSERVED";;\n*"provision.py cleanup"*) exit 37;;\n*"evidence.py collect"*) printf \'{"statuses":{"primary":%s,"observation":31,"cleanup":37,"collection":1},"success":false}\\n\' "$PRIMARY"; exit 1;;\nesac\nexit 0\n')
                sudo.chmod(0o755)
                for name in ('pnpm','bash'):
                    path=binpath/name; path.write_text('#!/bin/sh\nexit 0\n'); path.chmod(0o755)
                output=folder/'output'; output.mkdir()
                env={**os.environ,'PATH':str(binpath)+':'+os.environ['PATH'],'GITHUB_SHA':'a'*40,'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','GRADING_DISPOSABLE_CI':'1','CALLS':str(folder/'calls'),'OBSERVED':str(folder/'observed'),'PRIMARY':str(primary)}
                # Run from a synthetic checkout containing only wrapper inputs.
                (output/'deploy/scripts').mkdir(parents=True)
                shutil.copytree(root/'deploy/scripts/grading',output/'deploy/scripts/grading')
                script=output/'deploy/scripts/grading/ci/run.sh'
                result=subprocess.run(['/bin/bash',str(script)],env=env,capture_output=True,text=True,timeout=10)
                self.assertEqual(result.returncode,primary or 31,result.stderr+result.stdout+str(list((output/'test-results/disposable-native-kernel').glob('*'))))
                value=json.loads((output/'test-results/disposable-native-kernel/summary.json').read_text())
                self.assertEqual(value['statuses'],dict(primary=primary,observation=31,cleanup=37,infrastructure=0,collection=1,finalization=0))
                self.assertFalse((output/'test-results/disposable-native-kernel/collected.json').exists())
                calls=(folder/'calls').read_text()
                self.assertIn('provision.py cleanup',calls)
                self.assertNotIn('--preserve-env',calls)
                self.assertIn('GRADING_CI_NODE_SOURCE=/',calls)


class DiagnosticContracts(unittest.TestCase):
    def test_only_literal_invariant_reasons_survive(self):
        reason='Missing or ambiguous gated interpreter'
        value=evidence.diagnostic('Disposable kernel checks failed: ValueError: '+reason)
        self.assertEqual(value,dict(type='ValueError',reason=reason))
        value=evidence.diagnostic('Disposable kernel checks failed: ValueError: RAW_SECRET_CANARY')
        self.assertNotIn('RAW_SECRET_CANARY',json.dumps(value))
        self.assertEqual(value['reason'],'unclassified-controller-failure')
        self.assertIsNone(evidence.diagnostic('raw arbitrary journal or learner output'))


class InfrastructureContracts(unittest.TestCase):
    def test_only_exact_owned_unit_journals_are_bounded_and_sanitized(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve(); state=root/'state.json'; state.write_text('{}')
            real_popen=subprocess.Popen
            calls=[]
            raw=json.dumps(dict(MESSAGE='daemon startup failed password=RAW_SECRET https://user:RAW_SECRET@example.test/path',PRIORITY='3',UNRELATED='RAW_SECRET'))+'\n'
            def journal(args,**kwargs):
                calls.append(args)
                return real_popen([sys.executable,'-c','import sys;sys.stdout.write('+repr(raw)+')'],**kwargs)
            import sys
            with patch.object(kernel.host,'check_host'), patch.object(kernel.host,'load_state',return_value=dict(uid=11000)), patch.object(kernel.host,'verify_accounts'), patch.object(kernel.host,'STATE',state), patch.object(kernel.host,'STATE_DIR',root), patch.object(evidence.subprocess,'Popen',side_effect=journal), patch.object(evidence.os,'fstat',return_value=Mock(st_uid=0,st_mode=0o40700)):
                self.assertEqual(evidence.infrastructure_snapshot(),0)
            value=json.loads((root/'infrastructure.json').read_text())
            self.assertEqual(len(calls),2)
            for args in calls:
                self.assertIn('_UID=11000',args)
                self.assertIn('--lines=40',args)
                self.assertIn('--output-fields=MESSAGE,PRIORITY',args)
                self.assertIn(args[-1],['_SYSTEMD_USER_UNIT=cove-grading-docker.service','_SYSTEMD_USER_UNIT=cove-grading-broker.service'])
            self.assertNotIn('RAW_SECRET',json.dumps(value))
            self.assertNotIn('UNRELATED',json.dumps(value))
            self.assertEqual(value['authority'],'diagnostic-only')
            self.assertEqual(evidence.project_infrastructure(value),value)
            value['units']['worker.service']={}
            with self.assertRaises(ValueError): evidence.project_infrastructure(value)

    def test_finalization_retains_statuses_when_privileged_collection_has_no_json(self):
        import argparse
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,{'GITHUB_SHA':'b'*40}):
            folder=Path(directory).resolve(); (folder/'collected.json').write_text('')
            args=argparse.Namespace(directory=str(folder),primary=17,observation=19,cleanup=23,infrastructure=29,collection=31)
            self.assertEqual(evidence.finalize(args),1)
            value=json.loads((folder/'summary.json').read_text())
            self.assertEqual(value['statuses'],dict(primary=17,observation=19,cleanup=23,infrastructure=29,collection=31,finalization=1))
            self.assertFalse(value['success'])
            self.assertEqual(value['sourceCommit'],'b'*40)

    def test_raw_capture_values_and_broader_acceptance_claim_are_refused(self):
        value=complete_report(); next(c for c in value['cases'] if 'stdout' in c)['stdout']='RAW_SECRET'
        with self.assertRaises(ValueError): evidence.project_report(value)
        value=complete_report(); value['productionEquivalent']=True
        with self.assertRaises(ValueError): evidence.project_report(value)


class SuccessSummaryContracts(unittest.TestCase):
    def test_success_requires_authoritative_case_kernel_and_cleanup_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve(); value=complete_report()
            value.update(productionEquivalent=False,nativeAcceptanceExecuted=False)
            descriptor=dict(version=1,engine='cpython',engineVersion='3.12.16',pythonVersion='3.12.16',platform='linux',architecture='amd64',imageDigest='sha256:'+'a'*64,packageManifestHash='sha256:'+'b'*64,shimVersion='cove-guest-1',memoryPolicy='native-cgroup-growth-v1',executionPolicy='wall-v1')
            value['before']['runtimes']=[descriptor]
            for name,data in [('kernel.json',value),('prepare-observation.json',observation()),('observation.json',observation()),('cleanup.json',dict(version=1,cleaned=True,ownedProcessesAbsent=True,ownedNamespacesAbsent=True,unexpectedContainers=False))]:
                path=root/name; path.write_text(json.dumps(data)); path.chmod(0o600)
            result=evidence.collect(root,dict(primary=0,observation=0,cleanup=0),'complete',owner=os.getuid())
            self.assertTrue(result['success'])
            self.assertEqual(result['executedCaseCount'],24)
            self.assertEqual(result['requiredCaseCount'],24)
            self.assertEqual(result['evidence']['kernel.json']['before']['runtimes'],[descriptor])
            self.assertTrue(result['authoritativeHostProof'])
            for key in ('primary','observation','cleanup'):
                statuses=dict(primary=0,observation=0,cleanup=0); statuses[key]=5
                failed=evidence.collect(root,statuses,'complete',owner=os.getuid())
                self.assertFalse(failed['success'])


    def test_failed_authoritative_report_with_zero_primary_status_is_not_passing(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            for name,value in [('kernel.json',dict(version=1,success=False,cases=[],failure=dict(category='setup',type='ValueError'))),('prepare-observation.json',observation()),('observation.json',observation()),('cleanup.json',dict(version=1,cleaned=True))]:
                path=root/name; path.write_text(json.dumps(value)); path.chmod(0o600)
            result=evidence.collect(root,dict(primary=0,observation=0,cleanup=0),'complete',owner=os.getuid())
            self.assertFalse(result['success'])
            self.assertEqual(result['statuses']['collection'],1)
            self.assertFalse(result['authoritativeHostProof'])


class PrerequisiteEvidenceContracts(unittest.TestCase):
    node=CoordinatorContracts.node

    def fallback_step(self):
        steps=json.loads(self.node("""
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const web=createRequire(new URL('./packages/web/package.json',import.meta.url));
const yaml=createRequire(web.resolve('eslint/package.json'))('js-yaml');
console.log(JSON.stringify(yaml.load(readFileSync('.github/workflows/native-grading-kernel.yml','utf8'),{schema:yaml.JSON_SCHEMA,json:false}).jobs.kernel.steps));
"""))
        matches=[step for step in steps if step.get('id') == 'evidence_summary']
        self.assertEqual(len(matches),1,'Always-run prerequisite fallback is absent')
        step=matches[0]
        self.assertEqual(step['if'],'always()')
        self.assertNotIn('${{',step['run'])
        ids=['checkout','pnpm','node','install','prepare','contracts','build_context','kernel']
        self.assertEqual([s['id'] for s in steps[:8]],ids)
        self.assertEqual(step['env'],{'SOURCE_COMMIT':'${{ github.sha }}',**{'OUTCOME_'+key.upper():'${{ steps.'+key+'.outcome }}' for key in ids}})
        self.assertEqual(steps[-1]['if'],"always() && steps.evidence_summary.outputs.uploadable == 'true'")
        return step

    def run_fallback(self, folder, failed='install', wrapper='skipped'):
        step=self.fallback_step()
        ids=['checkout','pnpm','node','install','prepare','contracts','build_context','kernel']
        outcomes={key:('success' if ids.index(key)<ids.index(failed) else 'failure' if key==failed else 'skipped') for key in ids}
        outcomes['kernel']=wrapper
        env={**os.environ,'SOURCE_COMMIT':'c'*40,'GITHUB_OUTPUT':str(folder/'outputs'),**{'OUTCOME_'+key.upper():value for key,value in outcomes.items()},'UNRELATED_SECRET':'RAW_SECRET_CANARY'}
        result=subprocess.run(['/bin/bash','-e','-c',step['run']],cwd=folder,env=env,capture_output=True,text=True,timeout=10)
        return result,outcomes

    def test_prerequisite_failures_without_checkout_leave_uploadable_unexecuted_summary(self):
        for stage in ('checkout','pnpm','node','install','prepare','contracts','build_context'):
            with self.subTest(stage=stage),tempfile.TemporaryDirectory() as directory:
                folder=Path(directory).resolve()
                result,outcomes=self.run_fallback(folder,stage)
                self.assertNotEqual(result.returncode,0,'Fallback must not make missing native evidence green')
                summary=folder/'test-results/disposable-native-kernel/summary.json'
                value=json.loads(summary.read_text())
                self.assertEqual(value['sourceCommit'],'c'*40)
                self.assertEqual(value['stage'],stage)
                self.assertEqual(value['workflowOutcomes'],outcomes)
                self.assertFalse(value['success'])
                self.assertEqual(value['nativeKernelResult'],'unexecuted')
                self.assertEqual(value['cleanupResult'],'unexecuted')
                self.assertEqual(value['evidence'],{})
                self.assertFalse(value['authoritativeHostProof'])
                self.assertNotIn('RAW_SECRET_CANARY',summary.read_text())
                self.assertIn('uploadable=true',(folder/'outputs').read_text())

    def test_existing_valid_wrapper_summary_is_preserved_byte_for_byte(self):
        for success in (False,True):
            with self.subTest(success=success),tempfile.TemporaryDirectory() as directory:
                folder=Path(directory).resolve(); target=folder/'test-results/disposable-native-kernel/summary.json';target.parent.mkdir(parents=True)
                statuses=dict(primary=0 if success else 17,observation=0,cleanup=0,infrastructure=0,collection=0,finalization=0)
                data=(json.dumps(dict(version=1,sourceCommit='c'*40,success=success,productionEquivalent=False,nativeAcceptanceExecuted=False,statuses=statuses,evidence={}),indent=2)+'\n').encode()
                target.write_bytes(data);target.chmod(0o600)
                before=target.stat()
                result,_=self.run_fallback(folder,'kernel','success' if success else 'failure')
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertEqual(target.read_bytes(),data)
                self.assertEqual(target.stat().st_ino,before.st_ino)
                self.assertIn('uploadable=true',(folder/'outputs').read_text())

    def test_missing_wrapper_summary_reports_unknown_native_and_cleanup(self):
        for outcome in ('failure','success','cancelled','RAW_SECRET_CANARY'):
            with self.subTest(outcome=outcome),tempfile.TemporaryDirectory() as directory:
                folder=Path(directory).resolve();result,_=self.run_fallback(folder,'kernel',outcome)
                self.assertNotEqual(result.returncode,0)
                summary=(folder/'test-results/disposable-native-kernel/summary.json').read_text()
                value=json.loads(summary)
                self.assertEqual(value['nativeKernelResult'],'unknown')
                self.assertEqual(value['cleanupResult'],'unknown')
                self.assertEqual(value['stage'],'summary-missing' if outcome=='success' else 'kernel')
                self.assertNotIn('RAW_SECRET_CANARY',summary)

    def test_fallback_refuses_symlink_paths_and_oversized_existing_summary(self):
        for kind in ('parent','summary','overflow'):
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as directory:
                folder=Path(directory).resolve();outside=folder/'outside';outside.mkdir()
                marker=outside/'private';marker.write_text('RAW_SECRET_CANARY')
                if kind=='parent': (folder/'test-results').symlink_to(outside,target_is_directory=True)
                else:
                    target=folder/'test-results/disposable-native-kernel/summary.json';target.parent.mkdir(parents=True)
                    if kind=='summary':target.symlink_to(marker)
                    else:target.write_bytes(b'x'*(20*2**20+1))
                result,_=self.run_fallback(folder)
                self.assertNotEqual(result.returncode,0)
                self.assertFalse((folder/'outputs').exists())
                self.assertEqual(marker.read_text(),'RAW_SECRET_CANARY')
