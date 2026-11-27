# D.LAB student restoration verification

Base `f17625d5` on `feat/cove-studio-v2`. Tested with disposable Docker PostgreSQL 17, Redis and a local OS and auth provider fixture.

The additive migration applied to an empty database together with the existing migration history. Integration coverage used the real People deletion and D.LAB SSO completion and activation services. It verified that a repeated OS directory update leaves the student removed and that the next eligible SSO restores the same membership and active classes with the original enrollment metadata. The draft, graded submission and progress rows matched their original IDs and contents. The old session stayed invalid after the return.

Further cases cover skipped archived classes, successive deletion cycles, intentional unenrollment, legacy recovery and stale plans, preservation of an independent local suspension, platform account status deletion, a conflicting class scope causing rollback, deletion racing SSO, and direct table privileges.

## Test runs

- API build and API, web, and Playwright TypeScript checks passed.
- Across the database and class-service runs, 105 cases passed. The existing 1,818-person projection fixture exceeded its transaction timeout once during concurrent compilation. It passed on a focused rerun.
- The web SSO start and callback suites passed all 23 tests, and the shared people bulk suite passed all 19 tests. The callback test verifies the notice is scoped to the student's verified academy.
- Chromium and WebKit passed the local browser journey with separate manager and student sessions. The returning student saw both original classes, including the class with no submissions, and reopened the saved draft and graded answer. The PDF rendered, the quiz and Turtle workspaces opened, and the manager saw the student again in the class roster. Screenshots are in `test-results/dlab-student-restoration/`. WebKit was tested through Playwright.

## Query counts

Prisma query events on the disposable database. The total includes explicit transaction and lock statements. The read column counts statements beginning with SELECT. Trigger-internal queries are outside Prisma's event count.

| Operation | Inputs compared | Total statements | SELECT statements |
| --- | --- | ---: | ---: |
| Managed student deletion with preview | 1 and 100 students | 40 | 28 |
| Managed student deletion with preview | 1 and 100 saved enrollments for one student | 40 | 28 |
| SSO start, completion and activation after deletion | 1 and 100 saved enrollments | 36 | 18 |

## Recovering older deletions

For deletions that predate enrollment snapshots, use an operator-reviewed list of original class IDs. An earlier bulk deletion receipt confirms the student was removed. It does not contain a complete class list.

Set `DATABASE_URL` and `DLAB_RECOVERY_TARGET` explicitly. Use an active platform-admin UUID and a private JSON file containing `externalUserId`, `userId`, `academyId`, `membershipId`, and `classIds`. Run these commands from the repository:

```bash
pnpm --filter @cove/api dlab:recover-student plan ./private-recovery-plan.json <admin-uuid> ./private-recovery-input.json
pnpm --filter @cove/api dlab:recover-student apply ./private-recovery-plan.json <reviewed-digest>
```

The plan is read-only. Apply verifies the reviewed digest, target, identity, deletion receipt and current class state before recording the recovery. The next eligible SSO restores the saved enrollments. An empty class list is reported as `original_enrollments_unknown`. If original enrollment times are unavailable, the recovered enrollment uses the restoration time while existing learning records keep their original timestamps.
