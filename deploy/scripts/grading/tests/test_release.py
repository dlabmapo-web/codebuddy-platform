"""Synthetic signed fixtures exercise guards; never production acceptance evidence."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from release import canonical, digest, verify_activation, verify_signature

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.now = 2000000000
        runtime = dict(version=1,engineVersion='0.27.5',pythonVersion='3.12.7',platform='linux',shimVersion='synthetic-1',memoryPolicy='pyodide-charged-growth-v1',executionPolicy='wall-v1',engine='pyodide', imageDigest='sha256:'+'a'*64, packageManifestHash='sha256:'+'b'*64, architecture='amd64')
        self.manifest = dict(version=1, compatibility=runtime, native=None, capabilities=dict(runtimes=[runtime], maxActive=2,maxBackground=1,maxSpare=0), certifications=[], academyAllowances=[],historical=[])
        self.manifest['capabilities'].update(version=1,protocol=1,nativeMemoryPolicy='native-cgroup-growth-v1',nativeProfile=dict(packageProfile='standard-library',pythonFamily='3.12',memoryLimitMb=dict(min=32,max=256),timeLimitMs=dict(min=100,max=60000)),compatibilityProfile=dict(memoryLimitMb=dict(min=16,max=4096),timeLimitMs=dict(min=1,max=60000)),codeChars=100000,stdinChars=8388608,stdoutBytes=8388608,stderrBytes=262144)
        self.host = dict(version=1, observedAt=self.now, hostIdentity='c'*64, architecture='amd64', platform='linux', rootless=True, cgroupDriver='systemd', cgroupVersion='2', controllers=['cpu','memory','pids'], daemonId='dedicated', expectedDaemonId='dedicated', daemonInsideFamily=True, brokerInsideFamily=True, legacyStopped=True, worker=dict(memoryBytes=768*2**20,cpus=.75,pids=256), family=dict(memoryBytes=1280*2**20,cpus=1.5,pids=256,swapBytes=0), hostEnvelope=dict(memoryBytes=8*2**30,cpus=8,reservedMemoryBytes=6*2**30,reservedCpus=6,diskFreeBytes=30*2**30,diskRequiredBytes=20*2**30,turtleUnchanged=True), configurationIdentity='d'*64)
        self.inventory = dict(version=1, observedAt=self.now, complete=True, activeProfiles=[dict(memoryLimitMb=256,timeLimitMs=3000)], references=[], legacyPending=0, pending=0, recoverable=0, ephemeralPending=0)
        self.release = dict(version=1, workerGeneration='12345678-1234-4234-8234-123456789abc',manifestIdentity=digest(self.manifest),sourceCommit='e'*40,images=[dict(configId=runtime['imageDigest'],pullReference='registry.example/cove@sha256:'+'f'*64,architecture='amd64',packageManifestHash=runtime['packageManifestHash'])],rollback=dict(policyVersions=[1,2,3,4],practiceVersions=[1,2],imageConfigIds=[runtime['imageDigest']]),concurrency=2,maxSpare=0)
        self.release['brokerArtifact']=dict(configId='sha256:'+'2'*64,pullReference='registry.example/broker@sha256:'+'3'*64,treeIdentity='4'*64)
        self.release['rollback']['brokerConfigId']=self.release['brokerArtifact']['configId']
        self.release['applicationImages']={key:'registry.example/'+key+'@sha256:'+'5'*64 for key in ['api','worker']}
        self.evidence={k:dict(version=1,passed=True,reportHash='1'*64) for k in ['compatibility','containment','recovery','performance','mixedLoad','browser','scans','certifications','observations']}
        self.proof=dict(version=1,issuedAt=self.now,expiresAt=self.now+3600,releaseIdentity=digest(self.release),manifestIdentity=digest(self.manifest),workerGeneration=self.release['workerGeneration'],hostIdentity=self.host['hostIdentity'],configurationIdentity=self.host['configurationIdentity'],inventoryIdentity=digest(self.inventory),evidenceIdentity=digest(self.evidence),nativeAcceptancePassed=True)
    def verify(self):
        return verify_activation(self.release,self.manifest,self.host,self.inventory,self.proof,self.evidence,now=self.now)
    def test_valid_synthetic_guard_inputs(self): self.verify()
    def test_fixture_passes_shared_manifest_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'manifest.json';path.write_bytes(canonical(self.manifest))
            subprocess.run(['node',str(Path(__file__).resolve().parents[1]/'validate-manifest.mjs'),str(path)],check=True,capture_output=True)

    def test_all_unsafe_conditions_rejected(self):
        mutations=[lambda:setitem(self.host,'controllers',['memory','pids']),lambda:setitem(self.host,'daemonId','wrong'),lambda:setitem(self.host,'daemonInsideFamily',False),lambda:setitem(self.release['images'][0],'configId','sha256:'+'0'*64),lambda:setitem(self.proof,'nativeAcceptancePassed',False),lambda:setitem(self.proof,'issuedAt',self.now-90000),lambda:setitem(self.release,'concurrency',3),lambda:setitem(self.host,'legacyStopped',False),lambda:setitem(self.host['hostEnvelope'],'turtleUnchanged',False),lambda:setitem(self.inventory['activeProfiles'][0],'memoryLimitMb',4096),lambda:setitem(self.proof,'workerGeneration','other'),lambda:setitem(self.evidence['scans'],'passed',False)]
        for change in mutations:
            self.setUp(); change()
            with self.subTest(change=change),self.assertRaises(ValueError): self.verify()
    def test_manifest_and_inventory_hash_binding(self):
        self.manifest['academyAllowances'].append({'academyId':'changed'})
        with self.assertRaises(ValueError): self.verify()
    def test_signature_is_required_and_pinned(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); key=root/'key'; pub=root/'pub'; body=root/'proof'; sig=root/'sig'
            subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(key)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            subprocess.run(['openssl','pkey','-in',str(key),'-pubout','-out',str(pub)],check=True,stderr=subprocess.DEVNULL)
            body.write_bytes(canonical(self.proof)); subprocess.run(['openssl','dgst','-sha256','-sign',str(key),'-out',str(sig),str(body)],check=True)
            import hashlib
            pin=hashlib.sha256(pub.read_bytes()).hexdigest()
            verify_signature(body,sig,pub,pin)
            with self.assertRaises(ValueError): verify_signature(body,sig,pub,'0'*64)
            body.write_text('{}')
            with self.assertRaises(ValueError): verify_signature(body,sig,pub,pin)
    def test_retention_blocks_missing_accepted_image(self):
        self.inventory['references']=[dict(imageDigest='sha256:'+'9'*64)]
        self.proof['inventoryIdentity']=digest(self.inventory)
        with self.assertRaises(ValueError): self.verify()

def setitem(obj,key,value): obj[key]=value
if __name__=='__main__': unittest.main()
