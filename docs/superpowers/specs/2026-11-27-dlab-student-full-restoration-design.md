# D.LAB student restoration after deletion in Cove

Date: 2026-11-27

Status: Implementation on the feature branch. See the verification record for coverage.

Requested behavior approved in chat: a student deleted in Cove returns through D.LAB OS and resumes the same account, classes and saved learning work.

Feature branch: `feat/dlab-student-full-restoration`.

Base: `origin/feat/cove-studio-v2` at `f17625d519be11aff6734f82996dd0050f12e862`.

## 1. Required outcome

1. OS creates an eligible student and Cove receives or provisions the student through the existing integration.
2. The student enters Cove through OS. A Cove manager enrolls them in classes. The student saves code, submits answers and earns progress or points.
3. A manager deletes the student from Cove's academy People/Members interface. The student disappears from active directories and class rosters and immediately loses access.
4. The student later completes a new, eligible D.LAB OS SSO login.
5. Cove reuses the same user, managed authentication identity, academy membership and class IDs. It restores every saved enrollment whose class and academy are still available and whose campus remains authorized by OS.
6. The student sees those classes and their current assigned courses. Saved code, answers, submissions, results, feedback and progress remain associated with the same person. Managers see the returning student and their retained work in the same classes.

No manual ID matching, new account, invitation, or repeated class assignment is required for deletions captured by this implementation. A background user PUT alone must continue to leave the student deleted.

“Everything before deletion” means restoring participation in the existing learning records. It does not rewind later edits to courses, classes, grades, OS profile fields or teacher assignments; reopen archived resources; revive old sessions; or undo a separate suspension. Finished or expired exams retain their existing attempt state and deadlines.

## 2. Findings at the v2 base

- `packages/api/src/manage/people-bulk.service.ts`, `apply()` / `DELETE`, marks the academy membership `LEFT` and calls `classEnrollment.deleteMany`. If the user has no remaining membership, it marks the retained user row `DELETED` and removes provider sign-in after commit. D.LAB identifiers remain linked.
- `packages/api/src/integrations/dlab/dlab-sso.service.ts`, `complete()`, calls shared directory provisioning with `{ revive: true }`.
- `dlab-directory.service.ts` and `dlab-directory-reconciler.ts` reactivate the same account and removed membership on SSO. They do not reconstruct class enrollment.
- `packages/api/src/classes/classes.service.ts`, `removeStudent()`, explicitly preserves drafts, submissions, scores and progress. The academy deletion path also leaves those learning records in place. Restoring access to the same class/material IDs can expose the retained work again.
- `learning-class-context.service.ts` requires current class enrollment for course access. Missing enrollment explains an empty course/class experience even when the account has returned.
- Existing D.LAB integration tests cover account/membership revival, but do not prove restoration of a populated student's classes and learning work.
- The existing bulk-operation result and summary audit do not provide a complete, authoritative snapshot of removed enrollment metadata. A migration cannot reliably infer every previously deleted student's classes from these records.

The current behavior is account restoration with lost enrollment. This design extends restoration to the student's saved academy participation.

## 3. Approach and scope

| Approach | Trade-off | Decision |
| --- | --- | --- |
| Persist enrollment snapshots during student deletion, then restore on eligible SSO | Explicit deletion provenance, unchanged active-roster reads, recoverable retries | Selected |
| Keep active enrollment rows attached to a `LEFT` membership | Smaller migration, but every roster/count/access path must consistently exclude the removed member | Rejected for this change |
| Infer classes from submissions and other historical activity | Misses classes with no activity and can re-add a student deliberately removed before deletion | Not an automatic recovery method |

Applies to OS-managed academy memberships whose role at deletion is `STUDENT`, including single-person and bulk deletion through the existing People/Members workflow. Platform status deletion retains its existing relations; returning OS students must reuse those relations without duplicating enrollments. Integration coverage must exercise both entry points.

Ordinary Cove accounts and staff deletion/teacher-assignment behavior are unchanged. OS user/campus sync, role mapping, source version rules, campus scoping and normal course assignment remain in force. No HQ endpoint or payload change is required.

## 4. Durable deletion snapshots

Add two internal, migration-backed models with database constraints:

**Student removal snapshot**

- UUID primary key; schema version `1`.
- Stable external user ID, Cove user ID, academy ID and membership ID.
- Origin `LIVE_CAPTURE` or `LEGACY_REPAIR`, actor ID and capture time. Live capture also requires deletion operation ID and deletion time. Legacy repair requires a unique operator recovery operation ID and reviewed-plan digest; unavailable historic deletion facts remain null.
- Lifecycle `PENDING`, `RESTORED`, or `SUPERSEDED`; restoration time and correlation ID when committed.
- Unique `(deletion operation ID, membership ID)` for live captures, and `(recovery operation ID, membership ID)` for legacy repairs, prevent duplicate snapshots on retries. A check constraint enforces the appropriate provenance fields for each origin.
- At most one `PENDING` cycle per membership, enforced by a partial unique index.

**Saved enrollment**

- Snapshot ID and class ID, unique together.
- Original `enrolledAt`, `enrolledByUserId` and `lastLearningSeenAt`. Live capture requires the first two. Legacy repair may leave unproven historic metadata null and must label it unknown.
- Restore outcome `PENDING`, `RESTORED`, or `SKIPPED`, plus an allowlisted reason for a skipped item.

Capture a snapshot even when the membership has zero classes: this distinguishes a recorded empty roster from an old deletion with unknown history. Do not duplicate code, answers, grade records, credentials, full profiles or course content into the snapshot.

Foreign keys and indexes must support lookup by stable identity/membership and pending lifecycle. Retain valid user/membership references; use restrictive deletion behavior for recovery evidence until the authorized purge workflow explicitly removes it. Extend `packages/api/src/platform/academy-purge.ts` in dependency order so academy purging remains deliberate and complete. Protect the new tables from direct anonymous/authenticated database access under the project's existing RLS/grant conventions.

Preserve existing membership/profile rows and their original join/creation times. OS-owned fields may still update through the normal directory projection. Snapshot rows are internal recovery evidence, not a second member directory.

## 5. Removal transaction

Extend `PeopleBulkService` through a focused restoration helper:

1. Keep existing actor authorization, last-manager guards, preview revision checks and idempotency handling.
2. Resolve the selected OS-managed Student memberships and their enrollments in bounded batch reads. Never issue a query per student or class.
3. Capture every existing enrollment for those memberships, with the original metadata, in the same transaction as removal.
4. Mark an earlier pending cycle `SUPERSEDED` when a genuinely new deletion cycle starts. Capture only current enrollments; a class explicitly removed before this deletion must not return from an older cycle.
5. Create the new snapshots and saved-enrollment rows before removing live enrollments and setting memberships `LEFT`.
6. Preserve the account tombstone and post-commit access and monitoring revocation. Retain the OS-managed student provider record as described below. No learning data is deleted, reset or recalculated.

Snapshot persistence and removal must commit together. If the snapshot cannot be saved, deletion fails and leaves account/membership/enrollment state unchanged. A replay of a completed bulk operation neither captures an empty replacement snapshot nor starts another cycle.

The deletion preview/confirmation for managed students must explain: they disappear from Cove now; their previous available classes and saved work return when they next enter through OS. Keep the existing distinction between deletion and suspension. Do not promise recovery for ordinary accounts or staff through this message.

## 6. OS login restoration

Only a verified new SSO completion may automatically consume a snapshot. Continue using the existing per-external-user lease and verified source/identity/campus resolution.

Within the shared provisioning database-finalization transaction:

1. Resolve the existing stable account and memberships; check current OS eligibility, rollout policy, campus mapping and local restrictions.
2. Perform the existing account and membership revival for eligible removed memberships.
3. Batch-load pending removal snapshots, saved enrollments and referenced class/academy facts. Run this for eligible Student memberships even if a previous login already revived the membership, so a retry can finish pending recovery.
4. Require an exact match of external identity, user, membership and academy. A mismatched snapshot is a conflict; never attach it to another student, merge by name or guess a campus.
5. Restore all saved enrollments in still-active classes within that same active, currently authorized academy. Reuse the original enrollment metadata. Existing `(classId, membershipId)` enrollment is an idempotent success and must not be overwritten.
6. Mark restored or permanently unavailable items and complete their snapshot in the same transaction. Any unexpected database or identity failure rolls the finalization back; it must not report complete recovery after committing only part of the eligible roster.
7. Account/member changes and enrollment changes contribute to one logical people-revision increment per affected academy. Touch changed classes using the existing class revision conventions and emit restoration audits once.
8. Commit before issuing the activation bridge. A provisioning failure creates no usable login session; a later login can reuse the stable provider identity and retry the finalization.

Provider operations stay outside SQL transactions. Keep the existing recoverable provider/database boundary: a provider identity may already exist after a failed finalize, and the next attempt must reuse it.

Keep the OS-only provider identity for managed students when removing them from Cove. It has no local sign-in method. The Cove account tombstone and membership transition invalidate old sessions through the existing generation checks, including after restoration. Keeping the provider identity also removes the race between delayed provider deletion and a returning student's login. Earlier deletions may have removed the provider record, so SSO still verifies or recreates it at the reserved ID. The existing credential cleanup behavior continues for other accounts.

Directory PUTs and catch-up jobs call provisioning without SSO revival and must never restore saved enrollments. Replayed activation tickets, ordinary page visits and stale pre-deletion cookies are not new SSO logins and cannot trigger restoration. Keep current generation/session revocation rules.

### Availability and restrictions

| Condition | Required result |
| --- | --- |
| Same identity, authorized active academy, active former class | Restore the enrollment and retained learning context |
| Student has classes in multiple eligible scopes | Restore saved classes separately within their correct memberships; never cross scopes |
| OS account inactive, SSO disabled, no allowed campus, or account independently suspended | Preserve restrictions; no login-based access grant |
| Academy/source scope is currently blocked or removed | No enrollment/access grant in that scope; retain pending evidence for a future eligible SSO |
| Former class archived or physically purged | Do not reopen or recreate it; mark item skipped with a safe reason |
| Class exists in a different academy or snapshot identity conflicts | Fail the affected restoration transaction with an explicit conflict |
| Class now has different courses, materials or teachers | Restore membership in the same class using its current configuration |
| Student is no longer a Student under current OS roles | Do not grant the Student role or restore Student enrollment; retain the pending evidence |
| Manager independently removed a class before academy deletion | It is absent from the new snapshot and stays removed |
| Manager removes a class after restoration | It stays removed; the consumed snapshot cannot re-enroll the student on every login |

An archived/purged class is a documented unavailable item, not a claim that every class was restored. Record restored/skipped counts in safe diagnostics. A returning student sees a concise notice when recovery is incomplete, with no disclosure of classes outside their current scope. Managers with existing roster permission can inspect the restoration summary for their academy. Use existing notice/audit presentation rather than introducing a separate restoration wizard.

## 7. Learning continuity

Do not create replacements or modify the contents of retained learning records during restoration. Verify continuity for:

- Coding drafts, multi-file projects and saved editor state supported by the existing draft models.
- Submission IDs, code snapshots, verdicts, attempt counts and scores.
- Short-answer and multiple-choice drafts/submissions, teacher grades and feedback.
- Turtle/graphics code and saved submissions; browser-only, unsaved runtime/drawing state is not a durable artifact.
- PDF, video, document and other reading/watch progress that the platform already persists.
- Student learning days, answer history, class/course progress and teacher feedback.
- Points balances and award history; restoration does not award points again or manufacture new learning activity.
- Completed/in-progress exam records under existing timing rules; restoration does not restart an exam or grant another attempt.

The same class and material IDs must yield the same retained history. Login time can update through normal authentication; original enrollment time, historical learning timestamps and earned results must not become new activity just because enrollment returned. Live sockets, monitoring visits, help sessions, terminal processes and old auth sessions are not resumed; current session permissions establish new connections normally.

## 8. Concurrency, ordering and idempotency

All touched paths must use a documented consistent database lock order. For managed deletion and SSO finalization, acquire the existing D.LAB source advisory lock before academy locks, then affected membership/class locks in stable UUID order. Keep network I/O outside those locks and transactions. Avoid acquiring the per-user Redis lease recursively.

Coordinate every touched enrollment writer (`ClassesService.addStudents`, `removeStudent`, bulk `ENROLL`, managed deletion and restoration) with the same academy/class serialization order. Recheck membership eligibility and class status after acquiring the relevant lock; do not let an old ACTIVE read insert an enrollment after deletion commits. Preserve class optimistic revisions and no-op semantics.

The observable result must match a valid order of committed operations:

- A deletion committed after login restoration leaves the student removed and creates a new pending snapshot.
- A new eligible login finalized after deletion restores the latest captured roster.
- Concurrent callbacks cannot restore twice, duplicate awards/audits or consume another deletion cycle.
- Source deactivation or local suspension committed before eligibility finalization wins over restoration.
- A class archive racing restoration cannot end with unauthorized class access or reopen a class.

Membership reactivation, roster restoration, snapshot outcomes and their audits are one database finalization. Recoverable errors retain pending state. Do not swallow restoration failures behind a successful `READY`/login response.

## 9. Students deleted before rollout

The additive migration creates recovery storage; it cannot reconstruct previously removed enrollment rows. Do not promise that deployment alone restores all existing deleted students' classes.

Provide a narrowly scoped, dry-run-first operator recovery command for these legacy cases:

1. Select exact external user, user, academy and membership IDs and an explicitly reviewed list of original class IDs from authoritative operator evidence or a verified database backup.
2. Validate identity bindings, same-academy classes and absence of conflicting current deletion cycles. A class-name match or a past submission is a candidate for investigation, not sufficient automatic proof of the last roster.
3. Show the reviewed identity/class plan and digest without writes. Apply requires the existing authenticated platform-admin/operator authorization and explicit target environment; revalidate the plan before writing.
4. Create a versioned recovery snapshot with operator provenance. Leave access unchanged until the next eligible OS SSO login, including when an earlier login already reactivated the account. An explicit operator repair action must be recorded separately if immediate enrollment is requested.
5. If the former class list cannot be proven, report `original_enrollments_unknown`. A manager can supply/confirm the intended roster; never silently mark full recovery or create duplicate classes/accounts.

The command is not run by a schema migration or ordinary login and performs no bulk production repair by default. Already deleted students without a snapshot can still log in under current rules, but full recovery remains explicitly incomplete until the original enrollments are supplied. No recovery notice is necessary for a normal first-time student who was never deleted.

For a verified legacy class whose original enrollment timestamp/enroller is unknown, use the restoration commit time and the authorized recovery operator as the new live enrollment metadata, preserve null historical metadata in the recovery evidence, and explicitly report that limitation. Do not invent old timestamps or describe this enrollment metadata as fully reconstructed. Existing learning records keep their original timestamps and contents.

## 10. Performance and observability

Follow `AGENTS.md`: no SQL inside student/class loops; select only restoration facts; use set-based snapshot/restore writes. Ordinary pages continue using existing server-rendered reads and revision/socket invalidation. No polling or client-side fetch waterfall is added.

The normal directory snapshot remains a single SELECT. Load restoration data only for SSO revival/eligible pending recovery; background PUTs must not pay for class-history loading. For one deletion operation or one login, statement count must be independent of the number of students/classes, excluding explicitly documented bounded chunking at existing bulk-operation limits.

Measure current and new read/total statement counts with Prisma query events against disposable PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`. Compare one versus 100 students for deletion, and one versus 100 saved enrollments for login. Record exact measured counts and changes in the implementation verification document and commit message. Do not treat these design targets as measured results. Trigger-internal work is reviewed separately from client query events.

Record deletion cycle, external/user/membership IDs, source revision, correlation ID and restored/skipped counts in permission-scoped audits. Never log code, answers, private contact details, PINs, auth codes, token hashes or server keys. Repeated successful login produces no duplicate restoration domain event.

## 11. Implementation boundaries

- `packages/api/prisma/schema.prisma` and an additive migration: recovery snapshots, outcomes, constraints, indexes and access protection.
- `packages/api/src/manage/people-bulk.service.ts`: batch capture, transactional ordering and preview consequences for managed Students.
- New focused helper under `packages/api/src/integrations/dlab/`: batched snapshot capture, pending recovery resolution and enrollment restore. Keep provider/auth work in its current service.
- `dlab-directory.service.ts`, `dlab-directory-reconciler.ts`, `dlab-sso.service.ts`: verified-login-only orchestration, preserved restrictions, revision aggregation and retry behavior.
- `packages/api/src/classes/classes.service.ts` and bulk enrollment: align touched writes with removal/restoration serialization.
- `packages/api/src/platform/platform-users.service.ts`: verify status-only deletion preserves existing enrollments and reuse on OS revival; avoid introducing a second snapshot for unchanged relations.
- `packages/api/src/platform/academy-purge.ts`: explicit removal of recovery evidence during an authorized academy purge.
- Shared typed consequences/notice contracts and existing deletion/login notice components: explain the actual recovery behavior and partial legacy/unavailable outcomes in English and Korean.
- Operator recovery command, narrow integration tests and browser verification artifacts.

Implement on `feat/dlab-student-full-restoration`, the dedicated branch created from the verified v2 base. Use disposable test data for implementation verification and follow the release process in section 13 for production rollout.

## 12. Acceptance and verification

### Disposable-database integration tests

1. Create an OS-managed Student through real directory provisioning; enroll them in two classes and populate representative saved learning artifacts.
2. Delete through the real single-person/bulk People service: snapshot metadata matches the old enrollments, membership/account state changes appropriately, roster/access is revoked and saved learning rows/IDs remain unchanged.
3. Resend identical and newer OS user PUTs: account/member remains removed, saved enrollments remain pending, no restoration event or duplicate snapshot.
4. Complete the real verified SSO service path with mocked external OS/provider responses, rather than testing only `provision({ revive: true })`: stable IDs and both class enrollments return, metadata is preserved, and the normal learner reads return the original saved work/results.
5. Replay callbacks and log in repeatedly: one restoration, no duplicate membership/enrollment/award/audit and no reset of timestamps or progress.
6. Delete, restore, remove one class explicitly, then delete/restore again: only the second deletion's roster returns.
7. Cover zero classes, already-present enrollment, several memberships, another-campus class, changed OS campus/role, inactive source, local suspension, archived class, platform status deletion and ordinary/staff accounts.
8. Inject snapshot-save and finalization failures: deletion/restoration rolls back as specified; provider success plus finalize failure is retryable with the same identity.
9. Exercise actual concurrent transactions for duplicate SSO, delete-versus-login, enroll/unenroll-versus-delete, archive-versus-login and source-inactive-versus-login. Verify that managed student deletion preserves the provider identity and that the old session is rejected both before and after the new login. Assert serializable outcomes and no deadlock retry without bound.
10. Test legacy dry-run/apply, stale-plan rejection, unknown roster reporting, exact identity matching and retry idempotency.
11. Assert query-count invariance and direct-table access protection. Run purge regression coverage with pending/completed snapshots.

### Browser end-to-end verification

Use dedicated disposable test identities/classes, separate manager and Student browser contexts, and test both Chromium and WebKit. Label WebKit results accurately; claim Safari verification only after a separate run in actual Safari.

Manager enrolls Student in a class with coding, PDF, turtle, short-answer and quiz materials. Student saves code, submits answers and obtains a graded result. Manager deletes the student through the real UI; student loses access. Student performs a fresh OS SSO login; verify automatic return to the same class/course/material IDs, previous drafts/submissions/results and manager monitoring/history. Include a second class with no submissions to prove restoration does not infer enrollment from activity.

Capture before/removed/restored screenshots for the Student class list, a saved coding response and answer result, plus manager roster/history. Verify archived-class and legacy-incomplete notices separately. Production student data is not a test fixture.

Release only after the targeted tests and required checks pass and the verification document states the measured query counts, browser coverage and remaining legacy recovery cases. After local verification, stop temporary services and leave Cove API port 4000 free as required by `AGENTS.md`.

## 13. Deployment and rollback

Deploy the additive migration before application code that captures snapshots. Apply production release steps only after separate deployment authorization, using the current AWS deployment guide and its required GitHub reviewer.

Future deletions are fully restorable only after the snapshot-capable deletion writer is deployed. During rollback, pause managed-Student deletion before reverting that writer so new removals cannot silently lose recovery evidence. Retain snapshot tables and existing learning data. Reverting the login restorer may temporarily leave pending snapshots; a later compatible release can resume them. Do not run destructive down migrations or automatically re-enroll users as a rollback side effect.

Operational acceptance distinguishes: newly captured deletions fully recover on eligible SSO; archived resources remain closed; older deletions require verified enrollment recovery. Do not report the legacy population as repaired merely because the migration succeeded.
