import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Broker } from './broker.js';
import { invariant } from './errors.js';
export type CgroupObservation = { memoryCurrentBytes: number; memoryPeakBytes: number; oom: number; oomKill: number; pids: number; cpuUsageUsec: number; cpuPeriods: number; cpuThrottledPeriods: number; cpuThrottledUsec: number };
export async function observeCgroup(path: string): Promise<CgroupObservation> {
  const read = async (name: string) => (await readFile(join(path,name),'utf8')).trim();
  const number = (text: string) => { invariant(/^\d+$/.test(text) && Number.isSafeInteger(Number(text)), 'Invalid observation counter'); return Number(text); };
  const fields = (text: string) => Object.fromEntries(text.split('\n').map(row=>{const [key,value]=row.split(/\s+/);return [key,number(value)];}));
  const [current,peak,pids,cpu,events]=await Promise.all([read('memory.current'),read('memory.peak'),read('pids.current'),read('cpu.stat'),read('memory.events')]);
  const c=fields(cpu),e=fields(events);
  const result={memoryCurrentBytes:number(current),memoryPeakBytes:number(peak),pids:number(pids),oom:e.oom,oomKill:e.oom_kill,cpuUsageUsec:c.usage_usec,cpuPeriods:c.nr_periods,cpuThrottledPeriods:c.nr_throttled,cpuThrottledUsec:c.throttled_usec};
  invariant(Object.values(result).every(Number.isSafeInteger),'Required cgroup observation unavailable'); return result;
}
/** Safe numeric snapshot. No code, output, paths, attempt/user IDs or journal data. */
export async function writeObservations(broker: Broker, parent: string, path: string) {
  const children: {engine:'cpython'|'pyodide'; memoryLimitMb:number; counters:CgroupObservation}[]=[];
  for(const allocation of broker.observedAllocations()) {
    if(!allocation.cgroupPath) continue;
    const rel=relative(parent,allocation.cgroupPath);
    invariant(rel!==''&&!rel.startsWith('..')&&!rel.startsWith('/'),'Observation escaped execution family');
    try {children.push({engine:allocation.runtime.engine,memoryLimitMb:allocation.memoryLimitMb,counters:await observeCgroup(allocation.cgroupPath)});}
    catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;} // Concurrent confirmed removal; next sample updates census.
  }
  const record={version:1,observedAt:Date.now(),brokerGeneration:broker.generation,workerGeneration:broker.workerGeneration,pool:broker.census(),family:await observeCgroup(parent),children};
  await writeFile(path+'.tmp',JSON.stringify(record)+'\n',{mode:0o600});await rename(path+'.tmp',path);
}
