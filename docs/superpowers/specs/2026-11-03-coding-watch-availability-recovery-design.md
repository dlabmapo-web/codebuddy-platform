# Recover coding monitoring after a material transition

Date: 2026-11-03. Scope: the existing all-material monitoring feature branch.
Status: Proposed; awaiting user approval before implementation.
The user requested this spec after observing the failed state in native Safari
(student) and Chrome (monitor). Implementation will begin only after approval.

## Evidence and problem

The captured student presence remained fresh, named the correct coding material,
and had no interruption. The API logged `student.watch.start` refused with
`MONITORING_STUDENT_UNAVAILABLE` twice. Redis contained the general observation
lease (`draftId: null`) but no coding watch. The student had no teacher indicator
and code/pointers were unattached even though the monitor displayed Live.

The exact initial packet ordering was not captured. A watch request during the
temporary absence/non-code material is a supported trigger: `openWatch` resolves
the student's current material, and rejects missing/non-code targets. The client
settles that refusal and only starts another watch on connect or explicit Follow.
Later observation snapshots update the material label without repairing the watch.
The saved-preview header can borrow the observation socket's Live status.

## Decision

Use bounded command recovery plus one recovery opportunity per matching material
availability/source. A timer-only retry misses a student arriving after its budget;
an event-only retry misses availability that arrived before the refusal. Replacing
the two monitoring protocols is a larger change than this defect requires.

1. Keep the generic command helper's default refusal policy. Only watch-start
   opts into retrying `MONITORING_STUDENT_UNAVAILABLE`, using the existing four
   attempts and 1/2/4-second backoff. Access denial and protocol refresh remain
   terminal. Document sync does not inherit availability retries.
2. The coding workspace supplies an advisory availability hint only when the
   active observed material is programming, matches the monitor's selected
   problem, and is neither offline nor reconnecting. Include its source identity.
3. After a settled unavailable refusal, that matching hint permits one additional
   watch-start cycle for the academy/class/student/material/source combination.
   Mark the opportunity consumed before starting. Repeated heartbeats cannot
   create a retry loop. Losing availability resets the opportunity for a later
   return. Do not restart a healthy watch, displace independent reading, replay
   edits into another draft, or retry while switching, recovering pending edits,
   revoked, disconnected, or requiring a protocol refresh. Existing command
   cancellation and generation fences apply.
4. For the currently selected live coding problem, the header uses the coding
   connection and exact synchronized document readiness, including while showing
   its saved preview. A healthy observation socket alone cannot label that code
   session Live. Reading a different saved material retains the observation status.
   If automatic recovery exhausts its budget while the selected problem is
   available, show the existing retry-connection action so recovery never requires
   a browser refresh.
5. Every retry goes through existing server authorization and document sync.
   Pointer sharing and the student indicator resume through their normal watch
   and binding paths. No server grant or visibility rule is relaxed.

## Verification and implementation sequence

- Add an opt-in retry policy and tests for availability recovery, exhaustion,
  cancellation, default refusal, and terminal authorization/protocol errors.
- Test the actual live-workspace hook with a refused start and a late matching
  availability hint. Cover source changes, heartbeat stability, successful
  attachment/sync, unrelated selections, revoked access, and unmount cancellation.
- Test the header's selected-code readiness decision independently.
- Add real browser regressions for Teacher, Team Lead and Manager in Chromium
  and WebKit: monitor chooses coding while the student is on PDF; exhaust the
  initial refused starts; student then opens coding; verify automatic attachment,
  indicator, two-way edits/pointers and no page reload or student socket replacement.
  Repeat after leaving and restoring the cached coding page. Preserve the existing
  all-material suite, including Turtle and pointer expiry.
- Run affected monitoring suites, web lint/typecheck, E2E typecheck and browser
  checks. Use already-built unchanged API artifacts in the diagnostic runner to
  avoid colliding with the user's local Nest watcher. Record native Safari limits
  and any test infrastructure failures separately from application assertions.

No authentication-policy, inactivity-timeout, schema/migration, deployment,
merge, or unrelated UI change is included.

## Acceptance criteria

- A monitor can open coding while the student is still on PDF or between
  materials, then receive the student's coding session automatically once the
  student reaches that selected problem. Neither person refreshes or clicks Follow.
- Recovery works after both a brief transition and an arrival later than the
  initial retry budget, including a cached coding-page return.
- After recovery, the student sees the teacher indicator; edits and mouse
  pointers work in both directions; teacher pointers still hide after three
  seconds; no remote typing-line label reappears.
- The monitor's Live label represents an attached, synchronized coding session
  when that selected problem is the student's current material.
- Repeated heartbeats do not replace a healthy watch or create unlimited retries.
  Selecting another material preserves independent reading and pending edits.
- Revocation, enrollment/course removal and protocol-refresh requirements remain
  enforced; a stale availability hint grants no access.

