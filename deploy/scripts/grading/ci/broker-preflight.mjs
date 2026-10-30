/** Read-only CI diagnostic; never creates, discovers or removes a guest. */
import { pathToFileURL } from 'node:url';
import { readlink } from 'node:fs/promises';

// Reviewed literal messages from the production verification modules only.
// Convert them to closed identifiers; no arbitrary error text leaves the probe.
export const invariantReasons = new Map([
  ['Invalid broker owner','owner'], ['Dedicated rootless socket required','socket-config'],
  ['Invalid delegated systemd slice','slice-config'],
  ['Daemon identity too large','daemon-identity-size'], ['Invalid daemon identity','daemon-identity-schema'],
  ['Daemon PID sidecar mismatch','daemon-pid-sidecar'], ['Daemon identity must match dedicated broker account','daemon-uid'],
  ['Daemon executable/PID/socket identity changed','daemon-continuity'], ['Daemon binary changed','daemon-binary'],
  ['Daemon restarted during attestation','daemon-restarted'],
  ['Requires rootless Docker with systemd cgroup v2','daemon-rootless'],
  ['Dedicated daemon identity/data-root changed','daemon-config'], ['Daemon socket must belong to broker account','socket-owner'],
  ['Daemon socket replaced; require restart reconciliation','socket-replaced'],
  ['Dedicated non-root Linux broker required','broker-platform'], ['Invalid parent path','family-path'],
  ['Parent cannot be a symlink','family-symlink'], ['Missing delegated controllers','family-controllers'],
  ['Execution family memory ceiling mismatch','family-memory'], ['Execution family swap must be zero','family-swap'],
  ['Execution family PID ceiling mismatch','family-pids'], ['Execution CPU ceiling mismatch','family-cpu'],
  ['Broker/daemon not contained in execution parent','family-membership'],
  ['Immutable guest image mismatch','image-identity'], ['Guest package identity mismatch','image-package'],
  ['Container command timed out','docker-timeout'], ['Container command output exceeded bound','docker-output'],
  ['Container command failed','docker-command'],
  ['Manifest path must be absolute','manifest-path'], ['Invalid manifest file','manifest-file'],
  ['Manifest exceeds bound','manifest-size'],
]);
export const stages = ['configuration','imports','manifest','daemon-sidecar','driver-construction','driver-verify','complete'];
export const types = ['BrokerError','Error','TypeError','SyntaxError','ZodError','Unknown'];
export const codes = ['EACCES','EPERM','ENOENT','ESRCH','ENOTDIR','ELOOP','EIO','ENOMEM','EMFILE','ENFILE','ETIMEDOUT','INFRASTRUCTURE','UNKNOWN'];
export const syscalls = ['open','read','readlink','stat','lstat','realpath','scandir','spawn docker','unknown'];
export const pathRoles = ['daemon-pid','daemon-sidecar','daemon-executable','daemon-proc-executable','daemon-proc-starttime','daemon-proc-directory','daemon-socket','family','family-controllers','family-memory','family-swap','family-pids','family-cpu','broker-proc-cgroup','daemon-proc-cgroup','manifest','unknown'];
export function namespaceProjection(broker, host, daemon) {
  if (![broker,host,daemon].every(value=>typeof value==='string' && /^user:\[\d+\]$/.test(value))) throw new Error();
  return {brokerMatchesHost:broker===host,brokerMatchesDaemon:broker===daemon,daemonMatchesHost:daemon===host};
}
export function errorProjection(error, paths) {
  return {
    type: types.includes(error?.name) ? error.name : 'Unknown',
    code: codes.includes(error?.code) ? error.code : 'UNKNOWN',
    syscall: syscalls.includes(error?.syscall) ? error.syscall : 'unknown',
    pathRole: typeof error?.path === 'string' ? paths.get(error.path) ?? 'unknown' : 'unknown',
    reason: invariantReasons.get(error?.message) ?? 'unclassified',
  };
}
export function configuredPaths(env, daemonPid, brokerPid, daemonExecutable) {
  return new Map([
    [env.GRADING_DAEMON_PID_FILE,'daemon-pid'], [env.GRADING_DAEMON_PID_FILE+'.identity.json','daemon-sidecar'],
    [daemonExecutable,'daemon-executable'], [`/proc/${daemonPid}/exe`,'daemon-proc-executable'],
    [`/proc/${daemonPid}/stat`,'daemon-proc-starttime'], [`/proc/${daemonPid}`,'daemon-proc-directory'],
    [env.GRADING_DAEMON_SOCKET,'daemon-socket'], [env.GRADING_CGROUP_PARENT,'family'],
    ...[['cgroup.controllers','family-controllers'],['memory.max','family-memory'],['memory.swap.max','family-swap'],['pids.max','family-pids'],['cpu.max','family-cpu']].map(([file,role])=>[env.GRADING_CGROUP_PARENT+'/'+file,role]),
    [`/proc/${brokerPid}/cgroup`,'broker-proc-cgroup'], [`/proc/${daemonPid}/cgroup`,'daemon-proc-cgroup'],
    [env.GRADING_RUNTIME_MANIFEST_PATH,'manifest'],
  ]);
}
async function main() {
  let stage='configuration'; let paths=new Map(); let namespaces;
  let result;
  try {
    const env=process.env;
    const daemonPid=Number(process.argv[2]);
    const daemonExecutable=process.argv[3];
    if (!Number.isSafeInteger(daemonPid) || daemonPid<=0 || process.argv.length!==6 || !daemonExecutable.startsWith('/') || daemonExecutable.length>4096) throw new Error();
    namespaces=namespaceProjection(await readlink('/proc/self/ns/user'),process.argv[4],process.argv[5]);
    for (const name of ['GRADING_DAEMON_PID_FILE','GRADING_DAEMON_SOCKET','GRADING_CGROUP_PARENT','GRADING_SYSTEMD_PARENT','GRADING_DAEMON_ID','GRADING_DAEMON_DATA_ROOT','GRADING_BROKER_OWNER','GRADING_RUNTIME_MANIFEST_PATH'])
      if (!env[name] || env[name].length>4096) throw new Error();
    paths=configuredPaths(env,daemonPid,process.pid,daemonExecutable);
    stage='imports';
    const { RootlessDriver }=await import('/opt/cove/grading/current/dist/rootless-driver.js');
    const { loadManifest }=await import('/opt/cove/grading/current/dist/manifest.js');
    const { loadDaemonIdentity }=await import('/opt/cove/grading/current/dist/daemon-identity.js');
    stage='manifest'; const manifest=await loadManifest(env.GRADING_RUNTIME_MANIFEST_PATH);
    stage='daemon-sidecar'; await loadDaemonIdentity(env.GRADING_DAEMON_PID_FILE);
    stage='driver-construction';
    const driver=new RootlessDriver({socket:env.GRADING_DAEMON_SOCKET,parent:env.GRADING_CGROUP_PARENT,
      systemdParent:env.GRADING_SYSTEMD_PARENT,daemonPidFile:env.GRADING_DAEMON_PID_FILE,
      daemonId:env.GRADING_DAEMON_ID,daemonDataRoot:env.GRADING_DAEMON_DATA_ROOT,owner:env.GRADING_BROKER_OWNER,
      seccompPath:'/opt/cove/grading/current/guest/seccomp.json',runtimes:manifest.capabilities.runtimes});
    stage='driver-verify'; await driver.verify();
    result={version:1,authority:'diagnostic-only',success:true,stage:'complete'};
  } catch (error) {
    result={version:1,authority:'diagnostic-only',success:false,stage,...errorProjection(error,paths)};
  }
  if (namespaces) result.namespaces=namespaces;
  // Always exit normally so the root controller can preserve the bounded result
  // before refusing preparation; this diagnostic never determines acceptance.
  process.stdout.write(JSON.stringify(result)+'\n');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
