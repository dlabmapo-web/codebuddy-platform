"""Production wiring for the retained state machine; no fixture mode or secrets."""
import json
import hashlib
import os
from pathlib import Path
import subprocess
import time
from artifact import tree_identity
from control import update_env, verify_retained_environment
from host import collect_host, verify_images
from release import digest, load_signed_bundle, read_json, require, verify_activation
from retained import execute_transition, validate_transition

# This action replaces consumers/broker inside the same family. Changing daemon,
# account, enforcement or other service budgets requires a separate handover.
FIXED_HOST_FIELDS=('uid','controlGid','daemonConfig','daemonExecutable','daemonExecutableSha256','cgroupParent','daemonSocket','daemonPidFile','daemonId','daemonDataRoot','socketInode','socketDevice','applicationSocket','composeProject','rootfulRunningIds','externalCgroups','turtleIdentity','turtleServices','systemMemoryBytes','systemCpus','headroomMemoryBytes','headroomCpus','diskRequiredBytes','brokerEntrypoint','brokerEnvironmentPath')

def collect_candidate_inventory(compose, image):
    return json.loads(compose('run','--rm','--no-deps','--pull','never','--entrypoint','node','api','scripts/grading-inventory.mjs',capture=True,overrides={'API_IMAGE':image}))

def run_retained(args,root,state_path,environment):
    require(state_path.is_file(),'Retained deployment required')
    require(args.host_config and args.current_host_config and args.trusted_key and args.trusted_key_sha256,'Current/target host configs and pinned signer required')
    saved=read_json(state_path);pending=saved.get('transition')
    repairing=args.action=='repair-release'
    require(not repairing or pending,'Repair requires an interrupted target')
    origin=pending['target'] if repairing else pending['origin'] if pending else saved
    old_bundle=Path(origin['bundle']);bundle=args.bundle.resolve()
    current=load_signed_bundle(old_bundle,args.trusted_key,args.trusted_key_sha256,fresh=False)
    candidate=load_signed_bundle(bundle,args.trusted_key,args.trusted_key_sha256)
    old=current['release'];target=candidate['release'];manifest=candidate['manifest']
    require(origin['manifestIdentity']==old['manifestIdentity'] and origin['workerGeneration']==old['workerGeneration'],'Retained origin differs from signed release')
    if 'releaseIdentity' in origin:require(origin['releaseIdentity']==digest(old),'Retained release changed')
    previous_config=read_json(args.current_host_config);config=read_json(args.host_config)
    require(all(config.get(key)==previous_config.get(key) for key in FIXED_HOST_FIELDS),'Retained update changes daemon/family/unrelated host allocation')
    require(config.get('requireConfiguredApplications') is True,'Candidate must attest stopped application mounts before launch')
    require(config['manifestPath']==str(bundle/'manifest.json') and config['workerGeneration']==target['workerGeneration'] and config['applicationImages']==target['applicationImages'] and config['images']==target['images'],'Target host config differs from signed candidate')
    require(candidate['acceptance']['configurationIdentity']==digest(config),'Candidate proof configuration mismatch')
    require(candidate['acceptance']['hostIdentity']==hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest(),'Candidate proof belongs to another host')
    require(config['warmProfilesPath']==str(bundle/'warm-profiles.json') and config['warmProfilesIdentity']==digest(read_json(config['warmProfilesPath'])),'Candidate warm profiles differ from proof-bound config')
    previous_inventory=read_json(bundle/'previous-inventory.json')
    mode='binary-rollback' if repairing else pending['target']['mode'] if pending else args.action
    require(mode in ['retained-update','binary-rollback'],'No transition to resume')
    validate_transition(old,current['manifest'],previous_inventory,target,manifest,candidate['inventory'],candidate['acceptance'],digest(previous_config),mode)
    target_state=dict(bundle=str(bundle),manifestIdentity=target['manifestIdentity'],workerGeneration=target['workerGeneration'],releaseIdentity=digest(target),mode=mode,hostConfig=str(args.host_config.resolve()))
    if pending:
        require(repairing or args.action=='resume-release' and pending['target']==target_state,'Only same-target resume or explicit compatible repair is allowed')
        # env is atomically either the old or target configuration after a crash.
        try:verify_retained_environment(environment,target,bundle)
        except ValueError:
            try:verify_retained_environment(environment,old,old_bundle)
            except ValueError:
                require(repairing,'Unexpected interrupted environment')
                original_bundle=Path(pending['origin']['bundle']);original=load_signed_bundle(original_bundle,args.trusted_key,args.trusted_key_sha256,fresh=False)
                verify_retained_environment(environment,original['release'],original_bundle)
    else:
        require(args.action!='resume-release','No pending transition')
        verify_retained_environment(environment,old,old_bundle)
        actual=collect_host(previous_config)
        # Candidate proof binds a proposed config. This is a BEFORE-change content
        # gate, not positive target attestation; full target preflight runs twice.
        proposed={**actual,'configurationIdentity':digest(config)}
        verify_activation(target,manifest,proposed,candidate['inventory'],candidate['acceptance'],candidate['evidence'])
    verify_images(config)
    artifact=Path(config['brokerArtifactDirectory']).resolve(strict=True)
    require(tree_identity(artifact)==target['brokerArtifact']['treeIdentity'],'Candidate broker artifact differs from signed content')
    entry=Path(config['brokerEntrypoint'])
    require(str(entry)=='/opt/cove/grading/current/dist/main.js','Unsupported broker installation path')
    def run(command,capture=False,overrides=None):
        result=subprocess.run(command,check=True,capture_output=True,text=True,timeout=660,env={**os.environ,**(overrides or {})})
        if capture:
            require(len(result.stdout.encode())<=16*1024*1024,'Inventory output too large')
            return result.stdout
    docker=['docker','--host','unix://'+config['applicationSocket']]
    # Require pinned local reader images; never auto-pull mutable tags at mutation.
    for image in target['applicationImages'].values():
        require(run(docker+['image','inspect','--format','{{.Architecture}}',image],True).strip()=='amd64','Candidate reader image absent/wrong architecture')
    def compose(*parts,capture=False,overrides=None):
        return run(docker+['compose','--project-directory',str(root),'--env-file',str(environment),'-f',str(root/'compose.production.yml'),'-f',str(root/'compose.grading.yml'),*parts],capture,overrides)
    userctl=['runuser','-u','cove-grading','--','env',f"XDG_RUNTIME_DIR=/run/user/{config['uid']}",f"DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/{config['uid']}/bus",'systemctl','--user']
    def preflight():
        run(['python3',str(Path(__file__).with_name('release.py')),str(bundle),'--host-config',str(args.host_config),'--trusted-key',str(args.trusted_key),'--trusted-key-sha256',args.trusted_key_sha256])
    def install():
        # Both consumer services and broker are stopped before any pointer/env
        # change. Daemon, journal, owner, execution budgets and images stay intact.
        update_env(environment,dict(GRADING_NATIVE_ENABLED='false',GRADING_MANIFEST_HOST_PATH=str(bundle/'manifest.json'),GRADING_WORKER_GENERATION=target['workerGeneration'],GRADING_CONTROL_GID=str(config['controlGid']),API_IMAGE=target['applicationImages']['api'],JUDGE_IMAGE=target['applicationImages']['worker']))
        broker_env=Path(config['brokerEnvironmentPath'])
        update_env(broker_env,dict(GRADING_RUNTIME_MANIFEST_PATH=str(bundle/'manifest.json'),GRADING_WORKER_GENERATION=target['workerGeneration'],GRADING_WARM_PROFILES_PATH=config['warmProfilesPath']))
        link=entry.parent.parent;temporary=link.with_name('current.pending')
        require(link.is_symlink(),'Broker release pointer must be a symlink')
        if temporary.is_symlink():require(temporary.resolve()==artifact,'Conflicting pending broker artifact')
        else:
            require(not temporary.exists(),'Conflicting pending broker entry')
            temporary.symlink_to(artifact,target_is_directory=True)
        os.replace(temporary,link)
        directory=os.open(link.parent,os.O_RDONLY)
        try:os.fsync(directory)
        finally:os.close(directory)
    def action(name):
        if name=='stop-api':compose('stop','--timeout','90','api')
        elif name=='stop-worker':compose('stop','--timeout','600','judge-worker')
        elif name=='stop-broker':run(userctl+['stop','cove-grading-broker.service'])
        elif name=='install-candidate':install()
        elif name=='create-consumers':compose('create','--no-deps','--force-recreate','--pull','never','api','judge-worker')
        elif name=='start-broker':run(userctl+['start','cove-grading-broker.service'])
        elif name in ['preflight','verify-running']:preflight()
        elif name=='start-consumers':compose('up','-d','--wait','--wait-timeout','300','--no-deps','--pull','never','judge-worker','api')
        else:raise ValueError('Unknown transition operation')
    def inventory():
        # Only the trusted app image gets existing DB/Redis environment. API is
        # stopped, so its one-shot replacement fits that same reserved allocation.
        # Use the validated candidate reader, so a broken pending API image cannot
        # prevent compatible repair. Only its image changes; retained metadata/env
        # and the manifest stay current until the later install phase.
        return collect_candidate_inventory(compose,target['applicationImages']['api'])
    execute_transition(state_path,target_state,action,inventory,previous_inventory,repair=repairing)
    print('Retained release committed with native selection disabled; accepted runtime metadata and images preserved.')
