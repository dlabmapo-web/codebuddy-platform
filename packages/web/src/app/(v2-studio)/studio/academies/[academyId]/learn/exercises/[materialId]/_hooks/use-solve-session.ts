'use client';

import type { SolveSession } from '@cove/shared';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

/**
 * One server-owned sitting with the problem on screen.
 *
 * The workspace clock and the solve time stored on a submission both read the
 * `startedAt` this returns, so what a student watched while working and what
 * their history reports are the same measurement rather than two that happen
 * to agree.
 *
 * A new session per material: stepping to the next exercise or coming back to
 * this one is a new sitting, not a continuation. Repeated submissions without
 * leaving keep the session, and therefore show increasing solve times.
 *
 * A failure is not fatal. The workspace stays fully usable and the submission
 * simply records no solve time — a clock is not worth blocking work over.
 */
export function useSolveSession({
  academyId,
  materialId,
}: {
  academyId: string;
  materialId: string;
}) {
  const [session, setSession] = React.useState<SolveSession | null>(null);

  /**
   * Stepping to another exercise is another sitting. Cleared during render
   * rather than in an effect — the clock must not count the previous problem's
   * origin for even one frame.
   */
  const [trackedMaterialId, setTrackedMaterialId] = React.useState(materialId);
  if (trackedMaterialId !== materialId) {
    setTrackedMaterialId(materialId);
    setSession(null);
  }

  const open = React.useCallback(async () => {
    try {
      const opened = await orpc.learn.startSolveSession({
        academyId,
        materialId,
      });
      setSession(opened);
      return opened;
    } catch {
      setSession(null);
      return null;
    }
  }, [academyId, materialId]);

  React.useEffect(() => {
    let cancelled = false;
    void orpc.learn
      .startSolveSession({ academyId, materialId })
      .then((opened) => {
        if (!cancelled) setSession(opened);
      })
      .catch(() => {
        // Left null: see the note above.
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, materialId]);

  return {
    solveSessionId: session?.solveSessionId ?? null,
    startedAt: session?.startedAt ?? null,
    /** After a rejected session, so the retried submit has a valid one. */
    reopen: open,
  };
}

export type SolveSessionState = ReturnType<typeof useSolveSession>;
