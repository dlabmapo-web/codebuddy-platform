# Student presence and Safari PDF compatibility

Date: 2026-10-22
Branch: `feat/dlab-os-staff-sso`

## Report and diagnosis

An assigned Manager saw zero online/solving students while a DLAB OS student had an exercise open in Safari. A successful HTTP page response does not establish that its browser WebSocket is connected or has published an activity.

The real local Manager browser connected successfully and showed `Live`. During investigation the roster showed 김학생 online, but without an open exercise. This is not a missing Manager role grant: the existing assigned-class authorization permits Managers holding the inherited Teacher grant.

Three presence gaps were reproduced or identified:

1. Native short-answer, written-response and quiz workspaces did not register their open material with the academy's student presence publisher.
2. The server's material visibility predicate accepted only programming exercises. Publishing a manual activity therefore still appeared as online without solving.
3. The socket cached class enrollments at connection time. A student enrolled after signing in could remain absent from the new class until reconnecting. An isolated browser test reproduced this before the fix.

Class cards also needed an authoritative offline snapshot after the existing 30-second reconnect grace period. Detailed rosters already have expiry handling; the class-card counts do not run a per-student expiry clock.

## Changes

- Manual workspaces publish their verified course, class and material while mounted and clear the material on exit. Preview and staff practice do not publish student solving activity.
- Presence accepts visible programming or manual activities, including visible ancestors. Programming editor/watch authorization continues to require a programming exercise.
- Each presence heartbeat refreshes active student enrollments and the relevant course assignments in one class query. The query requires the current academy, active user and membership, Student role and active class. Removed enrollments clear stale presence.
- The server broadcasts offline class counts after reconnect grace expires, without overwriting a recovered connection.
- The roster offers its live code-editor action only for materials in its coding-exercise list. Code watch-context events also decline manual activities as follow targets. Short answers and quizzes retain their own **Tutoring** review surface.

No role mapping, account password, academy mapping, production environment or database migration is changed by this fix.

## Safari warning

The installed PDF.js version reads its text stream with `for await`. Safari versions without `ReadableStream[Symbol.asyncIterator]` can display the PDF canvas but fail its selectable text layer with the reported `undefined is not a function ... readableStream` warning. This matches the [PDF.js upstream report](https://github.com/mozilla/pdf.js/issues/21557).

A feature-detected iterator uses the existing stream reader when native iteration is absent. It preserves native implementations, serializes reads, releases reader locks on completion/error, cancels on early exit by default, and supports `preventCancel`. The PDF text layer remains enabled. See the [Streams async iteration explanation](https://github.com/whatwg/streams/blob/main/explainers/readable-stream-async-iteration.md).

This warning concerns PDF text rendering. It is separate from the Socket.IO presence transport.

## Manual retest

1. Keep the API on port 4000 and Studio on port 3000 running. Reload both browser pages after the update, once any work has saved.
2. In Chrome, sign in as the assigned Manager and open **My classes**. The connection indicator must say **Live**.
3. In a separate browser, sign in as the enrolled DLAB student. Open the academy dashboard. Expect **1 online / 0 solving** on the Manager's card.
4. Open the assigned coding exercise. Expect **1 online / 1 solving**. Open the live class roster to check the student's coding activity; the live editor remains available to assigned staff.
5. Return to the course. Expect **1 online / 0 solving**.
6. Open a short answer or multiple-choice activity. Expect **1 online / 1 solving**. Review these answers through that activity's **Tutoring** action.
7. Reload the student's activity. Presence should recover without requiring another login.
8. Close the student's Cove tabs. After the existing **30-second reconnect grace**, expect **0 online / 0 solving**. Another open student tab can keep that account online.
9. In Safari, open the exercise's reference PDF and check that its page and selectable text render without a new `readableStream` warning.

Enrollment changes should become visible on the next presence heartbeat (15 seconds). Normal page/activity changes publish immediately after workspace data is available.

## Verification

- Monitoring gateway and presence registry: 72 tests passed, including a manual activity that counts as solving without becoming a code-editor follow target.
- Stream compatibility, PDF canvas and roster: 30 tests passed.
- Web TypeScript: passed.
- API TypeScript and build: passed.
- E2E TypeScript: passed.
- Changed web files: ESLint passed with the two existing ManualWorkspace hook dependency warnings.
- Isolated SSO regression setup: 160 API, 69 shared and 16 web tests passed with one API test worker. A previous parallel attempt hit the default five-second test timeout under machine load; the serial retry used a 30-second timeout.
- The new two-browser WebSocket test passed: post-login enrollment, coding/short-answer/quiz activity changes, reload and offline counts after disconnect grace. Screenshot: `test-results/dlab-sso-Manager-class-car-f7325-g-short-answers-and-quizzes/manager-live-class-counts.png` (copied to `/tmp/cove-manager-live-class-counts.png` before subsequent runs clear test output).
- The existing Manager/Team Lead live-editing regression passed after waiting for the student's live presence. It verifies synchronized code edits, running code, responsive tutoring, and revoked access after unassignment. Its earlier attempt opened the valid saved-code fallback before the student's realtime handshake; rendering the student's **Run** button alone is not a live-presence readiness check.
- Both Chromium workflows passed together against the final implementation (2 tests, 1.7 minutes). Local API health returned HTTP 200 after verification.

The automated browser workflow uses separate student and Manager contexts, real Cove API authorization, real WebSocket transports and disposable PostgreSQL/Redis. OS/Supabase providers are test doubles. It covers enrollment after login, coding → course → short answer → course → quiz, reload and disconnect expiry.

The user's Safari controls became unresponsive during this session; the final Safari text-layer check remains a manual retest. No real student answer was edited or submitted during investigation.
