"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoCheckpoint, VideoProgress } from "@cove/shared";
import { videoApi } from "@/lib/video-api";
type Sample = Pick<
  VideoCheckpoint,
  "positionMs" | "rate" | "playing" | "seeking"
>;
export function useVideoProgress(
  target: {
    academyId: string;
    materialId: string;
    assetId: string;
    classId?: string;
    enabled: boolean;
  },
  initial: VideoProgress | null,
) {
  const [progress, setProgress] = useState(initial),
    [error, setError] = useState("");
  const startedAt = useRef(0);
  const [sessionRetry, setSessionRetry] = useState(0);
  const opening = useRef<{
    key: string;
    promise: Promise<VideoProgress>;
  } | null>(null);
  const session = useRef<VideoProgress | null>(null),
    queue = useRef<
      Array<Sample & { elapsedMs: number; payload?: VideoCheckpoint }>
    >([]),
    sending = useRef(false),
    active = useRef(true);
  useEffect(() => {
    let alive = true;
    active.current = true;
    session.current = null;
    queue.current = [];
    if (target.enabled && target.classId) {
      const key = `${target.academyId}:${target.materialId}:${target.assetId}:${target.classId}:${sessionRetry}`;
      if (opening.current?.key !== key)
        opening.current = {
          key,
          promise: videoApi.session({
            academyId: target.academyId,
            materialId: target.materialId,
            classId: target.classId,
          }),
        };
      void opening.current.promise
        .then((p) => {
          if (alive) {
            startedAt.current = performance.now();
            session.current = p;
            setProgress(p);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    }
    return () => {
      alive = false;
      active.current = false;
    };
  }, [
    target.academyId,
    target.materialId,
    target.assetId,
    target.classId,
    target.enabled,
    sessionRetry,
  ]);
  const flush = useCallback(async () => {
    if (sending.current || !session.current || !target.classId) return;
    sending.current = true;
    try {
      while (queue.current.length && session.current) {
        const head = queue.current[0];
        head.payload ??= {
          academyId: target.academyId,
          materialId: target.materialId,
          classId: target.classId,
          assetId: target.assetId,
          sessionId: session.current.sessionId!,
          sequence: session.current.sequence + 1,
          ...head,
        };
        const p = await videoApi.checkpoint(head.payload);
        // A class/asset change may have opened another session while this request was pending.
        if (session.current?.sessionId !== head.payload.sessionId) break;
        session.current = p;
        queue.current.shift();
        if (active.current) {
          setProgress(p);
          setError("");
        }
      }
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "Progress not yet saved");
    } finally {
      sending.current = false;
    }
  }, [target.academyId, target.materialId, target.assetId, target.classId]);
  const checkpoint = useCallback(
    (sample: Sample) => {
      if (!target.enabled || !session.current) return;
      if (queue.current.length >= 30) return;
      queue.current.push({
        ...sample,
        elapsedMs: Math.round(performance.now() - startedAt.current),
      });
      void flush();
    },
    [flush, target.enabled],
  );
  return {
    progress,
    error,
    ready: !target.enabled || Boolean(progress?.sessionId && session.current),
    checkpoint,
    retry: () => {
      if (!session.current) setSessionRetry((n) => n + 1);
      else void flush();
    },
  };
}
