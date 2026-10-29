"""Stateful accepted-work transition fixture; no real service or DB mutation."""
import copy
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
import subprocess
import selectors
from retained import atomic_json, execute_transition, validate_transition
from release import digest
import test_retained
from recovery import RECOVERY_CONTRACT, verify_stopped_container, verify_broker_cleanup, verify_stopped_broker, journal_identity

class RepairRecoveryTests(unittest.TestCase):
    def setUp(self):
        f=test_retained.RetainedTests();f.setUp();self.f=f
        native={**f.manifest['compatibility'],'engine':'cpython','engineVersion':'3.12.16','pythonVersion':'3.12.16','memoryPolicy':'native-cgroup-growth-v1','imageDigest':'sha256:'+'8'*64}
        f.manifest['native']=native;f.manifest['capabilities']['runtimes'].append(native)
        for release in [f.current,f.target]:
            release['images'].append({**release['images'][0],'configId':native['imageDigest']})
            release['rollback']['imageConfigIds'].append(native['imageDigest'])
            release['manifestIdentity']=digest(f.manifest)
        f.inventory['references']=[f.manifest['compatibility'],native]
        f.proof['transition']['previousReleaseIdentity']=digest(f.current)
        self.inventory=copy.deepcopy(f.inventory)
        self.inventory.update(pending=2,recoverable=1,ephemeralPending=1)
        self.inventory['queueBacklog']['cove-grading']=2
        self.proof=copy.deepcopy(f.proof)
        self.proof['transition'].update(previousInventoryIdentity=digest(self.inventory),recovery=RECOVERY_CONTRACT,recoveryJournalIdentity='a'*64)
    def validate(self,**changes):
        args=dict(current=self.f.current,old_manifest=self.f.manifest,previous_inventory=self.inventory,candidate=self.f.target,manifest=self.f.manifest,inventory=self.inventory,proof=self.proof,previous_config_identity='a'*64,mode='binary-rollback',recovery=True)
        args.update(changes);return validate_transition(**args)
    def test_only_signed_same_authority_repair_can_preserve_nonzero_work(self):
        self.validate()
        for mutation in ['unsigned','journal','authority','descriptor','image','readers','legacy','normal']:
            with self.subTest(mutation=mutation):
                args={}
                if mutation=='unsigned':args['proof']={**self.proof,'transition':{**self.proof['transition'],'recovery':None}}
                if mutation=='journal':args['proof']={**self.proof,'transition':{**self.proof['transition'],'recoveryJournalIdentity':''}}
                if mutation=='authority':args['candidate']={**self.f.target,'workerGeneration':'different'}
                if mutation=='descriptor':args['manifest']={**self.f.manifest,'capabilities':{**self.f.manifest['capabilities'],'runtimes':[]}}
                if mutation=='image':args['candidate']={**self.f.target,'images':[{**image,'pullReference':'changed'} for image in self.f.target['images']]}
                if mutation=='readers':args['candidate']={**self.f.target,'rollback':{**self.f.target['rollback'],'policyVersions':[1,2,3]}}
                if mutation=='legacy':args['inventory']={**self.inventory,'legacyPending':1}
                if mutation=='normal':args['recovery']=False
                with self.assertRaises(ValueError):self.validate(**args)
    def test_ready_target_accepts_work_then_failed_repair_keeps_frozen_recovery_state(self):
        with tempfile.TemporaryDirectory() as directory:
            state=Path(directory)/'state';atomic_json(state,dict(version=1,bundle='/old'))
            failed=dict(bundle='/broken',manifestIdentity=self.f.target['manifestIdentity'],workerGeneration=self.f.target['workerGeneration'])
            accepted={'inventory':copy.deepcopy(self.f.inventory),'oldWorker':False,'oldBroker':False,'receipt':'durable-removed-guest','checkpoint':'durable-before-commit','points':0}
            def fail_after_ready(name):
                if name=='start-consumers':
                    accepted.update(inventory=self.inventory,oldWorker=True,oldBroker=True)
                if name=='verify-running':raise RuntimeError('Failed after admitting frozen native/v4 work')
            with self.assertRaises(RuntimeError):execute_transition(state,failed,fail_after_ready,lambda:accepted['inventory'],self.f.inventory)
            repair={**failed,'bundle':'/repair','recovery':True}
            operations=[]
            def action(name):
                operations.append(name)
                if name=='stop-worker':accepted['oldWorker']=False
                if name=='verify-worker-stopped':self.assertFalse(accepted['oldWorker'])
                if name=='stop-broker':accepted['oldBroker']=False
                if name=='verify-broker-stopped':self.assertFalse(accepted['oldBroker'])
                if name=='verify-broker-cleanup':raise ValueError('Injected uncertain guest cleanup')
                if name=='start-consumers':self.fail('Uncertain cleanup must not launch replacement')
            with self.assertRaisesRegex(ValueError,'uncertain'):execute_transition(state,repair,action,lambda:accepted['inventory'],self.inventory,repair=True)
            self.assertEqual(json.loads(state.read_text())['transition']['target'],repair)
            self.assertLess(operations.index('verify-worker-stopped'),operations.index('start-broker'))
            self.assertEqual(accepted['receipt'],'durable-removed-guest');self.assertEqual(accepted['checkpoint'],'durable-before-commit');self.assertEqual(accepted['points'],0)
            resumed=[]
            execute_transition(state,repair,resumed.append,lambda:accepted['inventory'],self.inventory)
            self.assertLess(resumed.index('verify-broker-cleanup'),resumed.index('start-consumers'))
            self.assertEqual(json.loads(state.read_text())['bundle'],'/repair')
            self.assertEqual(accepted['inventory']['references'],self.inventory['references'])
    def test_missing_or_replaced_journal_cannot_authorize_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            config=dict(journalDirectory=directory,uid=os.getuid(),brokerOwner='retained-owner')
            with self.assertRaises((ValueError,OSError)):journal_identity(config)
            path=Path(directory)/'state.bin';path.write_bytes(b'durable receipt fixture')
            original=digest(journal_identity(config));path.write_bytes(b'replaced empty-state fixture')
            self.assertNotEqual(original,digest(journal_identity(config)))
            path.write_bytes(b'')
            with self.assertRaises(ValueError):journal_identity(config)

    def test_transition_restarts_real_journal_and_worker_receipt_checkpoint_recovery(self):
        root=Path(__file__).resolve().parents[4]
        with tempfile.TemporaryDirectory() as directory:
            process=subprocess.Popen([str(root/'packages/api/node_modules/.bin/tsx'),str(Path(__file__).with_name('repair-broker-fixture.mts')),directory],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env={**os.environ,'DOTENV_CONFIG_PATH':'/dev/null'})
            selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ)
            def rpc(command):
                process.stdin.write(json.dumps(command)+'\n');process.stdin.flush()
                self.assertTrue(selector.select(15),'Bounded broker fixture response required')
                value=json.loads(process.stdout.readline())
                self.assertTrue(value['ok'],value.get('error'))
                return value.get('value')
            try:
                state=Path(directory)/'retained.json';atomic_json(state,dict(version=1,bundle='/old'))
                failed=dict(bundle='/broken',workerGeneration='pending')
                accepted={'inventory':self.f.inventory}
                def broken(name):
                    if name=='start-consumers':
                        accepted.update(rpc('accepted'));accepted['inventory']={**self.inventory,'references':accepted['references']}
                    if name=='verify-running':raise RuntimeError('Failed after real native/v4 execution and admission')
                with self.assertRaises(RuntimeError):execute_transition(state,failed,broken,lambda:accepted['inventory'],self.f.inventory)
                self.assertEqual(accepted['executed'],2)
                config=dict(journalDirectory=accepted['journalDirectory'],uid=os.getuid(),brokerOwner='retained')
                recovery={**failed,'bundle':'/repair','recovery':True,'workerGeneration':accepted['worker']}
                operations=[];frozen=None;started_at=None
                def action(name):
                    nonlocal frozen,started_at
                    operations.append(name)
                    if name=='stop-broker':self.assertEqual(rpc('stop')['guests'],0)
                    if name=='preserve-recovery-state':frozen=journal_identity(config)
                    if name=='start-broker':
                        self.assertEqual(journal_identity(config),frozen)
                        started_at=int(time.time()*1000);accepted['cleanup']=rpc('start')
                    if name=='verify-broker-cleanup':verify_broker_cleanup(accepted['cleanup'],accepted['worker'],started_at)
                    if name=='start-consumers':accepted['recovered']=rpc('recover')
                execute_transition(state,recovery,action,lambda:accepted['inventory'],accepted['inventory'],repair=True)
                self.assertLess(operations.index('verify-worker-stopped'),operations.index('start-broker'))
                self.assertLess(operations.index('verify-broker-cleanup'),operations.index('start-consumers'))
                self.assertEqual(accepted['recovered']['knownExecutions'],2)
                self.assertEqual(accepted['recovered']['executed'],4)
                self.assertEqual(accepted['recovered']['queuedRecovered'],2)
                self.assertEqual(accepted['recovered']['queuedIds'],accepted['queuedIds'])
                self.assertEqual(accepted['recovered']['checkpoints'],2)
                self.assertEqual(accepted['recovered']['references'],accepted['inventory']['references'])
                self.assertEqual(json.loads(state.read_text())['bundle'],'/repair')
                rpc('close');process.stdin.close();process.wait(timeout=15)
                self.assertEqual(process.returncode,0,process.stderr.read())
            finally:
                selector.close()
                if process.poll() is None:process.kill();process.wait(timeout=5)
                for stream in [process.stdin,process.stdout,process.stderr]:stream.close()

    def test_actual_stop_and_cleanup_observations_reject_overlap_uncertainty(self):
        verify_stopped_container({'Running':False,'Pid':0,'Restarting':False,'Status':'exited'})
        for state in [{'Running':True,'Pid':123,'Restarting':False,'Status':'running'},{'Running':False,'Pid':123,'Restarting':False,'Status':'exited'},{'Running':False,'Pid':0,'Restarting':True,'Status':'restarting'}]:
            with self.assertRaises(ValueError):verify_stopped_container(state)
        verify_stopped_broker({'ActiveState':'inactive','MainPID':'0'},False)
        with self.assertRaises(ValueError):verify_stopped_broker({'ActiveState':'inactive','MainPID':'0'},True)
        with self.assertRaises(ValueError):verify_stopped_broker({'ActiveState':'active','MainPID':'123'},False)
        now=int(time.time()*1000)
        value=dict(version=1,observedAt=now,workerGeneration='same',brokerGeneration='new',pool=dict(ready=True,cleanupFailures=0,quarantined=0,running=0,preparing=0))
        verify_broker_cleanup(value,'same',now-1,now)
        for patch in [{'observedAt':now-10000},{'workerGeneration':'changed'},{'pool':{**value['pool'],'cleanupFailures':1}},{'pool':{**value['pool'],'quarantined':1}},{'pool':{**value['pool'],'ready':False}}]:
            with self.assertRaises(ValueError):verify_broker_cleanup({**value,**patch},'same',now-1,now)

if __name__=='__main__':unittest.main()
