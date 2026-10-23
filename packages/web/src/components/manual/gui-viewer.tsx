"use client";
import { useManualTranslation } from "./use-manual-translation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadRfb, releaseRfbCapture } from "./novnc-loader";
import { Button } from "@/components/studio/button";
import { Expand, X, Square, Scan, ScanLine, Keyboard } from "lucide-react";
import { DrawingIconButton, DrawingLayoutControl } from './drawing-panel-controls';
import styles from "./gui-viewer.module.css";
import { executionTranslationKey } from './execution-state';
import type { ManualSession } from "@cove/shared";
type Remote = {
  viewOnly: boolean;
  scaleViewport: boolean;
  resizeSession: boolean;
  disconnect: () => void;
  sendKey: (keysym: number, code: string, down?: boolean) => void;
  blur: () => void;
};
export function GuiViewer({
  session,
  onError,
  minimal = false,
  onFrame,
  onStop,
  layout,
  onLayoutChange,
}: {
  session: ManualSession;
  onError: (text: string) => void;
  minimal?: boolean;
  onFrame?: (frame: string) => void;
  onStop?: () => void;
  layout?: string;
  onLayoutChange?: (layout: string) => void;
}) {
  const { t: mt } = useManualTranslation();
  const state = useRef(session.state);
  // Latest-value ref read only by socket callbacks, never by render output.
  // eslint-disable-next-line react-hooks/refs
  state.current = session.state;
  const latest = useRef({ expiresAt: session.expiresAt, onFrame, fit: true });
  // eslint-disable-next-line react-hooks/refs
  latest.current = { ...latest.current, expiresAt: session.expiresAt, onFrame };
  const admitted = session.state !== "QUEUED";
  const frozen = !minimal && ['FINISHED', 'ERROR', 'STOPPED', 'TIMED_OUT', 'OUTPUT_LIMIT', 'DISCONNECTED'].includes(session.state);
  const [connection, setConnection] = useState("connecting");
  const [snapshot, setSnapshot] = useState<{ id: string; src: string }>();
  const frame = snapshot?.id === session.id ? snapshot.src : undefined;
  const [expanded, setExpanded] = useState(false);
  const [fit, setFit] = useState(true);
  const [help, setHelp] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDialogElement | null>(null);
  const attachDialog = useCallback((element: HTMLDialogElement | null) => { dialog.current = element; setPortalContainer(element); }, []);
  const close = useRef<HTMLButtonElement>(null);
  const expand = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const release = useRef<HTMLButtonElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const remote = useRef<Remote | null>(null);
  useEffect(() => { latest.current.fit = fit; if (remote.current) remote.current.scaleViewport = fit; }, [fit]);
  useEffect(() => { if (remote.current) remote.current.viewOnly = Boolean(session.readOnly || frozen); }, [session.readOnly, frozen]);
  useEffect(() => {
    if (!expanded) {
      if (restoreFocus.current) { expand.current?.focus(); restoreFocus.current = false; }
      return;
    }
    if (!dialog.current) return;
    const element = dialog.current;
    restoreFocus.current = true;
    // A native modal uses the browser top layer, focus containment and inert
    // background without moving/remounting the live noVNC canvas.
    element.close();
    element.showModal();
    close.current?.focus();
    return () => {
      remote.current?.blur();
      releaseRfbCapture();
      element.close();
      if (element.isConnected) element.show();
    };
  }, [expanded]);
  useEffect(() => {
    if (!admitted) return;
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let lastFrame: string | undefined;
    const capture = () => {
      if (disposed || !canvas.current || connectionLost) return;
      try {
        lastFrame = canvas.current.toDataURL();
        latest.current.onFrame?.(lastFrame);
      } catch { /* A frame is best-effort; never replace a useful one with an error. */ }
    };
    let connectionLost = true;
    const snapshots = setInterval(capture, 500);
    function connect() {
      if (disposed) return;
      setConnection("connecting");
      void loadRfb()
        .then((RFB) => {
          if (disposed || !target.current) return;
          socket = new WebSocket(session.displayUrl, `cove.${session.token}`);
          const rfb = new RFB(target.current, socket);
          remote.current = rfb;
          rfb.viewOnly = Boolean(session.readOnly || (!minimal && ['FINISHED', 'ERROR', 'STOPPED', 'TIMED_OUT', 'OUTPUT_LIMIT', 'DISCONNECTED'].includes(state.current)));
          rfb.scaleViewport = latest.current.fit;
          rfb.resizeSession = false;
          if (minimal) rfb.background = "#fff";
          rfb.addEventListener("connect", () => {
            if (disposed) return;
            canvas.current = target.current?.querySelector("canvas") ?? null;
            connectionLost = false;
            setSnapshot(undefined);
            setConnection("ready");
          });
          rfb.addEventListener("disconnect", () => {
            // noVNC's disconnected state is terminal. Do not disconnect this
            // instance again when React cleans up or replaces the viewer.
            if (remote.current === rfb) remote.current = null;
            if (disposed) return;
            connectionLost = true;
            // noVNC may clear its canvas during disconnect. Use the frame
            // captured while connected, rather than a newly black canvas.
            if (lastFrame) setSnapshot({ id: session.id, src: lastFrame });
            setConnection("disconnected");
            if (
              ["RUNNING", "STARTING", "WAITING_INPUT", "DISPLAYING"].includes(state.current) &&
              (!minimal || latest.current.expiresAt > Date.now())
            ) {
              reconnect = setTimeout(() => {
                if (
                  ["RUNNING", "STARTING", "WAITING_INPUT", "DISPLAYING"].includes(
                    state.current,
                  ) && (!minimal || latest.current.expiresAt > Date.now())
                )
                  connect();
              }, 2000);
            }
          });
          rfb.addEventListener("securityfailure", () => {
            if (!disposed) onError(mt("display_authorization_failed"));
          });
        })
        .catch(() => {
          if (!disposed) onError(mt("could_not_load_the_drawing_viewer"));
        });
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnect);
      clearInterval(snapshots);
      canvas.current = null;
      const current = remote.current;
      remote.current = null;
      current?.disconnect();
      releaseRfbCapture();
      if (socket?.readyState === WebSocket.OPEN) socket.close();
    };
  }, [session.id, session.displayUrl, session.token, session.readOnly, onError, mt, admitted, minimal]);
  return (
    <dialog
      open
      ref={attachDialog}
      role={expanded ? "dialog" : "group"}
      aria-modal={expanded || undefined}
      data-state={expanded ? "open" : "closed"}
      data-expanded={expanded}
      className={styles.viewer}
      aria-label={mt("drawing")}
      onCancel={(event) => { event.preventDefault(); setExpanded(false); }}
      // noVNC's mouse-capture proxy lives under body, outside the modal top
      // layer. Release it after the canvas handles mouseup, otherwise its
      // inert proxy can remain above the entire workspace after Close.
      onMouseUpCapture={() => queueMicrotask(releaseRfbCapture)}
      onTouchEndCapture={() => queueMicrotask(releaseRfbCapture)}
      onKeyDownCapture={event => {
        if (!expanded || event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]')]
          .filter(element => element.getClientRects().length > 0);
        if (!controls.length) return;
        event.preventDefault(); event.stopPropagation(); remote.current?.blur();
        const index = controls.findIndex(element => element === document.activeElement || element.contains(document.activeElement));
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
      }}
    >
      {!minimal && <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border bg-card px-3 text-xs">
        <strong className="mr-auto font-semibold">{mt("drawing")}</strong>
        <span role="status" className="mr-2 flex min-w-0 items-center gap-1.5 text-sub">
          <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${session.state === 'ERROR' ? 'bg-danger' : session.state === 'FINISHED' || connection === 'ready' ? 'bg-success' : 'bg-sub/50'}`} />
          {mt(executionTranslationKey(session.state))}{!frozen && connection !== 'ready' ? ` · ${mt(connection as 'connecting' | 'disconnected')}` : ''}
        </span>
        <DrawingIconButton label={mt(fit ? "actual_size" : "fit_drawing")} portalContainer={portalContainer} aria-pressed={fit} onClick={() => setFit(!fit)}>{fit ? <Scan aria-hidden /> : <ScanLine aria-hidden />}</DrawingIconButton>
        {!expanded && onLayoutChange && <DrawingLayoutControl value={layout ?? 'below'} onChange={onLayoutChange} portalContainer={portalContainer} />}
        {expanded ? <>
          {onStop && ["RUNNING", "QUEUED", "STARTING", "WAITING_INPUT", "DISPLAYING"].includes(session.state) && <Button size="sm" variant="outline" onClick={onStop}><Square />{mt("stop")}</Button>}
          <Button ref={close} size="sm" variant="outline" onClick={() => setExpanded(false)}><X />{mt("close_drawing")}</Button>
        </> : <DrawingIconButton ref={expand} label={mt("expand_drawing")} portalContainer={portalContainer} onClick={() => setExpanded(true)}><Expand aria-hidden /></DrawingIconButton>}
      </div>}
      <div
        ref={target}
        data-testid="turtle-display"
        className={
          "min-h-0 flex-1 bg-white focus-within:ring-2 focus-within:ring-brand " +
          (fit ? "overflow-hidden " : "overflow-auto ") +
          (frame ? "hidden" : "")
        }
        tabIndex={0}
        onKeyDownCapture={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            remote.current?.blur();
            if (minimal) target.current?.blur();
            else if (release.current) release.current.focus();
            else close.current?.focus();
          }
        }}
      />
      {frame ? (
        <div className="min-h-0 flex-1 overflow-auto bg-white"><img
          alt={mt("last_drawing_frame")}
          src={frame}
          className={fit ? "h-full w-full object-contain" : "mx-auto max-w-none"}
        /></div>
      ) : null}
      <p className="sr-only" role="status">
        {mt(frozen ? executionTranslationKey(session.state) : connection as "connecting" | "ready" | "disconnected")}
      </p>
      {!minimal && !frozen && <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-card px-3 py-1 text-xs text-sub">
        <button type="button" className="inline-flex min-h-7 items-center gap-1.5 rounded px-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand" aria-expanded={help} onClick={() => setHelp(!help)}><Keyboard aria-hidden className="size-3.5" />{mt("keyboard_controls")}</button>
        {help && <span>
          {session.readOnly || frozen
            ? mt("read_only")
            : mt(
                "click_the_drawing_to_use_keyboard_controls_escape_releases_keyboard_control",
              )}
        </span>}
        <button
          ref={release}
          type="button"
          onClick={() => remote.current?.blur()}
        >
          {mt("release_keyboard")}
        </button>
        {help && !session.readOnly && !frozen
          ? [
              ["↑", 0xff52, "ArrowUp"],
              ["↓", 0xff54, "ArrowDown"],
              ["←", 0xff51, "ArrowLeft"],
              ["→", 0xff53, "ArrowRight"],
              ["Space", 0x20, "Space"],
            ].map(([label, key, code]) => (
              <button
                className="rounded border border-border px-3 py-1"
                type="button"
                key={String(code)}
                onClick={() => {
                  remote.current?.sendKey(Number(key), String(code), true);
                  remote.current?.sendKey(Number(key), String(code), false);
                }}
              >
                {label}
              </button>
            ))
          : null}
      </div>}
    </dialog>
  );
}
