# Class Teacher Assignment Design

**Date:** 2026-08-04

**Status:** Approved for implementation planning

**Scope:** Academy-scoped assignment of one teacher to a class, managed by Team Leads and Managers

## Summary

Cove Studio will let a Team Lead or Manager assign one teacher to each academy class. A class may be temporarily unassigned, while one teacher may be responsible for many classes. This creates the authorization boundary required by the later teacher-monitoring feature without adding monitoring, presence, code sharing, or analytics in this phase.

The current assignment is stored directly on `Class` as a nullable academy-membership reference. Only an active, same-academy membership with the `TEACHER` role is eligible. Assignment changes are transactional, tenant-scoped, protected by the class revision, and recorded in the existing academy audit log.

## Goals

- Let Team Leads and Managers assign, replace, and remove a class teacher.
- Enforce at most one teacher per class.
- Let one teacher be assigned to many classes.
- Allow classes to exist without an assigned teacher.
- Restrict eligibility to active same-academy `TEACHER` memberships.
- Revoke effective teacher access immediately when the assignment or membership becomes invalid.
- Preserve assignment history through audit records.
- Expose the current assignment on class list and detail screens.
- Establish a secure, queryable boundary for the later monitoring design.
- Match the existing v2 Classes visual language and interaction patterns.

## Non-goals

- Multiple teachers on one class.
- Bulk teacher assignment.
- Teacher-owned assignment changes.
- A teacher-facing “My classes” page.
- Student presence or connection status.
- Live exercise, draft, code, cursor, or terminal monitoring.
- Teacher feedback, collaborative editing, messaging, or intervention requests.
- Submission review, progress analytics, attendance, schedules, or reports.
- Automatically assigning existing teachers during migration.
- Replacing the academy audit log with a dedicated assignment-history table.

## Product decisions

1. A class has zero or one assigned teacher.
2. One teacher may be assigned to any number of classes in the same academy.
3. Team Leads and Managers may assign, replace, and remove teachers.
4. Teachers may not assign themselves or other teachers.
5. Only an active academy membership with role `TEACHER` is eligible.
6. The teacher membership and class must belong to the same academy.
7. An active class may be assigned or unassigned at any time.
8. Archived classes are read-only until restored.
9. Removing or replacing a teacher changes effective access immediately.
10. Suspending the assigned membership or changing its role away from `TEACHER` changes effective access immediately without deleting the stored assignment.
11. An invalid stored assignment remains visible to authorized managers as unavailable until removed or replaced.
12. Assignment changes use optimistic concurrency; stale clients never silently overwrite a newer class change.
13. Repeating the current assignment or removing an already-empty assignment is a no-op with no revision change or audit entry.
14. The audit log is the authoritative assignment history for this phase.

## Domain model

### Class teacher relation

Extend `Class`:

```text
Class
- teacherMembershipId: UUID or null
- assignedTeacher: AcademyMembership or null
```

Extend `AcademyMembership` with the inverse relation:

```text
AcademyMembership
- assignedClasses: Class[]
```

Use this Prisma relation shape:

```prisma
model Class {
  // existing fields
  teacherMembershipId String?            @map("teacher_membership_id") @db.Uuid
  assignedTeacher     AcademyMembership? @relation("ClassTeacher", fields: [teacherMembershipId], references: [id], onDelete: SetNull)

  @@index([teacherMembershipId, status])
}

model AcademyMembership {
  // existing fields
  assignedClasses Class[] @relation("ClassTeacher")
}
```

`teacherMembershipId` is deliberately not unique: uniqueness would prevent one teacher from owning many classes. Storing the membership rather than the user makes academy scope and academy role explicit.

The foreign key alone cannot prove that the class and membership have the same `academyId`. The service validates tenant equality inside the same transaction as every write. All teacher-access queries must also include the class academy and current membership conditions rather than trusting the foreign key by itself.

`onDelete: SetNull` keeps a class valid if a membership is permanently removed. Ordinary suspension and role changes do not delete the membership or clear the field; this lets the management UI explain why the current assignment is unavailable and lets the audit history remain intelligible.

### Effective teacher assignment

A teacher is effectively assigned only when every condition is true:

```text
class.academyId = requested academy
AND class.status = ACTIVE
AND class.teacherMembershipId = actor academy membership id
AND membership.academyId = class.academyId
AND membership.status = ACTIVE
AND membership.role = TEACHER
AND membership.user.status = ACTIVE
```

This predicate is a design seam for the monitoring feature. Assignment management does not yet grant a teacher any monitoring endpoint because those endpoints do not exist in this phase.

## Permissions and authorization

Add an explicit permission:

```text
class-teachers.manage
```

Role mapping:

| Capability | Student | Teacher | Team Lead | Manager |
|---|:---:|:---:|:---:|:---:|
| View class assignment through class management | No | No | Yes | Yes |
| List eligible teachers | No | No | Yes | Yes |
| Assign, replace, or remove a teacher | No | No | Yes | Yes |

The existing `classes.assigned.manage` permission remains reserved for the later teacher-facing assigned-class and monitoring design. It does not authorize teacher assignment changes. This avoids giving assignment authority to the `TEACHER` role, which currently holds that reserved permission.

Every API query and mutation must call `AcademyAccessService` and apply academy scope in Prisma. Frontend action visibility is only a usability layer.

## Shared schemas and contracts

### Output summaries

Add a lightweight assigned-teacher summary for class lists:

```text
AssignedTeacherSummary
- membershipId
- userId
- displayName
- membershipStatus
- role
```

Add detail information for the class page and assignment dialog:

```text
AssignedTeacherDetail extends AssignedTeacherSummary
- email
```

`ClassSummary` gains `assignedTeacher: AssignedTeacherSummary | null`.

`ClassDetail` gains `assignedTeacher: AssignedTeacherDetail | null`.

The API returns the membership’s current status and role even when they no longer satisfy assignment eligibility. The client does not infer effective access from the presence of an ID alone.

Add an eligible-teacher summary:

```text
EligibleTeacherSummary
- membershipId
- userId
- displayName
- email
```

Only active same-academy teacher memberships appear in this result. Results sort by display name, then membership ID for deterministic ordering.

### Inputs

```text
listEligibleTeachers
  { academyId, classId }

setTeacher
  {
    academyId,
    classId,
    teacherMembershipId: UUID | null,
    expectedUpdatedAt: ISO timestamp
  }
```

One nullable `setTeacher` operation handles assignment, replacement, and removal. Separate endpoints would duplicate concurrency, authorization, validation, and audit logic.

### oRPC surface

Extend `academyClasses`:

```text
academyClasses.listEligibleTeachers(input)
  -> { teachers: EligibleTeacherSummary[] }

academyClasses.setTeacher(input)
  -> ClassDetail
```

Returning `ClassDetail` keeps the teacher panel, class revision, courses, and roster synchronized after a mutation.

## Backend behavior

### Listing eligible teachers

`listEligibleTeachers` must:

1. require `class-teachers.manage`;
2. verify that the class exists in the requested academy;
3. query memberships in that academy with `role = TEACHER`, `status = ACTIVE`, and an active user;
4. return only the fields defined by `EligibleTeacherSummary`;
5. never return memberships from another academy.

The operation may run for an archived class so authorized staff can inspect candidates while planning a restore, but `setTeacher` remains blocked until the class is active.

### Assigning, replacing, or removing

`setTeacher` runs in one Prisma transaction:

1. Load the academy-scoped class and its current assigned membership.
2. If the requested membership ID equals the stored ID, return the current detail with no write or audit entry.
3. If the request is non-null, load the membership using all eligibility conditions: requested ID, same academy, `TEACHER` role, active membership, and active user.
4. Reject the complete operation if no eligible membership matches.
5. Atomically claim the class revision with a conditional update constrained by class ID, academy ID, `ACTIVE` status, and `expectedUpdatedAt`.
6. Set `teacherMembershipId` to the requested ID or `null` in that same conditional update.
7. If the conditional update affects no row, distinguish not found, archived, and stale-revision errors using an academy-scoped read.
8. Reload and return the complete class detail.
9. Write the audit event inside the same transaction.

The read-then-unconditional-update pattern is forbidden because two staff members could otherwise replace the same teacher and silently lose one decision.

### Audit actions

Use distinct operational events:

- `class.teacher.assigned` for `null -> membership`;
- `class.teacher.replaced` for `membership A -> membership B`;
- `class.teacher.removed` for `membership -> null`.

Each event contains:

- academy ID;
- actor user ID;
- class ID;
- previous teacher membership ID or `null`;
- new teacher membership ID or `null`;
- request ID when available.

Audit payloads do not contain student code, teacher email, or other unnecessary personal information.

## Error handling

Add one stable error code with localized English and Korean messages:

| Code | Meaning |
|---|---|
| `CLASS_TEACHER_INELIGIBLE` | The membership is cross-academy, inactive, belongs to an inactive user, or is not a teacher |

Reuse existing class errors for:

- `CLASS_NOT_FOUND`;
- `CLASS_ARCHIVED`;
- `CLASS_EDIT_CONFLICT`.

Actors without `class-teachers.manage` receive the existing `PERMISSION_DENIED` error from `AcademyAccessService`.

Eligibility failures intentionally use one code so callers cannot probe membership details across academies. The UI presents a refresh-and-retry message for a stale class revision and keeps the last successful class snapshot for retryable failures.

## Web experience

### Classes list

Add an **Assigned teacher** column to the existing classes table.

- Assigned and effective: avatar/initial, display name, and neutral teacher label.
- Unassigned: subdued “Not assigned” text.
- Stored but unavailable: display name plus an “Unavailable” warning badge.
- Mobile: teacher state moves into the existing compact row/card metadata rather than forcing horizontal overflow.

The list query uses a lightweight membership/user selection and does not load class rosters or unnecessary teacher fields.

### Class detail panel

Add an **Assigned teacher** panel alongside the existing overview, courses, and students panels.

The panel shows:

- display name;
- email on the detail page;
- current membership status;
- `TEACHER` role or an unavailable explanation;
- **Assign teacher**, **Replace teacher**, or **Remove assignment** according to state.

An archived class shows the assignment read-only with the existing archived explanation.

### Assignment dialog

Use the established v2 dialog, form, button, badge, loading, and error patterns.

- Search active teachers by display name or email.
- Use a single-select control; never present checkboxes or multi-select language.
- Keep the current teacher visibly selected when still eligible.
- Show a clear empty state when the academy has no eligible teachers.
- Replacing a teacher states that the previous teacher loses future class-monitoring access immediately.
- Removing uses a focused confirmation state and explains that the class remains valid but unassigned.
- Disable duplicate submission while the mutation is pending.
- On success, close the dialog and update list/detail caches with the returned `ClassDetail` and new revision.
- On failure, retain the selection and display the localized inline error.

The dialog must support keyboard navigation, visible focus, accessible labels, and narrow mobile viewports.

## Membership lifecycle behavior

Assignment writes are not coupled to general membership administration. When an assigned membership is suspended, reactivated, or changes role:

- no class row is deleted;
- no assignment audit history is rewritten;
- effective access is calculated from current membership and user state;
- management screens display the assignment as unavailable when invalid;
- reactivation as an active teacher restores effective assignment access unless the class was reassigned in the meantime.

If a membership is permanently deleted, the foreign key sets `teacherMembershipId` to `null`. The membership deletion’s own audit record and prior class-teacher audit events preserve history. No extra `class.teacher.removed` event is synthesized by a database cascade.

## Migration and seed behavior

The migration:

1. adds nullable `teacher_membership_id` to `classes`;
2. adds the foreign key with `ON DELETE SET NULL`;
3. adds the teacher/status lookup index;
4. does not backfill assignments.

All existing classes remain valid and unassigned after migration. Production migration must not guess assignments from legacy teacher-student mappings.

Development and E2E fixtures must assign the existing teacher membership to at least one active class so assignment display, replacement, removal, and the later monitoring boundary have stable test data. Seed logic must use academy membership IDs rather than user IDs.

## Testing strategy

### Shared package

- Assigned-teacher summary and detail schema acceptance.
- Nullable assignment output.
- `setTeacher` accepts a UUID or `null` and requires `expectedUpdatedAt`.
- Eligible-teacher schema validation.
- Permission mapping grants `class-teachers.manage` only to Team Lead and Manager.

### API unit and integration tests

- Team Lead and Manager may list and change assignments.
- Teacher and Student are forbidden.
- Same-academy active teacher eligibility.
- Rejection of Student, Team Lead, Manager, invited, suspended, and inactive-user memberships.
- Cross-academy IDs return the non-probing eligibility error.
- One teacher may be assigned to multiple classes.
- A class stores at most one teacher.
- Assign, replace, and remove transitions.
- Same-assignment and already-empty no-ops do not touch `updatedAt` or audit.
- Archived class mutation rejection.
- Atomic stale-revision conflict under concurrent replacement.
- Assignment derivation and validation occur inside the transaction.
- Correct audit action and before/after membership IDs.
- Membership suspension and role change disable effective access without clearing the stored assignment.
- Membership deletion sets the assignment to `null`.
- Class list uses a lightweight teacher include and no roster PII.

### Web component and hook tests

- Teacher column states: assigned, unassigned, and unavailable.
- Detail panel actions match Team Lead and Manager permissions.
- Teacher and Student never see assignment management actions.
- Search and single selection.
- No eligible teachers empty state.
- Replacement and removal warning copy.
- Pending, success, validation, stale-revision, and transient-error states.
- Returned revision updates local state and query caches.
- English and Korean translations.
- Keyboard focus and mobile layout.

### End-to-end tests

1. A Team Lead assigns an active teacher to an unassigned class.
2. The same teacher is assigned to a second class.
3. A Manager replaces the first class’s teacher.
4. The old teacher no longer satisfies the effective assignment predicate for that class.
5. A Teacher cannot call assignment APIs directly.
6. A cross-academy or suspended teacher cannot be assigned.
7. Two stale dialogs cannot silently overwrite each other.
8. A Manager removes the teacher and the class remains active and unassigned.

## Delivery order

1. Shared permission, schemas, output types, errors, and oRPC contracts.
2. Prisma relation, migration, generated client, and seed fixtures.
3. NestJS class-service candidate query and atomic assignment mutation.
4. Audit events and API tests.
5. Class list teacher column and class-detail assignment panel/dialog.
6. Localization, component tests, and end-to-end coverage.

## Success criteria

- Every class has zero or one assigned teacher.
- One active teacher may be assigned to multiple classes.
- Team Leads and Managers can assign, replace, and remove teachers.
- Teachers and Students cannot manage assignments through UI or direct API calls.
- Cross-academy, inactive, non-teacher, and inactive-user memberships cannot be assigned.
- Assignment changes are atomic, revision-protected, and audited.
- No-op requests create neither false audit history nor revision churn.
- Membership suspension or role change immediately disables effective teacher access without erasing the assignment record.
- Class list and detail screens clearly show assigned, unassigned, and unavailable states on desktop and mobile.
- Existing classes migrate safely as unassigned.
- The resulting predicate can be reused by the next teacher-monitoring design without changing assignment cardinality or authorization semantics.

## Follow-up design

The next independent specification will cover teacher monitoring. It will use the effective assignment predicate defined here to scope:

- a teacher’s class list;
- class rosters visible to that teacher;
- live student presence and current exercise state;
- submission and progress review;
- any real-time code observation or feedback channel.

That design must replace v1’s academy-wide polling and unauthenticated public realtime channels with class-scoped authorization, bounded event delivery, reconnect behavior, privacy rules, and explicit student-facing monitoring indicators.
