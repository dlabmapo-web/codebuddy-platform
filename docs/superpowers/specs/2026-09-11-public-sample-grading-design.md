# Public sample checks with authoritative grading rules

Date: 2026-09-11  
Status: Implemented behind the `SERVER_SAMPLE_CHECKS` academy rollout flag (off by default); see "Implementation status" at the end. Capacity measurement and browser E2E remain before broad enablement.

## Goal

Restore useful pass/fail feedback when a student clicks a public Test button on an enhanced-grading exercise. Use Cove's server grading semantics, including its Python comparators, rather than approximating them in JavaScript. This extends the existing Elice compatibility work; it does not claim newly verified parity with Elice's private implementation.

For a problem with five cases, two SAMPLE and three HIDDEN:

- Test 1 checks only the first public case; Test 2 checks only the second.
- Each check displays its output and a meaningful verdict without submitting an answer.
- Submit continues to evaluate the full case set according to the configured continuation and scoring policies. Hidden inputs, expected outputs and comparator definitions stay on the server.
- Passing both samples is practice feedback, not a promise of a passing submission or a final score.

## Prerequisite review: the two reported correctness gaps

The current working tree was inspected on 2026-09-11. Both reported gaps have targeted fixes and their regression suites pass.

### Comparator wait and total deadline — addressed

`packages/api/src/judge/grading.service.ts` now passes an absolute `deadlineAt` to comparison, checks the deadline after execution and comparison, and checks again after progress reporting before finalization. `comparator-pool.ts` expires and removes queued waiters and reduces the comparison budget by time already spent waiting. A caller deadline is distinct from a comparator's own timeout.

Tests cover queued expiry, already-expired requests, shortened comparison budgets, late case results, and delayed final progress reporting.

Scope of this conclusion: the grading deadline starts at the existing claim time, not when the student first clicks Submit. It does not bound initial BullMQ queue time, database commit latency, network delivery, or UI rendering. The final check prevents accepting an already-expired grading run; it does not guarantee that its database transaction finishes before that timestamp. Cleanup may also require bounded additional time. These distinctions must remain explicit in latency reporting.

### Recorded runtime enforcement — addressed

`grading-profile.ts` now supplies `runtimeMismatch`. Before running any enhanced case, `GradingService` compares the stored runner and comparator versions with their reported versions. A mismatch or unknown comparator version produces `RUNTIME_VERSION_MISMATCH`, rather than silently grading with new semantics. The comparator pool learns its version from worker readiness and refuses mixed-version replacements.

Tests cover runner mismatch, comparator mismatch, unknown comparator version, matching versions, and replacement-worker version checks. This is fail-closed compatibility enforcement, not automatic provisioning of old runtimes. Historical work still needs its recorded runtime or an explicit audited regrade with a new snapshot. Version strings also do not by themselves identify every application-code or package change; semantic versions must change when grading semantics change.

### Verification performed

Command:

```sh
pnpm --filter @cove/api exec vitest run src/judge/grading.service.spec.ts src/judge/comparator-pool.spec.ts
```

Result: **75 tests passed across 2 files**. This is focused local verification, not a production load test, browser E2E, full repository validation, or independent Elice comparison.

## Current implementation

- `packages/web/src/lib/workspace/use-sample-runner.ts` runs samples through the browser Python runner.
- `sample-run.ts` compares legacy output locally. For enhanced grading it deliberately returns `unchecked` to avoid claiming that JavaScript reproduces Python comparison semantics.
- The terminal therefore shows output followed by the current checked-on-submit explanation.
- `LearnSampleTestCase` already exposes public position, input, expected output and comparator. Hidden cases are not part of that DTO.
- `useSampleRunner` also supports teacher live views and reports run completion, so changing only the student's button would leave inconsistent monitoring behavior.
- The API already has authenticated learning routes, submission access checks, a sandbox execution abstraction, comparator pool, and separate submission/regrade queues. Reuse these boundaries without creating fake submissions for practice.

## Approach decision

| Approach | Benefit | Limitation |
| --- | --- | --- |
| Server executes and compares the selected public case — recommended | Reuses trusted runner, comparator and case decisions; covers errors and limits | Adds queue/load management and a small asynchronous API |
| Clean browser Python comparator after browser execution | Less server load; closer output matching than JavaScript | Browser runtime, resource limits and timing still differ from official grading |
| JavaScript approximation | Small implementation | Can contradict Submit for Python regex, line handling and other rules |

Use the first approach for enhanced samples. Preserve the current legacy sample path initially. Plain Run remains an interactive browser execution. Do not add a silent local pass/fail fallback when the server is unavailable.

## Student behavior and terminology

Keep the existing public Test buttons beside Run. A public sample check progresses through Queued, Running and a terminal state. Its label explicitly says “Sample check”; it never appears as an official submission.

Display:

- Correct output: “Sample 1 passed. Submit checks all grading cases.”
- Incorrect output: “Sample 1 did not match,” actual output, and the public expected value with its rule label.
- Runtime error: the bounded, sanitized student error, not “wrong answer.”
- Hard time/memory/output limit: the corresponding execution outcome.
- Soft limit: a distinct warning showing that output may match while this case receives a penalty. Do not show a plain green full-pass badge.
- Invalid regex, comparator fault, runtime mismatch or unavailable sandbox: “Sample could not be checked. Try again later.” These are system/authoring errors, never student failures.
- Queue expiry or overall practice deadline: “Sample check timed out. Try again.” Distinguish this from the student's program exceeding a case limit.

For substring and regex rules, label the expected value “Required text” or “Pattern”; do not present a regex as literal expected stdout. Show original output without silently trimming it; comparison applies the configured rule separately. Clearly mark truncated display output.

A check snapshots the editor text at click time. Editing while it runs is allowed, but the result is labeled as belonging to the earlier code. Navigation or a newer check must not let an older response overwrite the current terminal. Use a run ID and code revision/hash to bind updates.

No public cases means no public Test buttons and a short explanation. Do not convert a hidden case into a sample. “Run all samples” is outside the first release; individual checks satisfy the current request.

## API and ownership

Add typed oRPC operations under `learn`: `startSampleCheck`, `getSampleCheck`, and `cancelSampleCheck`. Names are proposed, not existing endpoints.

Start input: academy ID, class ID, material ID, public case position, source code, workspace revision, and client request ID. Reuse existing source-size/language validation. Never accept expected output, comparator, limits, a student ID, or awarded weight from the client.

Start returns an opaque check ID, status, server-computed code hash and exercise revision. Read returns that identity plus status and, when terminal, the public result. Cancel is idempotent for the owner.

Use `studentAuthenticated` and reuse the relevant academy permission and assigned-course/class/material access checks from learning/submission services. Factor those access checks if needed; do not invoke Submit or enforce its attempt counter for practice. Apply current content availability rules, but practice does not consume an attempt even when official attempts are exhausted. Reauthorize reads and cancellation; possession of a check ID is not authorization.

Selecting a hidden/nonexistent position, another academy's material, or another student's check must return a non-disclosing error. Never load hidden definitions into a client response. Requests with a stale workspace revision return a refresh-required conflict, preventing a reordered position from selecting a different case.

An atomic deduplication key scoped to the authenticated student and client request ID prevents double-click duplicate jobs. Reusing it with different content returns conflict. Keep the deduplication record for the same lifetime as the job/result.

## Immutable practice snapshot and result

At acceptance, build a server-owned snapshot of only the selected SAMPLE case, its exercise grading profile, effective limits, semantic version and runtime identities. Capture it consistently with the exercise revision. The job never reads a newer comparator midway through execution.

Reuse existing policy validation and `runtimeMismatch` before execution. A change after acceptance does not mutate a running check. On read, recheck access and current public visibility; if the case was removed or hidden, withhold case details and require refresh. A stable case identity or a revision-bound lookup must prevent position reuse from exposing a different case. Already-delivered public data cannot be recalled.

Result fields: check ID, snapshot revision, code hash, lifecycle, case outcome, output-match state where available, soft-limit state, bounded stdout/stderr, queue duration, execution duration, comparison duration, and a safe failure code. Include the public rule/expected value only after the visibility check. Internal paths, credentials, engine stack traces and hidden-case aggregates are excluded.

Do not return a percentage score for one sample. Do not renormalize a sample's weight to 100, or expose hidden weights merely to compute a practice score. Weighted scoring remains part of Submit.

## Shared execution logic

Extract the smallest reusable enhanced single-case evaluator from the existing grading orchestration. Both official grading and sample checking call it with a trusted immutable profile, case, code and absolute deadline. It performs execution, comparison, runtime/limit decisions and soft-limit classification. Submission aggregation, points and database finalization remain in `GradingService`.

The sample service must never call `GradingService.grade` with a fabricated submission. It must never write Submission, answer history, best score, solved status, streak, points or attempt counters. Practice metrics and teacher run telemetry are allowed and must be labeled as practice.

Execute in the existing isolated sandbox, not the API process. Compare in the clean comparator pool, never in a student-controlled interpreter. Compare complete output up to the execution output limit before applying a smaller display cap.

## Queue, deadlines and cleanup

Use a separate ephemeral BullMQ sample queue backed by the existing Redis deployment. Keep snapshots/results server-side, expire terminal records after 15 minutes, and expire abandoned job data no later than 20 minutes after acceptance. Reads after expiry return an explicit expired state. Do not log source or expected output by default.

Initial configurable admission defaults: one outstanding sample check per student, six accepted checks per minute per student, and 50 outstanding sample checks per academy. Reject excess work with a retry delay; these are proposed starting limits, not measured VPS capacity. Idempotent retries do not consume another admission token.

Use a 10-second maximum queue wait. After dispatch, use the exercise's configured total grading limit for this one-case practice run. The absolute execution deadline includes sandbox acquisition, execution and comparator acquisition/comparison. Record queue time separately. Check expiry at admission to each worker resource and immediately before accepting a final verdict. Never extend deadlines on automatic retry; run crashed jobs to an infrastructure-error terminal state rather than replaying student code automatically in the first release.

A separate queue alone does not isolate resources: submission, regrade and sample workers share execution/comparison capacity. Introduce a shared admission limit across those consumers. Start sample concurrency at one, reserve at least one execution slot for official submissions when total capacity exceeds one, and cap combined background work so regrades plus samples cannot consume the reservation. With only one execution slot, dispatch samples only while official work is absent; already-running work may delay a new submission by at most its remaining bounded run. Apply equivalent bounded admission to comparator work.

Stop/cancel removes queued work. Running cancellation must propagate a request ID to the execution layer or retain its occupied slot until the bounded run and cleanup finish. Never mark capacity free merely because the browser stopped polling. If immediate runner cancellation is unavailable in the first release, show “Stopping” until completion and document that bounded behavior. Expired comparator waiters must be removed, using the newly fixed deadline mechanism.

Polling every second while queued/running is sufficient initially. Stop polling on a terminal state, expiry or navigation. No persistent database job model or new streaming transport is required for this feature.

## Author and staff controls

- Managers and team leads use the existing exercise editor to select SAMPLE/HIDDEN and set supported comparator/limit/weight fields. No separate duplicate sample configuration.
- Do not add student-controlled limits or comparator selectors. A public check uses the author's saved policy.
- Teachers' live monitoring shows the student's practice run with its check ID and verdict, separated from official results. Do not send public-run events through the official submission channel.
- A teacher's existing local copy may continue interactive execution, but must not claim enhanced server-verified pass/fail. A separate authorized staff sample-check entry point can be added later; do not bypass student authorization by impersonating the student.
- Head-office operations may see aggregate queue delay, errors and saturation using existing authorized monitoring patterns. This feature grants no new access to student code or academy content.

## Implementation order

1. Preserve the passing deadline/runtime regressions. Extract and test the shared single-case evaluator while keeping official grading behavior unchanged.
2. Add shared sample-check contracts, consistent revision-bound sample snapshots, access checks, Redis retention and idempotent admission.
3. Add sample worker, shared capacity reservation, deadline propagation and bounded cancellation/cleanup. Wire dependencies through existing oRPC and judge composition points.
4. Extend the workspace run model and `useSampleRunner` to choose legacy local versus enhanced server checking. Preserve interactive Run and teacher monitoring. Add translated terminal states in existing locales and avoid reporting unchecked/fault states as zero correct student answers.
5. Add an academy-scoped rollout flag. Enable only after authorization, shared-capacity and browser checks pass. Disabled enhanced checks retain the honest current unchecked behavior.

## Acceptance tests

### Correctness and privacy

- Fixture with two public and three hidden cases: each Test executes exactly its selected public case; Submit still evaluates the configured full set. Hidden sentinel strings never occur in any sample response, event or browser payload.
- Parameterize each currently supported comparator over shared sample/official evaluation: equal output, whitespace and line boundaries, Unicode, substring direction, regex search semantics, invalid pattern and comparator timeout.
- Test EOF for empty input, trailing newline, no trailing newline and `sys.stdin.read()`; UTF-8 split writes; stderr; runtime error; hard resource limits; soft penalty; output truncation.
- Version mismatch or unknown runtime executes no student code and creates no student failure/attempt.
- Queue expiry removes work; deadline reached during comparator waiting, comparison or progress reporting cannot produce a passed result. Cleanup does not release capacity early.
- Check all authorization dimensions, ownership on polling/cancel, hidden IDs, stale revisions, visibility changed after acceptance and case position reuse.
- Assert zero writes to official grade/progress/points/attempt tables on success, mismatch, cancellation, retry and infrastructure failure.

### Browser behavior

- As a student, Test 1 shows queued/running then pass; incorrect code shows mismatch with the public rule and output. Submit remains a separate action.
- Editing during a run labels old results; overlapping/stale responses do not overwrite a new run. Double clicks create one job.
- Stop, navigation, reconnect, expired results and server outage have clear bounded behavior. Plain Run still accepts interactive input.
- Weighted sample success never displays a final 100% score. Teacher monitoring preserves practice identity and does not mistake a system fault for a student's incorrect answer.

### Capacity and rollout

Measure mixed traffic: simultaneous official submissions, sample checks and a regrade. Record p50/p95/max queue and end-to-end times, rejection counts, CPU/RSS, live runner count and comparator saturation. Assert configured concurrency, reservations, output caps and cleanup bounds. Do this in a representative test environment before enabling broad server practice traffic.

Do not promise 2–3-second results from this design. Establish a measured baseline and an explicit deployment-specific latency target before increasing concurrency. Roll back the feature flag if sample traffic materially degrades official grading; retain diagnostic metrics without student source.

## Completion boundary

Complete when enhanced public Test buttons provide server-evaluated case feedback, hidden cases remain private, official grading state is untouched, both paths reuse the same versioned case semantics, and the acceptance checks pass. Matching rules does not guarantee identical timing between practice and a later submission, nor full marks on unseen tests.

## Implementation status (2026-09-11)

Implemented as designed, in the design's order. Where a choice was left open, it is recorded here.

- **Shared evaluator:** `judge/case-evaluator.ts` holds the enhanced per-case rules — execution, comparison, the absolute deadline across both waits, and soft-limit classification. `GradingService` and the sample runner both call it; official grading's tests are unchanged.
- **Contracts:** `learn.startSampleCheck`, `getSampleCheck` and `cancelSampleCheck` (`shared/src/content/sample-check.ts`), with six non-disclosing error codes. The learn payload gains `gradingRevision` (the workspace revision) and `serverSampleChecks`.
- **Admission and access:** `learn/sample-check.service.ts` applies Submit's permission, reachability and class-context checks, but never an attempt counter.
  - It snapshots only the selected SAMPLE case, through `gradingSnapshotFor`, together with its resolved limit and runtime identity.
  - A stale revision is `SAMPLE_CHECK_STALE`; a hidden or unknown position is `SAMPLE_CHECK_NOT_FOUND`.
  - Another student's check id reads exactly as an expired one.
  - Reads re-check current access. They withhold the rule (`refreshRequired`) when the revision or the case's visibility changed after the check.
- **Storage:** Redis only (`judge/sample-check.store.ts`), with every state change a Lua script.
  - Admission is one script: request id, one outstanding check per student, and the academy limit.
  - State changes are compare-and-set on status.
  - Active records expire after 20 minutes, finished ones 15 minutes after finishing; a later read is `EXPIRED`.
  - Rate limit: a token bucket per student, which an idempotent retry does not spend.
  - Defaults come from environment settings, as starting limits: 6 per minute, 1 outstanding, 50 per academy.
- **Worker:** `judge/sample-check.runner.ts` on its own BullMQ queue with `attempts: 1`, so student code is never replayed. The order of events:
  - The 10-second wait covers both the queue and the capacity gate.
  - The runtime-version check runs before any student code.
  - The total budget runs from dispatch, and a verdict after it is `TIMED_OUT`.
  - Stop is bounded: queued work is removed, and running work shows `STOPPING` and holds its slot until the run ends, then ends `CANCELLED` with its result discarded.
- **Capacity:** `judge/execution-capacity.ts` is shared by all three consumers.
  - Official grading is counted, never delayed.
  - Regrades and samples together are capped at `total − 1` slots.
  - With one slot, background work is dispatched only while no official work runs.
  - Comparator work is bounded by the same background cap, and deadline-aware comparator waits remove expired waiters.
- **Browser:** `use-sample-runner.ts` picks the path per problem.
  - Legacy problems stay local.
  - Enhanced problems with the flag go to the server: Queued, Running, then the verdict. Pure narration lives in `sample-check-narration.ts`.
  - Output is shown as printed; the rule is labelled by kind; a warning is never a green pass.
  - Results for code edited since the click are labelled, and a navigation aborts polling and cancels the check.
  - The teacher's copy stays local and unverified. Faults and timeouts reach monitoring as `CANCELLED`, never as a wrong answer.
- **Rollout:** `SERVER_SAMPLE_CHECKS` is added to `AcademyFeature` (migration `20260911000000_server_sample_checks`) and to both settings UIs. New academies do not start with it (`academyRolloutFeatures`).

Verified:

- Unit suites for the evaluator's official path, the capacity gate, the runner state machine and the narration.
- `sample-check.integration.spec.ts` against real PostgreSQL, Redis, runner and comparator, with two public and three hidden cases:
  - Test 1 and Test 2 each run only their own case, including the Python-regex `$` rule.
  - Mismatch and crash outcomes; hidden and unknown positions; a stale revision.
  - A double click starts one check; a reused request id with other code conflicts; the second outstanding check is refused; cancel works.
  - Another student learns nothing.
  - Zero writes to submission, case, progress and point tables.
  - The rule is withheld after the case was hidden.
  - The flag switched off gives unavailable.
  - Hidden sentinels appear in no response.

Not yet done, and required before broad enablement:

- The mixed-traffic capacity measurement (p50/p95, RSS, rejections).
- A browser E2E run.
- Immediate cancellation of a running program; running work is bounded, not interrupted.
- A staff sample-check entry point, which remains out of scope.

