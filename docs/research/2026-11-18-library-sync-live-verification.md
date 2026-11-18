# Library sync verification — 18 November 2026

## Environments and scope

Tested the supplied localhost library course `fc6a6426-7e26-452b-8b1b-bf3584ec1498`
and Gangnam DLab copy `717fed1c-4822-4f80-a70a-14bc85fa166d` using the existing
Admin and Manager Chrome profiles. Content writes in this environment were
performed through the product UI. Read-only database/service observations
verified persisted values and notification visibility for the academy's users.

The automated integration and browser suites used disposable Docker PostgreSQL
and isolated localhost services, never the shared development database.
Production content and academy organizations were not changed.

## Results in the supplied course

Added **Sync QA — Notification and merge tests**, containing the explanation
**Sync QA — Three-way explanation**. Its academy title was customized to
**Sync QA — Academy-customized title**. The original 18 materials were not
edited by these tests. The course now contains three lectures and 19 materials.

| Case | Observed result |
|---|---|
| Save a new lecture/material without publishing | Academy copy stayed unchanged; Manager notification panel was empty. |
| Publish additions as one batch | Lecture and explanation arrived in the existing copy automatically, without review notifications. |
| Academy changes title; admin changes body | Academy title survived; admin body synced; no conflicts or notifications. |
| Save an editor opened before that sync | Save was refused with the stale-explanation message; stored content was preserved. |
| Academy and admin change the body differently | Academy wording stayed in place; one body conflict and one grouped course notification appeared. |
| Eligible recipients | Both active Managers and both active Team Leads received the course notification. Four Teachers and 15 Students received none. These per-user checks used `NotificationsService.list` with each user's stored identity. |
| Read the notification | Manager's unread count cleared; the other Manager and both Team Leads remained unread. The conflict and academy content were unchanged. |
| Notification destination | Opened the course; its banner and the explanation's **Admin changes to review** row led to the correct comparison. |
| Comparison | Displayed the academy wording, latest admin wording, and previous shared wording. Live screenshots were emitted in the conversation. |
| Keep academy version | Kept academy body and title, removed the conflict for every reviewer, and returned to the course. |
| Later admin edit to that same body | Created a fresh notification for all four eligible reviewers; the earlier read receipt did not dismiss it. |
| Use admin version | Applied only the body; preserved the academy title; cleared every review notification and returned to the course. |
| Both sides save exactly the same new body | Converged without conflict or notification; academy title remained customized. |

The last published batch is applied, sync is `IDLE`, and the course has **zero
open conflicts**. The QA lecture remains for repeat testing. No pending admin
drafts were left by these cases.

Live material smoke checks also opened the copied PDF viewer (page navigation
available), played and paused the video, and graded the single-answer and
multiple-answer quizzes correctly at **100/100** in private staff practice.
Those practice records remain separate from student coursework. The short-answer
form loaded; no claim is made here about a live short-answer, written-response,
Turtle runtime, or programming execution test. Their sync behavior is covered
by the disposable suites below.

## Bug found and fixed

After resolving a batch, the Manager stayed on the course. Clicking a later
notification correctly marked it read but could leave the already-mounted
course builder showing cached rows without the new review badge. Next's
`router.refresh()` supplied fresh server data, but React Query's `initialData`
does not replace an existing cached query.

The staff course page now supplies a fresh server-read token. The builder
consumes each fresh server outline once, updating its existing query cache.
Replaying an already-consumed snapshot cannot overwrite newer client data.
No additional API call, polling, or database read was introduced.

The regression test failed before this fix and passes afterward. A clean
browser test also publishes a later correction while the Team Lead is already
on the course, clicks the notification, verifies the marked row and comparison,
accepts the admin body, and verifies the return to the course.

## Automated coverage and evidence

- **34 integration tests** across all five sync specs passed on disposable PostgreSQL: all seven material types, per-unit merge, convergent/independent edits, grading snapshots and solved progress, archive guards, PDF dependencies, stale decisions, solution-file preservation, legacy matching, role-scoped notifications, per-person receipts, and query budgets.
- **18 focused web tests** passed, including refreshed-server-data adoption, stale snapshot replay, no duplicate outline fetch, and existing builder operations.
- The standard browser workflow passed, including editing published library quiz options, batch publishing, notification navigation, both resolution choices, test-case input/output comparison, same-course refresh, and retained student solved status. This browser's academy reviewer is a **Team Lead**; the supplied live browser reviewer was a **Manager**.
- The separate **10 + 2 problem browser scenario** passed: two academy additions survive; problem 02's differing description conflicts; problem 05's identical description converges; independent test cases sync while another field conflicts; later publications preserve the conflict base; keep/accept decisions persist; removed content is archived; new library content arrives.
- Web and end-to-end TypeScript checks and changed-file ESLint passed. Both final browser scenarios reported no hydration errors.

The 10 + 2 report now describes the actual **Keep academy version** choice for
problem 09, instead of incorrectly claiming a manual UI merge. Manual merge
remains covered by API integration tests. Screenshots preserve the caret so
Playwright does not inject a transient style before React hydrates; that browser
scenario also checks hydration console errors.

Representative screenshots below are from the **isolated browser environment**,
not the Gangnam course:

- [Notification](../../test-results/library-sync/00-academy-notification.png)
- [Comparison](../../test-results/library-sync/02-material-comparison.png)
- [Test-case input and output](../../test-results/library-sync/04-test-case-input-output.png)
- [Same-course notification refresh](../../test-results/library-sync/07-same-course-notification-review.png)
- [Returned course after acceptance](../../test-results/library-sync/08-same-course-accepted.png)
- [10 + 2 problem report and screenshots](../../test-results/library-sync-ten-problems/evidence/report.md)

Measured SQL statement counts remain unchanged: notification list **3**,
review page **3**, server-rendered material comparison **10**, linked-copy
builder outline **15**. The refresh fix reuses that server result.

No migration was needed. The task's API/watch process and isolated test services
were stopped after verification, leaving port 4000 free. Restart with
`pnpm dev:api` to continue testing localhost.
