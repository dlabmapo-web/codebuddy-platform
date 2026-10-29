#!/usr/bin/env python3
"""Fixed account/service names and fail-on-different configuration."""
import json
import os
from pathlib import Path
import shutil
import stat
from release import require

def render(home, uid, dockerd, node):
    runtime=f'/run/user/{uid}/cove-grading'
    config=home/'.config/cove-grading'
    unit=home/'.config/systemd/user'
    return {
        config/'daemon.json':json.dumps({'data-root':str(home/'.local/share/cove-grading/docker'),'exec-root':runtime+'/exec','pidfile':runtime+'/namespace-docker.pid','hosts':['unix://'+runtime+'/docker.sock'],'bridge':'none','iptables':False,'ip6tables':False,'exec-opts':['native.cgroupdriver=systemd'],'cgroup-parent':'cove-grading.slice','log-driver':'local','log-opts':{'max-size':'10m','max-file':'3'}},indent=2)+'\n',
        unit/'cove-grading.slice':'''[Unit]
Description=Shared grading execution budget (daemon, broker, helpers and guests)
[Slice]
MemoryAccounting=yes
CPUAccounting=yes
TasksAccounting=yes
MemoryMax=1280M
MemorySwapMax=0
CPUQuota=150%
TasksMax=256
''',
        unit/'cove-grading-docker.service':f'''[Unit]
Description=Dedicated grading rootless Docker daemon
After=network.target
[Service]
Type=notify
NotifyAccess=all
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=DOCKERD_ROOTLESS_ROOTLESSKIT_NET=slirp4netns
Environment=DOCKERD_ROOTLESS_ROOTLESSKIT_STATE_DIR=%t/cove-grading/rootlesskit
RuntimeDirectory=cove-grading
RuntimeDirectoryMode=0700
ExecStart={dockerd} --config-file=%h/.config/cove-grading/daemon.json
ExecStartPost=/usr/bin/python3 /opt/cove/scripts/grading/host.py %h/.config/cove-grading/host.json --write-daemon-pid
Delegate=cpu memory pids
Slice=cove-grading.slice
KillMode=mixed
Restart=on-failure
RestartSec=5
TimeoutStartSec=120
''',
        unit/'cove-grading-broker.service':f'''[Unit]
Description=Credential-free grading host broker
Requires=cove-grading-docker.service
After=cove-grading-docker.service
BindsTo=cove-grading-docker.service
[Service]
Type=simple
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=NODE_OPTIONS=--max-old-space-size=128
EnvironmentFile=%h/.config/cove-grading/broker.env
WorkingDirectory=/opt/cove/grading/current
ExecStartPre=/usr/bin/python3 /opt/cove/scripts/grading/broker-env.py %h/.config/cove-grading/broker.env
ExecStart={node} /opt/cove/grading/current/dist/main.js
Slice=cove-grading.slice
UMask=0007
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=%h/.local/share/cove-grading /run/cove-grading-control %t/cove-grading /sys/fs/cgroup
Restart=on-failure
RestartSec=5
TimeoutStopSec=90
KillMode=control-group
'''}

def main():
    home=Path.home(); uid=os.getuid()
    require(uid!=0,'Non-root required')
    control=Path('/run/cove-grading-control'); info=control.stat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid==uid and info.st_gid==os.getgid() and stat.S_IMODE(info.st_mode)==0o2710,'Administrator must provision control-only directory 2710 with dedicated UID/primary client group')
    files=render(home,uid,shutil.which('dockerd-rootless.sh'),shutil.which('node'))
    for path,content in files.items():
        require(not path.is_symlink(),'Symlink config rejected')
        require(not path.exists() or path.read_text()==content,'Existing different configuration: '+path.name)
    for path,content in files.items():
        path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        if not path.exists(): path.write_text(content);path.chmod(0o600)
    for name in ['journal','docker']:
        (home/'.local/share/cove-grading'/name).mkdir(parents=True,exist_ok=True,mode=0o700)
if __name__=='__main__': main()
