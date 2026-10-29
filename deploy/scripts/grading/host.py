#!/usr/bin/env python3
"""Read-only Linux attestation; no caller-supplied success booleans."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import stat
import subprocess
import time
from release import digest, read_json, require, verify_host

CGROUP=Path('/sys/fs/cgroup')
def command(args):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=20).stdout

def group(pid):
    lines=Path(f'/proc/{pid}/cgroup').read_text().splitlines()
    values=[line[3:] for line in lines if line.startswith('0::/')]
    require(len(values)==1,'Unified cgroup mapping missing')
    return (CGROUP/values[0].lstrip('/')).resolve(strict=True)

def inside(parent,child): return parent in child.parents

def limits(path):
    quota,period=(path/'cpu.max').read_text().split()
    require(quota!='max','Unbounded CPU quota')
    return dict(memoryBytes=int((path/'memory.max').read_text()),cpus=int(quota)/int(period),pids=int((path/'pids.max').read_text()),swapBytes=int((path/'memory.swap.max').read_text()))

def daemon_pid(config):
    parent=Path(config['cgroupParent']).resolve(strict=True)
    expected=('--config-file='+config['daemonConfig']).encode()
    matches=[]
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal(): continue
        try:
            if entry.stat().st_uid!=config['uid']: continue
            args=(entry/'cmdline').read_bytes().split(b'\0')
            if Path(os.fsdecode(args[0])).name!='dockerd' or expected not in args: continue
            if inside(parent,group(int(entry.name))): matches.append(int(entry.name))
        except (FileNotFoundError,PermissionError,ProcessLookupError): continue
    require(len(matches)==1,'Cannot uniquely prove dedicated host dockerd PID/config/cgroup')
    return matches[0]

def docker(socket,*args): return command(['docker','--host','unix://'+socket,*args])

def collect_host(config):
    require(platform.system()=='Linux','Linux required; Desktop is unsupported')
    require(config['uid']!=0 and config['daemonSocket']!='/var/run/docker.sock','Dedicated non-root daemon required')
    parent=Path(config['cgroupParent']).resolve(strict=True)
    require(parent.is_relative_to(CGROUP) and parent.name=='cove-grading.slice','Wrong execution family')
    info=json.loads(docker(config['daemonSocket'],'info','--format','{{json .}}'))
    require(all(info.get(key) is True for key in ['MemoryLimit','CpuCfsQuota','PidsLimit']), 'Daemon cannot enforce required controllers')
    require(set(['cpu','memory','pids']) <= set((parent/'cgroup.subtree_control').read_text().split()), 'Family controllers not enabled for children')
    pid=daemon_pid(config)
    require(int(Path(config['daemonPidFile']).read_text())==pid,'Host dockerd PID file mismatch')
    require(info['DockerRootDir']==config['daemonDataRoot'],'Wrong dedicated data root')
    socket=Path(config['daemonSocket']).stat()
    require(stat.S_ISSOCK(socket.st_mode) and socket.st_uid==config['uid'],'Wrong daemon socket owner/type')
    require(socket.st_ino==config['socketInode'] and socket.st_dev==config['socketDevice'],'Daemon socket incarnation changed; renew proof')
    control=Path('/run/cove-grading-control').stat()
    broker_socket=Path('/run/cove-grading-control/broker.sock').stat()
    require(control.st_uid==config['uid'] and control.st_gid==config['controlGid'] and stat.S_IMODE(control.st_mode)==0o2710,'Control directory traversal/setgid mismatch')
    require(stat.S_ISSOCK(broker_socket.st_mode) and broker_socket.st_uid==config['uid'] and broker_socket.st_gid==config['controlGid'] and stat.S_IMODE(broker_socket.st_mode)==0o660,'Broker socket ownership/mode mismatch')
    private=Path(config['daemonSocket']).parent.stat()
    require(private.st_uid==config['uid'] and stat.S_IMODE(private.st_mode)==0o700,'Daemon directory must remain private')
    broker_pids=[]
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal(): continue
        try:
            args=(entry/'cmdline').read_bytes().split(b'\0')
            if entry.stat().st_uid==config['uid'] and config['brokerEntrypoint'].encode() in args:
                broker_pids.append(int(entry.name))
        except (FileNotFoundError,PermissionError,ProcessLookupError): continue
    require(len(broker_pids)==1,'One dedicated host broker PID required')
    broker_pid=broker_pids[0]
    # Read broker-only environment privately, compare explicit non-secret keys,
    # and never print raw bytes. Broker has no app credentials by construction.
    broker_env=dict(item.decode().split('=',1) for item in Path(f'/proc/{broker_pid}/environ').read_bytes().split(b'\0') if b'=' in item)
    for key,value in dict(GRADING_RUNTIME_MANIFEST_PATH=config['manifestPath'],GRADING_WORKER_GENERATION=config['workerGeneration'],GRADING_DAEMON_ID=config['daemonId'],GRADING_DAEMON_SOCKET=config['daemonSocket'],GRADING_CGROUP_PARENT=str(parent)).items():
        require(broker_env.get(key)==value,'Running broker configuration differs from attested release')
    all_ids=set(docker(config['applicationSocket'],'ps','-q','--no-trunc').split())
    require(all_ids==set(config['rootfulRunningIds']),'Host container inventory changed')
    ids=sorted(all_ids | set(docker(config['applicationSocket'],'ps','-aq','--no-trunc','--filter','label=com.docker.compose.project='+config['composeProject']).split()))
    require(ids,'Missing application workload inventory')
    # Explicit projection prevents Config.Env (application credentials) leaving Docker.
    template='{{json .Id}} {{json .Config.Labels}} {{json .State.Running}} {{json .HostConfig.Memory}} {{json .HostConfig.NanoCpus}} {{json .HostConfig.PidsLimit}} {{json .Config.Image}}'
    workloads=[]
    for cid in ids:
        raw=docker(config['applicationSocket'],'inspect','--format',template,cid)
        decoder=json.JSONDecoder(); values=[]; remaining=raw.strip()
        for _ in range(7):
            value,end=decoder.raw_decode(remaining);values.append(value);remaining=remaining[end:].lstrip()
        _,labels,running,memory,nano,pids,image=values
        service=labels.get('com.docker.compose.service')
        if labels.get('com.docker.compose.project')==config['composeProject'] and service in ['api','judge-worker']:
            require(image==config['applicationImages']['api' if service=='api' else 'worker'], 'Running application reader image differs from pinned release')
            if running:
                projection='{{range .Config.Env}}{{if or (eq (index (split . "=") 0) "GRADING_RUNTIME_MANIFEST_PATH") (eq (index (split . "=") 0) "GRADING_WORKER_GENERATION")}}{{println .}}{{end}}{{end}}'
                settings=docker(config['applicationSocket'],'inspect','--format',projection,cid).splitlines()
                require('GRADING_WORKER_GENERATION='+config['workerGeneration'] in settings and 'GRADING_RUNTIME_MANIFEST_PATH=/etc/cove-grading/manifest.json' in settings,'Running application manifest/incarnation mismatch')
                mounts=json.loads(docker(config['applicationSocket'],'inspect','--format','{{json .Mounts}}',cid))
                expected={'/etc/cove-grading/manifest.json':config['manifestPath']}
                if service=='judge-worker':expected['/run/cove-grading-control']='/run/cove-grading-control'
                binds=[m for m in mounts if m['Type']!='tmpfs']
                require({m['Destination']:m['Source'] for m in binds}==expected and all(m['RW'] is False for m in binds),'Application mount boundary mismatch')
                if service=='judge-worker':
                    groups=json.loads(docker(config['applicationSocket'],'inspect','--format','{{json .HostConfig.GroupAdd}}',cid))
                    require(str(config['controlGid']) in groups,'Worker missing control-only supplementary group')

        workloads.append(dict(service=labels.get('com.docker.compose.service'),running=running,memoryBytes=memory,cpus=nano/1e9,pids=pids))
    legacy=[x for x in workloads if x['service']=='judge-sandbox']
    worker=[x for x in workloads if x['service']=='judge-worker']
    require(len(worker)==1,'One trusted worker required')
    active=[x for x in workloads if x['running']]
    require(all(x['memoryBytes']>0 and x['cpus']>0 and x['pids']>0 for x in active),'Unbounded active application workload')
    # Independent all-daemon census must match the approved inventory. Unrelated
    # workloads are accounted as fixed reserved external budgets, never stopped.
    turtle=[x for x in workloads if x['service'] in config['turtleServices']]
    require(len(turtle)==len(config['turtleServices']),'Missing Turtle services in host inventory')
    external=[]
    for entry in config['externalCgroups']:
        path=Path(entry['path']).resolve(strict=True)
        require(path.is_relative_to(CGROUP) and path!=parent and not inside(parent,path) and not inside(path,parent),'Overlapping external budget')
        actual=limits(path)
        require(actual==entry['limits'],'External/Turtle effective resource limit changed')
        external.append(dict(role=entry['role'],limits=actual))
    require(all(config[key]>=0 for key in ['systemMemoryBytes','systemCpus','headroomMemoryBytes','headroomCpus']), 'Negative host reserve')
    require(any(x['role']=='turtle' for x in external) or turtle,'Active Turtle allocation missing')
    capacity=int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemTotal:')))*1024
    disk=os.statvfs(config['daemonDataRoot'])
    envelope=dict(memoryBytes=capacity,cpus=os.cpu_count(),reservedMemoryBytes=sum(x['memoryBytes'] for x in active)+1280*2**20+(0 if worker[0]['running'] else 768*2**20)+sum(x['limits']['memoryBytes'] for x in external)+config['systemMemoryBytes']+config['headroomMemoryBytes'],reservedCpus=sum(x['cpus'] for x in active)+1.5+(0 if worker[0]['running'] else .75)+sum(x['limits']['cpus'] for x in external)+config['systemCpus']+config['headroomCpus'],diskFreeBytes=disk.f_bavail*disk.f_frsize,diskRequiredBytes=config['diskRequiredBytes'],turtleUnchanged=digest(dict(containers=turtle,cgroups=[x for x in external if x['role']=='turtle']))==config['turtleIdentity'])
    result=dict(version=1,observedAt=int(time.time()),hostIdentity=hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest(),architecture={'x86_64':'amd64','aarch64':'arm64'}.get(platform.machine(),platform.machine()),platform='linux',rootless='name=rootless' in info.get('SecurityOptions',[]),cgroupDriver=info.get('CgroupDriver'),cgroupVersion=info.get('CgroupVersion'),controllers=(parent/'cgroup.controllers').read_text().split(),daemonId=info['ID'],expectedDaemonId=config['daemonId'],daemonInsideFamily=inside(parent,group(pid)),brokerInsideFamily=inside(parent,group(broker_pid)),legacyStopped=all(not x['running'] for x in legacy),worker={k:worker[0][k] for k in ['memoryBytes','cpus','pids']},family=limits(parent),hostEnvelope=envelope,configurationIdentity=digest(config))
    for image in config['images']:
        inspected=json.loads(docker(config['daemonSocket'],'image','inspect',image['pullReference'],'--format','{{json .}}'))
        require(inspected['Id']==image['configId'] and inspected['Architecture']==image['architecture'],'Pulled OCI digest/config image identity mismatch')
        require(inspected['Config']['Labels']['io.cove.grading.package']==image['packageManifestHash'],'Guest package identity mismatch')
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('config');p.add_argument('--write-daemon-pid',action='store_true');a=p.parse_args();config=read_json(a.config)
    if a.write_daemon_pid:
        # Sole controlled mutation: write proven host PID, not namespace pidfile.
        pid=daemon_pid(config); path=Path(config['daemonPidFile']);path.write_text(str(pid)+'\n');path.chmod(0o600)
    else:
        result=collect_host(config);verify_host(result,int(time.time()));print(json.dumps(result,sort_keys=True))
if __name__=='__main__':
    try: main()
    except (ValueError,KeyError,OSError,subprocess.CalledProcessError) as e: raise SystemExit('Host verification refused: '+(str(e) if isinstance(e,ValueError) else type(e).__name__))
