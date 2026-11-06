'use client';

import { useEffect, useRef, useState } from 'react';
import type { TurtleBrowserProfile } from '@cove/shared';
import type { BrowserTurtleExecution, TurtleBrowserBridge } from '@/lib/turtle-trial/browser-execution';
import styles from './turtle-trial.module.css';

/** Waits before each automatic replacement of a frame that failed; then it stays failed. */
export const runtimeRestartDelaysMs = [500, 2_000, 5_000];
/** The frame must load and accept a port within this, or it is replaced. */
const connectTimeoutMs = 12_000;
/**
 * Once connected, the runtime reports ready or its own preparation failure
 * within its 10 s budget. This only catches a frame that falls silent.
 */
const readyTimeoutMs = 30_000;
const runtimeKinds = ['connected', 'ready', 'prepare-failed', 'preparing', 'computing', 'painted', 'rendering', 'displaying', 'output', 'failed', 'unsupported', 'timed-out', 'lease-expired', 'stopped'];

/** Separate host, no application credentials, no popups/navigation permissions. */
export function BrowserTurtleSurface({ profile, execution, visible, title }: { profile: TurtleBrowserProfile; execution: BrowserTurtleExecution; visible: boolean; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Every attempt is a new frame: replacing one destroys its workers, which is
  // what makes an unacknowledged stop safe to recover from.
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<'live' | 'restarting' | 'failed'>('live');
  const connect = useRef<() => void>(() => {});
  useEffect(() => {
    if (phase !== 'live') return;
    let acknowledged = false, closed = false;
    let port: MessagePort | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    let stopping: unknown;
    const bridge: TurtleBrowserBridge = { ready: false, send: data => {
      // Commands travel only on the port the frame acknowledged. Before that
      // nothing can be running in it, and a port still being replaced by the
      // handshake would silently lose the command.
      if (closed || !acknowledged) return;
      port?.postMessage({ version: 1, ...data });
      // Only a stop of a running program has something that must provably end.
      if (data.kind === 'stop' && typeof data.generation === 'string') {
        clearTimeout(stopTimer); stopping = data.generation;
        stopTimer = setTimeout(fail, 100);
      }
    } };
    const fail = () => {
      if (closed) return;
      closed = true; clearTimeout(timeout); clearTimeout(stopTimer); clearTimeout(readyTimer); clearInterval(retry);
      port?.postMessage({ version: 1, kind: 'dispose' }); port?.close();
      execution.attach(null);
      // Removing the frame destroys its workers. Replace it a bounded number
      // of times before reporting the browser runtime unavailable.
      if (attempt < runtimeRestartDelaysMs.length) { setPhase('restarting'); return; }
      execution.event({ kind: 'prepare-failed' });
      setPhase('failed');
    };
    const timeout = setTimeout(fail, connectTimeoutMs);
    const acknowledge = () => {
      if (acknowledged) return;
      acknowledged = true; clearInterval(retry); clearTimeout(timeout);
      readyTimer = setTimeout(fail, readyTimeoutMs);
      execution.attach(bridge);
    };
    const link = () => {
      if (acknowledged || closed || !frame.current?.contentWindow) return;
      port?.close();
      if (frame.current) frame.current.dataset.connection = 'channel-sent';
      const channel = new MessageChannel(); const connectedPort = port = channel.port1;
      connectedPort.onmessage = event => {
        if (closed || port !== connectedPort) return;
        const m = event.data;
        if (!m || m.version !== 1 || typeof m.kind !== 'string' || !runtimeKinds.includes(m.kind)) return;
        // Worker output is untrusted even though the frame code is immutable.
        if (new TextEncoder().encode(JSON.stringify(m)).length > 70000 || (m.text !== undefined && typeof m.text !== 'string') || (m.message !== undefined && typeof m.message !== 'string') || (m.generation !== undefined && typeof m.generation !== 'string')) return;
        if (m.kind === 'stopped' && m.generation === stopping) clearTimeout(stopTimer);
        if (frame.current && ['connected', 'ready', 'prepare-failed'].includes(m.kind)) frame.current.dataset.connection = m.kind;
        if (m.kind === 'prepare-failed') { fail(); return; }
        if (m.kind === 'connected' || m.kind === 'ready') acknowledge();
        if (m.kind === 'ready') clearTimeout(readyTimer);
        execution.event(m);
      };
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
      closed = true; clearTimeout(timeout); clearTimeout(stopTimer); clearTimeout(readyTimer); clearInterval(retry); window.removeEventListener('message', handshake);
      execution.attach(null); port?.postMessage({ version: 1, kind: 'dispose' }); port?.close(); connect.current = () => {};
    };
  }, [execution, profile.origin, profile.runtimeId, attempt, phase]);
  useEffect(() => {
    if (phase !== 'restarting') return;
    const timer = setTimeout(() => { setAttempt(n => n + 1); setPhase('live'); }, runtimeRestartDelaysMs[attempt]);
    return () => clearTimeout(timer);
  }, [phase, attempt]);
  return phase !== 'live' ? null : <iframe key={attempt} ref={frame} src={`${profile.origin}/${profile.runtimeId}/index.html`} title={title}
    className={styles.browserFrame} style={visible ? undefined : { display: 'none' }}
    sandbox="allow-scripts allow-same-origin" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'"
    referrerPolicy="no-referrer" onLoad={() => connect.current()} />;
}
