import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('ci', Path(__file__).with_name('provision.py'))
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)

def ci_environment():
    return dict(GITHUB_ACTIONS='true', RUNNER_ENVIRONMENT='github-hosted', GRADING_DISPOSABLE_CI='1')

class ProvisionTests(unittest.TestCase):
    def test_non_ci_host_refused(self):
        with self.assertRaises(ValueError):
            ci.require_ephemeral_host({'GITHUB_ACTIONS': 'false'}, 'Linux', 'x86_64', 0)

    def test_wrong_architecture_refused(self):
        with self.assertRaises(ValueError):
            ci.require_ephemeral_host(ci_environment(), 'Linux', 'aarch64', 0)

    def test_root_required(self):
        with self.assertRaises(ValueError):
            ci.require_ephemeral_host(ci_environment(), 'Linux', 'x86_64', 1001)

    def test_exact_guard_accepts(self):
        ci.require_ephemeral_host(ci_environment(), 'Linux', 'x86_64', 0)


class SafetyContracts(unittest.TestCase):
    def test_only_official_selected_version_is_accepted(self):
        policy='  Candidate: 5:29.0.0-1~ubuntu.24.04~noble\n  Version table:\n     5:29.0.0-1~ubuntu.24.04~noble 500\n        500 https://download.docker.com/linux/ubuntu noble/stable amd64 Packages\n'
        version='5:29.0.0-1~ubuntu.24.04~noble'
        self.assertTrue(ci.official_rootless_version(policy,version))
        self.assertFalse(ci.official_rootless_version(policy.replace('download.docker.com','untrusted.example'),version))
        self.assertFalse(ci.official_rootless_version(policy,'5:30.0.0-1~ubuntu.24.04~noble'))

    def test_guard_precedes_mutation(self):
        from unittest.mock import patch
        with patch.object(ci, 'require_ephemeral_host', side_effect=ValueError('refused')), patch.object(ci.Path,'mkdir') as mkdir, patch.object(ci,'command') as command:
            with self.assertRaises(ValueError): ci.prepare('/irrelevant')
            mkdir.assert_not_called(); command.assert_not_called()

    def test_existing_account_group_and_path_refused(self):
        import tempfile
        for users,groups in [(['cove-grading'],[]), ([],['cove-grading-control']), (['cove-grading-ci-worker'],[])]:
            with self.subTest(users=users,groups=groups), self.assertRaises(ValueError):
                ci.require_absent([],users,groups)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError): ci.require_absent([Path(directory)],[],[])

    def test_existing_different_configuration_refused_without_write(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'config'; path.write_text('old')
            with self.assertRaises(ValueError): ci.write_owned({},path,'new')
            self.assertEqual(path.read_text(),'old')

    def test_subordinate_range_avoids_all_overlaps_and_real_accounts(self):
        start,count=ci.subordinate_range(['alice:100000:65536\nbob:180000:65536\n','carol:300000:65536\n'],[260000])
        self.assertEqual(count,65536)
        for low,high in [(100000,165536),(180000,245536),(260000,260001),(300000,365536)]:
            self.assertTrue(start+count<=low or start>=high)

    def test_malformed_or_overflow_subordinate_database_refused(self):
        for value in ['name:1:0','name:xyz:65536','name:4294967290:65536','bad']:
            with self.subTest(value=value), self.assertRaises(ValueError): ci.subordinate_range([value])

    def test_changed_inode_contents_modes_or_symlink_refused(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'owned'; path.write_text('one'); original=ci.snapshot(path)
            ci.validate_owned(path,original)
            path.write_text('two')
            with self.assertRaises(ValueError): ci.validate_owned(path,original)
            path.unlink(); path.symlink_to(Path(directory))
            with self.assertRaises(ValueError): ci.validate_owned(path,original)

    def test_exact_container_identity_required(self):
        import copy
        allocation='11111111-1111-4111-8111-111111111111'
        state=dict(owner='22222222-2222-4222-8222-222222222222',images=[dict(configId='sha256:'+'a'*64)])
        item=dict(Id='b'*64,Name='/cove-grade-'+allocation,Image=state['images'][0]['configId'],Config=dict(Labels={'io.cove.grading.owner':state['owner'],'io.cove.grading.allocation':allocation}))
        self.assertEqual(ci.owned_containers(state,[item]),[item])
        for key,value in [('Image','sha256:'+'c'*64),('Name','/unrelated'),('Id','short')]:
            changed=copy.deepcopy(item); changed[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError): ci.owned_containers(state,[changed])
        changed=copy.deepcopy(item);changed['Config']['Labels']['io.cove.grading.owner']='another'
        with self.assertRaises(ValueError):ci.owned_containers(state,[changed])

    def test_immutable_image_label_platform_and_id_required(self):
        import copy
        descriptor=dict(imageDigest='sha256:'+'a'*64,architecture='amd64',packageManifestHash='sha256:'+'b'*64,shimVersion='cove-guest-1',engine='cpython',engineVersion='3.12.16',pythonVersion='3.12.16')
        labels={'io.cove.grading.'+label:descriptor[key] for label,key in [('package','packageManifestHash'),('shim','shimVersion'),('engine','engine'),('version','engineVersion'),('python','pythonVersion')]}
        image=dict(Id=descriptor['imageDigest'],Os='linux',Architecture='amd64',Config=dict(Labels=labels))
        ci.verify_image(image,descriptor)
        for key,value in [('Id','mutable:ci'),('Os','windows'),('Architecture','arm64')]:
            changed=copy.deepcopy(image); changed[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):ci.verify_image(changed,descriptor)
        image['Config']['Labels']['io.cove.grading.package']='sha256:'+'c'*64
        with self.assertRaises(ValueError):ci.verify_image(image,descriptor)

    def test_manifest_change_fails_before_daemon_access(self):
        from unittest.mock import patch
        with patch.object(ci,'read_json',return_value=dict(version=1)),patch.object(ci,'docker') as docker:
            with self.assertRaisesRegex(ValueError,'Manifest identity'):
                ci.verify_manifest(dict(manifestPath='unused',manifestIdentity='wrong'))
            docker.assert_not_called()

    def test_cleanup_changed_path_refuses_before_stop(self):
        from unittest.mock import patch
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'owned'; path.write_text('one'); identity=ci.snapshot(path); path.write_text('changed')
            state=dict(uid=123,controlGid=456,workerGid=789,subordinateStart=100000,ownedPaths={str(path):identity},ownedFiles={})
            with patch.object(ci,'check_host'),patch.object(ci,'STATE',path),patch.object(ci,'load_state',return_value=state),patch.object(ci,'verify_accounts'),patch.object(ci,'verify_subordinate'),patch.object(ci,'subordinate_contents',return_value=[]),patch.object(ci.grp,'getgrnam',side_effect=KeyError),patch.object(ci,'command') as command:
                with self.assertRaisesRegex(ValueError,'identity changed'):ci.cleanup()
                command.assert_not_called()

    def test_subordinate_later_changes_refused(self):
        state={'subordinateStart':100000}
        ci.verify_subordinate(state,['cove-grading:100000:65536','cove-grading:100000:65536'])
        for changed in ['cove-grading:100001:65536','cove-grading:100000:65536\nother:120000:65536','']:
            with self.subTest(changed=changed),self.assertRaises(ValueError):ci.verify_subordinate(state,[changed])

    def test_cleanup_cleaned_receipt_is_idempotent(self):
        from unittest.mock import patch
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'state';path.write_text('{}')
            with patch.object(ci,'check_host'),patch.object(ci,'STATE',path),patch.object(ci,'load_state',return_value={'cleaned':True,'delegationPath':'/not-present-cove-test'}),patch.object(ci.pwd,'getpwnam',side_effect=KeyError),patch.object(ci.grp,'getgrnam',side_effect=KeyError),patch.object(ci,'command') as command:
                self.assertTrue(ci.cleanup()['alreadyAbsent']);command.assert_not_called()

    def test_cleanup_cleaned_receipt_refuses_reappeared_principals(self):
        from unittest.mock import patch
        import tempfile
        for kind,name in [('account','cove-grading'),('account','cove-grading-ci-worker'),('group','cove-grading-control'),('group','cove-grading-ci-worker')]:
            with self.subTest(kind=kind,name=name),tempfile.TemporaryDirectory() as directory:
                path=Path(directory)/'state';path.write_text('{}')
                def account_lookup(requested):
                    if kind=='account' and requested==name: return object()
                    raise KeyError(requested)
                def group_lookup(requested):
                    if kind=='group' and requested==name: return object()
                    raise KeyError(requested)
                with patch.object(ci,'check_host'),patch.object(ci,'STATE',path),patch.object(ci,'load_state',return_value={'cleaned':True,'delegationPath':'/not-present-cove-test'}),patch.object(ci.pwd,'getpwnam',side_effect=account_lookup),patch.object(ci.grp,'getgrnam',side_effect=group_lookup),patch.object(ci,'command') as command,patch.object(ci,'user_command') as user_command,patch.object(ci.shutil,'rmtree') as rmtree:
                    with self.assertRaisesRegex(ValueError,'principal.*reappeared'):ci.cleanup()
                    command.assert_not_called();user_command.assert_not_called();rmtree.assert_not_called()

    def test_bundle_production_schema_and_funding_and_identity_rejections(self):
        import subprocess
        script=r'''
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {descriptor,bundle} from './deploy/scripts/grading/ci/bundle.mjs';
const raw=Buffer.from('{"version":1}');
const hash='sha256:'+createHash('sha256').update(raw).digest('hex');
function runtime(engine,id) {
 const identity={engine,engineVersion:engine==='cpython'?'3.12.16':'0.27.5',pythonVersion:engine==='cpython'?'3.12.16':'3.12.7',packageManifestHash:hash,shimVersion:'cove-guest-1'};
 const labels=Object.fromEntries(Object.entries({engine:'engine',version:'engineVersion',python:'pythonVersion',package:'packageManifestHash',shim:'shimVersion'}).map(([l,k])=>['io.cove.grading.'+l,identity[k]]));
 const image={Id:'sha256:'+id.repeat(64),Os:'linux',Architecture:'amd64',Config:{Labels:labels}};
 const result=descriptor(image,identity,raw);
 assert.throws(()=>descriptor({...image,Architecture:'arm64'},identity,raw));
 assert.throws(()=>descriptor({...image,Id:'mutable:ci'},identity,raw));
 assert.throws(()=>descriptor(image,identity,Buffer.from('changed')));
 assert.throws(()=>descriptor({...image,Config:{Labels:{...labels,'io.cove.grading.shim':'wrong'}}},identity,raw));
 return result;
}
const n=runtime('cpython','a'),p=runtime('pyodide','b');
const value=bundle(n,p);
assert.equal(value.manifest.capabilities.maxActive,2);
assert.equal(value.manifest.capabilities.maxBackground,1);
assert.equal(value.manifest.capabilities.maxSpare,0);
assert.equal(value.warmProfiles.reduce((sum,p)=>sum+p.targetReady,0),2);
assert(value.warmProfiles.every(p=>p.memoryLimitMb===128));
assert.equal(256+value.warmProfiles.reduce((sum,p)=>sum+p.memoryLimitMb+(p.runtime.engine==='cpython'?128:320),0),960);
assert.throws(()=>bundle(n,n));
'''
        root=Path(__file__).resolve().parents[4]
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=root,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

class PrerequisitePackageTests(unittest.TestCase):
    version='5:28.5.1-1~ubuntu.24.04~noble'

    def policy(self):
        return ('  Candidate: 5:29.0.0-1~ubuntu.24.04~noble\n  Version table:\n'
                '     5:29.0.0-1~ubuntu.24.04~noble 500\n'
                '        500 https://download.docker.com/linux/ubuntu noble/stable amd64 Packages\n'
                ' *** '+self.version+' 500\n'
                '        500 https://download.docker.com/linux/ubuntu noble/stable amd64 Packages\n'
                '        100 /var/lib/dpkg/status\n')

    def test_older_matching_version_is_selected_independently_of_candidate(self):
        self.assertTrue(ci.official_rootless_version(self.policy(),self.version))

    def test_matching_version_requires_exclusive_official_noble_amd64_origin(self):
        for changed in [self.policy().replace('noble/stable','jammy/stable'),self.policy().replace('amd64 Packages','arm64 Packages'),self.policy()+'        500 https://untrusted.example/linux/ubuntu noble/stable amd64 Packages\n',self.policy().replace('https://download.docker.com/linux/ubuntu','https://download.docker.com/linux/ubuntu.attacker')]:
            with self.subTest(policy=changed): self.assertFalse(ci.official_rootless_version(changed,self.version))

    def test_installed_snapshot_excludes_absent_packages_and_retains_architecture(self):
        from unittest.mock import patch
        output='docker-ce\tamd64\tinstalled\t'+self.version+'\nrunc\tamd64\tconfig-files\t1.0\nunrelated\tamd64\tinstalled\t2.0\ndocker-ce-cli\tamd64\tinstalled\t'+self.version
        with patch.object(ci,'command',return_value=output):
            self.assertEqual(ci.installed_packages(),{'docker-ce:amd64':self.version,'docker-ce-cli:amd64':self.version})

    def test_transaction_projection_discards_repository_and_prose(self):
        raw='Reading package lists...\nInst uidmap [1:old] (1:new Ubuntu:24.04/noble-updates [amd64])\nConf uidmap (1:new Ubuntu:24.04/noble-updates [amd64])\nRemv runc:amd64 [1.2]\n'
        self.assertEqual(ci.prerequisite_plan(raw),[dict(action='Inst',package='uidmap',previousVersion='1:old',version='1:new'),dict(action='Conf',package='uidmap',previousVersion=None,version='1:new'),dict(action='Remv',package='runc:amd64',previousVersion='1.2',version=None)])
        for invalid in ['Inst ../escape (1.0 repo [amd64])','Inst docker-ce malformed','Inst uidmap (version/escape repo [amd64])','Inst uidmap (1.0 repo [amd64])\n'*129,'x'*(256*1024+1)]:
            with self.subTest(raw=invalid[:80]),self.assertRaises(ValueError): ci.prerequisite_plan(invalid)

    def exercise_install(self,simulation,after=None,installed=None):
        import copy
        from unittest.mock import patch
        installed=installed if installed is not None else {'docker-ce:amd64':self.version,'docker-ce-cli:amd64':self.version,'containerd.io:amd64':'1.7.28-1'}
        calls=[]; records=[]
        def command(args,**kwargs):
            calls.append(args)
            if args[:2]==['apt-cache','policy']: return self.policy()
            if '--simulate' in args:
                if isinstance(simulation,Exception): raise simulation
                return simulation
            return ''
        class Done(Exception): pass
        failure=None
        with patch.object(ci,'installed_packages',side_effect=[installed,after if after is not None else {**installed,'docker-ce-rootless-extras:amd64':self.version}]),patch.object(ci,'command',side_effect=command),patch.object(ci,'atomic_json',side_effect=lambda path,value:records.append(copy.deepcopy(value))),patch.object(ci,'file_hash',return_value='same'),patch.object(ci,'verify_rootful',side_effect=Done):
            try: ci.install_prerequisites({})
            except Done: pass
            except Exception as error: failure=error
        return calls,records,failure

    def test_matching_extras_and_all_installed_protected_versions_pinned(self):
        calls,records,failure=self.exercise_install('Inst uidmap (1.0 Ubuntu:24.04/noble [amd64])')
        self.assertIsNone(failure)
        simulated=next(args for args in calls if '--simulate' in args)
        installed=next(args for args in calls if args[:2]==['apt-get','install'])
        for pin in ['docker-ce:amd64='+self.version,'docker-ce-cli:amd64='+self.version,'containerd.io:amd64=1.7.28-1','docker-ce-rootless-extras:amd64='+self.version]:
            self.assertIn(pin,simulated); self.assertIn(pin,installed)
        self.assertIn('--no-remove',installed)
        self.assertEqual(records[-1]['selectedRootlessVersion'],self.version)
        self.assertTrue(records[-1]['officialOrigin'])

    def test_any_removal_or_protected_inst_including_arch_suffix_refused(self):
        for raw in ['Remv unrelated [1.0]','Inst docker-ce (1.0 repo [amd64])','Inst docker-ce:amd64 [1.0] (2.0 repo [amd64])','Inst runc:amd64 (1.0 repo [amd64])']:
            with self.subTest(raw=raw):
                calls,records,failure=self.exercise_install(raw)
                self.assertRegex(str(failure),'alter rootful engine')
                self.assertFalse(any(args[:2]==['apt-get','install'] for args in calls))
                self.assertEqual(len(records[-1]['simulation']['transactions']),1)

    def test_failed_simulation_retained_and_never_installed(self):
        import subprocess
        calls,records,failure=self.exercise_install(subprocess.CalledProcessError(100,['apt-get'],output='Inst uidmap (1.0 repo [amd64])\n',stderr='token=must-not-be-retained'))
        self.assertRegex(str(failure),'could not be resolved')
        self.assertEqual(records[-1]['simulation']['exitCode'],100)
        self.assertEqual(records[-1]['simulation']['transactions'][0]['package'],'uidmap')
        self.assertNotIn('must-not-be-retained',str(records))
        self.assertFalse(any(args[:2]==['apt-get','install'] for args in calls))

    def test_absent_ce_version_fails_before_apt_mutation_with_snapshot(self):
        calls,records,failure=self.exercise_install('',installed={'moby-engine:amd64':'1.0'})
        self.assertRegex(str(failure),'Installed Docker CE AMD64')
        self.assertEqual(calls,[])
        self.assertIsNone(records[-1]['selectedRootlessVersion'])

    def test_unavailable_matching_official_version_refuses_install_with_selection_retained(self):
        from unittest.mock import patch
        with patch.object(self,'policy',return_value=self.policy().replace(self.version,'5:27.0.0-1~ubuntu.24.04~noble')):
            calls,records,failure=self.exercise_install('')
        self.assertRegex(str(failure),'Matching official Docker')
        self.assertEqual(records[-1]['selectedRootlessVersion'],self.version)
        self.assertFalse(records[-1]['officialOrigin'])
        self.assertFalse(any('--simulate' in args or args[:2]==['apt-get','install'] for args in calls))

    def test_post_install_protected_change_or_wrong_extras_refused(self):
        for after in [{'docker-ce:amd64':'different'},{'docker-ce:amd64':self.version,'docker-ce-cli:amd64':self.version,'containerd.io:amd64':'1.7.28-1','docker-ce-rootless-extras:amd64':'different'}]:
            with self.subTest(after=after):
                _,_,failure=self.exercise_install('',after=after)
                self.assertIsInstance(failure,ValueError)


if __name__ == '__main__':
    unittest.main()
