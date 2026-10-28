'use client';

import { useEffect, useRef, useState } from 'react';
import type { TurtleBrowserProfile } from '@cove/shared';
import type { BrowserTurtleExecution, TurtleBrowserBridge } from '@/lib/turtle-trial/browser-execution';
import styles from './turtle-trial.module.css';

/** Separate host, no application credentials, no popups/navigation permissions. */
export function BrowserTurtleSurface({ profile, execution, visible, title }: { profile: TurtleBrowserProfile; execution: BrowserTurtleExecution; visible: boolean; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  const connect = useRef<() => void>(() => {});
  useEffect(() => {
    let acknowledged = false, closed = false;
    let port: MessagePort | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    let stopping: unknown;
    const bridge: TurtleBrowserBridge = { ready: false, send: data => {
      if (closed) return;
      port?.postMessage({ version: 1, ...data });
      if (data.kind === 'stop') {
        clearTimeout(stopTimer); stopping = data.generation;
        stopTimer = setTimeout(fail, 100);
      }
    } };
    const fail = () => {
      if (closed) return;
      closed = true; clearTimeout(timeout); clearTimeout(stopTimer); clearInterval(retry);
      port?.postMessage({ version: 1, kind: 'dispose' }); port?.close();
      execution.attach(null); execution.event({ kind: 'prepare-failed' });
      setFailed(true); // Removing a failed frame also destroys its workers.
    };
    const timeout = setTimeout(fail, 12000);
    const link = () => {
      if (acknowledged || closed || !frame.current?.contentWindow) return;
      port?.close();
      if (frame.current) frame.current.dataset.connection = 'channel-sent';
      const channel = new MessageChannel(); const connectedPort = port = channel.port1;
      connectedPort.onmessage = event => {
        if (closed || port !== connectedPort) return;
        const m = event.data;
        if (!m || m.version !== 1 || typeof m.kind !== 'string' || !['connected', 'ready', 'prepare-failed', 'preparing', 'computing', 'painted', 'rendering', 'displaying', 'output', 'failed', 'unsupported', 'timed-out', 'lease-expired', 'stopped'].includes(m.kind)) return;
        // Worker output is untrusted even though the frame code is immutable.
        if (new TextEncoder().encode(JSON.stringify(m)).length > 70000 || (m.text !== undefined && typeof m.text !== 'string') || (m.message !== undefined && typeof m.message !== 'string') || (m.generation !== undefined && typeof m.generation !== 'string')) return;
        if (m.kind === 'stopped' && m.generation === stopping) clearTimeout(stopTimer);
        if (frame.current && ['connected', 'ready', 'prepare-failed'].includes(m.kind)) frame.current.dataset.connection = m.kind;
        if (m.kind === 'prepare-failed') { fail(); return; }
        if (['connected', 'ready', 'prepare-failed'].includes(m.kind)) { acknowledged = true; clearInterval(retry); }
        if (m.kind === 'ready' || m.kind === 'prepare-failed') clearTimeout(timeout);
        execution.event(m);
      };
      execution.attach(bridge);
      frame.current.contentWindow.postMessage({ version: 1, kind: 'connect' }, profile.origin, [channel.port2]);
    };
    connect.current = link;
    if (frame.current) frame.current.dataset.connection = 'listening';
    const handshake = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.origin === profile.origin && event.data?.version === 1 && event.data?.kind === 'cove-turtle-connect') link();
    };
    window.addEventListener('message', handshake);
    // SSR can load the hidden frame before hydration attaches any listener.
    // Initiate immediately, and retry until the *frame* acknowledges a port.
    // A message sent to an initial about:blank document is not a connection.
    const retry = setInterval(link, 250); link();
    return () => {
      closed = true; clearTimeout(timeout); clearTimeout(stopTimer); clearInterval(retry); window.removeEventListener('message', handshake);
      execution.attach(null); port?.postMessage({ version: 1, kind: 'dispose' }); port?.close(); connect.current = () => {};
    };
  }, [execution, profile.origin, profile.runtimeId]);
  return failed ? null : <iframe ref={frame} src={`${profile.origin}/${profile.runtimeId}/index.html`} title={title}
    className={styles.browserFrame} style={visible ? undefined : { display: 'none' }}
    sandbox="allow-scripts allow-same-origin" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
    referrerPolicy="no-referrer" onLoad={() => connect.current()} />;
}
