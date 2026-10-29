"""Actual production census callback + durable executor, synthetic Docker only."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from retained import atomic_json, execute_transition
from retained_operator import stopped_consumer
import test_retained

DOCKER=['docker','--host','unix:///owned.sock']
PROJECT='owned-project'
STOPPED=dict(Running=False,Pid=0,Restarting=False,Status='exited')

class DockerCensus:
    def __init__(self):
        self.containers={};self.calls=[];self.next_id=0
        self.fail_census=False;self.interrupt_removal=None;self.removed=[]
    def add(self,service,**state):
        self.next_id+=1;cid=f'{self.next_id:064x}'
        self.containers[cid]=dict(Id=cid,Labels={'com.docker.compose.project':PROJECT,'com.docker.compose.service':service,'com.docker.compose.oneoff':'False'},State={**STOPPED,**state})
        return cid
    def run(self,command,capture=False):
        self.calls.append(command)
        assert command[:len(DOCKER)]==DOCKER
        args=command[len(DOCKER):]
        if args[0]=='ps':
            if self.fail_census:raise subprocess.CalledProcessError(1,command)
            assert '--no-trunc' in args
            assert 'label=com.docker.compose.project='+PROJECT in args
            service=next(value.split('=',2)[2] for value in args if value.startswith('label=com.docker.compose.service='))
            return '\n'.join(cid for cid,value in self.containers.items() if value['Labels']['com.docker.compose.service']==service)
        if args[0]=='inspect':return json.dumps(self.containers[args[-1]])
        if args[0]=='rm':
            assert len(args)==2 # Exact ID only: never force, volume or service prune.
            cid=args[1];assert self.containers[cid]['State']==STOPPED or self.containers[cid]['State']=={**STOPPED,'Status':'created'}
            del self.containers[cid];self.removed.append(cid)
            if len(self.removed)==self.interrupt_removal:raise RuntimeError('Interrupted ID-scoped removal')
            return ''
        raise AssertionError(command)
    def verify(self,service,reconcile=False):stopped_consumer(self.run,DOCKER,PROJECT,service,reconcile)

class RecreateRecoveryTests(unittest.TestCase):
    def test_actual_census_and_executor_resume_after_create_before_old_removal(self):
        fixture=test_retained.RetainedTests();fixture.setUp();docker=DockerCensus()
        originals=[docker.add(service) for service in ['api','judge-worker']]
        journal={'receipt':'retained-receipt','checkpoint':'retained-checkpoint'}
        before=copy.deepcopy(journal);operations=[];interrupted=False
        with tempfile.TemporaryDirectory() as directory:
            state=Path(directory)/'retained.json';atomic_json(state,dict(version=1,bundle='/failed'))
            target=dict(bundle='/repair',recovery=True)
            def action(name):
                nonlocal interrupted
                operations.append(name)
                if name=='verify-api-stopped':docker.verify('api',reconcile=True)
                elif name=='verify-worker-stopped':docker.verify('judge-worker',reconcile=True)
                elif name=='create-consumers':
                    # Compose creates new labelled containers before old removal.
                    for service in ['api','judge-worker']:docker.add(service,Status='created')
                    if not interrupted:
                        interrupted=True;raise RuntimeError('After replacement create, before old removal')
                elif name in ['start-broker','start-consumers']:
                    docker.verify('api');docker.verify('judge-worker')
            with self.assertRaisesRegex(RuntimeError,'replacement create'):
                execute_transition(state,target,action,lambda:fixture.inventory,fixture.inventory)
            self.assertEqual(len(docker.containers),4)
            self.assertEqual(json.loads(state.read_text())['transition']['phase'],'create-consumers')
            self.assertNotIn('start-broker',operations)
            interrupted_ids={service:{cid for cid,value in docker.containers.items() if value['Labels']['com.docker.compose.service']==service} for service in ['api','judge-worker']}
            execute_transition(state,target,action,lambda:fixture.inventory,fixture.inventory)
            self.assertEqual(len(docker.containers),2)
            self.assertEqual(len(docker.removed),4)
            self.assertTrue(set(originals)<=set(docker.removed))
            self.assertEqual(json.loads(state.read_text())['bundle'],'/repair')
            self.assertEqual(journal,before)
            # The complete service set was inspected before its first mutation.
            for ids in interrupted_ids.values():
                first_removal=min(docker.calls.index(DOCKER+['rm',cid]) for cid in ids)
                for cid in ids:
                    self.assertTrue(any(call[3:4]==['inspect'] and call[-1]==cid for call in docker.calls[:first_removal]))

    def test_failed_unknown_or_live_census_cannot_remove_any_container(self):
        for defect in ['failed','running','pid','restarting','status','ownership','oneoff','missing-label','changed']:
            with self.subTest(defect=defect):
                docker=DockerCensus();docker.add('api');cid=docker.add('api',Status='created')
                value=docker.containers[cid]
                if defect=='failed':docker.fail_census=True
                elif defect=='running':value['State']['Running']=True
                elif defect=='pid':value['State']['Pid']=123
                elif defect=='restarting':value['State']['Restarting']=True
                elif defect=='status':value['State']['Status']='unknown'
                elif defect=='ownership':value['Labels']['com.docker.compose.project']='unrelated'
                elif defect=='oneoff':value['Labels']['com.docker.compose.oneoff']='True'
                elif defect=='missing-label':del value['Labels']['com.docker.compose.oneoff']
                if defect=='changed':
                    original=docker.run
                    def changed(command,capture=False):
                        if command[len(DOCKER)]=='ps' and any(call[len(DOCKER)]=='inspect' for call in docker.calls):docker.add('api')
                        return original(command,capture)
                    docker.run=changed
                with self.assertRaises((ValueError,subprocess.CalledProcessError)):docker.verify('api',reconcile=True)
                self.assertEqual(docker.removed,[])

    def test_interrupted_exact_id_cleanup_resumes_and_absence_never_allows_start(self):
        for removed_count in [1,2]:
            with self.subTest(removed_count=removed_count):
                docker=DockerCensus();docker.add('judge-worker');docker.add('judge-worker',Status='created')
                docker.interrupt_removal=removed_count
                with self.assertRaisesRegex(RuntimeError,'ID-scoped'):docker.verify('judge-worker',reconcile=True)
                docker.interrupt_removal=None
                docker.verify('judge-worker',reconcile=True)
                if not docker.containers:
                    with self.assertRaisesRegex(ValueError,'before startup'):docker.verify('judge-worker')
                    docker.add('judge-worker',Status='created')
                docker.verify('judge-worker')

if __name__=='__main__':unittest.main()
