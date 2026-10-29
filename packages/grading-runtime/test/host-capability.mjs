/** Read-only probe; never starts a guest or modifies a daemon. */
import { execFileSync } from 'node:child_process';
import { assertRootlessInfo } from '../dist/rootless-driver.js';
const raw=JSON.parse(execFileSync('docker',['info','--format','{{json .}}'],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024}));
const capability={platform:process.platform,architecture:raw.Architecture,cgroupDriver:raw.CgroupDriver,cgroupVersion:raw.CgroupVersion,securityOptions:raw.SecurityOptions};
try{assertRootlessInfo(raw);if(process.platform!=='linux')throw new Error('Broker host is not Linux');console.log(JSON.stringify({...capability,supportedEnvironment:true,nativeContainment:'not yet tested'}));}
catch(e){console.log(JSON.stringify({...capability,supportedEnvironment:false,reason:e.message}));process.exitCode=2;}
