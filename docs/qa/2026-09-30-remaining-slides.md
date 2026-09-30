# Remaining slides QA — implementation and review

Branch: `fix/login-auth-qa`. Development verification only; no production deployment.

## Implemented

- **43, single-answer quizzes:** question-type selector; 2–10 stable-ID choices; one correct answer; optional explanation; preview; learner radio choices, draft recovery, submission, retry and previous/next navigation. Quiz answers take a native grading path and are never executed as Python. The existing transaction records verdict, progress and first-solve points. The authoring answer key is excluded from learner bootstrap; feedback is disclosed only after a completed verdict. Each attempt freezes the question, choices and answer key. Teacher reviews show the frozen choices rather than an answer ID in a Python editor. Existing question types cannot be silently converted. Quiz definitions survive library copying; the programming-only workbook refuses to overwrite them.
- **40, social sign-in:** Google and Naver are default-off deployment gates, enforced by server actions as well as the button list. Build arguments and release configuration carry the flags. Existing provider implementations are retained for explicit future enablement.
- **11, multiple campuses:** this is an intentional membership capability. Added a regression proving that a manager in one campus cannot use that role in another campus where they are only a teacher, or in a campus with no membership. No memberships were revoked.
- **Memory enforcement:** replace macOS resident-only measurements with the OS physical-footprint ledger, and count RSS plus swap on Linux. Compressed/swapped allocations remain charged. Measurements fail closed when unavailable. The original allocation assertion is unchanged.

## Review corrections

- JSONB object-key ordering must not invalidate quiz progress. Compare normalized choices and answer IDs; changing only the explanation leaves earned progress intact.
- Do not mark a quiz as missing Python tests in academy/platform health checks.
- Stop the Python workspace and use route navigation when switching between programming and quiz questions.
- Preserve quiz definitions in regrade snapshots and copied library courses.
- Teacher live previews show quiz choices/results instead of Python editing and execution controls. Quiz choices are not collaboratively editable.
- Block old clients from accidentally dropping the quiz definition on save.

## Verification

- Browser: created `QA — Single-answer logic quiz` through the localhost authoring form in the development Manual Testing Sandbox. Save was disabled until all choices and the correct answer were present.
- Development integration: the real queue graded a wrong choice as FAILED / 0 and the correct choice as PASSED / 100. Both returned frozen quiz feedback; progress became SOLVED with two attempts. Fixture material: `2bd45468-f94f-46a9-865e-c7527bbe36cc`.
- Applied migration `20260930180000_single_answer_quizzes` only after checking the database is the documented development Supabase project. Production was not touched.
- Runtime/comparator/memory telemetry: 110 passed. The previously intermittent allocation test then passed three additional independent runs, without weakening its limit or assertion.
- Web full suite: 1,184 passed before final focused additions.
- Shared full suite: 846 passed before the JSONB comparison regression; that focused suite subsequently passed all four checks.
- Focused API suite: 279 passed, including grading, submissions, authoring, import, regrade, review, membership and monitoring. Final authoring/membership subset: 43 passed.
- Final web regression subsets: 83 authentication/draft/collaboration checks and 10 live-result checks passed. API, web and judge-worker typechecks passed. Targeted web lint has no errors (three existing auth-file ignore warnings).
- i18n: 122 passed; catalog extraction reported no stale keys or copy markers.

## Browser acceptance still required

Chrome repeatedly timed out or displayed a blank renderer; an independent Safari session also stalled at the loading screen. The user was asked to reconnect Chrome and complete any login security check. Do not equate the service-level checks with completed paired-browser acceptance.

- **19 and 27:** existing presence recovery and cursor regressions pass; paired teacher/student browser acceptance remains pending.
- **43:** authoring and real grading/progress verified; complete native learner interaction/reload/history acceptance remains pending.
- **44:** Elice grading reference inspected and the integrated grading tests pass; final localhost authoring/run/result browser comparison remains pending.

No new deck completion markers were added for these pending browser checks.

## Runtime note

On macOS, the development judge now requires Xcode Command Line Tools to build a small, parent-owned `libproc` reader in a private temporary directory. Production Linux uses `/proc` and needs no compiler. Sampling remains a process-growth limit, not a replacement for the production sandbox/container boundary. Apple's [physical-footprint definition](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/task.c) includes compressed anonymous memory; this closes the resident-only accounting gap observed on the memory-pressured development machine.
