import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from control import drained, handover_plan, update_env, execute_handover
from install import render
from metrics import render as render_metrics
from host import collect_host

ROOT=Path(__file__).resolve().parents[4]
class OperationTests(unittest.TestCase):
    def test_install_only_fixed_limits_and_private_daemon(self):
        files=render(Path('/home/cove-grading'),1234,'/usr/bin/dockerd-rootless.sh','/usr/bin/node')
        text='\n'.join(files.values())
        for expected in ['MemoryMax=1280M','CPUQuota=150%','MemorySwapMax=0','TasksMax=256','RuntimeDirectoryMode=0700','Delegate=cpu memory pids','Slice=cove-grading.slice']:
            self.assertIn(expected,text)
        self.assertNotIn('Group=',text);self.assertNotIn('DATABASE_URL',text);self.assertNotIn('turtle',text)
        setup=(ROOT/'deploy/scripts/setup-grading-rootless.sh').read_text()
        self.assertNotIn('enable --now',setup);self.assertNotIn('systemctl --user start',setup)
    def test_handover_order_stops_old_before_new(self):
        plan=handover_plan()
        self.assertLess(plan.index('stop-legacy-worker'),plan.index('stop-legacy-sandbox'))
        self.assertLess(plan.index('stop-legacy-sandbox'),plan.index('start-dedicated-rootless-daemon'))
        self.assertLess(plan.index('persist-retained-handover-marker'),plan.index('stop-legacy-worker'))
    def test_actual_handover_commands_stop_old_before_start_and_abort_on_failed_proof(self):
        commands=[]
        def compose(*args,**kwargs):commands.append(('compose',args))
        def service(*args):commands.append(('user',args))
        def proof():commands.append(('proof',));raise ValueError('Synthetic missing proof')
        with self.assertRaises(ValueError):execute_handover(compose,service,proof,lambda:commands.append(('env',)))
        self.assertEqual(commands,[('compose',('stop','--timeout','600','judge-worker')),('compose',('stop','--timeout','90','judge-sandbox')),('user',('start','cove-grading-docker.service')),('user',('start','cove-grading-broker.service')),('proof',)])
    def test_pending_or_unreconciled_cannot_drain(self):
        good=dict(complete=True,observedAt=123,pending=0,legacyPending=0,recoverable=0,ephemeralPending=0,queueBacklog={'cove-regrade':0})
        drained(good,123)
        for field in ['pending','legacyPending','recoverable','ephemeralPending']:
            with self.assertRaises(ValueError):drained({**good,field:1},123)
        with self.assertRaises(ValueError):drained(good,500)
    def test_selection_rollback_retains_every_other_setting(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'env';path.write_text('GRADING_NATIVE_ENABLED=true\nGRADING_WORKER_GENERATION=original\nGRADING_MANIFEST_HOST_PATH=/immutable/manifest\nAPI_IMAGE=original\n')
            update_env(path,{'GRADING_NATIVE_ENABLED':'false'})
            self.assertEqual(path.read_text(),'GRADING_NATIVE_ENABLED=false\nGRADING_WORKER_GENERATION=original\nGRADING_MANIFEST_HOST_PATH=/immutable/manifest\nAPI_IMAGE=original\n')
    def test_ordinary_release_refuses_before_mutation_after_handover(self):
        for script in ['deploy.sh','rollback.sh','set-v2-release.sh']:
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);(root/'state').mkdir();(root/'state/grading-handover.json').write_text('{}');(root/'deployment.env').write_text('unchanged')
                result=subprocess.run(['bash',str(ROOT/'deploy/scripts'/script)],env={**os.environ,'COVE_DEPLOY_ROOT':directory},capture_output=True,text=True)
                self.assertNotEqual(result.returncode,0);self.assertIn('refused before mutation',result.stderr)
                self.assertEqual((root/'deployment.env').read_text(),'unchanged')
    def test_marker_created_at_lock_acquisition_refuses_before_any_release_copy(self):
        for script in ['deploy.sh','rollback.sh','set-v2-release.sh']:
            with self.subTest(script=script), tempfile.TemporaryDirectory() as directory:
                root=Path(directory);(root/'state').mkdir();(root/'bin').mkdir()
                (root/'deployment.env').write_text('unchanged')
                (root/'candidate.env').write_text('candidate')
                (root/'state/previous-deployment.env').write_text('previous')
                mocks={
                    'flock':'#!/bin/bash\nprintf "{}" > "$COVE_DEPLOY_ROOT/state/grading-handover.json"\n',
                    'install':'#!/bin/bash\ntouch "$COVE_DEPLOY_ROOT/mutated"\nexit 99\n',
                    'cp':'#!/bin/bash\ntouch "$COVE_DEPLOY_ROOT/mutated"\nexit 99\n',
                }
                for name,body in mocks.items():
                    path=root/'bin'/name;path.write_text(body);path.chmod(0o755)
                arguments=[str(root/'candidate.env')] if script=='deploy.sh' else ['ghcr.io/synthetic','sha-'+'a'*40,'false','false','false','false'] if script=='set-v2-release.sh' else []
                result=subprocess.run(['bash',str(ROOT/'deploy/scripts'/script),*arguments],env={**os.environ,'COVE_DEPLOY_ROOT':directory,'PATH':str(root/'bin')+os.pathsep+os.environ['PATH']},capture_output=True,text=True)
                self.assertNotEqual(result.returncode,0)
                self.assertIn('retained under deployment lock',result.stderr)
                self.assertFalse((root/'mutated').exists())
                self.assertEqual((root/'deployment.env').read_text(),'unchanged')
    def test_metrics_stale_and_label_injection_rejected(self):
        sample=dict(version=1,observedAt=100,brokerGeneration='private',workerGeneration='private',pool=dict(active=0,running=0,preparing=0,prepared=1,quarantined=0,cleanupFailures=2,ready=True,resources=dict(allocations=1,bytes=1,pids=1,waiting=1,oldestWaitMs=25)),family=dict(memoryCurrentBytes=10),children=[])
        output=render_metrics(sample,100);self.assertIn('cleanupFailures 2.0',output);self.assertNotIn('private',output)
        with self.assertRaises(ValueError):render_metrics(sample,6101)
        sample['children']=[dict(engine='arbitrary-user',memoryLimitMb=64,counters={})]
        with self.assertRaises(ValueError):render_metrics(sample,100)
    @unittest.skipIf(sys.platform=='linux','Negative unsupported-host check is for Desktop')
    def test_desktop_fails_closed_before_daemon_access(self):
        with self.assertRaisesRegex(ValueError,'Linux required'):collect_host({})
if __name__=='__main__':unittest.main()
