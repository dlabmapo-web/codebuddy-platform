#!/usr/bin/env python3
"""Explicit grading handover/selection control. Run only during approved maintenance."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
from release import read_json, require, verify_retention, verify_signature, verify_profiles

def drained(inventory, now=None):
    now=int(time.time()) if now is None else now
    require(inventory['complete'] is True and 0<=now-inventory['observedAt']<=300,'Fresh trusted inventory required')
    require(all(inventory[k]==0 for k in ['pending','legacyPending','recoverable','ephemeralPending']),'Accepted work still needs draining/reconciliation')
    require('queueBacklog' in inventory and all(n==0 for n in inventory['queueBacklog'].values()),'Queues not drained')

def update_env(path, updates):
    owner=path.stat()
    rows=path.read_text().splitlines();seen=set();out=[]
    for row in rows:
        key,sep,_=row.partition('=')
        if sep and key.strip() in updates:
            key=key.strip();require(key not in seen,'Duplicate release setting');seen.add(key);out.append(key+'='+updates[key])
        else: out.append(row)
    out.extend(k+'='+v for k,v in updates.items() if k not in seen)
    fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.grading-env-')
    try:
        if (os.fstat(fd).st_uid,os.fstat(fd).st_gid)!=(owner.st_uid,owner.st_gid):os.fchown(fd,owner.st_uid,owner.st_gid)
        with os.fdopen(fd,'w') as file:file.write('\n'.join(out)+'\n');file.flush();os.fsync(file.fileno())
        os.chmod(tmp,0o600);os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def verify_retained_environment(path, release, bundle):
    values={}
    for row in path.read_text().splitlines():
        key,separator,value=row.partition('=')
        if separator: values[key.strip()]=value.strip().strip('"\'')
    expected=dict(GRADING_WORKER_GENERATION=release['workerGeneration'],GRADING_MANIFEST_HOST_PATH=str(bundle/'manifest.json'),API_IMAGE=release['applicationImages']['api'],JUDGE_IMAGE=release['applicationImages']['worker'])
    require(all(values.get(key)==value for key,value in expected.items()),'Retained application environment differs from approved bundle; refuse implicit reader/manifest replacement')

def handover_plan():
    return ['verify-signed-bundle-and-drained-inventory','persist-retained-handover-marker','stop-legacy-worker','stop-legacy-sandbox','start-dedicated-rootless-daemon','start-host-broker','verify-live-host-and-signed-acceptance','start-compatible-worker-and-api-native-disabled']

def execute_handover(compose, user_service, preflight, commit_environment):
    """Single command ordering authority; a failed proof never starts consumers."""
    compose('stop','--timeout','600','judge-worker',legacy=True)
    compose('stop','--timeout','90','judge-sandbox',legacy=True)
    user_service('start','cove-grading-docker.service')
    user_service('start','cove-grading-broker.service')
    preflight()
    commit_environment()
    compose('up','-d','--wait','--wait-timeout','300','--no-deps','judge-worker','api')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['plan','drain-check','handover','activate','rollback','retained-update','binary-rollback','resume-release','repair-release']);parser.add_argument('--deploy-root',type=Path,default=Path('/opt/cove'));parser.add_argument('--bundle',type=Path,required=True);parser.add_argument('--host-config',type=Path);parser.add_argument('--trusted-key',type=Path);parser.add_argument('--trusted-key-sha256');parser.add_argument('--grading-uid',type=int);parser.add_argument('--control-gid',type=int);parser.add_argument('--current-host-config',type=Path);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    root=args.deploy_root.resolve();bundle=args.bundle.resolve();inventory=read_json(bundle/'inventory.json');release=read_json(bundle/'release.json');verify_retention(release,inventory)
    if args.action=='plan':print(json.dumps(handover_plan()));return
    if args.action=='drain-check':drained(inventory);print('Trusted inventory is drained; no services changed.');return
    require(args.apply,'Mutation requires explicit --apply during approved maintenance')
    state=root/'state/grading-handover.json';env=root/'deployment.env'
    state.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    deployment_lock=(state.parent/'deploy.lock').open('a')
    fcntl.flock(deployment_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    def run(command):subprocess.run(command,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    def compose(*parts,legacy=False):
        command=['docker','compose','--project-directory',str(root),'--env-file',str(env),'-f',str(root/'compose.production.yml')]
        if not legacy:command+=['-f',str(root/'compose.grading.yml')]
        run(command+list(parts))
    def preflight():
        require(args.host_config is not None and args.trusted_key is not None and args.trusted_key_sha256,'Explicit host config and trusted signer required')
        run(['python3',str(Path(__file__).with_name('release.py')),str(bundle),'--host-config',str(args.host_config),'--trusted-key',str(args.trusted_key),'--trusted-key-sha256',args.trusted_key_sha256])
    if args.action in ['retained-update','binary-rollback','resume-release','repair-release']:
        from retained_operator import run_retained
        run_retained(args,root,state,env)
        return
    if state.exists():
        require('transition' not in read_json(state),'Unresolved retained transition requires resume-release; selection/binary changes refused')
    if args.action=='handover':
        require(not state.exists(),'Handover already retained; use reviewed forward-compatible update procedure')
        drained(inventory)
        verify_profiles(inventory)
        require(args.trusted_key is not None and args.trusted_key_sha256,'Explicit signer required')
        verify_signature(bundle/'acceptance.json',bundle/'acceptance.sig',args.trusted_key,args.trusted_key_sha256)
        proof=read_json(bundle/'acceptance.json')
        from release import digest
        require(proof['releaseIdentity']==digest(release) and proof['inventoryIdentity']==digest(inventory) and proof['manifestIdentity']==digest(read_json(bundle/'manifest.json')),'Handover content mismatch')
        require(0 <= time.time()-proof['issuedAt']<=86400 and time.time()<proof['expiresAt'],'Stale signed handover')
        require(args.grading_uid and args.control_gid,'Dedicated UID/control GID required')
        fence=inventory.get('admissionFence') or {}
        require(fence.get('manifestIdentity')==release['manifestIdentity'] and fence.get('workerGeneration')==release['workerGeneration'] and fence.get('readinessAbsent') is True,'Configure the API manifest/missing-readiness admission fence before collecting final drained inventory')
        # Verify the running API really has that configuration, rather than
        # accepting a collector launched with a different ad-hoc environment.
        api_id=subprocess.run(['docker','compose','--project-directory',str(root),'--env-file',str(env),'-f',str(root/'compose.production.yml'),'ps','-q','api'],check=True,capture_output=True,text=True).stdout.strip()
        require(bool(api_id) and '\n' not in api_id,'One admission-fenced API required')
        template='{{range .Config.Env}}{{if or (eq (index (split . "=") 0) "GRADING_RUNTIME_MANIFEST_PATH") (eq (index (split . "=") 0) "GRADING_WORKER_GENERATION")}}{{println .}}{{end}}{{end}}'
        observed=subprocess.run(['docker','inspect','--format',template,api_id],check=True,capture_output=True,text=True).stdout.splitlines()
        require('GRADING_WORKER_GENERATION='+release['workerGeneration'] in observed and 'GRADING_RUNTIME_MANIFEST_PATH=/etc/cove-grading/manifest.json' in observed,'Running API admission fence mismatch')

        # Persist before any service mutation. Every ordinary deploy now refuses,
        # including failures/reboots. This marker must never be auto-deleted.
        state.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        with state.open('x') as file:json.dump(dict(version=1,bundle=str(bundle),workerGeneration=release['workerGeneration'],manifestIdentity=release['manifestIdentity']),file);file.flush();os.fsync(file.fileno())
        state.chmod(0o600)
        # Rootful control may not be delegated to the grading account.
        userctl=['runuser','-u','cove-grading','--','env',f'XDG_RUNTIME_DIR=/run/user/{args.grading_uid}',f'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{args.grading_uid}/bus','systemctl','--user']
        updates=dict(GRADING_NATIVE_ENABLED='false',GRADING_RUNTIME_MANIFEST_PATH='/etc/cove-grading/manifest.json',GRADING_MANIFEST_HOST_PATH=str(bundle/'manifest.json'),GRADING_WORKER_GENERATION=release['workerGeneration'],GRADING_CONTROL_GID=str(args.control_gid),API_IMAGE=release['applicationImages']['api'],JUDGE_IMAGE=release['applicationImages']['worker'])
        execute_handover(compose,lambda *command:run(userctl+list(command)),preflight,lambda:update_env(env,updates))
    elif args.action=='rollback':
        require(state.is_file(),'No retained rootless handover')
        saved=read_json(state)
        require(saved['manifestIdentity']==release['manifestIdentity'] and saved['workerGeneration']==release['workerGeneration'],'Rollback must preserve accepted runtime manifest/incarnation')
        verify_retained_environment(env,release,bundle)
        update_env(env,{'GRADING_NATIVE_ENABLED':'false'})
        compose('up','-d','--wait','--wait-timeout','300','--no-deps','api')
        print('Future native selection disabled. Accepted descriptors, worker, images and schema retained.')
    else:
        require(state.is_file(),'Explicit compatibility handover required first');saved=read_json(state)
        require(saved['manifestIdentity']==release['manifestIdentity'] and saved['workerGeneration']==release['workerGeneration'],'Activation differs from retained handover')
        verify_retained_environment(env,release,bundle)
        preflight();update_env(env,{'GRADING_NATIVE_ENABLED':'true'});compose('up','-d','--wait','--wait-timeout','300','--no-deps','api')
if __name__=='__main__':
    try: main()
    except (ValueError,KeyError,OSError,subprocess.CalledProcessError) as error: raise SystemExit('Grading operation refused: '+(str(error) if isinstance(error,ValueError) else type(error).__name__))
