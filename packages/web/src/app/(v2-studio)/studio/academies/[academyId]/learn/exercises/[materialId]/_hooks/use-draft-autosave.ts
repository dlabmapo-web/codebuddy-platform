'use client';

import { resolveInitialCode } from '@cove/shared';
import * as React from 'react';

import { orpc } from '@/lib/orpc';
import { registerDraftFlush } from '@/lib/session/draft-flush';

import {
  readLocalDraft,
  resolveReviewBuffer,
  resolveSaveState,
  shouldPersistOnHide,
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
  historicalCode = null,
}: {
  academyId: string;
  materialId: string;
  serverDraft: { code: string; updatedAt: string } | null;
  starterCode: string;
  /**
   * A historical submission's code, opened for review.
   *
   * It seeds the editor without becoming the draft: merely opening an old
   * attempt and leaving must not overwrite whatever the student had saved.
   * The first edit — or a Submit, which flushes first — promotes this buffer
   * into the ordinary draft flow, and autosave takes over from there.
   */
  historicalCode?: string | null;
}) {
  const [code, setCode] = React.useState(
    () =>
      resolveReviewBuffer({
        historicalCode,
        draftCode: resolveInitialCode({
          localDraft: null,
          serverDraft,
          starterCode,
        }).code,
        starterCode,
      }).code,
  );
  // Until the buffer is touched it is a view of an immutable submission, not
  // work in progress, so nothing syncs and the header reports nothing.
  const [reviewingUntouched, setReviewingUntouched] = React.useState(
    historicalCode !== null,
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
  // Mirrored for the teardown handler, where a state read would be stale.
  const reviewingUntouchedRef = React.useRef(reviewingUntouched);

  /**
   * Previous/Next swaps the exercise without remounting this component, so the
   * draft state has to follow the new material. Adjusting during render is
   * React's documented pattern for reacting to a changed prop — an effect would
   * paint the previous problem's code for a frame first.
   */
  const [trackedHistorical, setTrackedHistorical] = React.useState(historicalCode);
  if (trackedHistorical !== historicalCode && historicalCode !== null) {
    // A different attempt was selected for the same problem. Seed the editor
    // with it, still without touching the saved draft.
    setTrackedHistorical(historicalCode);
    setCode(historicalCode);
    setReviewingUntouched(true);
  }

  const [trackedMaterialId, setTrackedMaterialId] = React.useState(materialId);
  if (trackedMaterialId !== materialId) {
    setTrackedMaterialId(materialId);
    // A transition leaves the reviewed attempt behind: the destination is an
    // ordinary workspace with its own draft.
    const initial = resolveInitialCode({
      localDraft: null,
      serverDraft,
      starterCode,
    });
    setCode(initial.code);
    setLastSyncedCode(serverDraft?.code ?? null);
    setEverSynced(serverDraft !== null);
    setReviewingUntouched(false);
    setTrackedHistorical(null);
    setFailed(false);
    setSyncing(false);
  }

  React.useEffect(() => {
    codeRef.current = code;
  }, [code]);

  React.useEffect(() => {
    reviewingUntouchedRef.current = reviewingUntouched;
  }, [reviewingUntouched]);

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
    // Skipped while reviewing: the student asked for this submission, and a
    // newer local draft replacing it would answer a question nobody asked.
    if (historicalCode !== null) return;
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
  }, [historicalCode, materialId, serverDraft, starterCode]);

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
      // The first edit is what promotes a reviewed submission into a draft.
      setReviewingUntouched(false);
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

  /**
   * Persist now rather than on the idle timer.
   *
   * Submit calls this, which is also what promotes a reviewed submission the
   * student never edited: the code they are about to submit becomes their
   * draft, matching the ordinary submit rule exactly.
   */
  const flushNow = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setReviewingUntouched(false);
    return sync(codeRef.current);
  }, [sync]);

  /**
   * §9.3 — an automatic sign-out saves the draft before it ends the session.
   *
   * Registered rather than called from the guard directly: the guard lives in
   * the academy layout and has no way to reach an editor several routes below
   * it, and the registration lasting exactly as long as this hook is mounted
   * means an unmounted editor can never be asked to save.
   */
  React.useEffect(() => registerDraftFlush(flushNow), [flushNow]);

  /**
   * A closing tab never runs an async handler to completion, so the last edit
   * is handed to `sendBeacon`, which the browser delivers after teardown.
   */
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      // Closing the tab on a submission nobody edited saves nothing: the
      // student's own draft is still what belongs on the server.
      const current = codeRef.current;
      if (
        !shouldPersistOnHide({
          reviewing: reviewingUntouchedRef.current,
          code: current,
          lastSyncedCode: lastSyncedRef.current,
        })
      ) {
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

  // An untouched reviewed submission is not unsaved work, so the header stays
  // quiet rather than claiming the student has changes they never made.
  const dirty =
    !reviewingUntouched && shouldSyncDraft({ code, lastSyncedCode });
  const saveState: DraftSaveState = resolveSaveState({
    dirty,
    syncing,
    failed,
    everSynced,
  });

  return {
    code,
    setCode: onChange,
    resetTo: (nextCode: string) => {
      setReviewingUntouched(false);
      setCode(nextCode);
    },
    flushNow,
    saveState,
  };
}
