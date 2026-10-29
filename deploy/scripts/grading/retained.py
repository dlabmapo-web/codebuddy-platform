#!/usr/bin/env python3
"""Forward-only, durable application/broker update and compatible binary rollback."""
import json
import os
import re
from pathlib import Path
import tempfile
import time
from release import canonical, digest, read_json, require, verify_profiles, verify_retention
from recovery import RECOVERY_CONTRACT

INVENTORY_FIELDS=('version','activeProfiles','references','pending','legacyPending','recoverable','ephemeralPending','queueBacklog')

def inventory_identity(inventory):
    return digest({key:inventory[key] for key in INVENTORY_FIELDS})

def fresh_inventory(inventory,now,drained=True):
    require(inventory['complete'] is True and 0<=now-inventory['observedAt']<=300,'Fresh complete transition inventory required')
    counts=[inventory[key] for key in ['pending','legacyPending','recoverable','ephemeralPending']]+list(inventory['queueBacklog'].values())
    require(all(type(value) is int and value>=0 for value in counts),'Invalid accepted work inventory')
    require(inventory['legacyPending']==0,'Unversioned work cannot use accepted-work repair')
    require(set(inventory['queueBacklog'])=={'cove-grading','cove-staff-practice','cove-sample-checks','cove-regrade'},'All four queues required')
    if drained:require(all(value==0 for value in counts),'Accepted work and all four queues must drain before replacement')

def validate_transition(current,old_manifest,previous_inventory,candidate,manifest,inventory,proof,previous_config_identity,mode,now=None,recovery=False):
    now=int(time.time()) if now is None else now
    require(not recovery or mode=='binary-rollback' and proof.get('transition',{}).get('recovery')==RECOVERY_CONTRACT,'Explicit signed accepted-work recovery required')
    if recovery:require(re.fullmatch('[a-f0-9]{64}',proof['transition'].get('recoveryJournalIdentity','')) is not None,'Signed retained journal identity required')
    for item in [previous_inventory,inventory]:
        fresh_inventory(item,now,drained=not recovery);verify_profiles(item);verify_retention(candidate,item)
    verify_retention(current,previous_inventory)
    require(inventory_identity(previous_inventory)==inventory_identity(inventory),'Candidate omits current inventory')
    transition=proof.get('transition',{})
    require(transition.get('previousReleaseIdentity')==digest(current) and transition.get('previousInventoryIdentity')==digest(previous_inventory) and transition.get('previousConfigurationIdentity')==previous_config_identity,'Signed transition origin mismatch')
    registered={canonical(runtime) for runtime in manifest['capabilities']['runtimes']}
    protected=[*old_manifest['capabilities']['runtimes'],*previous_inventory['references'],*inventory['references']]
    require(all(canonical(runtime) in registered for runtime in protected),'Transition removes an accepted/retained complete descriptor')
    historical={entry['engineVersion']:canonical(entry) for entry in manifest['historical']}
    require(all(historical.get(entry['engineVersion'])==canonical(entry) for entry in old_manifest['historical']),'Transition rewrites historical decoder mapping')
    require(candidate['manifestIdentity']==digest(manifest),'Candidate manifest identity mismatch')
    require(candidate['concurrency']==current['concurrency']==2 and candidate['maxSpare']==current['maxSpare']==0,'Transition changes shared resource bank')
    if recovery:require(all(canonical(image) in {canonical(item) for item in candidate['images']} for image in current['images']),'Repair removes retained image identity')
    if mode=='binary-rollback':
        require(canonical(manifest)==canonical(old_manifest),'Binary rollback must retain current manifest/certifications')
        require(candidate['workerGeneration']==current['workerGeneration'],'Binary rollback must retain current worker authority')

def atomic_json(path,value):
    path=Path(path);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    fd,temporary=tempfile.mkstemp(dir=path.parent,prefix='.grading-state-')
    try:
        with os.fdopen(fd,'w') as file:
            json.dump(value,file,sort_keys=True);file.write('\n');file.flush();os.fsync(file.fileno())
        os.chmod(temporary,0o600);os.replace(temporary,path)
        directory=os.open(path.parent,os.O_RDONLY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)

def execute_transition(state_path,target,action,collect_inventory,expected_inventory,repair=False):
    """Retry only the same target. Never restore an older manifest on exception."""
    state=read_json(state_path)
    transition=state.get('transition')
    if repair:
        require(transition is not None,'Repair requires a retained failed target')
        origin={**transition['target'],'version':1}
        state={**origin,'transition':dict(version=1,target=target,origin=origin,phase='stop-api')}
        transition=state['transition'];atomic_json(state_path,state)
    elif transition:
        require(transition['target']==target,'Unresolved transition must resume its retained target')
    else:
        transition=dict(version=1,target=target,origin={key:value for key,value in state.items() if key not in ['transition','previous']},phase='stop-api')
        state['transition']=transition;atomic_json(state_path,state)
    def phase(name):
        transition['phase']=name;atomic_json(state_path,state)
    # Re-fence after post-start failure. Healthy updates drain; explicit repair
    # freezes accepted authority/journal for the compatible startup coordinator.
    recovery=target.get('recovery') is True
    before_inventory=['stop-api']
    if recovery:before_inventory+=['verify-api-stopped','stop-worker','verify-worker-stopped','stop-broker','verify-broker-stopped','preserve-recovery-state']
    for name in before_inventory:phase(name);action(name)
    phase('drain' if not recovery else 'frozen-recovery-inventory')
    live=collect_inventory()
    fresh_inventory(live,int(time.time()),drained=not recovery)
    require(inventory_identity(live)==inventory_identity(expected_inventory),'Live fenced inventory differs; retain fence and renew signed proof')
    operations=[] if recovery else ['stop-worker','stop-broker']
    operations+=['install-candidate','create-consumers','start-broker']
    if recovery:operations+=['verify-broker-cleanup']
    operations+=['preflight','start-consumers','verify-running']
    for name in operations:
        phase(name);action(name)
    # State installation is last; a crash just before this point still leaves a
    # target-preserving resumable intent, including after new work was accepted.
    committed={**target,'version':1,'previous':transition['origin']}
    atomic_json(state_path,committed)
