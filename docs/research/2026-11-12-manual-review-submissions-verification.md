# Manual programming assessment verification

Date: 2026-11-12 (Asia/Seoul)
Branch: `feat/manual-review-submissions`
Design: [approved specification](../superpowers/specs/2026-11-12-manual-review-submissions-design.md)

## Delivered workflow

1. In a programming exercise's **Grading** section, choose **수동 채점 / Teacher grading**. Set the maximum and whether to include it in course scores; the default is 100 points, excluded. Tests and private reference solutions are optional.
2. The student can Run and Submit. Submit saves a frozen code receipt and displays **해당 문제는 채점이 불가하므로 담당 선생님에게 수동으로 채점을 받으세요.** The pending receipt has no automatic score, test verdict, or judge job.
3. In **Student history**, select the class, student, material and submitted attempt. Open the saved code, enter a final score and optional feedback, independently select learning complete, then Apply.
4. Staff can correct a published grade by final score or signed adjustment. Corrections require a reason, preserve prior versions and reject a stale version. A real zero is a grade; pending is null.
5. The student's result/history/latest summary shows the published human assessment. A new submission becomes pending without inheriting an older attempt's grade. Excluded exercises retain individual assessments and stay outside course-score/completion denominators.

Human assessments appear in mixed work history/manual assessment summaries. The automatic Solution status dashboard excludes manual exercises from judge metrics, acceptance rates and automatic completion totals.

## Authorization and persistence

| Actor | Publish/correct scope |
| --- | --- |
| Assigned Teacher | Active homeroom or assistant classes |
| Unassigned Teacher | Denied |
| Team Lead | Active classes in the same academy, without an extra Teacher grant |
| Manager | Active classes in the same academy, without a teacher assignment |
| Student | Own receipt/result; publishing denied |
| Support/platform inspection | No new publication capability |
| Staff personal practice | Private recorded attempt; never enters student grading |

Publication rechecks actual membership, user/academy status, class assignment, enrollment, course assignment and visible material ancestors inside its transaction. It locks the relevant rows through commit. The stored submission's class must agree with the requested class. Idempotent submit/publish keys and optimistic review versions protect retries and competing reviewers.

Raw submissions remain `RECORDED`, with nullable raw score and frozen maximum/inclusion. A transaction appends a `ProgrammingSubmissionReview`, updates a small current-assessment projection on the receipt and writes an audit event. The projection avoids another relation read on existing result/history paths. Database triggers protect submitted code/settings and review rows against updates; review versions remain stored. Review tables deny browser roles.

Three ordered migrations add enum values first, then tables/constraints, then immutability guards and a scoped manual-history index. Automatic rows retain non-null scores. Migration checks ran only on disposable Docker PostgreSQL.

## Refresh and execution

Manual admission returns its committed result directly. Waiting for a human review opens no judge stream or polling interval. A directly requested receipt stream terminates immediately. Assessment events carry identifiers/version, and scoped authorized reads fetch the grade/feedback. Existing student presence supplies the authenticated socket; focus, reconnect and explicit Refresh recover missed hints. Assessment events invalidate learning/work-history caches in the named academy. Later responses cannot replace a newer manual review version.

Python Run retains the browser runtime. C/C++ manual Run builds a temporary, bounded execution profile from the user's input, without requiring authored test cases or changing the stored grading definition. Manual Test/sample grading is refused. Unit checks cover both C and C++ snapshots and existing compiled grading remains covered by its regression suite; native-host qualification was not repeated for this feature.

## SQL evidence

Counts include authorization and all service statements, measured with Prisma query events on local PostgreSQL. The expanded fixture has 20 materials, 20 students, 20 attempts for the selected student/material, and 20 review versions, plus receipts connecting the extra students/materials. No page/read query runs inside a row loop.

| Complete service read | Small fixture | Expanded fixture |
| --- | ---: | ---: |
| Student result | 4 | 4 |
| Staff review + versions | 6 | 6 |
| Student answer records | 12 | 12 |
| Teacher attempt list | 13 | 13 |
| Teacher mixed attempt history | 15 | 15 |
| Teacher by-material student list | 23 | 23 |
| Teacher student's mixed material list | 22 | 22 |
| Latest submission | 6 | 6 |
| Learner bootstrap + current manual receipt | 19 | 19 |

The v2 nested material-metadata reader was measured at **6 statements**, versus **1** for the joined reader, with identical expanded-fixture output: **−5 statements** at that boundary. This is the measured v2 comparison; the table above is the complete feature service count, not a claimed end-to-end v2 delta. The learner admission/workspace graph and class-context reads also use joined metadata instead of deep includes. List projections exclude source code, solutions and long assessment feedback unless the response needs them.

First publication and correction each take **17 statements: 12 SELECTs, 3 writes and 2 transaction-control statements**. Idempotent replay takes **13: 11 SELECTs, no writes and 2 transaction-control statements**. These counts include the post-commit owner lookup and review-history response. Stored grades survive event-delivery failure.

Machine-readable counts: [sql-counts.json](../qa/assets/2026-11-12-manual-programming/sql-counts.json).

## Validation

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed all workspace packages and E2E types |
| `pnpm --filter @cove/shared test` | 939 passed, 56 files |
| API full unit/default suite (`vitest run --maxWorkers=3`) | 1,742 passed; 279 opt-in integration tests skipped |
| Web full suite (`vitest run --maxWorkers=3`) | 1,590 passed, 211 files |
| Follow-up UI refresh/cache/race checks | 9 passed, 3 files |
| `pnpm --filter @cove/web i18n:check` | 144 tests passed; no stale keys/copy markers; payload budgets passed |
| Changed web-file ESLint | No errors; three existing unused `academyId` warnings in answer-records.tsx |
| Disposable manual-assessment integration suite | 15 passed, including actual SQL counts and database immutability guards |
| Fresh database migration + integration regressions in isolated script | 26 passed across four files |
| Chromium + WebKit | Both passed; student → Teacher → Team Lead → Manager; author setting persistence, live grade refresh, correction history, mobile, Korean/English, light/dark and keyboard radio selection |

The API default-suite skipped tests need additional opt-in infrastructure; they are not reported as executed. The isolated script runs the relevant manual/curriculum/navigation/academy-role integration checks against its own database. No production-host qualification or production deployment is claimed.

WebKit exposed a score-input hydration race during verification: typing before React attached could leave the saved score in application state. The grading fieldset now stays disabled until hydrated; both browsers then published the exact edited score. Author saves are tested after the existing course navigation completes. A separate UI regression verifies that Refresh loads a newer grade while preserving an unsaved correction. A late-read regression keeps newer manual review versions in the latest cache.

### Screenshots

- [Author settings, English/light](../qa/assets/2026-11-12-manual-programming/chromium-author-manual-settings.png)
- [Manager grading and correction history, English/light](../qa/assets/2026-11-12-manual-programming/chromium-manager-grading-history.png)
- [Student result, English/mobile](../qa/assets/2026-11-12-manual-programming/chromium-student-manual-result-mobile.png)
- [Student result, Korean/dark/mobile](../qa/assets/2026-11-12-manual-programming/webkit-student-manual-result-ko-dark-mobile.png)
- [Manager grading and correction history, Korean/dark](../qa/assets/2026-11-12-manual-programming/webkit-manager-grading-history-ko-dark.png)

Both browsers' original screenshots are retained in the linked assets directory. They contain only disposable local fixtures.

Reproduce the isolated database/API/web/browser workflow:

```sh
bash packages/api/scripts/test-manual-programming.sh
```

The script creates its own PostgreSQL/Redis containers and local authentication provider, applies every migration from scratch, compiles the API, checks integration regressions and runs Chromium/WebKit. Cleanup removes only the created containers/build directory. It never reads shared Supabase or real student work.

No production database migration, deployment, push or production content conversion was performed. Apply the migrations and deploy compatible API/web/worker readers together before using this mode in production. After real receipts/reviews exist, rollback must keep compatible nullable-score/manual-status readers and preserve the stored review history.
