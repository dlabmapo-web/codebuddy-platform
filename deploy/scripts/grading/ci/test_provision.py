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

class BrokerPreflightTests(unittest.TestCase):
    def test_probe_derives_actual_production_broker_policy_with_concrete_paths(self):
        content=ci.render(ci.HOME,10000,'/usr/bin/dockerd-rootless.sh','/opt/cove/bin/node')[ci.HOME/'.config/systemd/user/cove-grading-broker.service']
        properties=ci.broker_preflight_properties(content,10000)
        for value in ['Slice=cove-grading.slice','NoNewPrivileges=yes','PrivateTmp=yes','ProtectSystem=strict','UMask=0007','WorkingDirectory=/opt/cove/grading/current','EnvironmentFile=/home/cove-grading/.config/cove-grading/broker.env','Environment=NODE_OPTIONS=--max-old-space-size=128','Environment=PATH=/usr/local/bin:/usr/bin:/bin','ReadWritePaths=/home/cove-grading/.local/share/cove-grading /run/cove-grading-control /run/user/10000/cove-grading /sys/fs/cgroup']:
            self.assertIn('--property='+value,properties)
        self.assertFalse(any('%' in value for value in properties))
        for bad in [content+'ProtectHome=yes\n',content.replace('PrivateTmp=yes\n',''),content.replace('ProtectSystem=strict','ProtectSystem=%unknown'),content.replace('/opt/cove/bin/node /opt/cove/grading/current/dist/main.js','/usr/bin/node /opt/cove/grading/current/dist/main.js')]:
            with self.subTest(content=bad),self.assertRaises(ValueError): ci.broker_preflight_properties(bad,10000)

    def test_actual_probe_projects_errno_and_exact_path_role_without_payloads(self):
        import json
        import subprocess
        script=r'''
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {errorProjection,configuredPaths,invariantReasons,stages,types,codes,syscalls,pathRoles} from './deploy/scripts/grading/ci/broker-preflight.mjs';
const env={GRADING_DAEMON_PID_FILE:'/run/user/10000/cove-grading/host-docker.pid',GRADING_DAEMON_SOCKET:'/run/user/10000/cove-grading/docker.sock',GRADING_CGROUP_PARENT:'/sys/fs/cgroup/cove.slice/cove-grading.slice',GRADING_RUNTIME_MANIFEST_PATH:'/opt/cove/grading/ci/manifest.json'};
const paths=configuredPaths(env,123,456,'/usr/bin/dockerd');
const error={name:'Error',code:'EACCES',syscall:'readlink',path:'/proc/123/exe',message:'token=RAW_SECRET_CANARY',stack:'RAW_SECRET_CANARY'};
assert.deepEqual(errorProjection(error,paths),{type:'Error',code:'EACCES',syscall:'readlink',pathRole:'daemon-proc-executable',reason:'unclassified'});
assert.equal(errorProjection({...error,path:'/proc/123/exe/RAW_SECRET_CANARY'},paths).pathRole,'unknown');
assert.equal(errorProjection({...error,path:env.GRADING_DAEMON_PID_FILE+'.identity.json',code:'ENOENT',syscall:'open'},paths).pathRole,'daemon-sidecar');
assert.equal(errorProjection({...error,path:env.GRADING_CGROUP_PARENT+'/memory.max'},paths).pathRole,'family-memory');
assert.equal(errorProjection({...error,path:'/usr/bin/dockerd'},paths).pathRole,'daemon-executable');
assert.equal(errorProjection({...error,message:'Daemon identity too large'},paths).reason,'daemon-identity-size');
assert.deepEqual(errorProjection({name:'RAW_SECRET_CANARY',code:'RAW_SECRET_CANARY',syscall:'RAW_SECRET_CANARY',path:'RAW_SECRET_CANARY',message:'RAW_SECRET_CANARY'},paths),{type:'Unknown',code:'UNKNOWN',syscall:'unknown',pathRole:'unknown',reason:'unclassified'});
const source=(await Promise.all(['rootless-driver.ts','daemon-identity.ts','cgroup.ts','manifest.ts'].map(file=>readFile('./packages/grading-runtime/src/'+file,'utf8')))).join('\n');
for(const literal of invariantReasons.keys()) assert(source.includes(JSON.stringify(literal)) || source.includes("'"+literal+"'"),literal+' not a production literal');
const probe=await readFile('./deploy/scripts/grading/ci/broker-preflight.mjs','utf8');
assert(probe.includes("import('/opt/cove/grading/current/dist/rootless-driver.js')"));
assert.deepEqual([...probe.matchAll(/\bdriver\.([A-Za-z]+)\(/g)].map(m=>m[1]),['verify']);
console.log(JSON.stringify({stage:stages,type:types,code:codes,syscall:syscalls,pathRole:pathRoles,reason:[...invariantReasons.values(),'unclassified']}));
'''
        result=subprocess.run(['node','--input-type=module','-e',script],cwd=Path(__file__).resolve().parents[4],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual({key:set(values) for key,values in json.loads(result.stdout).items()},ci.PREFLIGHT_FIELDS)


class UserManagerEnvironmentTests(unittest.TestCase):
    def exercise(self,result=None,runtime_mode=0o40700,runtime_uid=10000,bus_mode=0o140666,bus_uid=10000):
        import json
        from types import SimpleNamespace
        from unittest.mock import patch
        expected={key:True for key in ('uidMatches','homeMatches','runtimeEnvironmentMatches','busMatches','runtimePathMatches','runtimeDirectoryExists','runtimeDirectoryOwned','runtimeDirectoryMode')}
        with patch.object(ci.Path,'lstat',side_effect=[SimpleNamespace(st_mode=runtime_mode,st_uid=runtime_uid),SimpleNamespace(st_mode=bus_mode,st_uid=bus_uid)]),patch.object(ci.os.path,'lexists',return_value=False),patch.object(ci,'user_command',side_effect=['not-found','',json.dumps(expected if result is None else result),'not-found']) as command:
            failure=None
            try: ci.normalize_user_manager(dict(uid=10000))
            except Exception as error: failure=error
        return command.call_args_list,failure

    def test_owned_manager_environment_is_set_and_probed_through_service(self):
        calls,failure=self.exercise()
        self.assertIsNone(failure)
        normalization=calls[1].args
        self.assertEqual(normalization[1:4],('systemctl','--user','set-environment'))
        self.assertEqual(set(normalization[4:]),{'HOME='+str(ci.HOME),'XDG_RUNTIME_DIR=/run/user/10000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/10000/bus'})
        probe=calls[2].args
        self.assertEqual(probe[1],'systemd-run')
        for required in ('--user','--wait','--pipe','--collect','--unit=cove-grading-ci-environment.service','--property=RuntimeMaxSec=15','--property=MemoryMax=32M','--property=TasksMax=16'): self.assertIn(required,probe)
        self.assertNotIn('--scope',probe)
        self.assertFalse(any(str(value).startswith('--setenv') for value in probe))
        self.assertFalse(any(str(value).startswith('--property=Environment=') for value in probe))
        self.assertIn('--property=RuntimeDirectory=cove-grading-ci-environment',probe)
        self.assertIn('--property=RuntimeDirectoryMode=0700',probe)

    def test_wrong_runtime_directory_or_bus_refused_before_manager_mutation(self):
        for changes in [dict(runtime_uid=1001),dict(runtime_mode=0o40755),dict(runtime_mode=0o120777),dict(bus_uid=1001),dict(bus_mode=0o100600)]:
            with self.subTest(changes=changes):
                calls,failure=self.exercise(**changes)
                self.assertIsInstance(failure,ValueError)
                self.assertEqual(calls,[])

    def test_service_inheriting_runner_runtime_or_wrong_identity_is_refused(self):
        correct={key:True for key in ('uidMatches','homeMatches','runtimeEnvironmentMatches','busMatches','runtimePathMatches','runtimeDirectoryExists','runtimeDirectoryOwned','runtimeDirectoryMode')}
        for key,message in [('uidMatches','service UID differs'),('homeMatches','service HOME differs'),('runtimeEnvironmentMatches','service XDG runtime differs'),('busMatches','service bus address differs'),('runtimePathMatches','runtime prefix differs'),('runtimeDirectoryExists','runtime directory was not created'),('runtimeDirectoryOwned','runtime directory owner differs'),('runtimeDirectoryMode','runtime directory mode differs')]:
            with self.subTest(key=key):
                _,failure=self.exercise(result={**correct,key:False})
                self.assertIn(message,str(failure))

    def test_probe_uses_real_runtime_directory_and_ignores_literal_transient_specifier(self):
        import json
        import os
        import subprocess
        import sys
        import tempfile
        calls,_=self.exercise()
        args=calls[2].args
        probe=args[args.index('-c')+1]
        with tempfile.TemporaryDirectory() as folder:
            runtime=Path(folder).resolve(); child=runtime/'cove-grading-ci-environment';child.mkdir(mode=0o700)
            env=dict(HOME=folder,XDG_RUNTIME_DIR=str(runtime),DBUS_SESSION_BUS_ADDRESS='unix:path='+str(runtime/'bus'),RUNTIME_DIRECTORY=str(child),GRADING_CI_RUNTIME_SPECIFIER='%t')
            def execute():
                result=subprocess.run([sys.executable,'-I','-c',probe,str(os.getuid()),folder,str(runtime)],env=env,capture_output=True,text=True,check=True)
                return json.loads(result.stdout)
            self.assertTrue(all(execute().values()))
            child.chmod(0o755)
            self.assertFalse(execute()['runtimeDirectoryMode'])
            child.chmod(0o700)
            env['RUNTIME_DIRECTORY']='/run/user/1001/cove-grading-ci-environment'
            self.assertFalse(execute()['runtimePathMatches'])
            env['RUNTIME_DIRECTORY']=str(child);child.rmdir()
            facts=execute()
            self.assertFalse(facts['runtimeDirectoryExists'])
            self.assertFalse(facts['runtimeDirectoryOwned'])
            self.assertFalse(facts['runtimeDirectoryMode'])

    def test_preexisting_probe_directory_cannot_substitute_for_manager_creation(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        with patch.object(ci.Path,'lstat',side_effect=[SimpleNamespace(st_mode=0o40700,st_uid=10000),SimpleNamespace(st_mode=0o140666,st_uid=10000)]),patch.object(ci.os.path,'lexists',return_value=True),patch.object(ci,'user_command',return_value='not-found') as command:
            with self.assertRaisesRegex(ValueError,'Existing user environment probe runtime directory refused'): ci.normalize_user_manager(dict(uid=10000))
            self.assertEqual(command.call_count,1)

    def test_probe_launch_failure_stops_only_its_exact_unit_and_preserves_primary(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        import subprocess
        failure=subprocess.CalledProcessError(17,['systemd-run'])
        for stop in ['',subprocess.CalledProcessError(23,['systemctl'])]:
            with self.subTest(stop=stop),patch.object(ci.Path,'lstat',side_effect=[SimpleNamespace(st_mode=0o40700,st_uid=10000),SimpleNamespace(st_mode=0o140666,st_uid=10000)]),patch.object(ci.os.path,'lexists',return_value=False),patch.object(ci,'user_command',side_effect=['not-found','',failure,'loaded',stop]) as command:
                with self.assertRaises(subprocess.CalledProcessError) as raised: ci.normalize_user_manager(dict(uid=10000))
                self.assertIs(raised.exception,failure)
                self.assertEqual(command.call_args.args[1:],('systemctl','--user','stop','cove-grading-ci-environment.service'))

    def test_normalization_follows_last_user_reload_and_precedes_grading_start(self):
        # Ordering matters because a user environment generator may repopulate
        # the manager's launch environment during daemon-reload.
        import inspect
        source=inspect.getsource(ci.prepare)
        self.assertLess(source.rindex("'--user','daemon-reload'"),source.index('normalize_user_manager(state)'))
        self.assertLess(source.index('normalize_user_manager(state)'),source.index("'--user','start','cove-grading.slice'"))


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
