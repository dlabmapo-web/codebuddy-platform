import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,stat,rm,unlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyDaemonIdentity,loadDaemonIdentity} from '../dist/daemon-identity.js';
test('bound daemon identity rejects executable, socket and PID reuse before mutations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'grading-identity-'));
 try {
  const proc=join(root,'123');await mkdir(proc);const binary=join(root,'dockerd');await writeFile(binary,'synthetic reviewed dockerd');await symlink(binary,join(proc,'exe'));
  const statText=start=>'123 (name with ) parentheses) S '+'0 '.repeat(18)+start+' 0\n';await writeFile(join(proc,'stat'),statText('456'));
  const executable=await stat(binary);const owner=await stat(proc);
  const identity={version:1,pid:123,uid:owner.uid,startTime:'456',executable:await realpath(binary),executableDevice:executable.dev,executableInode:executable.ino,executableSha256:createHash('sha256').update('synthetic reviewed dockerd').digest('hex'),socketDevice:5,socketInode:6};
  await verifyDaemonIdentity(identity,{dev:5,ino:6},true,root);
  await assert.rejects(verifyDaemonIdentity(identity,{dev:5,ino:7},false,root),/identity changed/);
  await writeFile(join(proc,'stat'),statText('999'));await assert.rejects(verifyDaemonIdentity(identity,{dev:5,ino:6},false,root),/identity changed/);
  await writeFile(join(proc,'stat'),statText('456'));await writeFile(binary,'changed executable');await assert.rejects(verifyDaemonIdentity(identity,{dev:5,ino:6},true,root),/binary changed/);
  const other=join(root,'fake');await writeFile(other,'fake');await unlink(join(proc,'exe'));await symlink(other,join(proc,'exe'));await assert.rejects(verifyDaemonIdentity(identity,{dev:5,ino:6},false,root),/identity changed/);
  const pidFile=join(root,'pid');await writeFile(pidFile,'999\n');await writeFile(pidFile+'.identity.json',JSON.stringify({...identity,uid:owner.uid||1}));await assert.rejects(loadDaemonIdentity(pidFile),/sidecar mismatch/);
 }finally{await rm(root,{recursive:true,force:true});}
});
