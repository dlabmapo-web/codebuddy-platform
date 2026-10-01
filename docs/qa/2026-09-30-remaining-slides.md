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

## Browser follow-up: September 30, 2026

The user signed in as `cove-student` in Chrome and `cove-teacher` in Safari. The following checks were performed through browser UI against localhost and the development database, after the implementation commits were pushed.

### Slide 43 — learner acceptance passed

- Empty selection disables submission; only one radio choice can be selected.
- Submitted the first (wrong) choice: Incorrect, 0/100, correct choice 2 and the explanation displayed; choices lock after grading.
- Retried, selected the second choice, then reloaded: that draft choice was restored.
- Submitted the correct choice: Correct, 100/100.
- Navigated Previous into the Python workspace and Next back into the quiz; the saved quiz choice survived and the course outline showed the quiz as Solved.
- Answer records listed both new attempts. Opening the earlier wrong attempt showed its original selected first choice and 0 score, rather than the later correct answer.
- Browser attempts: wrong `02302db9-56b7-4802-b98e-c17fb80cf810`; correct `cbfe636d-448e-4615-a594-5b84094cbba3`.

### Slide 44 — learner grading comparison passed; authoring acceptance pending

- Inspected the signed-in Elice CH04 problem 5 grader UI and its five methods: exact, contains, does-not-contain, regex match and regex non-match. It showed two 50-point cases, inputs/expectations 42 and 29, with contains and does-not-contain respectively, and 60-second per-case limits. No Elice Save was clicked.
- Opened matching localhost material `f7312054-4ebf-4e6d-9cbe-2f817bfd2afd` in Manual Testing Class.
- Test run of the correct solution printed 42 for the public sample. The browser clearly deferred rule-based grading to submission.
- Correct conditional solution: Accepted, 100/100, 2/2 cases.
- `print(input())`: Not accepted, 50/100, 1/2 cases.
- `print(29)`: Not accepted, 0/100, 0/2 cases; public expected/actual output was visible, while the hidden case showed a verdict only.
- Re-entered the original correct solution in the test account's editor after testing; post-restart persistence was not rechecked because the browser debugger disconnected.
- This is a browser check of the contains/non-contains reference fixture, not a new browser parity run of all five comparators. The automated comparator coverage is listed above.

### Remaining teacher-session blocker

Safari initially showed the authenticated teacher overview, but its My classes route then stalled on Loading or a blank renderer. Refreshing, opening a fresh tab, restarting the local web server, and restarting Safari/restoring its previous tabs did not produce a usable teacher page. The restarted web server logged a successful 200 response for the teacher classes route. A separate Chrome teacher login at 127.0.0.1 remained disabled behind its security check; it was not bypassed. The user was asked to check the visible Safari page.

- **19:** subsequent paired-browser check passed the basic transition: Safari’s Manual Testing Class roster changed Cove Student from Reconnecting / Not in an exercise to Solving / CH04 problem 5 after Chrome opened that exercise. Online and Solving counts both became 1. Controlled disconnect/recovery acceptance is still pending.
- **27:** cursor acceptance remains pending. The teacher live-editor route again showed Loading or a blank renderer, including after Reload Page From Origin. The student’s test help request displayed Waiting; teacher editing was not exercised. The user was asked to refresh the current live-editor tab. No cursor pass is inferred from the successful roster update.
- **44:** final teacher authoring-control acceptance remains pending; learner sample/run/result behavior passed as described above.
- No new deck completion markers were added for these pending teacher-browser checks. No application code was changed during this browser follow-up, and no production deployment occurred.

## Runtime note

On macOS, the development judge now requires Xcode Command Line Tools to build a small, parent-owned `libproc` reader in a private temporary directory. Production Linux uses `/proc` and needs no compiler. Sampling remains a process-growth limit, not a replacement for the production sandbox/container boundary. Apple's [physical-footprint definition](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/kern/task.c) includes compressed anonymous memory; this closes the resident-only accounting gap observed on the memory-pressured development machine.
