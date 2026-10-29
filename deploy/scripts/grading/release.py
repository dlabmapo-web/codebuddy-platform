#!/usr/bin/env python3
"""Fail-closed release validation. This tool verifies evidence, never issues it."""
import argparse
import hashlib
import json
import re
import subprocess
import time
import uuid
from pathlib import Path

MIB = 2**20

def require(condition, message):
    if not condition:
        raise ValueError(message)

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()

def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()

def read_json(path):
    path = Path(path)
    require(path.is_file() and path.stat().st_size <= 16*MIB, 'Missing/oversized JSON artifact')
    return json.loads(path.read_bytes())

def verify_signature(proof, signature, public_key, trusted_key_sha256):
    require(re.fullmatch('[a-f0-9]{64}', trusted_key_sha256), 'Explicit trusted public-key SHA256 pin required')
    require(hashlib.sha256(Path(public_key).read_bytes()).hexdigest() == trusted_key_sha256, 'Untrusted acceptance signer')
    result = subprocess.run(['openssl','dgst','-sha256','-verify',str(public_key),'-signature',str(signature),str(proof)],capture_output=True)
    require(result.returncode == 0, 'Unsigned/invalid acceptance proof')

def verify_host(host, now):
    require(0 <= now-host['observedAt'] <= 60, 'Stale/future host observation')
    require(host['platform']=='linux' and host['architecture']=='amd64', 'Matching Linux AMD64 required')
    require(host['rootless'] is True and host['cgroupDriver']=='systemd' and host['cgroupVersion']=='2', 'Dedicated rootless systemd v2 required')
    require(set(['cpu','memory','pids']) <= set(host['controllers']), 'Missing delegated controller')
    require(host['daemonId'] == host['expectedDaemonId'], 'Wrong daemon')
    require(host['daemonInsideFamily'] is True and host['brokerInsideFamily'] is True, 'Unrelated process cgroup')
    require(host['legacyStopped'] is True, 'Overlapping legacy execution pool')
    require(host['worker']==dict(memoryBytes=768*MIB,cpus=.75,pids=256), 'Worker envelope mismatch')
    require(host['family']==dict(memoryBytes=1280*MIB,cpus=1.5,pids=256,swapBytes=0), 'Execution family envelope mismatch')
    envelope=host['hostEnvelope']
    require(0 < envelope['reservedMemoryBytes'] <= envelope['memoryBytes'] and 0 < envelope['reservedCpus'] <= envelope['cpus'], 'Host resource budget exceeded')
    require(envelope['diskFreeBytes'] >= envelope['diskRequiredBytes'] > 0, 'Image/scratch/headroom disk unfunded')
    require(envelope['turtleUnchanged'] is True, 'Turtle allocation changed')

def verify_retention(release, inventory):
    rollback=release['rollback']
    require(set([1,2,3,4]) <= set(rollback['policyVersions']) and set([1,2]) <= set(rollback['practiceVersions']), 'Rollback removes snapshot readers')
    ids={image['configId'] for image in release['images']}
    require(ids <= set(rollback['imageConfigIds']), 'Rollback omits runtime images')
    require(all(ref['imageDigest'] in ids for ref in inventory['references']), 'Accepted/recoverable runtime missing')

def verify_profiles(inventory):
    for p in inventory['activeProfiles']:
        require(16 <= p['memoryLimitMb'] <= 4096 and 1 <= p['timeLimitMs'] <= 60000, 'Invalid declared compatibility profile')
        require(p['memoryLimitMb']+320 <= 1024, 'Active compatibility profile cannot be physically funded; preserve allowance and block handover')

def verify_activation(release, manifest, host, inventory, proof, evidence, now=None):
    now=int(time.time()) if now is None else now
    for obj in [release,manifest,host,inventory,proof]: require(obj['version']==1, 'Unknown evidence version')
    verify_host(host,now)
    require(release['concurrency']==2 and release['maxSpare']==0, 'Unvalidated concurrency/spare change')
    require(manifest['capabilities']['maxActive']==2 and manifest['capabilities']['maxBackground']==1 and manifest['capabilities']['maxSpare']==0, 'Manifest resource bank mismatch')
    require(re.fullmatch('[a-f0-9]{40}',release['sourceCommit']), 'Missing source commit')
    artifact=release['brokerArtifact']
    require(re.fullmatch('sha256:[a-f0-9]{64}',artifact['configId']) and re.fullmatch(r'[^\s@]+@sha256:[a-f0-9]{64}',artifact['pullReference']) and re.fullmatch('[a-f0-9]{64}',artifact['treeIdentity']), 'Missing immutable host broker artifact')
    require(release['rollback']['brokerConfigId']==artifact['configId'], 'Rollback must retain compatible host broker')
    for key in ['api','worker']:
        require(re.fullmatch(r'[^\s@]+@sha256:[a-f0-9]{64}',release['applicationImages'][key]), 'Immutable runtime-aware application image required')
    require(str(uuid.UUID(release['workerGeneration']))==release['workerGeneration'], 'Invalid worker generation')
    require(release['manifestIdentity']==digest(manifest), 'Full manifest identity mismatch')
    require(0 <= now-inventory['observedAt'] <= 300 and inventory['complete'] is True, 'Incomplete/stale profile and reference inventory')
    require(inventory['legacyPending']==0, 'Unversioned legacy work must drain first')
    verify_profiles(inventory)
    verify_retention(release,inventory)
    registered={canonical(runtime) for runtime in manifest['capabilities']['runtimes']}
    require(all(canonical(ref) in registered for ref in inventory['references']), 'Accepted complete descriptor missing from capabilities')
    ids={i['configId']:i for i in release['images']}
    require(len(ids)==len(release['images']), 'Duplicate image inventory')
    for runtime in manifest['capabilities']['runtimes']:
        image=ids.get(runtime['imageDigest'])
        require(image is not None, 'Runtime image missing')
        require(image['architecture']==runtime['architecture']=='amd64' and image['packageManifestHash']==runtime['packageManifestHash'], 'Image runtime identity mismatch')
        require(re.fullmatch(r'[^\s@]+@sha256:[a-f0-9]{64}',image['pullReference']), 'Immutable registry pull digest required separately from config ID')
    require(proof['nativeAcceptancePassed'] is True, 'Native acceptance missing')
    require(0 <= now-proof['issuedAt'] <= 86400 and now < proof['expiresAt'] <= proof['issuedAt']+86400, 'Stale/future acceptance proof')
    bindings=dict(releaseIdentity=digest(release),manifestIdentity=digest(manifest),workerGeneration=release['workerGeneration'],hostIdentity=host['hostIdentity'],configurationIdentity=host['configurationIdentity'],inventoryIdentity=digest(inventory),evidenceIdentity=digest(evidence))
    require(all(proof.get(k)==v for k,v in bindings.items()), 'Acceptance content/generation/host binding mismatch')
    for key in ['compatibility','containment','recovery','performance','mixedLoad','browser','scans','certifications','observations']:
        record=evidence.get(key,{})
        require(record.get('version')==1 and record.get('passed') is True and re.fullmatch('[a-f0-9]{64}',record.get('reportHash','')), 'Missing/failed '+key+' evidence')
    if manifest['native'] is not None:
        require(len(manifest['certifications'])>0 and len(manifest['academyAllowances'])>0, 'Missing certified native pilot scope')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle',type=Path)
    parser.add_argument('--trusted-key',type=Path,required=True)
    parser.add_argument('--trusted-key-sha256',required=True)
    parser.add_argument('--host-config',type=Path,required=True)
    args=parser.parse_args()
    bundle=args.bundle.resolve()
    verify_signature(bundle/'acceptance.json',bundle/'acceptance.sig',args.trusted_key,args.trusted_key_sha256)
    release=read_json(bundle/'release.json'); manifest=read_json(bundle/'manifest.json')
    # The JS shared schema is the single structural authority; do not duplicate it.
    validator=Path(__file__).with_name('validate-manifest.mjs')
    subprocess.run(['node',str(validator),str(bundle/'manifest.json')],check=True,stdout=subprocess.DEVNULL)
    from host import collect_host
    host_config=read_json(args.host_config)
    require(host_config['applicationImages']==release['applicationImages'] and host_config['workerGeneration']==release['workerGeneration'], 'Host application/incarnation mismatch')
    require(host_config['images']==release['images'], 'Host image inventory differs from release')
    require(digest(read_json(host_config['manifestPath']))==digest(manifest), 'Host broker manifest differs from application manifest')
    from artifact import tree_identity
    require(tree_identity(Path(host_config['brokerEntrypoint']).parent.parent)==release['brokerArtifact']['treeIdentity'], 'Extracted broker artifact content mismatch')
    host=collect_host(host_config)
    evidence=read_json(bundle/'evidence.json')
    for record in evidence.values():
        require(re.fullmatch('[a-f0-9]{64}',record.get('reportHash','')), 'Invalid evidence hash')
        report=bundle/'reports'/record['reportHash']
        require(report.is_file() and report.stat().st_size<=64*MIB and hashlib.sha256(report.read_bytes()).hexdigest()==record['reportHash'], 'Evidence report bytes missing/changed')
    verify_activation(release,manifest,host,read_json(bundle/'inventory.json'),read_json(bundle/'acceptance.json'),evidence)
    print('Verified signed release, live host, immutable images and retained readers; selection remains disabled until explicit activation.')

if __name__=='__main__':
    try: main()
    except (ValueError,KeyError,OSError,subprocess.CalledProcessError) as error:
        # Never print subprocess stderr, environment, credentials or report contents.
        raise SystemExit('Grading preflight refused: '+(str(error) if isinstance(error,ValueError) else type(error).__name__))
