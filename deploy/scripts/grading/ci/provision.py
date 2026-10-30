#!/usr/bin/env python3
"""Guarded, ephemeral Ubuntu CI only. No production activation or acceptance proof.

Only prepare accepts a path (the repository). Observe/cleanup consume fixed,
root-private state. A failed cleanup never widens its resource selection.
"""
import argparse
import grp
import hashlib
import json
import os
from pathlib import Path
import platform
import pwd
import re
import shutil
import socket
import stat
import struct
import subprocess
import sys
import time
import urllib.request
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from release import canonical, digest, read_json, require
from artifact import tree_identity
from daemon_identity import attest_daemon, file_hash
from install import render
from host import group, limits

STATE_DIR = Path('/var/lib/cove-grading-ci')
STATE = STATE_DIR/'state.json'
PUBLIC = Path('/opt/cove/grading/ci/config.json')
EVIDENCE = STATE_DIR/'evidence'
HOME = Path('/home/cove-grading')
WORKER_HOME = Path('/home/cove-grading-ci-worker')
CONTROL = Path('/run/cove-grading-control')
OPT = Path('/opt/cove')
WORKER_SLICE = 'cove-grading-ci-worker.slice'
WORKER_SERVICE = 'cove-grading-ci-worker.service'
ROOTFUL = 'unix:///var/run/docker.sock'
TAGS = ['cove-grading-native:ci', 'cove-grading-compatibility:ci', 'cove-grading-broker:ci']
FAMILY_LIMITS = dict(memoryBytes=1280*2**20, cpus=1.5, pids=256, swapBytes=0)
WORKER_LIMITS = dict(memoryBytes=768*2**20, cpus=.75, pids=256, swapBytes=0)
SYSTEM_FILES = [Path('/etc/apt/keyrings/cove-grading-ci.asc'), Path('/etc/apt/sources.list.d/cove-grading-ci.sources'), Path('/etc/systemd/system/cove-grading-ci-worker.slice')]
PROTECTED_PACKAGES = {'docker-ce','docker-ce-cli','docker.io','moby-engine','moby-cli','containerd','containerd.io','runc'}
PACKAGE_NAME = re.compile(r'[a-z0-9][a-z0-9+.-]{0,95}(?::[a-z0-9][a-z0-9-]{0,31})?')
PACKAGE_VERSION = re.compile(r'[A-Za-z0-9.+:~_-]{1,128}')
PREFLIGHT_FIELDS = dict(stage={'configuration','imports','manifest','daemon-sidecar','driver-construction','driver-verify','complete'},
    type={'BrokerError','Error','TypeError','SyntaxError','ZodError','Unknown'},
    code={'EACCES','EPERM','ENOENT','ESRCH','ENOTDIR','ELOOP','EIO','ENOMEM','EMFILE','ENFILE','ETIMEDOUT','INFRASTRUCTURE','UNKNOWN'},
    syscall={'open','read','readlink','stat','lstat','realpath','scandir','spawn docker','unknown'},
    pathRole={'daemon-pid','daemon-sidecar','daemon-executable','daemon-proc-executable','daemon-proc-starttime','daemon-proc-directory','daemon-socket','family','family-controllers','family-memory','family-swap','family-pids','family-cpu','broker-proc-cgroup','daemon-proc-cgroup','manifest','unknown'},
    reason={'owner','socket-config','slice-config','daemon-identity-size','daemon-identity-schema','daemon-pid-sidecar','daemon-uid','daemon-continuity','daemon-binary','daemon-restarted','daemon-rootless','daemon-config','socket-owner','socket-replaced','broker-platform','family-path','family-symlink','family-controllers','family-memory','family-swap','family-pids','family-cpu','family-membership','image-identity','image-package','docker-timeout','docker-output','docker-command','manifest-path','manifest-file','manifest-size','unclassified'})


def require_ephemeral_host(env, system, architecture, euid):
    if not (env.get('GITHUB_ACTIONS') == 'true' and
            env.get('RUNNER_ENVIRONMENT') == 'github-hosted' and
            env.get('GRADING_DISPOSABLE_CI') == '1' and
            system == 'Linux' and architecture == 'x86_64' and euid == 0):
        raise ValueError('Disposable Ubuntu AMD64 GitHub host required')


def command(args, timeout=60, **kwargs):
    # Never inherit Docker context or application credentials into owned services.
    env = dict(PATH='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG='C.UTF-8', DEBIAN_FRONTEND='noninteractive')
    return subprocess.run([str(x) for x in args], check=True, capture_output=True,
                          text=True, timeout=timeout, env=env, **kwargs).stdout.strip()


def user_command(state, *args, timeout=60):
    return command(['runuser','-u','cove-grading','--','env', 'HOME='+str(HOME),
                    'XDG_RUNTIME_DIR=/run/user/'+str(state['uid']),
                    'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/'+str(state['uid'])+'/bus',
                    'PATH=/opt/cove/bin:/usr/local/bin:/usr/bin:/bin', *args], timeout=timeout)


def normalize_user_manager(state):
    """Normalize only the newly owned manager, then verify a real service launch.

    A correctly addressed systemctl client does not establish the environment
    that an already-started user manager supplies to its services.
    """
    uid=state['uid']; runtime=Path('/run/user')/str(uid)
    info=runtime.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid==uid and stat.S_IMODE(info.st_mode)==0o700,'Dedicated user runtime directory identity differs')
    bus=(runtime/'bus').lstat()
    require(stat.S_ISSOCK(bus.st_mode) and bus.st_uid==uid,'Dedicated user bus identity differs')
    unit='cove-grading-ci-environment.service'
    require(user_command(state,'systemctl','--user','show',unit,'--property=LoadState','--value')=='not-found','Existing user environment probe unit refused')
    require(not os.path.lexists(runtime/'cove-grading-ci-environment'),'Existing user environment probe runtime directory refused')
    expected=dict(uid=uid,home=str(HOME),runtimeDirectory=str(runtime),busAddress='unix:path='+str(runtime/'bus'))
    user_command(state,'systemctl','--user','set-environment','HOME='+expected['home'],
                 'XDG_RUNTIME_DIR='+expected['runtimeDirectory'],'DBUS_SESSION_BUS_ADDRESS='+expected['busAddress'])
    # Use a transient SERVICE, never --scope/--setenv: its process must receive
    # the manager's environment rather than the correctly addressed client's.
    # RuntimeDirectory exercises the manager's actual runtime prefix. Transient
    # Environment properties store literal %t, so they cannot probe expansion.
    # Only fixed booleans leave the service; arbitrary inherited values do not.
    probe="""import json,os,stat,sys
uid=int(sys.argv[1]); home=sys.argv[2]; runtime=sys.argv[3]
path=runtime+'/cove-grading-ci-environment'
facts=dict(uidMatches=os.getuid()==uid,homeMatches=os.environ.get('HOME')==home,runtimeEnvironmentMatches=os.environ.get('XDG_RUNTIME_DIR')==runtime,busMatches=os.environ.get('DBUS_SESSION_BUS_ADDRESS')=='unix:path='+runtime+'/bus',runtimePathMatches=os.environ.get('RUNTIME_DIRECTORY')==path,runtimeDirectoryExists=False,runtimeDirectoryOwned=False,runtimeDirectoryMode=False)
try:
    info=os.lstat(path)
    facts.update(runtimeDirectoryExists=stat.S_ISDIR(info.st_mode),runtimeDirectoryOwned=info.st_uid==uid,runtimeDirectoryMode=stat.S_IMODE(info.st_mode)==0o700)
except FileNotFoundError: pass
print(json.dumps(facts))
"""
    def stop_probe():
        if user_command(state,'systemctl','--user','show',unit,'--property=LoadState','--value')!='not-found':
            user_command(state,'systemctl','--user','stop',unit,timeout=20)
    try:
        result=user_command(state,'systemd-run','--user','--quiet','--wait','--pipe','--collect',
                            '--unit='+unit,'--property=RuntimeMaxSec=15',
                            '--property=MemoryMax=32M','--property=TasksMax=16',
                            '--property=RuntimeDirectory=cove-grading-ci-environment','--property=RuntimeDirectoryMode=0700',
                            '/usr/bin/python3','-I','-c',probe,str(uid),str(HOME),str(runtime),timeout=30)
    except BaseException:
        # Preserve the launch failure. The lifecycle trap still stops this
        # exact owned manager if the immediate bounded unit stop also fails.
        try: stop_probe()
        except (OSError,ValueError,subprocess.SubprocessError): pass
        raise
    stop_probe()
    require(len(result)<=4096,'User manager environment probe bound exceeded')
    facts=json.loads(result)
    fields={'uidMatches','homeMatches','runtimeEnvironmentMatches','busMatches','runtimePathMatches','runtimeDirectoryExists','runtimeDirectoryOwned','runtimeDirectoryMode'}
    require(isinstance(facts,dict) and set(facts)==fields and all(type(v) is bool for v in facts.values()),'Invalid user manager environment probe schema')
    require(facts['uidMatches'],'Dedicated user manager service UID differs')
    require(facts['homeMatches'],'Dedicated user manager service HOME differs')
    require(facts['runtimeEnvironmentMatches'],'Dedicated user manager service XDG runtime differs')
    require(facts['busMatches'],'Dedicated user manager service bus address differs')
    require(facts['runtimePathMatches'],'Dedicated user manager runtime prefix differs')
    require(facts['runtimeDirectoryExists'],'Dedicated user manager runtime directory was not created')
    require(facts['runtimeDirectoryOwned'],'Dedicated user manager runtime directory owner differs')
    require(facts['runtimeDirectoryMode'],'Dedicated user manager runtime directory mode differs')
    return expected


def docker(state, *args, rootful=False, timeout=60):
    endpoint = ROOTFUL if rootful else 'unix://'+state['daemonSocket']
    return command(['docker','--host',endpoint,*args], timeout=timeout)


def project_broker_preflight(value):
    require(isinstance(value,dict) and value.get('version')==1 and value.get('authority')=='diagnostic-only' and type(value.get('success')) is bool,'Invalid broker preflight diagnostic')
    result=dict(version=1,authority='diagnostic-only',success=value['success'])
    for name in ('stage',) if value['success'] else PREFLIGHT_FIELDS:
        require(isinstance(value.get(name),str) and value[name] in PREFLIGHT_FIELDS[name],'Invalid broker preflight identity')
        result[name]=value[name]
    require((result['stage']=='complete')==result['success'],'Invalid broker preflight completion')
    return result


def broker_preflight_properties(content,uid):
    """Copy the current renderer's actual broker sandbox, resolving fixed paths.

    Transient D-Bus properties do not expand unit-file specifiers. Resolve only
    the exact %h/%t meanings already verified for this dedicated manager.
    """
    service={}; section=None
    for line in content.splitlines():
        if line.startswith('['): section=line; continue
        if section!='[Service]' or '=' not in line: continue
        name,value=line.split('=',1); service.setdefault(name,[]).append(value)
    require(service.get('ExecStart')==['/opt/cove/bin/node /opt/cove/grading/current/dist/main.js'],'Broker preflight Node entrypoint differs')
    require(service.get('Environment')==['PATH=/usr/local/bin:/usr/bin:/bin','NODE_OPTIONS=--max-old-space-size=128'],'Broker preflight environment policy differs')
    names=('Environment','EnvironmentFile','WorkingDirectory','Slice','UMask','NoNewPrivileges','PrivateTmp','ProtectSystem','ReadWritePaths')
    require(set(service)<=set(names)|{'Type','ExecStartPre','ExecStart','Restart','RestartSec','TimeoutStopSec','KillMode'},'Unsupported broker preflight sandbox directive')
    result=[]
    for name in names:
        values=service.get(name,[])
        require(len(values)==(2 if name=='Environment' else 1),'Broker preflight sandbox policy incomplete')
        for value in values:
            value=value.replace('%h',str(HOME)).replace('%t',f'/run/user/{uid}')
            require('%' not in value,'Unknown broker preflight policy specifier')
            result.append('--property='+name+'='+value)
    return result


def broker_preflight(state,repo,content):
    unit='cove-grading-ci-broker-preflight.service'
    require(user_command(state,'systemctl','--user','show',unit,'--property=LoadState','--value')=='not-found','Existing broker preflight unit refused')
    for path in [HOME/'.config/systemd/user/cove-grading-broker.service',HOME/'.config/cove-grading/broker.env']:
        validate_owned(path,state['ownedFiles'][str(path)])
    source=repo/'deploy/scripts/grading/ci/broker-preflight.mjs'
    target=OPT/'grading/ci/broker-preflight.mjs'
    require(not os.path.lexists(target),'Broker preflight script target occupied')
    shutil.copyfile(source,target); target.chmod(0o644)
    require(target.stat().st_uid==0 and file_hash(target)==file_hash(source),'Broker preflight script identity differs')
    properties=broker_preflight_properties(content,state['uid'])
    def stop_probe():
        if user_command(state,'systemctl','--user','show',unit,'--property=LoadState','--value')!='not-found':
            user_command(state,'systemctl','--user','stop',unit,timeout=20)
    try:
        result=user_command(state,'systemd-run','--user','--quiet','--wait','--pipe','--collect','--unit='+unit,
                            '--property=RuntimeMaxSec=60',*properties,'/opt/cove/bin/node',str(target),
                            str(state['daemonIdentity']['pid']),state['daemonExecutable'],timeout=75)
    except BaseException:
        try: stop_probe()
        except (OSError,ValueError,subprocess.SubprocessError): pass
        raise
    stop_probe()
    require(len(result)<=4096,'Broker preflight diagnostic bound exceeded')
    diagnostic=project_broker_preflight(json.loads(result))
    atomic_json(STATE_DIR/'broker-preflight.json',diagnostic)
    require(diagnostic['success'],'Production broker driver verification preflight failed')


def require_absent(paths, users, groups):
    for path in paths:
        require(not os.path.lexists(path), 'Existing owned path refused: '+str(path))
    require(not set(users) & {'cove-grading','cove-grading-ci-worker'}, 'Existing grading account refused')
    require('cove-grading-control' not in groups and 'cove-grading-ci-worker' not in groups,
            'Existing grading group refused')


def subordinate_contents():
    return [Path('/etc/'+name).read_text() for name in ['subuid','subgid']]


def subordinate_range(contents, accounts=()):
    """Choose an unused 65536 span, excluding all real account IDs as well."""
    intervals = []
    for text in contents:
        for row in text.splitlines():
            if not row: continue
            fields = row.split(':')
            require(len(fields)==3 and fields[1].isdecimal() and fields[2].isdecimal(), 'Malformed subordinate ID database')
            start, count = map(int, fields[1:])
            require(start > 0 and count > 0 and start+count <= 2**32-1, 'Invalid subordinate ID span')
            intervals.append((start,start+count))
    intervals += [(value,value+1) for value in accounts]
    candidate = 100000
    for start,end in sorted(intervals):
        if candidate+65536 <= start: break
        if candidate < end and candidate+65536 > start: candidate=end
    require(candidate+65536 <= 2**32-1, 'No safe subordinate ID range')
    return candidate,65536


def verify_subordinate(state, contents, allow_missing=False):
    expected=f'cove-grading:{state["subordinateStart"]}:65536'
    for text in contents:
        rows=text.splitlines(); owned=[row for row in rows if row.startswith('cove-grading:')]
        require(owned==[expected] or (allow_missing and not owned),'Owned subordinate ID allocation changed')
        for row in rows:
            if not row or row==expected: continue
            fields=row.split(':')
            require(len(fields)==3 and fields[1].isdecimal() and fields[2].isdecimal(),'Malformed subordinate ID database')
            low,count=map(int,fields[1:]); start=state['subordinateStart']
            require(low+count<=start or low>=start+65536,'Subordinate ID allocation overlaps another account')


def snapshot(path):
    path = Path(path); info = path.lstat()
    result = dict(device=info.st_dev, inode=info.st_ino, uid=info.st_uid, gid=info.st_gid,
                  mode=stat.S_IMODE(info.st_mode), type=stat.S_IFMT(info.st_mode))
    require(not path.is_symlink(), 'Owned path became a symlink')
    if path.is_file(): result['sha256']=file_hash(path)
    return result


def validate_owned(path, expected):
    require(snapshot(path)==expected, 'Owned path identity changed: '+str(path))


def atomic_json(path, value, mode=0o600):
    path=Path(path); temporary=path.with_suffix('.tmp')
    require(not os.path.lexists(temporary), 'Unexpected state temporary file')
    with temporary.open('x') as stream: json.dump(value,stream,sort_keys=True); stream.write('\n')
    temporary.chmod(mode); os.replace(temporary,path)


def save(state):
    atomic_json(STATE,state)


def own_path(state, path):
    state['ownedPaths'][str(path)] = snapshot(path)
    save(state)


def write_owned(state,path,content,mode=0o644):
    path=Path(path)
    require(not os.path.lexists(path), 'Existing different configuration refused: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('x') as stream: stream.write(content)
    path.chmod(mode); own_path(state,path)


def check_host():
    require_ephemeral_host(os.environ,platform.system(),platform.machine(),os.geteuid())
    os_release=dict(row.split('=',1) for row in Path('/etc/os-release').read_text().splitlines() if '=' in row)
    require(os_release.get('ID','').strip('"')=='ubuntu' and os_release.get('VERSION_ID','').strip('"')=='24.04', 'Ubuntu 24.04 required')
    require(Path('/proc/1/comm').read_text().strip()=='systemd', 'systemd PID 1 required')
    require(Path('/sys/fs/cgroup/cgroup.controllers').is_file(), 'Unified cgroup v2 required')
    require(Path('/sys/module/apparmor/parameters/enabled').read_text().strip()=='Y', 'Active AppArmor required')
    require(Path('/proc/sys/kernel/apparmor_restrict_unprivileged_userns').read_text().strip()=='1', 'Ubuntu userns restriction must remain enabled')


def load_state():
    info=STATE.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid==0 and stat.S_IMODE(info.st_mode)==0o600, 'Private root-owned CI state required')
    state=read_json(STATE)
    require(state['version']==1 and str(uuid.UUID(state['runId']))==state['runId'], 'Invalid CI state')
    require(state['home']==str(HOME) and state['workerHome']==str(WORKER_HOME) and state['workerSlice']==WORKER_SLICE and state['workerService']==WORKER_SERVICE, 'Changed owned resource names')
    require(state['owner']==state['runId'], 'Changed run owner')
    allowed_files={str(p) for p in render(HOME,state['uid'],'/usr/bin/dockerd-rootless.sh','/opt/cove/bin/node')} | {str(HOME/'.config/cove-grading/host.json'),str(HOME/'.config/cove-grading/broker.env')}
    require(set(state.get('ownedFiles',{}))<=allowed_files,'Arbitrary owned file refused')
    expected_paths={str(OPT),str(HOME),str(WORKER_HOME),str(CONTROL),str(EVIDENCE),*[str(p) for p in SYSTEM_FILES],state['delegationPath']}
    require(set(state['ownedPaths'])<=expected_paths, 'Arbitrary owned cleanup path refused')
    require(state['delegationPath']==f'/etc/systemd/system/user@{state["uid"]}.service.d/cove-grading-ci.conf', 'Changed delegation target')
    manager=Path(f'/sys/fs/cgroup/user.slice/user-{state["uid"]}.slice/user@{state["uid"]}.service')
    require(state['daemonSocket']==f'/run/user/{state["uid"]}/cove-grading/docker.sock' and Path(state['cgroupParent']).is_relative_to(manager) and Path(state['cgroupParent']).name=='cove-grading.slice' and '..' not in Path(state['cgroupParent']).parts, 'Changed daemon target')
    return state


def verify_accounts(state, allow_missing=False):
    for name,prefix,home,primary in [('cove-grading','',HOME,'cove-grading-control'),('cove-grading-ci-worker','worker',WORKER_HOME,'cove-grading-ci-worker')]:
        key=prefix+'Uid' if prefix else 'uid'; gid_key=prefix+'Gid' if prefix else 'controlGid'
        try: account=pwd.getpwnam(name)
        except KeyError:
            require(allow_missing,'Owned account missing'); continue
        require(account.pw_uid==state[key] and account.pw_gid==state[gid_key] and account.pw_dir==str(home) and account.pw_shell=='/usr/sbin/nologin', 'Owned account identity changed')
        require(grp.getgrnam(primary).gr_gid==account.pw_gid, 'Owned primary group changed')
        allowed={account.pw_gid,state['controlGid']} if prefix else {account.pw_gid}
        require(set(os.getgrouplist(name,account.pw_gid))==allowed, 'Owned account gained supplementary authority')


def verify_image(image, descriptor):
    require(image['Id']==descriptor['imageDigest'] and image['Os']=='linux' and image['Architecture']==descriptor['architecture']=='amd64', 'Immutable image identity changed')
    for label,key in [('package','packageManifestHash'),('shim','shimVersion'),('engine','engine'),('version','engineVersion'),('python','pythonVersion')]:
        require(image['Config']['Labels'].get('io.cove.grading.'+label)==descriptor[key], 'Image package/engine identity changed')


def verify_manifest(state):
    manifest=read_json(state['manifestPath'])
    require(digest(manifest)==state['manifestIdentity'], 'Manifest identity changed')
    require(digest(read_json(state['warmProfilesPath']))==state['warmProfilesIdentity'], 'Warm profiles identity changed')
    require(tree_identity(Path(state['brokerEntrypoint']).parent.parent)==state['brokerArtifact']['treeIdentity'], 'Broker tree changed')
    require(file_hash('/opt/cove/bin/node')==state['nodeSha256'], 'Host Node changed')
    for descriptor in manifest['capabilities']['runtimes']:
        image=json.loads(docker(state,'image','inspect',descriptor['imageDigest']))[0]
        verify_image(image,descriptor)
    return manifest


def owned_containers(state, inspections):
    result=[]; ids=set()
    for item in inspections:
        labels=item.get('Config',{}).get('Labels') or {}
        allocation=labels.get('io.cove.grading.allocation','')
        require(re.fullmatch(r'[a-f0-9-]{36}',allocation) and str(uuid.UUID(allocation))==allocation, 'Unknown allocation identity')
        require(labels.get('io.cove.grading.owner')==state['owner'] and item['Image'] in {x['configId'] for x in state['images']}, 'Unowned container refused')
        require(item['Name']=='/cove-grade-'+allocation and re.fullmatch(r'[a-f0-9]{64}',item['Id']), 'Changed owned container identity')
        require(item['Id'] not in ids, 'Duplicate owned container')
        ids.add(item['Id']); result.append(item)
    return result


def census(state):
    ids=docker(state,'ps','-aq','--no-trunc').split()
    require(len(ids)<=64,'Unexpected oversized dedicated container inventory')
    return owned_containers(state,json.loads(docker(state,'inspect',*ids)) if ids else [])


def wait_for(operation, timeout, message):
    deadline=time.monotonic()+timeout
    while True:
        try:
            value=operation()
            if value: return value
        except (OSError,ValueError,subprocess.SubprocessError): pass
        require(time.monotonic()<deadline,message)
        time.sleep(.5)


def health(state):
    """Bounded production wire health, with actual warm observation cross-check."""
    request=dict(protocol=1,requestId=str(uuid.uuid4()),type='health')
    payload=canonical(request)
    with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
        connection.settimeout(3); connection.connect(str(CONTROL/'broker.sock'))
        connection.sendall(struct.pack('!I',len(payload))+payload)
        def exact(length):
            data=b''
            while len(data)<length:
                part=connection.recv(length-len(data)); require(part,'Truncated broker health'); data+=part
            return data
        size=struct.unpack('!I',exact(4))[0]; require(0<size<=65536,'Invalid health size')
        response=json.loads(exact(size))
    require(response.get('type')=='health' and response.get('requestId')==request['requestId'] and response.get('workerGeneration')==state['workerGeneration'], 'Broker not ready for generation')
    require(response['capabilities']==read_json(state['manifestPath'])['capabilities'], 'Broker capability identity differs')
    observation=read_json(state['observationsPath'])
    require(0<=time.time()*1000-observation['observedAt']<=5000 and observation['pool']['ready'] is True and observation['pool']['prepared']==2, 'Mixed warm pool not ready')
    return response


def prepare(repo):
    check_host()  # Guard precedes every mutation, including state directory creation.
    repo=Path(repo).resolve(strict=True)
    require((repo/'deploy/scripts/grading/ci/bundle.mjs').is_file(), 'Repository required')
    require_absent([STATE_DIR,OPT,HOME,WORKER_HOME,CONTROL,*SYSTEM_FILES], [x.pw_name for x in pwd.getpwall()], [x.gr_name for x in grp.getgrall()])
    node_source=os.environ.get('GRADING_CI_NODE_SOURCE','')
    require(Path(node_source).is_absolute(),'Explicit absolute GRADING_CI_NODE_SOURCE required')
    node=Path(node_source).resolve(strict=True)
    require(stat.S_ISREG(node.stat().st_mode) and os.access(node,os.X_OK),'Regular executable Node source required')
    node_hash=file_hash(node)
    require(command([node,'-p','process.versions.node.split(".")[0]'])=='22', 'Node 22 setup must precede prepare')
    projections=json.loads(command(['docker','--host',ROOTFUL,'image','inspect',*TAGS]))
    require(len(projections)==3 and all(x['Os']=='linux' and x['Architecture']=='amd64' and re.fullmatch(r'sha256:[a-f0-9]{64}',x['Id']) for x in projections), 'Built Linux AMD64 immutable images required')
    rootful_info=json.loads(command(['docker','--host',ROOTFUL,'info','--format','{{json .}}']))
    rootful_baseline=dict(id=rootful_info['ID'],runningIds=sorted(command(['docker','--host',ROOTFUL,'ps','-q','--no-trunc']).split()))
    # Select unused fixed-for-this-run IDs and persist intent before creating accounts.
    used={x.pw_uid for x in pwd.getpwall()} | {x.gr_gid for x in grp.getgrall()}
    ids=[value for value in range(10000,60000) if value not in used][:4]
    require(len(ids)==4,'No private account IDs available')
    uid,gid,worker_uid,worker_gid=ids
    delegation=Path(f'/etc/systemd/system/user@{uid}.service.d/cove-grading-ci.conf')
    require(not os.path.lexists(delegation),'Existing delegation configuration refused')
    subcontents=subordinate_contents()
    start,count=subordinate_range(subcontents,list(used)+ids)
    STATE_DIR.mkdir(mode=0o711)
    run_id=str(uuid.uuid4())
    state=dict(version=1,runId=run_id,owner=run_id,workerGeneration=str(uuid.uuid4()),home=str(HOME),workerHome=str(WORKER_HOME),workerSlice=WORKER_SLICE,workerService=WORKER_SERVICE,workerCgroup='/sys/fs/cgroup/'+WORKER_SLICE,ownedPaths={},ownedFiles={},phase='initializing',carrier=None,images=[],rootfulImages=[x['Id'] for x in projections],rootfulBaseline=rootful_baseline)
    state.update(uid=uid,controlGid=gid,workerUid=worker_uid,workerGid=worker_gid,subordinateStart=start,subordinateCount=count,delegationPath=f'/etc/systemd/system/user@{uid}.service.d/cove-grading-ci.conf',daemonSocket=f'/run/user/{uid}/cove-grading/docker.sock',daemonConfig=str(HOME/'.config/cove-grading/daemon.json'),daemonPidFile=f'/run/user/{uid}/cove-grading/host-docker.pid',daemonDataRoot=str(HOME/'.local/share/cove-grading/docker'),cgroupParent=f'/sys/fs/cgroup/user.slice/user-{uid}.slice/user@{uid}.service/cove.slice/cove-grading.slice',manifestPath='/opt/cove/grading/ci/manifest.json',warmProfilesPath='/opt/cove/grading/ci/warm-profiles.json',brokerEntrypoint='/opt/cove/grading/current/dist/main.js',observationsPath=str(HOME/'.local/share/cove-grading/observations.json'),journalDirectory=str(HOME/'.local/share/cove-grading/journal'))
    save(state)
    for path,owner,primary in [(HOME,uid,gid),(WORKER_HOME,worker_uid,worker_gid)]:
        path.mkdir(mode=0o700); os.chown(path,owner,primary); own_path(state,path)
    command(['groupadd','--gid',str(gid),'cove-grading-control'])
    command(['groupadd','--gid',str(worker_gid),'cove-grading-ci-worker'])
    command(['useradd','--uid',str(uid),'--no-create-home','--home-dir',str(HOME),'--no-user-group','--gid','cove-grading-control','--shell','/usr/sbin/nologin','-K','SUB_UID_COUNT=0','-K','SUB_GID_COUNT=0','cove-grading'])
    command(['useradd','--uid',str(worker_uid),'--no-create-home','--home-dir',str(WORKER_HOME),'--no-user-group','--gid','cove-grading-ci-worker','--groups','cove-grading-control','--shell','/usr/sbin/nologin','-K','SUB_UID_COUNT=0','-K','SUB_GID_COUNT=0','cove-grading-ci-worker'])
    require(subcontents==subordinate_contents(), 'Subordinate IDs changed during account creation')
    command(['usermod','--add-subuids',f'{start}-{start+count-1}','--add-subgids',f'{start}-{start+count-1}','cove-grading'])
    verify_subordinate(state,subordinate_contents())
    verify_accounts(state)
    account=pwd.getpwnam('cove-grading'); worker=pwd.getpwnam('cove-grading-ci-worker')
    install_prerequisites(state)
    OPT.mkdir(mode=0o755); own_path(state,OPT)
    (OPT/'bin').mkdir(); shutil.copyfile(node,OPT/'bin/node'); (OPT/'bin/node').chmod(0o755)
    require(file_hash(node)==node_hash==file_hash(OPT/'bin/node'),'Node changed while copying')
    require(command([OPT/'bin/node','-p','process.versions.node.split(".")[0]'])=='22', 'Copied Node 22 unavailable')
    state['nodeSha256']=file_hash(OPT/'bin/node')
    scripts=OPT/'scripts/grading'; scripts.mkdir(parents=True)
    for path in (repo/'deploy/scripts/grading').glob('*.py'): shutil.copyfile(path,scripts/path.name)
    write_owned(state,state['delegationPath'],'[Service]\nDelegate=cpu memory pids\n')
    write_owned(state,SYSTEM_FILES[2],'[Unit]\nDescription=Disposable grading CI coordinator\n[Slice]\nMemoryAccounting=yes\nCPUAccounting=yes\nTasksAccounting=yes\nMemoryMax=768M\nMemorySwapMax=0\nCPUQuota=75%\nTasksMax=256\n')
    command(['systemctl','daemon-reload'])
    command(['loginctl','enable-linger','cove-grading'])
    command(['systemctl','start',f'user@{uid}.service',WORKER_SLICE])
    worker_group=command(['systemctl','show',WORKER_SLICE,'--property=ControlGroup','--value'])
    require(worker_group.startswith('/') and worker_group.endswith('/'+WORKER_SLICE) and '..' not in worker_group.split('/'), 'Unexpected coordinator cgroup')
    state['workerCgroup']='/sys/fs/cgroup'+worker_group; save(state)
    manager=Path(f'/sys/fs/cgroup/user.slice/user-{uid}.slice/user@{uid}.service')
    wait_for(lambda: {'cpu','memory','pids'}<=set((manager/'cgroup.controllers').read_text().split()),30,'User manager controller delegation unavailable')
    CONTROL.mkdir(mode=0o2710); os.chown(CONTROL,uid,account.pw_gid); CONTROL.chmod(0o2710); own_path(state,CONTROL)
    EVIDENCE.mkdir(mode=0o700); os.chown(EVIDENCE,worker.pw_uid,worker.pw_gid); own_path(state,EVIDENCE)
    dockerd=Path(shutil.which('dockerd')).resolve(strict=True)
    state.update(daemonExecutable=str(dockerd),daemonExecutableSha256=file_hash(dockerd))
    rendered=render(HOME,uid,shutil.which('dockerd-rootless.sh'),'/opt/cove/bin/node')
    for path in rendered: require(not os.path.lexists(path),'Existing different installer configuration')
    # The production installer selects Node through PATH. Its units remain byte-identical.
    user_command(state,'python3',str(scripts/'install.py'))
    for path,content in rendered.items(): require(path.read_text()==content,'Production installer renderer differs')
    state['ownedFiles']={str(path):snapshot(path) for path in rendered}
    host_config=HOME/'.config/cove-grading/host.json'
    host_config.write_text(json.dumps({key:state[key] for key in ['uid','daemonExecutable','daemonExecutableSha256','daemonConfig','daemonSocket','daemonPidFile','cgroupParent']})+'\n')
    os.chown(host_config,uid,account.pw_gid); host_config.chmod(0o600)
    state['ownedFiles'][str(host_config)]=snapshot(host_config)
    user_command(state,'systemctl','--user','daemon-reload')
    normalize_user_manager(state)
    user_command(state,'systemctl','--user','start','cove-grading.slice')
    family_group=user_command(state,'systemctl','--user','show','cove-grading.slice','--property=ControlGroup','--value')
    manager_group=f'/user.slice/user-{uid}.slice/user@{uid}.service/'
    require(family_group.startswith(manager_group) and family_group.endswith('/cove-grading.slice') and '..' not in family_group.split('/'),'Unexpected execution family cgroup')
    state['cgroupParent']='/sys/fs/cgroup'+family_group
    host_config.write_text(json.dumps({key:state[key] for key in ['uid','daemonExecutable','daemonExecutableSha256','daemonConfig','daemonSocket','daemonPidFile','cgroupParent']})+'\n')
    state['ownedFiles'][str(host_config)]=snapshot(host_config)
    state['phase']='daemon-starting'; save(state)
    user_command(state,'systemctl','--user','start','cove-grading-docker.service',timeout=150)
    identity=attest_daemon(state); state['daemonIdentity']=identity
    info=json.loads(docker(state,'info','--format','{{json .}}'))
    require('name=rootless' in info.get('SecurityOptions',[]) and info.get('CgroupDriver')=='systemd' and info.get('CgroupVersion')=='2', 'Real rootless systemd v2 required')
    require(info['DockerRootDir']==state['daemonDataRoot'] and all(info.get(k) is True for k in ['MemoryLimit','CpuCfsQuota','PidsLimit']), 'Required limits unavailable')
    require(not docker(state,'ps','-aq'),'Dedicated daemon not fresh')
    state['daemonId']=info['ID']; save(state)
    install_artifacts(state,repo,projections)
    broker_env={
        'GRADING_RUNTIME_MANIFEST_PATH':state['manifestPath'],'GRADING_WARM_PROFILES_PATH':state['warmProfilesPath'],
        'GRADING_DAEMON_SOCKET':state['daemonSocket'],'GRADING_CGROUP_PARENT':state['cgroupParent'],
        'GRADING_SYSTEMD_PARENT':'cove-grading.slice','GRADING_DAEMON_PID_FILE':state['daemonPidFile'],
        'GRADING_DAEMON_ID':state['daemonId'],'GRADING_DAEMON_DATA_ROOT':state['daemonDataRoot'],
        'GRADING_BROKER_OWNER':state['owner'],'GRADING_WORKER_GENERATION':state['workerGeneration'],
        'GRADING_JOURNAL_DIRECTORY':state['journalDirectory'],'GRADING_OBSERVATIONS_PATH':state['observationsPath'],
        'JUDGE_SANDBOX_SOCKET':str(CONTROL/'broker.sock')}
    env_path=HOME/'.config/cove-grading/broker.env'
    env_path.write_text(''.join(k+'='+v+'\n' for k,v in broker_env.items())); env_path.chmod(0o600); os.chown(env_path,uid,account.pw_gid)
    command(['python3',scripts/'broker-env.py',env_path])
    state['ownedFiles'][str(env_path)]=snapshot(env_path)
    broker_preflight(state,repo,rendered[HOME/'.config/systemd/user/cove-grading-broker.service'])
    state['phase']='broker-starting'; save(state)
    user_command(state,'systemctl','--user','start','cove-grading-broker.service')
    wait_for(lambda:health(state),120,'Real mixed broker readiness unavailable')
    manifest=read_json(state['manifestPath'])
    PUBLIC.write_text(json.dumps(dict(version=1,manifest=manifest,brokerSocket=str(CONTROL/'broker.sock'),workerGeneration=state['workerGeneration'],evidenceDirectory=str(EVIDENCE)))+'\n'); PUBLIC.chmod(0o644)
    state['phase']='prepared'; save(state)
    result=observe(state); atomic_json(STATE_DIR/'prepare-observation.json',result)
    return result


def verify_rootful(state):
    info=json.loads(docker(state,'info','--format','{{json .}}',rootful=True))
    require(info['ID']==state['rootfulBaseline']['id'] and sorted(docker(state,'ps','-q','--no-trunc',rootful=True).split())==state['rootfulBaseline']['runningIds'],'Unrelated rootful daemon/workload inventory changed')


def official_rootless_version(policy, version):
    """Check the selected version's origin, independently of apt's newest candidate."""
    selected=False; official=False; other=False
    for row in policy.splitlines():
        fields=row.strip().removeprefix('*** ').split()
        if len(fields)==2 and fields[1].isdecimal():
            selected=fields[0]==version
            continue
        if selected and fields and fields[0].isdecimal():
            if fields[1:]==['https://download.docker.com/linux/ubuntu','noble/stable','amd64','Packages']: official=True
            elif fields[1:]!=['/var/lib/dpkg/status']: other=True
    # Apt can choose any source advertising an identical version. Merely finding
    # one official row does not establish the download origin in a mixed table.
    return official and not other


def installed_packages():
    # Query the installed database once: absent package names must not make
    # dpkg-query fail before we can preserve a useful, bounded diagnostic.
    raw=command(['dpkg-query','-W','-f=${Package}\t${Architecture}\t${db:Status-Status}\t${Version}\n'])
    require(len(raw)<=2*2**20,'Installed package database bound exceeded')
    result={}
    for row in raw.splitlines():
        fields=row.split('\t')
        require(len(fields)==4,'Invalid installed package projection')
        name,architecture,status,version=fields
        if name not in PROTECTED_PACKAGES | {'docker-ce-rootless-extras'} or status!='installed': continue
        key=name+':'+architecture
        require(PACKAGE_NAME.fullmatch(key) and PACKAGE_VERSION.fullmatch(version) and key not in result,'Invalid installed engine package identity')
        result[key]=version
    require(len(result)<=16,'Installed engine package count bound exceeded')
    return result


def prerequisite_plan(raw):
    """Discard apt prose, origins and stderr; retain only package transactions."""
    require(len(raw)<=256*1024,'APT simulation output bound exceeded')
    result=[]
    for row in raw.splitlines():
        if not row.startswith(('Inst ','Remv ','Conf ')): continue
        match=re.fullmatch(r'(Inst|Remv|Conf) (\S+)(?: \[([^\]]+)\])?(?: \((\S+)(?: [^\r\n]*)?\))?',row)
        require(match is not None,'Invalid APT transaction projection')
        action,package,previous,version=match.groups()
        require(PACKAGE_NAME.fullmatch(package) and all(PACKAGE_VERSION.fullmatch(v) for v in (previous,version) if v is not None),'Invalid APT transaction identity')
        result.append(dict(action=action,package=package,previousVersion=previous,version=version))
    require(len(result)<=128,'APT transaction count bound exceeded')
    return result


def install_prerequisites(state):
    installed=installed_packages()
    protected={name:version for name,version in installed.items() if name.split(':')[0] in PROTECTED_PACKAGES}
    diagnostic=dict(version=1,authority='diagnostic-only',installedProtected=protected,selectedRootlessVersion=None,officialOrigin=False,simulation=None)
    def record(): atomic_json(STATE_DIR/'prerequisite-packages.json',diagnostic)
    record()
    version=installed.get('docker-ce:amd64')
    require(version is not None,'Installed Docker CE AMD64 package required for matching rootless extras')
    diagnostic['selectedRootlessVersion']=version; record()
    # Reuse an existing official Docker apt source when present; adding the same
    # URI with a different Signed-By key would make apt reject the runner's setup.
    policy=command(['apt-cache','policy','docker-ce-rootless-extras'])
    if 'https://download.docker.com/linux/ubuntu' not in policy:
        Path('/etc/apt/keyrings').mkdir(exist_ok=True,mode=0o755)
        with urllib.request.urlopen('https://download.docker.com/linux/ubuntu/gpg',timeout=30) as response: key=response.read(65537)
        require(len(key)<=65536 and key.startswith(b'-----BEGIN PGP PUBLIC KEY BLOCK-----'), 'Invalid official Docker apt key')
        write_owned(state,SYSTEM_FILES[0],key.decode())
        write_owned(state,SYSTEM_FILES[1],'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: noble\nComponents: stable\nArchitectures: amd64\nSigned-By: /etc/apt/keyrings/cove-grading-ci.asc\n')
    command(['apt-get','update'],timeout=180)
    policy=command(['apt-cache','policy','docker-ce-rootless-extras'])
    diagnostic['officialOrigin']=official_rootless_version(policy,version); record()
    require(diagnostic['officialOrigin'],'Matching official Docker noble AMD64 rootless extras version required')
    packages=['uidmap','dbus-user-session','slirp4netns','apparmor','docker-ce-rootless-extras:amd64='+version,*[name+'='+value for name,value in sorted(protected.items())]]
    simulation_status=0
    try: simulation=command(['apt-get','--simulate','install','--no-install-recommends',*packages])
    except subprocess.CalledProcessError as error:
        simulation_status=error.returncode; simulation=error.stdout or ''
    diagnostic['simulation']=dict(exitCode=simulation_status,transactions=prerequisite_plan(simulation)); record()
    require(simulation_status==0,'Matching rootless prerequisite transaction could not be resolved')
    require(not any(row['action']=='Remv' or (row['action']=='Inst' and row['package'].split(':')[0] in PROTECTED_PACKAGES) for row in diagnostic['simulation']['transactions']),'Rootless prerequisites would alter rootful engine; refused')
    dockerd_before=file_hash(shutil.which('dockerd'))
    command(['apt-get','install','-y','--no-remove','--no-install-recommends',*packages],timeout=240)
    after=installed_packages()
    require({name:version for name,version in after.items() if name.split(':')[0] in PROTECTED_PACKAGES}==protected,'Protected rootful engine package identity changed')
    require(after.get('docker-ce-rootless-extras:amd64')==version,'Installed rootless extras version differs from selection')
    require(file_hash(shutil.which('dockerd'))==dockerd_before,'Rootful engine executable changed')
    verify_rootful(state)
    rootlesskit=Path(shutil.which('rootlesskit')).resolve(strict=True)
    require(str(rootlesskit)=='/usr/bin/rootlesskit', 'Packaged rootlesskit required')
    profiles=[Path(p) for p in command(['dpkg-query','-L','apparmor']).splitlines() if p.startswith('/etc/apparmor.d/') and Path(p).name in ['rootlesskit','usr.bin.rootlesskit']]
    require(len(profiles)==1 and 'userns,' in profiles[0].read_text(), 'Official rootlesskit userns AppArmor profile missing')
    command(['apparmor_parser','-r',profiles[0]])
    require(any('rootlesskit' in row for row in Path('/sys/kernel/security/apparmor/profiles').read_text().splitlines()), 'Rootlesskit AppArmor profile not loaded')


def install_artifacts(state,repo,projections):
    artifact=OPT/'grading/current'; artifact.mkdir(parents=True)
    carrier_name='cove-grading-ci-carrier-'+state['runId']
    require(not docker(state,'ps','-aq','--filter','name=^/'+carrier_name+'$',rootful=True),'Carrier name occupied')
    cid=docker(state,'create','--name',carrier_name,'--label','io.cove.grading.ci='+state['runId'],projections[2]['Id'],rootful=True)
    state['carrier']=dict(id=cid,name=carrier_name,image=projections[2]['Id']); save(state)
    verify_carrier(state)
    docker(state,'cp',cid+':/opt/grading-runtime/.',str(artifact),rootful=True)
    state['brokerArtifact']=dict(configId=projections[2]['Id'],treeIdentity=tree_identity(artifact)); save(state)
    verify_carrier(state); docker(state,'rm',cid,rootful=True); state['carrier']=None; save(state)
    # docker cp preserves image UID. Host artifact must be root-owned and unwritable.
    for directory,dirs,files in os.walk(OPT,followlinks=False):
        os.chown(directory,0,0)
        for name in dirs+files:
            path=Path(directory)/name; os.chown(path,0,0,follow_symlinks=False)
            if not path.is_symlink(): path.chmod(path.stat().st_mode & ~0o022)
    data={}
    for engine,image in zip(['cpython','pyodide'],projections[:2]):
        identity=read_json(repo/f'packages/grading-runtime/guest/artifacts/{engine}-identity.json')
        data[engine]=dict(image={**{k:image[k] for k in ['Id','Os','Architecture']},'Config':{'Labels':image['Config']['Labels']}},identity=identity,packageManifestPath=str(repo/f'packages/grading-runtime/guest/artifacts/{engine}-manifest.json'))
        # Save exact immutable config IDs to a private tar; never run rootful guests.
        archive=STATE_DIR/(engine+'.tar')
        docker(state,'save','--output',str(archive),image['Id'],rootful=True,timeout=180)
        docker(state,'load','--input',str(archive),timeout=180); archive.unlink()
        state['images'].append(dict(configId=image['Id'],architecture='amd64',packageManifestHash=identity['packageManifestHash'])); save(state)
    (OPT/'grading/ci').mkdir()
    projection_path=STATE_DIR/'image-projections.json'; projection_path.write_text(json.dumps(data)); projection_path.chmod(0o600)
    bundle_path=STATE_DIR/'bundle.json'
    command([OPT/'bin/node',repo/'deploy/scripts/grading/ci/bundle.mjs',projection_path,bundle_path])
    projection_path.unlink(); bundle=read_json(bundle_path); bundle_path.unlink()
    for key,path in [('manifest',state['manifestPath']),('warmProfiles',state['warmProfilesPath'])]:
        Path(path).write_text(json.dumps(bundle[key])+'\n'); Path(path).chmod(0o644)
    state['manifestIdentity']=digest(bundle['manifest']); state['warmProfilesIdentity']=digest(bundle['warmProfiles']); save(state)
    verify_manifest(state)


def verify_carrier(state):
    carrier=state['carrier']; item=json.loads(docker(state,'inspect',carrier['id'],rootful=True))[0]
    require(item['Id']==carrier['id'] and item['Name']=='/'+carrier['name'] and item['Image']==carrier['image'] and item['Config']['Labels'].get('io.cove.grading.ci')==state['runId'] and item['State']['Status']=='created' and item['State']['Pid']==0, 'Carrier identity/state changed')


def service_pid(state,unit):
    value=user_command(state,'systemctl','--user','show',unit,'--property=MainPID','--value')
    require(value.isdecimal() and int(value)>0,'Required live service PID missing')
    return int(value)


def observe(state=None):
    check_host(); state=state or load_state(); verify_accounts(state)
    verify_subordinate(state,subordinate_contents())
    for path,identity in {**state['ownedPaths'],**state.get('ownedFiles',{})}.items(): validate_owned(path,identity)
    verify_rootful(state)
    manifest=verify_manifest(state); identity=attest_daemon(state)
    require(read_json(state['daemonPidFile']+'.identity.json')==identity,'Service daemon attestation changed')
    info=json.loads(docker(state,'info','--format','{{json .}}'))
    require(info['ID']==state['daemonId'] and info['DockerRootDir']==state['daemonDataRoot'] and 'name=rootless' in info.get('SecurityOptions',[]) and info['CgroupDriver']=='systemd' and info['CgroupVersion']=='2','Daemon runtime identity changed')
    family=Path(state['cgroupParent']); worker=Path(state['workerCgroup'])
    require(limits(family)==FAMILY_LIMITS and limits(worker)==WORKER_LIMITS,'Effective family/coordinator limit mismatch')
    require({'cpu','memory','pids'}<=set((family/'cgroup.subtree_control').read_text().split()),'Actual child controllers missing')
    broker_pid=service_pid(state,'cove-grading-broker.service')
    require(family in group(broker_pid).parents and family in group(identity['pid']).parents,'Services outside execution family')
    private=Path(state['daemonSocket']).parent.stat(); sock=(CONTROL/'broker.sock').stat()
    require(private.st_uid==state['uid'] and stat.S_IMODE(private.st_mode)==0o700,'Private daemon directory changed')
    require(stat.S_ISSOCK(sock.st_mode) and sock.st_uid==state['uid'] and sock.st_gid==state['controlGid'] and stat.S_IMODE(sock.st_mode)==0o660,'Broker socket boundary changed')
    containers=census(state)
    for item in containers: verify_image(json.loads(docker(state,'image','inspect',item['Image']))[0],next(x for x in manifest['capabilities']['runtimes'] if x['imageDigest']==item['Image']))
    memory={row.split(':',1)[0]:int(row.split()[1])*1024 for row in Path('/proc/meminfo').read_text().splitlines() if row.startswith(('MemTotal:','MemAvailable:'))}
    require(memory['MemTotal']>=2048*2**20 and memory['MemAvailable']>=2048*2**20 and (os.cpu_count() or 0)>=3,'Combined grading budget exceeds host capacity')
    external=[]
    for cid in state['rootfulBaseline']['runningIds']:
        values=docker(state,'inspect','--format','{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{if .HostConfig.PidsLimit}}{{.HostConfig.PidsLimit}}{{else}}0{{end}}',cid,rootful=True).split()
        require(len(values)==3 and all(re.fullmatch(r'-?[0-9]+',v) for v in values),'Invalid external resource projection')
        external.append(dict(id=cid,memoryBytes=int(values[0]),cpus=int(values[1])/1e9,pids=int(values[2])))
    disk=os.statvfs(state['daemonDataRoot'])
    require(disk.f_bavail*disk.f_frsize>=2*1024**3,'Insufficient scratch/system disk headroom')
    result=dict(version=1,observedAt=int(time.time()),platform='linux',architecture='amd64',kernel=platform.release(),node=command([OPT/'bin/node','--version']),docker=info['ServerVersion'],rootless=True,cgroupDriver=info['CgroupDriver'],cgroupVersion=info['CgroupVersion'],daemonId=info['ID'],daemonIdentity=identity,brokerPid=broker_pid,daemonServicePid=service_pid(state,'cove-grading-docker.service'),family=limits(family),worker=limits(worker),controllers=(family/'cgroup.controllers').read_text().split(),images=state['images'],brokerArtifact=state['brokerArtifact'],runtimes=manifest['capabilities']['runtimes'],manifestIdentity=state['manifestIdentity'],containers=[dict(id=x['Id'],image=x['Image'],pid=x['State']['Pid'],running=x['State']['Running']) for x in containers],socketModes=dict(daemonDirectory=stat.S_IMODE(private.st_mode),broker=stat.S_IMODE(sock.st_mode)),hostEnvelope=dict(memoryBytes=memory['MemTotal'],availableMemoryBytes=memory['MemAvailable'],cpus=os.cpu_count(),gradingMemoryBytes=2048*2**20,gradingCpus=2.25,externalAndSystemMemoryBytes=memory['MemTotal']-memory['MemAvailable'],externalRootful=external,unreservedMemoryBytes=memory['MemAvailable']-2048*2**20,unreservedCpus=os.cpu_count()-2.25,diskFreeBytes=disk.f_bavail*disk.f_frsize),productionEquivalent=False,nativeAcceptanceExecuted=False)
    require(attest_daemon(state)==identity,'Daemon changed during observation')
    require(len(canonical(result))<1024*1024,'Oversized observation')
    return result


def cleanup():
    check_host()
    if not os.path.lexists(STATE):
        require(not any(os.path.lexists(p) for p in [STATE_DIR,OPT,HOME,WORKER_HOME,CONTROL,*SYSTEM_FILES]),'Owned resources exist without private state')
        return dict(version=1,cleaned=True,alreadyAbsent=True)
    state=load_state()
    if state.get('cleaned'):
        for lookup,names in [(pwd.getpwnam,['cove-grading','cove-grading-ci-worker']),
                             (grp.getgrnam,['cove-grading-control','cove-grading-ci-worker'])]:
            for name in names:
                try: lookup(name)
                except KeyError: continue
                raise ValueError('Owned principal reappeared after cleanup: '+name)
        require(not any(os.path.lexists(p) for p in [OPT,HOME,WORKER_HOME,CONTROL,*SYSTEM_FILES,Path(state['delegationPath'])]),'Owned resources reappeared after cleanup')
        return dict(version=1,cleaned=True,alreadyAbsent=True)
    verify_accounts(state,allow_missing=True)
    verify_subordinate(state,subordinate_contents(),allow_missing=True)
    for name,gid in [('cove-grading-control',state['controlGid']),('cove-grading-ci-worker',state['workerGid'])]:
        try: require(grp.getgrnam(name).gr_gid==gid,'Owned group changed')
        except KeyError: pass
    for path,identity in {**state['ownedPaths'],**state.get('ownedFiles',{})}.items(): validate_owned(path,identity)
    verify_rootful(state)
    # Validate every target before stopping anything. Rootful services remain untouched.
    if state.get('carrier'): verify_carrier(state)
    running=False; initial_containers=[]
    if Path(state['daemonSocket']).exists():
        identity=attest_daemon(state)
        if state.get('daemonIdentity'): require(identity==state['daemonIdentity'],'Daemon incarnation changed; cleanup refused')
        initial_containers=census(state); running=True
    tracked=[]
    for entry in Path('/proc').iterdir():
        if entry.name.isdecimal():
            try:
                if entry.stat().st_uid in {state['uid'],state['workerUid']}:
                    tracked.append((int(entry.name),(entry/'stat').read_text().rsplit(')',1)[1].split()[19],os.readlink(entry/'ns/pid')))
            except (FileNotFoundError,ProcessLookupError): pass
    for item in initial_containers:
        pid=item['State']['Pid']
        if pid:
            process=Path('/proc')/str(pid)
            tracked.append((pid,(process/'stat').read_text().rsplit(')',1)[1].split()[19],os.readlink(process/'ns/pid')))
    if command(['systemctl','show',WORKER_SERVICE,'--property=LoadState','--value'])!='not-found':
        require(command(['systemctl','show',WORKER_SERVICE,'--property=User','--value']) in {'cove-grading-ci-worker',str(state['workerUid'])} and command(['systemctl','show',WORKER_SERVICE,'--property=Slice','--value'])==WORKER_SLICE,'Changed coordinator service refused')
        command(['systemctl','stop',WORKER_SERVICE],timeout=100)
    manager_running=command(['systemctl','show',f'user@{state["uid"]}.service','--property=ActiveState','--value'])=='active'
    if manager_running:
        user_command(state,'systemctl','--user','stop','cove-grading-broker.service',timeout=110) if str(HOME/'.config/systemd/user/cove-grading-broker.service') in state['ownedFiles'] else None
    if running:
        for item in census(state):
            current=json.loads(docker(state,'inspect',item['Id']))[0]
            require(current['Id']==item['Id'] and current['Created']==item['Created'],'Container changed before cleanup')
            owned_containers(state,[current]); docker(state,'rm','--force',item['Id'])
        require(not docker(state,'ps','-aq'),'Unexpected containers remain')
    if manager_running:
        if str(HOME/'.config/systemd/user/cove-grading-docker.service') in state['ownedFiles']:
            user_command(state,'systemctl','--user','stop','cove-grading-docker.service','cove-grading.slice',timeout=100)
        command(['loginctl','disable-linger','cove-grading'])
        command(['systemctl','stop',f'user@{state["uid"]}.service'],timeout=100)
    if str(SYSTEM_FILES[2]) in state['ownedPaths']: command(['systemctl','stop',WORKER_SLICE],timeout=100)
    def absent():
        for pid,start,namespace in tracked:
            path=Path('/proc')/str(pid)
            try:
                if (path/'stat').read_text().rsplit(')',1)[1].split()[19]==start: return False
            except FileNotFoundError: pass
        namespaces={namespace for _,_,namespace in tracked if namespace!=os.readlink('/proc/1/ns/pid')}
        for path in Path('/proc').iterdir():
            if not path.name.isdecimal(): continue
            try:
                if path.stat().st_uid in {state['uid'],state['workerUid']} or os.readlink(path/'ns/pid') in namespaces: return False
            except (FileNotFoundError,ProcessLookupError): pass
        return not Path(state['cgroupParent']).exists() and not Path(state['workerCgroup']).exists()
    wait_for(absent,15,'Owned processes, namespaces or cgroups remain')
    if state.get('carrier'):
        verify_carrier(state); docker(state,'rm',state['carrier']['id'],rootful=True); state['carrier']=None
    # Keep private state/evidence as the cleanup receipt. Remove only registered roots.
    state['phase']='cleaning'; save(state)
    for path,identity in reversed(list(state['ownedPaths'].items())):
        if path==str(EVIDENCE): continue
        validate_owned(path,identity)
        if Path(path).is_dir(): shutil.rmtree(path)
        else: Path(path).unlink()
        del state['ownedPaths'][path]
        state['ownedFiles']={name:value for name,value in state['ownedFiles'].items() if not Path(name).is_relative_to(path)}
        save(state)
    for name in ['cove-grading','cove-grading-ci-worker']:
        try: pwd.getpwnam(name)
        except KeyError: continue
        command(['userdel',name])
    for name in ['cove-grading-control','cove-grading-ci-worker']:
        try: grp.getgrnam(name)
        except KeyError: continue
        command(['groupdel',name])
    command(['systemctl','daemon-reload'])
    verify_rootful(state)
    state['cleaned']=True; state['phase']='cleaned'; save(state)
    result=dict(version=1,cleaned=True,ownedProcessesAbsent=True,ownedNamespacesAbsent=True,unexpectedContainers=False)
    atomic_json(STATE_DIR/'cleanup.json',result)
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__); sub=parser.add_subparsers(dest='operation',required=True)
    sub.add_parser('prepare').add_argument('repo',type=Path); sub.add_parser('observe'); sub.add_parser('cleanup')
    args=parser.parse_args()
    result=prepare(args.repo) if args.operation=='prepare' else observe() if args.operation=='observe' else cleanup()
    if args.operation=='observe': atomic_json(STATE_DIR/'observation.json',result)
    print(json.dumps(result,sort_keys=True))

if __name__=='__main__':
    try: main()
    except (ValueError,KeyError,OSError,subprocess.SubprocessError) as error:
        # Do not print command stderr, image environment, raw journals or credentials.
        raise SystemExit('Disposable grading host refused: '+(str(error) if isinstance(error,ValueError) else type(error).__name__))
