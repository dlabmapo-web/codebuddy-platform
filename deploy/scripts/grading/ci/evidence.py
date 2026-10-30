#!/usr/bin/env python3
"""Fixed-path, bounded summary collection. No private state is uploaded; journal excerpts are unit-scoped.

Only the root-owned kernel report can establish host proof. Worker phase files
are optional diagnostics and cannot change the result. Unknown JSON fields,
raw captures and exception messages are deliberately excluded from projection.
"""
import argparse
import ast
import subprocess
import json
import math
import os
from pathlib import Path
import re
import select
import time
import stat
import sys

import kernel

MAX_ARTIFACT = 20 * 2**20
# Output vocabulary is intentionally closed. This includes numeric kernel
# counters and immutable identities, never source, argv, env or payload fields.
FIELDS = set('''version success cases productionEquivalent nativeAcceptanceExecuted
before after systemReserve systemReserveBefore systemReserveAfter hostProof
kernelEvents failure category type shutdownFailures phase name completedCases
outputTruncated runtimeMs engine cleanup sourceHash context reservationId outcome nonScoring stdout stderr
bytes sha256 caseId attemptId kind generation leaseToken workerGeneration token
preInitEngines workerPhases allocations containerId learner exec pid uid cgroupId
executable id startTime identity parent control leaf namespaces memoryPolicy
leafMax pidns shmemBefore markerObserved markerChildren pidsLimitReached removed
scratchCharge scratchMountBytes oom noReplay beforeContainers restartContainers
receiptHash stage serial isolation scratch netns userns victimBefore victimAfter
victimPid victimStartTime victimCgroupId kernelVictims pidfdHeld observedBeforeRemoval
scope family memoryBytes cpus pids swapBytes cgroup limits memoryCurrentBytes
memoryPeakBytes events low high max oom_kill oom_group_kill sock_throttled
observedAt platform architecture kernel node docker rootless cgroupDriver
cgroupVersion daemonId daemonIdentity brokerPid daemonServicePid controllers
images brokerArtifact runtimes manifestIdentity containers socketModes
hostEnvelope configId packageManifestHash treeIdentity executableDevice
executableInode executableSha256 image running daemonDirectory broker
availableMemoryBytes gradingMemoryBytes gradingCpus externalAndSystemMemoryBytes
externalRootful unreservedMemoryBytes unreservedCpus diskFreeBytes
engineVersion platform architecture imageDigest runtimeAbi packageProfile
adapterVersion supervisorVersion protocolVersion pythonVersion shimVersion executionPolicy socketDevice socketInode net user mnt cgroup
cleaned alreadyAbsent ownedProcessesAbsent ownedNamespacesAbsent unexpectedContainers
'''.split()) | {name for _,name in kernel.REQUIRED} | {'/tmp','/dev/shm'}
TOP = set('version success cases productionEquivalent nativeAcceptanceExecuted before after systemReserve systemReserveBefore systemReserveAfter hostProof kernelEvents failure shutdownFailures'.split())
OBSERVATION = set('version observedAt platform architecture kernel node docker rootless cgroupDriver cgroupVersion daemonId daemonIdentity brokerPid daemonServicePid family worker controllers images brokerArtifact runtimes manifestIdentity containers socketModes hostEnvelope productionEquivalent nativeAcceptanceExecuted'.split())
FIELDS.add('worker')
SAFE_STRING = re.compile(r'[A-Za-z0-9_./:@+%=\[\]\\-]{0,2048}')


def require(condition, message):
    if not condition: raise ValueError(message)


def project(value, depth=0):
    require(depth <= 20, 'Projection depth exceeded')
    if isinstance(value, dict):
        require(len(value) <= 256, 'Projection object bound exceeded')
        result={}
        for key,item in value.items():
            if key not in FIELDS: continue
            if key in ('stdout','stderr'):
                require(isinstance(item,dict) and type(item.get('bytes')) is int and 0 <= item['bytes'] <= 8388608 and kernel.HEX.fullmatch(item.get('sha256','')), 'Invalid capture projection')
                item={k:item[k] for k in ('bytes','sha256')}
            result[key]=project(item,depth+1)
        return result
    if isinstance(value, list):
        require(len(value) <= 4096, 'Projection array bound exceeded')
        return [project(item,depth+1) for item in value]
    if isinstance(value, str):
        require(SAFE_STRING.fullmatch(value) is not None, 'Non-identity string refused')
        return value
    require(value is None or type(value) in (bool,int,float), 'Non-JSON value')
    if type(value) in (int,float): require(math.isfinite(value) and abs(value) <= 2**64, 'Numeric bound exceeded')
    return value


def project_report(value):
    require(isinstance(value,dict) and value.get('version') == 1 and type(value.get('success')) is bool, 'Invalid kernel report')
    require(value.get('productionEquivalent',False) is False and value.get('nativeAcceptanceExecuted',False) is False,'Broader acceptance claim refused')
    result=project({key:item for key,item in value.items() if key in TOP})
    if isinstance(value.get('failure'),dict):
        reason=value['failure'].get('message')
        if reason in known_reasons(): result['failure']['reason']=reason
    for key in ('before','after'):
        if key in value: result[key]=project({k:v for k,v in value[key].items() if k in OBSERVATION})
    return result


def open_directory(path):
    """Walk all components with dirfds: intermediate symlinks never resolve."""
    path=Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'Absolute contained directory required')
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            next_fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            os.close(fd); fd=next_fd
        return fd
    except BaseException:
        os.close(fd); raise


def read_json(root, relative, owner, maximum):
    path=Path(relative)
    require(not path.is_absolute() and path.parts and all(p not in ('.','..') for p in path.parts), 'Evidence path escape')
    directory=open_directory(root)
    fd=None
    try:
        for part in path.parts[:-1]:
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=directory)
            os.close(directory); directory=child
        fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
        info=os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == owner and not info.st_mode & 0o022 and info.st_nlink == 1 and info.st_size <= maximum, 'Untrusted bounded evidence')
        if relative == 'kernel.json': require(stat.S_IMODE(info.st_mode) == 0o600, 'Root report mode differs')
        data=b''
        while len(data) <= maximum:
            chunk=os.read(fd,min(65536,maximum+1-len(data)))
            if not chunk: break
            data+=chunk
        require(len(data) <= maximum, 'Evidence byte overflow')
        def unique(pairs):
            result={}
            for key,item in pairs:
                require(key not in result,'Duplicate JSON key'); result[key]=item
            return result
        return json.loads(data,object_pairs_hook=unique,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
    finally:
        if fd is not None: os.close(fd)
        os.close(directory)


def encode(value):
    data=(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
    require(len(data) <= MAX_ARTIFACT, 'Artifact exceeds 20MiB')
    return data


def write_summary(path, value):
    data=encode(value)
    directory=open_directory(Path(path).parent)
    try:
        fd=os.open(Path(path).name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
        with os.fdopen(fd,'wb') as stream: stream.write(data)
    finally: os.close(directory)


def collect(root, statuses, stage, owner=0):
    require({'primary','observation','cleanup'} <= set(statuses) <= {'primary','observation','cleanup','infrastructure'} and all(type(x) is int and 0 <= x <= 255 for x in statuses.values()), 'Invalid exit statuses')
    require(stage in ('guard','dependencies','build','prepare','observe-before','kernel','complete'), 'Unknown primary stage')
    result=dict(version=1,success=False,productionEquivalent=False,nativeAcceptanceExecuted=False,
                stage=stage,statuses={**statuses,'collection':0},collectionFailures=[],evidence={})
    failures=result['collectionFailures']; output=result['evidence']
    if statuses.get('infrastructure'): failures.append('infrastructure:collection-failed')
    def read(name,maximum,transform,required=True,file_owner=owner):
        try:
            value=transform(read_json(root,name,file_owner,maximum)); output[name]=value
            return value
        except FileNotFoundError:
            if required: failures.append(name+':missing')
        except (ValueError,TypeError,KeyError,AttributeError,OSError,RecursionError): failures.append(name+':invalid')
    def report(value):
        projected=project_report(value)
        if projected['success']: kernel.validate_results(projected)
        return projected
    read('infrastructure.json',128*1024,project_infrastructure,required=bool(statuses.get('infrastructure')))
    read('prerequisite-packages.json',65536,project_prerequisites,required=False)
    read('broker-preflight.json',4096,kernel.host.project_broker_preflight,required=False)
    authoritative=read('kernel.json',2*2**20,report)
    observation=lambda value: project({k:v for k,v in value.items() if k in OBSERVATION})
    read('prepare-observation.json',2**20,observation)
    read('observation.json',2**20,observation)
    cleanup=read('cleanup.json',65536,lambda v:project({k:v[k] for k in ('version','cleaned','alreadyAbsent','ownedProcessesAbsent','ownedNamespacesAbsent','unexpectedContainers') if k in v}))
    if statuses['cleanup'] == 0 and (not cleanup or cleanup.get('cleaned') is not True): failures.append('cleanup.json:unproved')
    # Optional, untrusted diagnostic summaries. Never inspect the worker's
    # handshake, kernel convenience copy, host-proof copy, or arbitrary files.
    try:
        directory=open_directory(Path(root)/'evidence')
        try: worker_owner=os.fstat(directory).st_uid
        finally: os.close(directory)
        for phase in kernel.PHASES:
            read('evidence/'+phase+'.json',256*1024,
                 lambda v:project({k:v[k] for k in ('version','phase','success','cases','failure') if k in v}),False,worker_owner)
    except FileNotFoundError: pass
    except OSError: failures.append('evidence:invalid-directory')
    if authoritative and not authoritative['success'] and statuses['primary'] == 0:
        failures.append('kernel.json:failed-without-primary-status')
    if authoritative:
        result['requiredCaseCount']=len(kernel.REQUIRED)
        result['executedCaseCount']=len(authoritative.get('cases',[]))
        result['authoritativeReport']='root-owned-kernel-report'
        result['authoritativeHostProof']=authoritative['success']
    result['statuses']['collection']=int(bool(failures))
    result['success']=bool(authoritative and authoritative['success'] and not failures and not any(statuses.values()))
    encode(result)
    return result


def project_prerequisites(value):
    require(value.get('version')==1 and value.get('authority')=='diagnostic-only','Invalid prerequisite diagnostic')
    installed=value.get('installedProtected')
    require(isinstance(installed,dict) and len(installed)<=16,'Installed prerequisite diagnostic bound')
    for name,version in installed.items():
        require(kernel.host.PACKAGE_NAME.fullmatch(name) and name.split(':')[0] in kernel.host.PROTECTED_PACKAGES and isinstance(version,str) and kernel.host.PACKAGE_VERSION.fullmatch(version),'Invalid installed prerequisite diagnostic')
    selected=value.get('selectedRootlessVersion')
    require(selected is None or isinstance(selected,str) and kernel.host.PACKAGE_VERSION.fullmatch(selected),'Invalid selected prerequisite version')
    require(type(value.get('officialOrigin')) is bool,'Invalid prerequisite origin result')
    result=dict(version=1,authority='diagnostic-only',installedProtected=dict(installed),selectedRootlessVersion=selected,officialOrigin=value['officialOrigin'],simulation=None)
    simulation=value.get('simulation')
    if simulation is not None:
        require(isinstance(simulation,dict) and type(simulation.get('exitCode')) is int and 0<=simulation['exitCode']<=255,'Invalid prerequisite simulation status')
        rows=simulation.get('transactions'); require(isinstance(rows,list) and len(rows)<=128,'Prerequisite transaction bound')
        transactions=[]
        for row in rows:
            require(isinstance(row,dict) and row.get('action') in ('Inst','Remv','Conf') and isinstance(row.get('package'),str) and kernel.host.PACKAGE_NAME.fullmatch(row['package']),'Invalid prerequisite transaction')
            for field in ('version','previousVersion'):
                require(row.get(field) is None or isinstance(row[field],str) and kernel.host.PACKAGE_VERSION.fullmatch(row[field]),'Invalid prerequisite transaction version')
            transactions.append({key:row.get(key) for key in ('action','package','previousVersion','version')})
        result['simulation']=dict(exitCode=simulation['exitCode'],transactions=transactions)
    return result


def project_infrastructure(value):
    require(value.get('version') == 1 and value.get('authority') == 'diagnostic-only','Invalid infrastructure snapshot')
    units=value.get('units',{})
    require(set(units) == {'cove-grading-docker.service','cove-grading-broker.service'},'Unowned journal unit')
    result=dict(version=1,authority='diagnostic-only',units={})
    for name,unit in units.items():
        require(type(unit.get('exitCode')) is int and type(unit.get('truncated')) is bool,'Invalid journal status')
        entries=unit.get('entries',[]); require(len(entries)<=40,'Journal count bound')
        result['units'][name]=dict(exitCode=unit['exitCode'],truncated=unit['truncated'],entries=[])
        for entry in entries:
            require(isinstance(entry.get('message'),str) and len(entry['message'])<=1024,'Journal message bound')
            result['units'][name]['entries'].append(dict(priority=str(entry.get('priority',''))[:1],message=entry['message']))
    return result


def infrastructure_snapshot():
    """Only two owned service journals, before cleanup. Never container logs.

    This diagnostic is not host proof. Journal metadata and all but bounded
    printable MESSAGE excerpts are discarded; known sensitive assignments and
    credential-bearing URL forms are redacted even on these credential-free units.
    """
    kernel.host.check_host()
    if not kernel.host.STATE.exists(): return 0
    state=kernel.host.load_state()
    require(type(state.get('uid')) is int and 10000 <= state['uid'] <= 59999, 'Invalid diagnostic UID')
    kernel.host.verify_accounts(state)
    units={}
    for unit in ('cove-grading-docker.service','cove-grading-broker.service'):
        args=['journalctl','--no-pager','--quiet','--output=json','--output-fields=MESSAGE,PRIORITY',
              '--lines=40','_UID='+str(state['uid']),'_SYSTEMD_USER_UNIT='+unit]
        child=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                               env=dict(PATH='/usr/sbin:/usr/bin:/sbin:/bin',LANG='C.UTF-8'))
        try:
            data=b''; deadline=time.monotonic()+15
            while len(data)<=65536:
                remaining=deadline-time.monotonic()
                require(remaining>0,'Journal collection timeout')
                readable,_,_=select.select([child.stdout],[],[],remaining)
                require(readable,'Journal collection timeout')
                chunk=os.read(child.stdout.fileno(),min(8192,65537-len(data)))
                if not chunk: break
                data+=chunk
            if len(data)>65536: child.kill()
            status=child.wait(timeout=max(.1,deadline-time.monotonic()))
        except BaseException:
            child.kill(); child.wait(timeout=5); raise
        finally: child.stdout.close()
        entries=[]
        for line in data[:65536].splitlines()[:40]:
            try: row=json.loads(line)
            except (ValueError,TypeError): continue
            message=row.get('MESSAGE')
            if not isinstance(message,str): continue
            message=''.join(c for c in message[:1024] if c.isprintable() or c == '\t')
            message=re.sub(r'(?i)(token|password|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*[^ ,;]+',r'\1=[redacted]',message)
            message=re.sub(r'(https?://)[^ /:@]+:[^ /@]+@',r'\1[redacted]@',message)
            entries.append(dict(priority=str(row.get('PRIORITY',''))[:1],message=message))
        units[unit]=dict(exitCode=status,truncated=len(data)>65536,entries=entries)
    value=dict(version=1,authority='diagnostic-only',units=units)
    require(len(encode(value))<=128*1024,'Infrastructure diagnostic bound exceeded')
    # State root is root-owned and already guarded by the producer contract.
    root=kernel.host.STATE_DIR
    fd=open_directory(root)
    try:
        info=os.fstat(fd); require(info.st_uid == 0 and not info.st_mode & 0o022,'Untrusted diagnostic root')
    finally: os.close(fd)
    write_summary(root/'infrastructure.json',value)
    return int(any(v['exitCode'] != 0 or v['truncated'] for v in units.values()))


def known_reasons():
    # Only literal invariant messages from this reviewed controller source can
    # be retained. Dynamic paths, subprocess stderr and payloads never match.
    reasons=set()
    for name in ('provision.py','kernel.py'):
        tree=ast.parse(Path(__file__).with_name(name).read_text())
        for node in ast.walk(tree):
            if isinstance(node,ast.Call) and isinstance(node.func,ast.Name):
                if node.func.id in ('require','ValueError','wait_for'):
                    for arg in node.args[1:] if node.func.id == 'require' else node.args:
                        if isinstance(arg,ast.Constant) and isinstance(arg.value,str) and len(arg.value) <= 300:
                            reasons.add(arg.value)
    return reasons


def diagnostic(line):
    prefixes=('Disposable grading host refused: ', 'Disposable kernel checks failed: ')
    for prefix in prefixes:
        if line.startswith(prefix):
            text=line[len(prefix):].strip()
            if ': ' in text:
                exception,text=text.split(': ',1)
            else:
                exception=text if text in ('CalledProcessError','TimeoutExpired','FileNotFoundError','PermissionError','OSError','KeyError') else 'ValueError'
            if exception not in ('ValueError','KeyError','OSError','PermissionError','FileNotFoundError','CalledProcessError','TimeoutExpired'):
                exception='ControllerError'
            return dict(type=exception,reason=text if text in known_reasons() else 'unclassified-controller-failure')
    return None


def invoke(args):
    require(args.stage in ('guard','prepare','observe-before','kernel','observe-after','cleanup'), 'Unknown diagnostic stage')
    require(args.command and args.command[0] == 'sudo', 'Only lifecycle commands accepted')
    child=subprocess.Popen(args.command,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    reason=None
    try:
        # Drain stderr without retaining it. A line/fragment has a hard bound;
        # raw bytes are never written anywhere, echoed, or added to summaries.
        while True:
            line=child.stderr.readline(2049)
            if not line: break
            if len(line) <= 2048:
                match=diagnostic(line.decode('utf-8','replace'))
                if match and reason is None: reason=match
        status=child.wait()
    finally: child.stderr.close()
    record=dict(stage=args.stage,exitCode=status if status >= 0 else 128-status)
    if status: record['failure']=reason or dict(type='ProcessExit',reason='unclassified-controller-failure')
    write_summary(Path.cwd()/args.diagnostics/(args.stage+'.json'),record)
    return record['exitCode']


def finalize(args):
    folder=Path.cwd()/args.directory
    finalization=0
    try: value=read_json(folder,'collected.json',os.getuid(),MAX_ARTIFACT)
    except (ValueError,OSError):
        finalization=1
        value=dict(version=1,success=False,productionEquivalent=False,nativeAcceptanceExecuted=False,
                   collectionFailures=['collector:missing-or-invalid-summary'])
    source=os.environ.get('GITHUB_SHA','')
    require(re.fullmatch(r'[0-9a-f]{40}',source) is not None,'Source revision absent')
    value['sourceCommit']=source
    value['diagnostics']=[]
    for stage in ('guard','prepare','observe-before','kernel','observe-after','cleanup'):
        try: value['diagnostics'].append(read_json(folder,stage+'.json',os.getuid(),4096))
        except FileNotFoundError: pass
    # Keep actual process collection failure even when collection itself could
    # not produce a complete status object (e.g. privileged host guard refusal).
    value['statuses']={name:getattr(args,name) for name in ('primary','observation','cleanup','infrastructure','collection')}
    value['statuses']['finalization']=finalization
    value['success']=bool(value.get('success') and not any(value['statuses'].values()))
    write_summary(folder/'summary.json',value)
    # Only the bounded final summary is eligible for upload.
    for name in ('collected.json', *(stage+'.json' for stage in ('guard','prepare','observe-before','kernel','observe-after','cleanup'))):
        try: (folder/name).unlink()
        except FileNotFoundError: pass
    return finalization


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='operation',required=True)
    command=sub.add_parser('collect')
    for name in ('primary','observation','cleanup'): command.add_argument('--'+name,type=int,required=True)
    command.add_argument('--stage',required=True)
    command.add_argument('--infrastructure',type=int,default=0)
    sub.add_parser('snapshot')
    runner=sub.add_parser('invoke')
    runner.add_argument('--stage',required=True); runner.add_argument('--diagnostics',required=True)
    runner.add_argument('command',nargs=argparse.REMAINDER)
    finish=sub.add_parser('finalize'); finish.add_argument('--directory',required=True)
    for name in ('primary','observation','cleanup','infrastructure','collection'): finish.add_argument('--'+name,type=int,required=True)
    args=parser.parse_args()
    if args.operation == 'snapshot': return infrastructure_snapshot()
    if args.operation == 'invoke':
        if args.command and args.command[0] == '--': args.command=args.command[1:]
        return invoke(args)
    if args.operation == 'finalize': return finalize(args)
    # All production reads are privileged, fixed-root, and guarded. No caller
    # path, private state contents or entire caller environment is accepted.
    kernel.host.check_host()
    root=kernel.host.STATE_DIR
    if root.exists():
        fd=open_directory(root)
        try:
            info=os.fstat(fd)
            require(info.st_uid == 0 and not info.st_mode & 0o022, 'Untrusted evidence root')
        finally: os.close(fd)
    value=collect(root,{name:getattr(args,name) for name in ('primary','observation','cleanup','infrastructure')},args.stage)
    sys.stdout.buffer.write(encode(value))
    return value['statuses']['collection']


if __name__ == '__main__':
    try: raise SystemExit(main())
    except (ValueError,TypeError,KeyError,AttributeError,OSError,RecursionError,subprocess.SubprocessError) as error:
        # No exception text: it can contain arbitrary file/payload information.
        value=dict(version=1,success=False,productionEquivalent=False,nativeAcceptanceExecuted=False,collectionFailures=['collector:'+type(error).__name__])
        sys.stdout.buffer.write(encode(value)); raise SystemExit(1)
