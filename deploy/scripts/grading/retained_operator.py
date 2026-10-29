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
from retained import execute_transition, validate_transition, atomic_json
from recovery import verify_stopped_container, verify_stopped_broker, verify_broker_cleanup, journal_identity as frozen_journal_identity

# This action replaces consumers/broker inside the same family. Changing daemon,
# account, enforcement or other service budgets requires a separate handover.
FIXED_HOST_FIELDS=('uid','controlGid','daemonConfig','daemonExecutable','daemonExecutableSha256','cgroupParent','daemonSocket','daemonPidFile','daemonId','daemonDataRoot','socketInode','socketDevice','applicationSocket','composeProject','rootfulRunningIds','externalCgroups','turtleIdentity','turtleServices','systemMemoryBytes','systemCpus','headroomMemoryBytes','headroomCpus','diskRequiredBytes','brokerEntrypoint','brokerEnvironmentPath','journalDirectory','brokerOwner','observationsPath')

def collect_candidate_inventory(compose, image):
    return json.loads(compose('run','--rm','--no-deps','--pull','never','--entrypoint','node','api','scripts/grading-inventory.mjs',capture=True,overrides={'API_IMAGE':image}))

def run_retained(args,root,state_path,environment):
    require(state_path.is_file(),'Retained deployment required')
    require(args.host_config and args.current_host_config and args.trusted_key and args.trusted_key_sha256,'Current/target host configs and pinned signer required')
    saved=read_json(state_path);pending=saved.get('transition')
    repairing=args.action=='repair-release'
    recovering=repairing or bool(pending and pending['target'].get('recovery'))
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
    validate_transition(old,current['manifest'],previous_inventory,target,manifest,candidate['inventory'],candidate['acceptance'],digest(previous_config),mode,recovery=recovering)
    target_state=dict(bundle=str(bundle),manifestIdentity=target['manifestIdentity'],workerGeneration=target['workerGeneration'],releaseIdentity=digest(target),mode=mode,hostConfig=str(args.host_config.resolve()))
    if recovering:
        target_state['recovery']=True
        require(all(config.get(key) for key in ['journalDirectory','brokerOwner','observationsPath']),'Recovery requires fixed journal/owner/observation identities')
        broker_values=dict(line.split('=',1) for line in Path(config['brokerEnvironmentPath']).read_text().splitlines() if line and not line.startswith('#'))
        require(all(broker_values.get(env)==config[key] for env,key in [('GRADING_JOURNAL_DIRECTORY','journalDirectory'),('GRADING_BROKER_OWNER','brokerOwner'),('GRADING_OBSERVATIONS_PATH','observationsPath')]),'Recovery must preserve installed journal/owner/observation paths')
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
    broker_started_at=0
    journal_identity=None
    def stopped_consumer(service):
        # Census all containers, including stopped/restarting ones, not a cached ID.
        ids=run(docker+['ps','-aq','--no-trunc','--filter','label=com.docker.compose.project='+config['composeProject'],'--filter','label=com.docker.compose.service='+service],True).split()
        require(len(ids)==1,'One retained consumer required; duplicate/unknown process refused')
        verify_stopped_container(json.loads(run(docker+['inspect','--format','{{json .State}}',ids[0]],True)))
    def stopped_broker():
        properties=dict(line.split('=',1) for line in run(userctl+['show','cove-grading-broker.service','--property=ActiveState,MainPID'],True).splitlines())
        group=Path(config['cgroupParent'])/'cove-grading-broker.service'
        populated=False
        if group.exists():
            events=dict(line.split() for line in (group/'cgroup.events').read_text().splitlines())
            require(events.get('populated') in ['0','1'],'Missing broker process census')
            populated=events['populated']=='1'
        verify_stopped_broker(properties,populated)
    def journal_snapshot():return frozen_journal_identity(config)
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
        nonlocal broker_started_at,journal_identity
        if name=='stop-api':compose('stop','--timeout','90','api')
        elif name=='verify-api-stopped':stopped_consumer('api')
        elif name=='verify-worker-stopped':stopped_consumer('judge-worker')
        elif name=='verify-broker-stopped':stopped_broker()
        elif name=='preserve-recovery-state':
            journal_identity=journal_snapshot()
            require(digest(journal_identity)==candidate['acceptance']['transition']['recoveryJournalIdentity'],'Stopped retained journal differs from signed recovery proof; keep fence and renew proof')
            atomic_json(state_path.with_name('grading-recovery-state.json'),dict(version=1,target=target_state,journal=journal_identity))
        elif name=='stop-worker':compose('stop','--timeout','600','judge-worker')
        elif name=='stop-broker':run(userctl+['stop','cove-grading-broker.service'])
        elif name=='install-candidate':install()
        elif name=='create-consumers':compose('create','--no-deps','--force-recreate','--pull','never','api','judge-worker')
        elif name=='start-broker':
            if recovering:
                stopped_consumer('api');stopped_consumer('judge-worker');stopped_broker()
                require(journal_snapshot()==journal_identity,'Retained journal changed while broker stopped')
            broker_started_at=int(time.time()*1000)
            run(userctl+['start','cove-grading-broker.service'])
        elif name=='verify-broker-cleanup':
            # Broker writes observations only AFTER startup has reconciled all
            # discovered guests and persisted retained receipts/uncertainty.
            deadline=time.monotonic()+30
            while True:
                try:
                    verify_broker_cleanup(read_json(config['observationsPath']),target['workerGeneration'],broker_started_at)
                    break
                except (OSError,ValueError,KeyError):
                    if time.monotonic()>=deadline:raise ValueError('Recovery broker cleanup could not be proven')
                    time.sleep(.25)
        elif name in ['preflight','verify-running']:preflight()
        elif name=='start-consumers':
            if recovering:
                stopped_consumer('api');stopped_consumer('judge-worker')
                verify_broker_cleanup(read_json(config['observationsPath']),target['workerGeneration'],broker_started_at)
                compose('up','-d','--wait','--wait-timeout','300','--no-deps','--pull','never','judge-worker')
                compose('up','-d','--wait','--wait-timeout','300','--no-deps','--pull','never','api')
            else:compose('up','-d','--wait','--wait-timeout','300','--no-deps','--pull','never','judge-worker','api')
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
