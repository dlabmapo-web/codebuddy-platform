'use client';

import { resolveInitialCode, toSharedDocumentText } from '@cove/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { orpc } from '@/lib/orpc';
import { registerDraftFlush } from '@/lib/session/draft-flush';

import {
  localDraftKey,
  promotesReviewBuffer,
  readLocalDraft,
  resolveReviewBuffer,
  resolveSaveState,
  shouldPersistOnHide,
  shouldSyncDraft,
  writeLocalDraft,
  type DraftAction,
  type DraftOwner,
  type DraftSaveState,
} from '../_lib/draft-store';
import {
  createDraftSyncQueue,
  type DraftSendResult,
} from '../_lib/draft-sync-queue';
import { workspaceQueryKey } from './use-exercise-navigation';

/** Long enough that a pause in typing, not a gap between words, triggers it. */
const SYNC_IDLE_MS = 5_000;

/**
 * Which buffer an asynchronous answer is about.
 *
 * Previous/Next swaps the exercise without remounting this hook, so a local
 * read, a save, or a beacon started under one problem can complete while the
 * reader is looking at another. Every one of them carries this, and a
 * completion whose generation has been retired changes nothing on screen —
 * while still being allowed to finish its own work, because the save it
 * carries belongs to the problem it was started for.
 */
type DraftSession = DraftOwner & { generation: number };

export function useDraftAutosave({
  academyId,
  classId,
  userId,
  materialId,
  serverDraft,
  starterCode,
  historicalCode = null,
}: {
  academyId: string;
  /** Authorization and cache context only; never part of a draft's identity. */
  classId: string;
  /** The signed-in learner. A local buffer is addressed by them, not only by the problem. */
  userId: string;
  materialId: string;
  serverDraft: { code: string; updatedAt: string } | null;
  starterCode: string;
  /**
   * A historical submission's code, opened for review.
   *
   * It seeds the editor without becoming the draft: merely opening an old
   * attempt and leaving must not overwrite whatever the student had saved.
   * An explicit edit, a Reset, or a Submit promotes this buffer into the
   * ordinary draft flow. Navigating away and a teacher arriving do not.
   */
  historicalCode?: string | null;
}) {
  const queryClient = useQueryClient();

  // Canonical from the first render. Monaco derives its model's line ending
  // from the text it is given, and a CRLF model exchanges offsets a shared
  // document cannot read — see `lib/monitoring/yjs-monaco`.
  const canonicalStarter = React.useMemo(
    () => toSharedDocumentText(starterCode),
    [starterCode],
  );
  const canonicalServerDraft = React.useMemo(
    () =>
      serverDraft
        ? { ...serverDraft, code: toSharedDocumentText(serverDraft.code) }
        : null,
    [serverDraft],
  );
  const canonicalHistorical = React.useMemo(
    () => (historicalCode === null ? null : toSharedDocumentText(historicalCode)),
    [historicalCode],
  );

  const [code, setCodeState] = React.useState(
    () =>
      resolveReviewBuffer({
        historicalCode: canonicalHistorical,
        draftCode: resolveInitialCode({
          localDraft: null,
          serverDraft: canonicalServerDraft,
          starterCode: canonicalStarter,
        }).code,
        starterCode: canonicalStarter,
      }).code,
  );
  // Until the buffer is touched it is a view of an immutable submission, not
  // work in progress, so nothing syncs and the header reports nothing.
  const [reviewingUntouched, setReviewingUntouched] = React.useState(
    canonicalHistorical !== null,
  );
  const [syncing, setSyncing] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const [everSynced, setEverSynced] = React.useState(canonicalServerDraft !== null);
  // State, not a ref: the save indicator is derived from it during render, and
  // a ref would leave that indicator showing a stale value after a sync.
  const [lastSyncedCode, setLastSyncedCode] = React.useState<string | null>(
    canonicalServerDraft?.code ?? null,
  );

  const codeRef = React.useRef(code);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Created once, because it holds every draft's revision and whatever save is
   * in flight for it — rebuilding it would drop both. It is handed this
   * render's sender below rather than being rebuilt around it.
   */
  const [queue] = React.useState(() => createDraftSyncQueue<DraftSession>());
  // Mirrored for the teardown handler, where a state read would be stale.
  const reviewingUntouchedRef = React.useRef(reviewingUntouched);

  /**
   * Whose buffer this is, as state so that it can be adjusted during render
   * and read by every callback without a ref.
   */
  const [session, setSession] = React.useState<DraftSession>(() => ({
    generation: 0,
    userId,
    academyId,
    materialId,
  }));
  // Async completions and the teardown handler need the session as it is now,
  // not the one they were created under. Mirrored in a layout effect: it runs
  // before anything the browser can interleave, and writing a ref during
  // render is not allowed.
  const sessionRef = React.useRef(session);
  React.useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);
  /**
   * Whether this generation's buffer has been established.
   *
   * A generation counter rather than one mutable flag: the flag could be set
   * by the destination's own initialization and then read by the outgoing
   * problem's in-flight local read, which is exactly the crossing it exists to
   * prevent.
   */
  const hydratedGenerationRef = React.useRef(-1);
  /**
   * The same fact, as state.
   *
   * Collaboration must not hand the server a buffer that local recovery has
   * not finished with: on a cached revisit the editor briefly holds the code
   * the workspace query was cached with, and publishing that as the student's
   * own would overwrite newer work they did on this machine.
   */
  const [hydratedGeneration, setHydratedGeneration] = React.useState(-1);

  /**
   * Previous/Next swaps the exercise without remounting this component, so the
   * draft state has to follow the new material. Adjusting during render is
   * React's documented pattern for reacting to a changed prop — an effect would
   * paint the previous problem's code for a frame first.
   */
  const [trackedHistorical, setTrackedHistorical] =
    React.useState(canonicalHistorical);
  if (trackedHistorical !== canonicalHistorical && canonicalHistorical !== null) {
    // A different attempt was selected for the same problem. Seed the editor
    // with it, still without touching the saved draft.
    setTrackedHistorical(canonicalHistorical);
    setCodeState(canonicalHistorical);
    setReviewingUntouched(true);
  }

  if (
    session.materialId !== materialId ||
    session.userId !== userId ||
    session.academyId !== academyId
  ) {
    // A transition leaves the reviewed attempt behind: the destination is an
    // ordinary workspace with its own draft, under its own identity. Adjusting
    // during render is React's documented pattern for reacting to a changed
    // prop — an effect would paint the previous problem's code for a frame
    // first. Only state is written here; the refs follow in a layout effect.
    const initial = resolveInitialCode({
      localDraft: null,
      serverDraft: canonicalServerDraft,
      starterCode: canonicalStarter,
    });
    setSession({
      generation: session.generation + 1,
      userId,
      academyId,
      materialId,
    });
    setCodeState(initial.code);
    setLastSyncedCode(canonicalServerDraft?.code ?? null);
    setEverSynced(canonicalServerDraft !== null);
    setReviewingUntouched(false);
    setTrackedHistorical(null);
    setFailed(false);
    setConflict(false);
    setSyncing(false);
  }

  /**
   * The revision the destination's buffer is based on.
   *
   * Keyed on the generation rather than on the server draft, so an unrelated
   * re-render cannot quietly reset what this buffer claims to have been edited
   * from — which is the whole of what the server's staleness check reads.
   */
  const basedGenerationRef = React.useRef(-1);
  React.useLayoutEffect(() => {
    if (basedGenerationRef.current === session.generation) return;
    basedGenerationRef.current = session.generation;
    queue.seed(localDraftKey(session), {
      base: canonicalServerDraft?.updatedAt ?? null,
      lastSynced: canonicalServerDraft?.code ?? null,
    });
  }, [canonicalServerDraft, queue, session]);

  React.useEffect(() => {
    codeRef.current = code;
  }, [code]);

  React.useEffect(() => {
    reviewingUntouchedRef.current = reviewingUntouched;
  }, [reviewingUntouched]);

  /**
   * A local entry newer than the server's means the last sync never completed,
   * so the student's own machine wins. Runs once per generation, and only while
   * the editor is still untouched — overwriting live typing would be worse than
   * the staleness it fixes.
   */
  React.useEffect(() => {
    // Skipped while reviewing: the student asked for this submission, and a
    // newer local draft replacing it would answer a question nobody asked.
    // Nothing is pending in that case; `hydrated` below says so directly
    // rather than this effect having to announce it.
    if (canonicalHistorical !== null) return;
    let cancelled = false;
    void readLocalDraft({
      userId: session.userId,
      academyId: session.academyId,
      materialId: session.materialId,
    }).then((localDraft) => {
      if (
        cancelled ||
        // A different problem is on screen now, or this generation has already
        // been established by a keystroke that beat the database to it.
        sessionRef.current.generation !== session.generation ||
        hydratedGenerationRef.current === session.generation
      ) {
        return;
      }
      hydratedGenerationRef.current = session.generation;
      setHydratedGeneration(session.generation);
      const resolved = resolveInitialCode({
        localDraft: localDraft
          ? { ...localDraft, code: toSharedDocumentText(localDraft.code) }
          : null,
        serverDraft: canonicalServerDraft,
        starterCode: canonicalStarter,
      });
      if (resolved.source === 'local') {
        setCodeState(resolved.code);
        codeRef.current = resolved.code;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    canonicalHistorical,
    canonicalServerDraft,
    canonicalStarter,
    session,
  ]);

  /* ------------------------------------------------------------- persistence */

  /**
   * Sends one save and reports what the server said.
   *
   * The queue owns ordering and each draft's revision; this owns only what the
   * student is told. The two are separate because the indicator belongs to the
   * problem on screen while a save belongs to the problem it was started for,
   * and conflating them is how an acknowledgement for one exercise moved the
   * other's base revision.
   */
  const send = React.useCallback(
    async (input: {
      session: DraftSession;
      code: string;
      base: string | null;
    }): Promise<DraftSendResult> => {
      const { session: forSession, code: nextCode, base } = input;
      const onScreen = () =>
        sessionRef.current.generation === forSession.generation;
      if (onScreen()) setSyncing(true);
      try {
        const result = await orpc.learn.saveDraft({
          academyId: forSession.academyId,
          materialId: forSession.materialId,
          code: nextCode,
          baseUpdatedAt: base,
        });

        if (result.outcome === 'CONFLICT') {
          // Somebody else's newer work is on the server — another tab, another
          // device, or the teacher helping. Nothing is discarded: this buffer
          // stays exactly as it is and in IndexedDB, and the header says the
          // save did not land.
          if (onScreen()) {
            setConflict(true);
            setFailed(false);
          }
          return { outcome: 'conflict', updatedAt: result.updatedAt };
        }

        // The cached workspace this problem would be revisited with holds a
        // draft snapshot too. Left alone it serves code from before this save
        // for the next minute, and a revisit would open on it.
        queryClient.setQueryData(
          workspaceQueryKey(forSession.academyId, classId, forSession.materialId),
          (cached: unknown) =>
            cached && typeof cached === 'object'
              ? {
                  ...(cached as Record<string, unknown>),
                  draft: { code: nextCode, updatedAt: result.updatedAt },
                }
              : cached,
        );

        // Only the generation that is still on screen may move the indicator.
        // An acknowledgement for the problem the student has left is real, and
        // belongs to that problem alone.
        if (onScreen()) {
          setLastSyncedCode(nextCode);
          setEverSynced(true);
          setFailed(false);
          setConflict(false);
        }
        return { outcome: 'saved', updatedAt: result.updatedAt };
      } catch {
        // The code is already in IndexedDB, so a failed sync costs nothing but
        // cross-device availability. Surfaced, not thrown.
        if (onScreen()) setFailed(true);
        return { outcome: 'failed' };
      } finally {
        if (onScreen()) setSyncing(false);
      }
    },
    [classId, queryClient],
  );

  React.useLayoutEffect(() => {
    queue.setSender(send);
  }, [queue, send]);

  const sync = React.useCallback(
    (forSession: DraftSession, nextCode: string): Promise<void> =>
      queue.enqueue(localDraftKey(forSession), forSession, nextCode),
    [queue],
  );

  /* ------------------------------------------------------------------ edits */

  /**
   * One path for every change to the buffer.
   *
   * Typing, Reset, and a promoted review buffer all write locally and schedule
   * the same save. Reset in particular must not depend on Monaco reporting the
   * change back: `@monaco-editor/react` suppresses its own `onChange` for a
   * programmatic value it wrote itself, so a Reset that only set React state
   * would never reach IndexedDB or the server.
   */
  const applyLocalEdit = React.useCallback(
    (nextCode: string, action: DraftAction) => {
      const canonical = toSharedDocumentText(nextCode);
      hydratedGenerationRef.current = session.generation;
      setHydratedGeneration(session.generation);
      if (promotesReviewBuffer(action)) setReviewingUntouched(false);
      setCodeState(canonical);
      codeRef.current = canonical;
      // Local first: this is what makes typing free.
      void writeLocalDraft(
        {
          userId: session.userId,
          academyId: session.academyId,
          materialId: session.materialId,
        },
        { code: canonical, updatedAt: new Date().toISOString() },
      );

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void sync(session, canonical);
      }, SYNC_IDLE_MS);
    },
    [session, sync],
  );

  const setCode = React.useCallback(
    (nextCode: string) => applyLocalEdit(nextCode, 'edit'),
    [applyLocalEdit],
  );

  const resetTo = React.useCallback(
    (nextCode: string) => applyLocalEdit(nextCode, 'reset'),
    [applyLocalEdit],
  );

  /**
   * Persist now rather than on the idle timer.
   *
   * The action decides what happens to a reviewed attempt the student never
   * edited. Submit promotes it — the code they are about to submit becomes
   * their draft. Navigating away and a teacher arriving do not: neither is a
   * decision to replace the draft with an old submission, and promoting on a
   * watch would rewrite a student's work because somebody looked at them.
   */
  const flush = React.useCallback(
    (action: DraftAction = 'submit'): Promise<void> => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (promotesReviewBuffer(action)) {
        setReviewingUntouched(false);
      } else if (reviewingUntouchedRef.current) {
        // An untouched review buffer is not this student's draft, and this is
        // not an action that makes it one.
        return Promise.resolve();
      }
      return sync(session, codeRef.current);
    },
    [session, sync],
  );

  const flushNow = React.useCallback(() => flush('submit'), [flush]);

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
      const session = sessionRef.current;
      const revision = queue.revisionOf(localDraftKey(session));
      if (
        !shouldPersistOnHide({
          reviewing: reviewingUntouchedRef.current,
          code: current,
          lastSyncedCode: revision.lastSynced,
        })
      ) {
        return;
      }
      const payload = JSON.stringify({
        academyId: session.academyId,
        materialId: session.materialId,
        code: current,
        // A closing tab cannot wait for an answer, so it cannot recover from a
        // refusal. It says what it was based on and the server decides.
        baseUpdatedAt: revision.base,
      });
      const sent = navigator.sendBeacon?.(
        '/api/learn/draft-beacon',
        new Blob([payload], { type: 'application/json' }),
      );
      if (!sent) void sync(session, current);
    };

    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queue, sync]);

  // An untouched reviewed submission is not unsaved work, so the header stays
  // quiet rather than claiming the student has changes they never made.
  const dirty =
    !reviewingUntouched && shouldSyncDraft({ code, lastSyncedCode });
  const saveState: DraftSaveState = resolveSaveState({
    dirty,
    syncing,
    failed,
    conflict,
    everSynced,
  });

  const acceptCollaborationSnapshot = React.useCallback(
    (snapshot: { code: string; updatedAt: string }) => {
      // A durable revision belongs only to the exact buffer it acknowledges.
      // Unsent edits keep their old base and recovery copy instead of gaining
      // permission to replace a newer server snapshot.
      if (snapshot.code !== codeRef.current) return;
      queue.seed(localDraftKey(session), {
        base: snapshot.updatedAt,
        lastSynced: snapshot.code,
      });
      setLastSyncedCode(snapshot.code);
      setEverSynced(true);
      setConflict(false);
    },
    [queue, session],
  );

  return {
    acceptCollaborationSnapshot,
    code,
    setCode,
    resetTo,
    flushNow,
    /** Navigation and a teacher arriving: persist, but promote nothing. */
    flushWithoutPromoting: React.useCallback(
      () => flush('navigate'),
      [flush],
    ),
    /**
     * Whether the buffer on screen is this student's draft rather than an old
     * submission they are only reading. Exposed because collaboration must not
     * publish a review buffer as their work.
     */
    reviewing: reviewingUntouched,
    /**
     * Whether this problem's buffer is settled — local recovery has answered,
     * or the student has already typed. Collaboration waits for it.
     */
    hydrated:
      // A reviewed attempt is exactly the buffer that was asked for: there is
      // no local recovery outstanding for it to be overtaken by.
      canonicalHistorical !== null || hydratedGeneration === session.generation,
    /** What the server holds instead, when a save was refused as stale. */
    conflict,
    saveState,
  };
}
