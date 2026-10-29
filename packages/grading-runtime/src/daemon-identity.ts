import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { invariant } from './errors.js';
export type DaemonIdentity = { version: 1; pid: number; uid: number; startTime: string; executable: string; executableDevice: number; executableInode: number; executableSha256: string; socketDevice: number; socketInode: number };
export async function loadDaemonIdentity(pidFile: string): Promise<DaemonIdentity> {
  const raw=await readFile(pidFile+'.identity.json','utf8');
  invariant(Buffer.byteLength(raw)<=8192,'Daemon identity too large');
  const value=JSON.parse(raw) as DaemonIdentity;
  invariant(value.version===1 && [value.pid,value.uid,value.executableDevice,value.executableInode,value.socketDevice,value.socketInode].every(v=>Number.isSafeInteger(v)&&v>=0) && value.pid>0 && value.uid>0 && /^\d+$/.test(value.startTime) && value.executable.startsWith('/') && /^[a-f0-9]{64}$/.test(value.executableSha256),'Invalid daemon identity');
  invariant((await readFile(pidFile,'utf8')).trim()===String(value.pid),'Daemon PID sidecar mismatch');
  return Object.freeze(value);
}
/** Continuity of the kernel peer proved by the host unit; never accepts argv. */
export async function verifyDaemonIdentity(identity: DaemonIdentity, socket: {dev:number;ino:number}, hashExecutable=false, procRoot='/proc') {
  const path=join(procRoot,String(identity.pid));
  const start=async()=> { const raw=await readFile(join(path,'stat'),'utf8');return raw.slice(raw.lastIndexOf(')')+1).trim().split(/\s+/)[19]; };
  const before=await start();const executable=await stat(join(path,'exe'));
  invariant((await stat(path)).uid===identity.uid && (await realpath(join(path,'exe')))===identity.executable && executable.dev===identity.executableDevice && executable.ino===identity.executableInode && before===identity.startTime && socket.dev===identity.socketDevice && socket.ino===identity.socketInode,'Daemon executable/PID/socket identity changed');
  if(hashExecutable){const hash=createHash('sha256');for await(const chunk of createReadStream(join(path,'exe')))hash.update(chunk);invariant(hash.digest('hex')===identity.executableSha256,'Daemon binary changed');}
  const after=await stat(join(path,'exe'));
  invariant(await start()===before && after.dev===executable.dev && after.ino===executable.ino && after.ctimeMs===executable.ctimeMs,'Daemon restarted during attestation');
}
