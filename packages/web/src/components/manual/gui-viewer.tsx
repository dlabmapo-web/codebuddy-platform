"use client";
import { useManualTranslation } from "./use-manual-translation";
import { useEffect, useRef, useState } from "react";
import { loadRfb } from "./novnc-loader";
import type { ManualSession } from "@cove/shared";
type Remote = {
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
}: {
  session: ManualSession;
  onError: (text: string) => void;
  minimal?: boolean;
  onFrame?: (frame: string) => void;
}) {
  const { t: mt } = useManualTranslation();
  const state = useRef(session.state);
  // Latest-value ref read only by socket callbacks, never by render output.
  // eslint-disable-next-line react-hooks/refs
  state.current = session.state;
  const latest = useRef({ expiresAt: session.expiresAt, onFrame });
  // eslint-disable-next-line react-hooks/refs
  latest.current = { expiresAt: session.expiresAt, onFrame };
  const admitted = session.state !== "QUEUED";
  const [connection, setConnection] = useState("connecting");
  const [frame, setFrame] = useState<string>();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const release = useRef<HTMLButtonElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const remote = useRef<Remote | null>(null);
  useEffect(() => {
    if (!admitted) return;
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    function connect() {
      if (disposed) return;
      setConnection("connecting");
      void loadRfb()
        .then((RFB) => {
          if (disposed || !target.current) return;
          socket = new WebSocket(session.displayUrl, `cove.${session.token}`);
          setFrame(undefined);
          const rfb = new RFB(target.current, socket);
          remote.current = rfb;
          rfb.viewOnly = session.readOnly ?? false;
          rfb.scaleViewport = true;
          rfb.resizeSession = false;
          if (minimal) rfb.background = "#fff";
          rfb.addEventListener("connect", () => {
            if (disposed) return;
            canvas.current = target.current?.querySelector("canvas") ?? null;
            setConnection("ready");
          });
          rfb.addEventListener("disconnect", () => {
            // noVNC's disconnected state is terminal. Do not disconnect this
            // instance again when React cleans up or replaces the viewer.
            if (remote.current === rfb) remote.current = null;
            if (disposed) return;
            if (canvas.current) {
              try {
                const image = canvas.current.toDataURL();
                setFrame(image);
                latest.current.onFrame?.(image);
              } catch {}
            }
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
      const current = remote.current;
      remote.current = null;
      current?.disconnect();
      if (socket?.readyState === WebSocket.OPEN) socket.close();
    };
  }, [session.id, session.displayUrl, session.token, session.readOnly, onError, mt, admitted, minimal]);
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label={mt("drawing")}
    >
      <div
        ref={target}
        data-testid="turtle-display"
        className={
          (minimal ? "min-h-0 flex-1 " : "h-[240px] min-h-[160px] flex-none md:h-auto md:min-h-0 md:flex-1 ") +
          "overflow-hidden bg-white focus-within:ring-2 focus-within:ring-brand " +
          (frame ? "hidden" : "")
        }
        tabIndex={0}
        onKeyDownCapture={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            remote.current?.blur();
            if (minimal) target.current?.blur();
            else release.current?.focus();
          }
        }}
      />
      {frame ? (
        <img
          alt={mt("last_drawing_frame")}
          src={frame}
          className="min-h-0 flex-1 object-contain"
        />
      ) : null}
      <p className={minimal ? "sr-only" : "px-2 text-xs"} role="status">
        {mt(connection as "connecting" | "ready" | "disconnected")}
      </p>
      {!minimal && <div className="flex flex-wrap gap-2 border-t border-border p-2 text-xs">
        <span>
          {session.readOnly
            ? mt("read_only")
            : mt(
                "click_the_drawing_to_use_keyboard_controls_escape_releases_keyboard_control",
              )}
        </span>
        <button
          ref={release}
          type="button"
          onClick={() => remote.current?.blur()}
        >
          {mt("release_keyboard")}
        </button>
        {!session.readOnly
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
        <button
          type="button"
          onClick={() =>
            void target.current?.requestFullscreen().catch(() => {})
          }
        >
          {mt("fullscreen_drawing")}
        </button>
      </div>}
    </section>
  );
}
