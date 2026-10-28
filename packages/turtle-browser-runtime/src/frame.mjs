import { LocalTurtleRuntime } from './runtime.mjs';
import { parentOrigin } from './config.mjs';
import { validateControl } from './protocol.mjs';
let port, runtime;
document.documentElement.dataset.runtimeState = 'awaiting-parent';
addEventListener('message', event => {
  if (event.source !== parent || event.origin !== parentOrigin || event.data?.kind !== 'connect' || event.data.version !== 1 || event.ports.length !== 1) return;
  // A trusted parent can replace a closed connection (React Strict Mode or a
  // restored frame). Retire both old workers before accepting its new port.
  runtime?.dispose(); port?.close();
  const connectedPort = port = event.ports[0];
  const send = message => {
    if (port !== connectedPort) return;
    if (message.kind !== 'output') document.documentElement.dataset.runtimeState = message.kind;
    connectedPort.postMessage(message);
  };
  let connectedRuntime;
  try { connectedRuntime = runtime = new LocalTurtleRuntime(document.querySelector('#drawing'), document.querySelector('#cursors'), send); }
  catch { send({ version: 1, kind: 'prepare-failed', message: 'Browser drawing is unavailable' }); connectedPort.close(); if (port === connectedPort) port = null; return; }
  connectedPort.onmessage = async event => {
    if (port !== connectedPort) return;
    const data = event.data;
    if (!validateControl(data)) return;
    try {
      if (data.kind === 'run') await connectedRuntime.run(data);
      else if (data.kind === 'stop') { connectedRuntime.stop(!!data.clear); send({ version: 1, kind: 'stopped', generation: data.generation }); }
      else if (data.kind === 'renew' && data.generation === connectedRuntime.generation) connectedRuntime.renew(data.leaseUntil);
      else if (data.kind === 'dispose') { connectedRuntime.dispose(); connectedPort.close(); if (port === connectedPort) port = null; }
    } catch (e) { if (port === connectedPort) connectedRuntime.fail(e.message); }
  };
  connectedPort.start(); send({ version: 1, kind: 'connected' });
});
addEventListener('pagehide', () => { runtime?.dispose(); port?.close(); });
if (parent !== window) parent.postMessage({ version: 1, kind: 'cove-turtle-connect' }, parentOrigin);
