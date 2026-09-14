# Live monitoring correctness and exercise draft isolation

Date: 2026-09-14
Status: proposed design, reviewed against local source; implementation pending
Source baseline: `ed43923` on `feat/cove-studio-v2`
Scope: student initialization and exercise navigation, shared editor text, and draft persistence

## 1. Report and evidence limits

The user reports two production failures:

1. Student typing appears at another position in the teacher editor.
2. Opening a problem or selecting another problem in the left navigator can show code that does not belong to the selected problem.

The supplied screenshots show the same string-operations exercise. The student displays `hello` on line 3; the teacher displays `#hello` on line 4, with the student caret badge around line 3. This is a text disagreement, not just a different viewport. The captures do not establish identical capture time, actual EOL bytes, event offsets, or the sequence of edits.

The previous spec's `beat1` / `beat2`, line-4-to-line-7 example is a useful synthetic regression, but is not evidence from these screenshots. Remove the claims that a production `rangeOffset: 35` was measured, that the fault can only be offsets, and that teacher binding always precedes sync. Those require runtime evidence. Offset drift depends on characters preceding the edit; it does not always move text a fixed number of lines.

This review inspected local source and installed Monaco 0.56.0. It did not inspect production database contents, establish the deployed commit, or reproduce the screenshots in two live browsers. Findings below distinguish definite code gaps from candidate explanations of the report. No production data repair is authorized by this document alone.

## 2. Current code and findings

Paths below are relative to the repository. Student workspace paths use:
`packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/`.

### A. Line-ending mismatch is a supported failure mechanism

`packages/web/src/lib/monitoring/yjs-monaco.ts`, `bindYTextToMonaco`:

- Seeds student Y.Text from `model.getValue()` without an LF policy.
- Seeds a teacher model with `model.setValue(ytext.toString())`.
- Converts Monaco `rangeOffset` and `rangeLength` directly into Y.Text indices.
- Converts remote indices through `getPositionAt` without verifying text equality.
- Does not pin model EOL or normalize inserted text.

Student `_components/code-editor.tsx` passes controlled `value={code}`. Teacher `live/_components/live-editor.tsx` supplies no value and binds in an effect. If the teacher binds an empty document before receiving CRLF text, its LF model normalizes remote inserted line endings while Y.Text retains CRLF. Later offsets no longer describe the same string.

Installed Monaco's `pieceTreeTextBufferBuilder.js::_getEOL` derives the model EOL from input, and `pieceTreeTextBuffer.js::applyEdits` normalizes inserted line breaks to the buffer EOL. This supports the mechanism, without proving the production documents contained CRLF. Awareness sends line/column separately, so a plausible caret does not prove matching code.

`packages/api/src/monitoring/collaboration-document.service.ts::load` accepts raw draft code or persisted Yjs state. `monitoring.gateway.ts::ensureDraft` copies starter code verbatim. Existing CRLF can therefore reach collaboration. The migration/import history is a population hypothesis, not proof that every migrated exercise is affected or every other import is safe.

Read-only monitoring may display divergent text without corrupting the authoritative string. A subsequent edit using mismatched offsets can modify the wrong characters and persist damage. Distinguish these cases.

### B. Student collaboration is not isolated per exercise

`packages/web/src/lib/monitoring/use-student-monitoring.ts` creates a single `Y.Doc` in a state initializer. Changing `materialId` updates presence but does not replace this document or synchronously detach the old binding.

- `onWatchStarted` accepts a draft without checking the event's material/class against the active workspace.
- `onSynced` and `onUpdated` apply updates without checking `draftId`.
- `onWatchEnded` detaches the binding but retains the document and its history.
- `bindEditor` only runs on sync; if Monaco mounts after sync, `registerEditor` does not complete binding.
- `seed: model` replaces all shared text on first bind when strings differ.

`_hooks/use-exercise-navigation.ts` deliberately preserves the workspace, editor, and worker across sidebar, Previous/Next, and browser-history transitions. `_components/workspace.tsx::beforeCommit` flushes the draft and resets run/result state, but does not detach monitoring before changing editor code.

Consequences to reproduce: B's controlled value can be observed by A's still-attached binding; a late A update can modify B's editor; a later watch can merge independent A/B CRDT histories. Server room authorization cannot repair a client that labels the wrong document's bytes with an authorized draft ID.

The teacher hook already replaces documents on draft changes and filters document updates. Reuse that principle, not an assumption that the student implementation is equivalent. Teacher watch-start acknowledgements also need request-generation guards; existing sync-ack visit checks do not guard every watch-start completion. `watchEnded` currently lacks draft/visit identity in the gateway payload, so client filtering alone cannot fully solve stale endings.

### C. Initial code has multiple legitimate sources and insufficient local ownership

`packages/shared/src/content/learn.ts::resolveInitialCode` selects the newer local/server draft, then whichever exists, then starter code. `_hooks/use-draft-autosave.ts` separately gives an explicitly selected historical submission precedence. Thus code differing from starter code is not inherently a bug: saved work must win for the correct owner and problem.

`_lib/draft-store.ts` uses the origin-wide `cove-learn` database with only `materialId` as key. The API uses `userId_materialId`. Two accounts using the same browser profile can therefore select each other's local buffer for the same problem. This explains wrong initial code as a separate possible cause; it is not proof of this user's exact incident.

Autosave adjusts material state during render and cancels obsolete local reads, which are useful existing safeguards. However, in-flight `sync` completions can still update shared saved-state refs after the material changes. Saves can overlap, with no client serialization. `resetTo` only sets React state: it does not explicitly write IndexedDB or schedule persistence, so Reset durability must not depend on Monaco producing an onChange callback.

Navigation caches complete workspaces, including drafts, for 60 seconds; save does not update that workspace query. A revisit can initially consume stale server code and await IndexedDB hydration. Hydration must not race first collaborative seeding or allow an obsolete response to replace current typing.

### D. Plain draft and CRDT have independent writers

`packages/api/src/learn/learn.service.ts::saveDraft` upserts plain `ExerciseDraft.code`. It does not reconcile the collaboration service or stored Yjs state. `CollaborationDocumentService.load` prefers stored Yjs state over that plain snapshot; `flush` writes CRDT text back to the draft.

Therefore unwatched edits can leave collaboration history stale, and a later collaboration flush can overwrite a more recent HTTP save. Student model seeding can mask this in some arrival orders; it is not a persistence contract. The background `onBeforeCollaborate` flush is deliberately not awaited, so it does not establish ordering.

Additional service lifecycle gaps relevant to losing code:

- Concurrent cold `load` calls can construct different documents for the same draft before either is cached.
- Updates arriving during an asynchronous flush can be followed by unconditional `dirty = false`, obscuring newer unsaved edits.
- `release` destroys a document even if its attempted flush failed.

These are code-level risks, not claims that each caused this report. They belong in the persistence work because a display-only fix cannot guarantee saved student work.

## 3. Options and decision

1. **LF-only patch:** smallest patch, addresses one supported mechanism; leaves navigation contamination and competing persistence writers. Insufficient for the reported scope.
2. **LF policy plus explicit exercise sessions and coordinated persistence — recommended:** retain fast navigation and Pyodide reuse, isolate editor/document ownership, and make snapshots follow one draft authority. More lifecycle tests, but covers both reports.
3. **Full workspace reload on every selection:** simplifies some component lifetime issues at a performance cost; does not fix local account collisions, EOL offsets, or competing saves. Useful only as a temporary mitigation if separately chosen.

Implement option 2 in separable changes under this one correctness spec. No unrelated layout redesign, grading change, or wholesale replacement of Yjs.

## 4. Required behavior and invariants

1. For a synchronized session, student Monaco, teacher Monaco, and server Y.Text represent the same LF-only UTF-16 string. Selection and offsets describe that string.
2. Every editable buffer, async callback, binding, and save belongs to an explicit owner/material session. A CRDT never changes draft identity.
3. Changing the statement, title, selected navigator row, code, and session identity is one logical transition. Old collaboration is detached before destination code enters Monaco.
4. Opening a problem uses only that signed-in learner's draft for that material. Existing empty code remains an intentional empty draft. Starter code is used only when no draft exists, or on explicit Reset.
5. Saved means the current revision is durable. An old completion cannot mark newer work saved, and navigation cannot discard a failed outgoing save's local recovery buffer.
6. Watching or reconnecting does not silently replace current student edits or promote an untouched historical submission into the active draft.

## 5. Proposed changes

### 5.1 Canonical text

Add a shared `toSharedDocumentText` helper with `value.replace(/\r\n?/g, "\n")`, preserving lone CR as a line break. Apply it to starter/draft ingress, Reset, local hydration, initial model values, and server plain-text save/creation boundaries.

Pin bound Monaco models to LF before offset-sensitive work and after full model replacement. Normalize local inserted text and handle EOL-only events explicitly. While bound, prohibit independent whole-model writes except a deliberate session operation such as Reset. Use binding-specific transaction origins; two bindings in a same-document unit harness must not both ignore the other's edits because they share the module-wide `localOrigin` symbol.

Repair existing CRDT line endings in place, from the end toward the beginning: delete CR before LF; replace lone CR with LF. Preserve unaffected CRDT identities. Mark changes dirty and persist them. Do not clear Yjs state or replace the entire document just to normalize EOL.

Load-only normalization is insufficient: cached incoming updates, Redis replication, and merges during flush can introduce CR again. All accepted update paths must enforce the invariant and distribute any repair update to peers and replicas before allowing offset-based editing to resume. Never normalize just the rendered string while leaving its Y.Text different. Use an origin marker to prevent repair echo loops. Existing old browser clients cannot be made safe by server load normalization alone; require refreshed clients at rollout.

### 5.2 Exercise session lifecycle

Introduce a focused session controller with phases `local`, `syncing`, `bound`, and `retired`, identified by owner, academy, class, material, draft when known, and a monotonically increasing local generation.

Before a successful navigation commit:

1. Capture the outgoing buffer and enqueue its save with its immutable owner/material identity.
2. Retire its generation, detach binding/listeners, stop document publishing, and clear its awareness before setting destination code.
3. Initialize the destination's code under its own identity. Preserve the outer workspace and Python worker.
4. Publish destination presence and accept only a matching authorized watch; allocate a fresh Y.Doc for a different draft.

A failed destination fetch leaves the old session intact. Old save requests can finish for their own material but cannot mutate destination UI state. Check generation and identity in sync callbacks, local hydration, editor registration, watch acknowledgements, and teardown.

Complete binding when BOTH the correct snapshot and matching editor are ready, in either order. Make duplicate sync delivery idempotent. Retain same-draft unsent edits across reconnect; do not replace shared text on every sync. First-watch handoff captures the current local revision, establishes it through coordinated persistence, and merges edits made while synchronization was pending. Readiness must cover this handoff before the teacher can edit.

Extend lifecycle events with draft/visit identity where missing, validate shared schemas, and update both gateway and clients. Filter stale watch endings, indicators, run/result/feedback/terminal events using available session identity; add identity to ambiguous payloads. Preserve teacher preview versus live behavior: preview code never binds or writes to the student's document.

### 5.3 Initialization and local recovery

Key local drafts by authenticated stable user ID, academy ID, and material ID. Class remains session/authorization context; do not make separate saved drafts per class when the database's identity is user/material. Resolve user identity before reading local storage.

Do not automatically adopt legacy material-only records: ownership cannot be inferred. Leave them inaccessible to normal hydration; any recovery must be explicit and attributable. Update all draft-store callers, including discard, to use the same key.

Resolve initial code in this order: explicitly requested historical attempt; otherwise correct-owner recoverable local draft versus server draft; otherwise starter code. Keep timestamp precedence initially, but never let a delayed hydration replace edits made after initialization started. Use a generation/revision guard rather than relying only on a mutable shared boolean.

Keep the workspace query's draft snapshot updated or invalidated on successful saves. On a cached revisit, resolve current draft recovery before collaborative binding; do not publish a cached stale buffer as authoritative. Reset uses the same local-write and save pipeline as an edit, with normalized destination starter code.

An untouched historical attempt remains a review buffer. Teacher arrival must not flush/promote it automatically. Explicit edit, Reset, or Submit may promote it according to existing product behavior; navigation alone may not.

### 5.4 One persistence authority per draft

Route HTTP autosave and beacon persistence through a draft coordination boundary shared with collaboration. If CRDT history exists, a plain save must reconcile through that authority rather than update only `code`. While actively collaborating, CRDT updates own edits; stale HTTP snapshots must not overwrite that session. Carry a base revision/session token and reject stale replacement writes with a recoverable conflict response. Do not silently discard rejected work.

Serialize saves per owner/material on the client, retain the latest pending value, and associate saved indicators with the acknowledged revision. Protect against other tabs and delayed beacons on the server as well; client ordering alone is insufficient.

Single-flight cold loads per draft. Track dirty generations through flush: only acknowledge the captured persisted generation; reschedule if newer updates arrived. Keep dirty documents recoverable after a failed release, and define retry/shutdown failure behavior without reporting success or destroying the only copy. Persist text, hash, Yjs state, and revision consistently under the existing transactional lock. Preserve authorization checks on every entry path.

## 6. Regression and acceptance plan

Tests must fail against the relevant existing defect and verify actual text and persisted identity, not only carets or status labels.

### Binding and service tests

- LF, CRLF, lone CR, mixed endings, empty text, Korean text, emoji/surrogate pairs, trailing blank lines.
- Two independent peer documents exchanging encoded updates; student/teacher mounting and syncing in both orders.
- Insert at line 3 and line 4, delete across line breaks, paste multiline text, undo/redo, teacher edits, concurrent non-overlapping edits. Compare complete text after quiescence.
- Real browser Monaco regression in addition to a model double, so the test does not merely mirror assumptions about EOL behavior.
- Existing CRLF Yjs state repair, repeat load after eviction, and round-trip persistence of normalized state/hash/text.
- CR introduced by an incoming update or flush merge: repair converges on every peer.
- Concurrent cold loads, edit during delayed flush, failed release, and retry without lost text.
- Stale plain saves and beacons cannot overwrite later shared revisions. Unwatched editing after a prior watched session reopens with the latest durable code.

### Session, initialization, and navigation tests

- A and B have unmistakably different starter code. Test no draft, server draft, newer local draft, and intentionally empty draft.
- Student types unique A text, selects B through sidebar, Previous/Next, and Back/Forward, then returns to A. Repeat watched and unwatched. Verify both server drafts and CRDTs stay separate.
- Delay A sync/update/end/save/hydration until after B opens; deliver each and assert B is unchanged and A's save only affects A.
- Repeat A→B→A and watcher leave/rejoin; verify no concatenation, duplication, or old CRDT history contamination.
- Sync-before-editor, editor-before-sync, duplicate sync, reconnect, and teacher watch-start responses arriving out of order.
- Two users sharing one browser profile never hydrate each other's code; test legacy key handling and unavailable IndexedDB.
- Reset persists without relying on programmatic Monaco onChange; reload and revisit show the reset code.
- Untouched historical review survives teacher arrival without replacing the draft; explicit promotion still works.
- Fail a destination fetch and a save independently. Preserve the current exercise for the former and recoverable outgoing code for the latter.
- Teacher preview remains isolated, while Return to live opens the current student's current draft.

### End-to-end release gate

Extend `e2e/specs/teacher-live-monitoring.spec.ts` and the exercise-navigation coverage. Use unique per-test fixtures with CRLF starter text and distinct A/B code. Compare full student and teacher editor values and expected strings, then read saved drafts after flush and after reload. Keep existing caret assertions, but do not treat them as text equality. Cover both teacher-to-student and student-to-teacher editing.

Collect a local reproduction trace with material ID, draft ID, session generation, model EOL, text lengths/hashes, and revision markers. Avoid recording real student source code in logs. Reproduce each claimed production mechanism before labeling it a confirmed incident root cause.

## 7. Existing data and rollout

Do not run the previous spec's blanket SQL draft updates. They leave Yjs state/hash inconsistent, can race active saves, and cannot repair already misplaced edits. The old claim that repair order is independent of deployment is withdrawn.

Before implementation writes, read the relevant installed Next.js guides under `node_modules/next/dist/docs/`, as required by `AGENTS.md`. Preserve the fast navigation contract rather than assuming framework navigation remounts every component.

Follow `docs/operations/deployment-guide.local.md` without committing that private guide:

1. Use a dedicated fix branch from `feat/cove-studio-v2`. This spec is prepared on `fix/live-monitoring-workspace-spec`; code work can continue after design review.
2. Reproduce with development-only fixtures. Verify environment targets without printing credentials.
3. Run shared/i18n builds, recursive typecheck/lint/test/build, route lint, i18n checks, and targeted monitoring/navigation e2e. Do not run the production build concurrently with the dev server.
4. Review and merge the completed implementation into `feat/cove-studio-v2` after checks. Select the next unused release tag; do not copy an old example tag from the guide. Follow its deployment approval and health checks.
5. Before data repair, take a recoverable backup/export and inventory affected starter text, plain drafts, and decoded CRDT text using a read-only script. Counts of CR-containing plain rows alone do not measure corrupted work.
6. Deploy with collaboration drained or temporarily disabled, persist pending work, and require client refresh before resuming. A rolling mixture of old and new offset/session behavior is not safe.
7. Normalize stored drafts through an idempotent application repair that uses the same locking and document authority as runtime writes. Update Yjs state, plain text, hash, and revision together. Normalize starter code separately; never reset student code to starter code as repair.
8. Verify a known-CRLF fixture and A/B switching on the deployed version, including reload persistence. Record the release commit and results. Rollback must account for the older client defect and data changes; reverting images alone is not a data rollback.

Already misplaced/deleted text cannot be reconstructed from line endings alone. Preserve original snapshots and assess recoverable backups/submissions with the affected teacher; never bulk replace drafts or promise automatic reconstruction. The actual affected population remains unmeasured.

## 8. Completion criteria

Both reported experiences must be covered: exact student/teacher text agreement and correct problem-specific code on initial entry and navigation. Completion requires the regression matrix above, durable text agreement after reload, and evidence that obsolete events/saves cannot cross session boundaries. LF normalization by itself does not complete this spec.

This change set currently contains documentation only. Production reproduction, implementation, tests of the fix, merge, data repair, and deployment remain future work.
