"""Synthetic transition executor, real durable files, no host/service mutations."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from retained import validate_transition, execute_transition, atomic_json, inventory_identity
from release import digest
import test_release

class RetainedTests(unittest.TestCase):
    def setUp(self):
        fixture=test_release.ReleaseTests();fixture.setUp()
        self.current=fixture.release;self.manifest=fixture.manifest;self.inventory=fixture.inventory
        self.inventory['observedAt']=int(time.time())
        self.inventory['queueBacklog']={'cove-grading':0,'cove-staff-practice':0,'cove-sample-checks':0,'cove-regrade':0}
        self.target=copy.deepcopy(self.current);self.target['applicationImages']={key:'registry.example/'+key+'@sha256:'+'6'*64 for key in ['api','worker']}
        self.proof={'transition':{'previousReleaseIdentity':digest(self.current),'previousInventoryIdentity':digest(self.inventory),'previousConfigurationIdentity':'a'*64}}
    def verify(self,manifest=None,mode='retained-update'):
        return validate_transition(self.current,self.manifest,self.inventory,self.target,manifest or self.manifest,self.inventory,self.proof,'a'*64,mode,int(time.time()))
    def test_changed_valid_application_images_are_supported(self):self.verify()
    def test_removed_readers_and_accepted_descriptors_are_rejected(self):
        self.target['rollback']['policyVersions']=[1,2,3]
        with self.assertRaises(ValueError):self.verify()
        self.setUp();manifest=copy.deepcopy(self.manifest);manifest['capabilities']['runtimes']=[]
        with self.assertRaises(ValueError):self.verify(manifest)
    def test_certification_expansion_keeps_accepted_runtime_capabilities(self):
        expanded=copy.deepcopy(self.manifest)
        native={**expanded['compatibility'],'engine':'cpython','engineVersion':'3.12.16','pythonVersion':'3.12.16','memoryPolicy':'native-cgroup-growth-v1','imageDigest':'sha256:'+'8'*64}
        expanded['native']=native;expanded['capabilities']['runtimes'].append(native)
        scope=dict(organizationId='11111111-1111-4111-8111-111111111111',academyId='22222222-2222-4222-8222-222222222222')
        expanded['academyAllowances']=[scope]
        expanded['certifications']=[dict(**scope,materialId='33333333-3333-4333-8333-333333333333',gradingRevision=1,context='live',memoryLimitMb=128,timeLimitMs=3000,packageProfile='standard-library',runtime=native)]
        self.target['images'].append({**self.target['images'][0],'configId':native['imageDigest']})
        self.target['rollback']['imageConfigIds'].append(native['imageDigest'])
        self.target['manifestIdentity']=digest(expanded);self.verify(expanded)
        with tempfile.TemporaryDirectory() as directory:
            import subprocess
            path=Path(directory)/'manifest.json';path.write_text(json.dumps(expanded))
            subprocess.run(['node',str(Path(__file__).resolve().parents[1]/'validate-manifest.mjs'),str(path)],check=True,capture_output=True)
        with self.assertRaises(ValueError):self.verify(expanded,'binary-rollback')
    def test_binary_rollback_can_change_images_but_keeps_metadata(self):self.verify(mode='binary-rollback')
    def test_failure_after_consumers_start_retains_target_and_forward_resume(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'state.json';atomic_json(path,dict(version=1,bundle='/old',manifestIdentity=self.current['manifestIdentity'],workerGeneration=self.current['workerGeneration']))
            target=dict(bundle='/candidate',manifestIdentity=self.target['manifestIdentity'],workerGeneration=self.target['workerGeneration'],releaseIdentity=digest(self.target))
            commands=[];fail=True
            def action(name):
                nonlocal fail
                commands.append(name)
                if name=='start-consumers' and fail:
                    fail=False;raise RuntimeError('Synthetic crash after consumers could accept work')
            with self.assertRaises(RuntimeError):execute_transition(path,target,action,lambda:self.inventory,self.inventory)
            state=json.loads(path.read_text());self.assertEqual(state['transition']['phase'],'start-consumers');self.assertEqual(state['transition']['target'],target);self.assertEqual(state['bundle'],'/old')
            with self.assertRaises(ValueError):execute_transition(path,{**target,'bundle':'/different'},action,lambda:self.inventory,self.inventory)
            execute_transition(path,target,action,lambda:self.inventory,self.inventory)
            state=json.loads(path.read_text());self.assertEqual(state['bundle'],'/candidate');self.assertNotIn('transition',state)
            self.assertLess(commands.index('stop-worker'),commands.index('stop-broker'));self.assertLess(commands.index('stop-broker'),commands.index('install-candidate'))
            self.assertNotIn('restore-old-manifest',commands)
    def test_live_inventory_change_keeps_fence_before_stopping_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'state';atomic_json(path,dict(version=1,bundle='/old'))
            commands=[];live={**self.inventory,'pending':1}
            with self.assertRaises(ValueError):execute_transition(path,dict(bundle='/new'),commands.append,lambda:live,self.inventory)
            self.assertEqual(commands,['stop-api']);self.assertEqual(json.loads(path.read_text())['transition']['phase'],'drain')
    def test_inventory_projection_ignores_only_time_and_fence_metadata(self):
        self.assertEqual(inventory_identity(self.inventory),inventory_identity({**self.inventory,'observedAt':123,'admissionFence':{}}))
        self.assertNotEqual(inventory_identity(self.inventory),inventory_identity({**self.inventory,'references':[{'imageDigest':'changed'}]}))

class FailedTargetRepairTests(unittest.TestCase):
    def test_repair_inventory_uses_validated_reader_even_when_pending_image_is_broken(self):
        from retained_operator import collect_candidate_inventory
        commands=[]
        def compose(*arguments,**options):
            commands.append((arguments,options))
            if options.get('overrides',{}).get('API_IMAGE')!='compatible-reader':raise RuntimeError('Pending image cannot run')
            return '{"complete":true}'
        self.assertEqual(collect_candidate_inventory(compose,'compatible-reader'),{'complete':True})
        arguments,options=commands[0]
        self.assertEqual(arguments,('run','--rm','--no-deps','--pull','never','--entrypoint','node','api','scripts/grading-inventory.mjs'))
        self.assertEqual(options,dict(capture=True,overrides={'API_IMAGE':'compatible-reader'}))

    def test_compatible_repair_replaces_broken_target_without_restoring_old_metadata(self):
        fixture=RetainedTests();fixture.setUp()
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'state';atomic_json(path,dict(version=1,bundle='/old',manifestIdentity='old-metadata'))
            failed=dict(bundle='/broken',manifestIdentity='retained-target-metadata',workerGeneration=fixture.current['workerGeneration'],releaseIdentity='broken')
            def broken(name):
                if name=='start-consumers':raise RuntimeError('Synthetic unhealthy target after start')
            with self.assertRaises(RuntimeError):execute_transition(path,failed,broken,lambda:fixture.inventory,fixture.inventory)
            repair={**failed,'bundle':'/compatible-repair','releaseIdentity':'repair'}
            commands=[];execute_transition(path,repair,commands.append,lambda:fixture.inventory,fixture.inventory,repair=True)
            saved=json.loads(path.read_text());self.assertEqual(saved['manifestIdentity'],'retained-target-metadata');self.assertEqual(saved['bundle'],'/compatible-repair');self.assertEqual(saved['previous']['bundle'],'/broken')
            self.assertNotIn('transition',saved);self.assertEqual(commands[0],'stop-api')
    def test_new_accepted_target_descriptor_blocks_a_metadata_removing_repair(self):
        fixture=RetainedTests();fixture.setUp()
        accepted=copy.deepcopy(fixture.manifest['compatibility']);accepted['imageDigest']='sha256:'+'7'*64
        failed_manifest=copy.deepcopy(fixture.manifest);failed_manifest['capabilities']['runtimes'].append(accepted)
        candidate=copy.deepcopy(fixture.target);candidate['manifestIdentity']=digest(failed_manifest)
        with self.assertRaisesRegex(ValueError,'descriptor'):
            validate_transition(fixture.current,failed_manifest,fixture.inventory,candidate,fixture.manifest,fixture.inventory,fixture.proof,'a'*64,'binary-rollback',int(time.time()))

if __name__=='__main__':unittest.main()
