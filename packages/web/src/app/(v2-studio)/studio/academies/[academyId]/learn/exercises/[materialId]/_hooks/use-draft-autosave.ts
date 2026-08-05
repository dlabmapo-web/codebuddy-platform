'use client';

import { resolveInitialCode } from '@cove/shared';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  readLocalDraft,
  resolveSaveState,
  shouldSyncDraft,
  writeLocalDraft,
  type DraftSaveState,
} from '../_lib/draft-store';

/** Long enough that a pause in typing, not a gap between words, triggers it. */
const SYNC_IDLE_MS = 5_000;

export function useDraftAutosave({
  academyId,
  materialId,
  serverDraft,
  starterCode,
}: {
  academyId: string;
  materialId: string;
  serverDraft: { code: string; updatedAt: string } | null;
  starterCode: string;
}) {
  const [code, setCode] = React.useState(
    () =>
      resolveInitialCode({ localDraft: null, serverDraft, starterCode }).code,
  );
  const [syncing, setSyncing] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [everSynced, setEverSynced] = React.useState(serverDraft !== null);
  // State, not a ref: the save indicator is derived from it during render, and
  // a ref would leave that indicator showing a stale value after a sync.
  const [lastSyncedCode, setLastSyncedCode] = React.useState<string | null>(
    serverDraft?.code ?? null,
  );

  const codeRef = React.useRef(code);
  const lastSyncedRef = React.useRef<string | null>(serverDraft?.code ?? null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = React.useRef(false);

  /**
   * Previous/Next swaps the exercise without remounting this component, so the
   * draft state has to follow the new material. Adjusting during render is
   * React's documented pattern for reacting to a changed prop — an effect would
   * paint the previous problem's code for a frame first.
   */
  const [trackedMaterialId, setTrackedMaterialId] = React.useState(materialId);
  if (trackedMaterialId !== materialId) {
    setTrackedMaterialId(materialId);
    const initial = resolveInitialCode({
      localDraft: null,
      serverDraft,
      starterCode,
    });
    setCode(initial.code);
    setLastSyncedCode(serverDraft?.code ?? null);
    setEverSynced(serverDraft !== null);
    setFailed(false);
    setSyncing(false);
  }

  React.useEffect(() => {
    codeRef.current = code;
  }, [code]);

  /**
   * The beacon handler runs during teardown, where reading state would be
   * stale, so the synced marker is mirrored into a ref. Written in an effect
   * rather than during render — the render-time adjustment above only touches
   * state.
   */
  React.useEffect(() => {
    lastSyncedRef.current = lastSyncedCode;
  }, [lastSyncedCode]);

  /**
   * A local entry newer than the server's means the last sync never completed,
   * so the student's own machine wins. Runs once, and only while the editor is
   * still untouched — overwriting live typing would be worse than the staleness
   * it fixes.
   */
  React.useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    void readLocalDraft(materialId).then((localDraft) => {
      if (cancelled || hydratedRef.current) return;
      hydratedRef.current = true;
      const resolved = resolveInitialCode({
        localDraft,
        serverDraft,
        starterCode,
      });
      if (resolved.source === 'local') setCode(resolved.code);
    });
    return () => {
      cancelled = true;
    };
  }, [materialId, serverDraft, starterCode]);

  const sync = React.useCallback(
    async (nextCode: string) => {
      if (!shouldSyncDraft({ code: nextCode, lastSyncedCode: lastSyncedRef.current })) {
        return;
      }
      setSyncing(true);
      try {
        await orpc.learn.saveDraft({ academyId, materialId, code: nextCode });
        // The ref mirrors the state for the beacon handler, which runs during
        // teardown where a state read would be stale.
        lastSyncedRef.current = nextCode;
        setLastSyncedCode(nextCode);
        setEverSynced(true);
        setFailed(false);
      } catch {
        // The code is already in IndexedDB, so a failed sync costs nothing but
        // cross-device availability. Surfaced, not thrown.
        setFailed(true);
      } finally {
        setSyncing(false);
      }
    },
    [academyId, materialId],
  );

  const onChange = React.useCallback(
    (nextCode: string) => {
      hydratedRef.current = true;
      setCode(nextCode);
      // Local first: this is what makes typing free.
      void writeLocalDraft(materialId, {
        code: nextCode,
        updatedAt: new Date().toISOString(),
      });

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void sync(nextCode);
      }, SYNC_IDLE_MS);
    },
    [materialId, sync],
  );

  const flushNow = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return sync(codeRef.current);
  }, [sync]);

  /**
   * A closing tab never runs an async handler to completion, so the last edit
   * is handed to `sendBeacon`, which the browser delivers after teardown.
   */
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const current = codeRef.current;
      if (!shouldSyncDraft({ code: current, lastSyncedCode: lastSyncedRef.current })) {
        return;
      }
      const payload = JSON.stringify({ academyId, materialId, code: current });
      const sent = navigator.sendBeacon?.(
        '/api/learn/draft-beacon',
        new Blob([payload], { type: 'application/json' }),
      );
      if (!sent) void sync(current);
    };

    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [academyId, materialId, sync]);

  const dirty = shouldSyncDraft({ code, lastSyncedCode });
  const saveState: DraftSaveState = resolveSaveState({
    dirty,
    syncing,
    failed,
    everSynced,
  });

  return { code, setCode: onChange, resetTo: setCode, flushNow, saveState };
}
