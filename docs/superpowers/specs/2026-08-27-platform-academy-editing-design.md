# Platform Academy Editing Design

**Date:** 2026-08-27
**Branch:** `feat/platform-academy-editing`
**Status:** Approved for implementation

## 1. Purpose

A platform admin can create an academy and can never correct it. A name typed
wrong at creation, or a slug entered `dlab-mapo` when the school writes it
`mapo-dlab`, is permanent: no role in the system can change either.

Everything else about an academy already has an owner. Its manager edits the
address, phone, contact email and time zone through
`academy.settings.manage`. Only the two identity fields — the name people read
and the slug in every URL — belong to nobody.

## 2. Scope

A platform admin may edit an academy's **name** and **slug**, and nothing else.

Deliberately excluded:

- **Deletion.** Archiving already ends an academy: row-locked, audited, and it
  revokes live monitoring. It is documented as terminal because an academy is
  referenced by its courses, classes, submissions and audit history. A purge
  would destroy student records to solve a problem archiving already solves.
- **The address block.** It is the manager's, and two editors of one field is
  how the two drift apart.
- **Editing an archived academy.** Archived is the end. An academy that has
  ended does not get renamed.

## 3. Authorization

A new `platform.academies.update` permission, held by `ADMIN`.

Separate from `platform.academies.lifecycle` rather than folded into it:
suspending an academy and renaming one are different authorities, and a role
added later should be able to hold one without the other.

## 4. Old links keep working

Changing a slug changes every URL an academy has ever appeared in — a
student's bookmark mid-course, a link a teacher emailed, an invitation already
sent. A rename that breaks them is a rename nobody dares perform.

### 4.1 Retired slugs are remembered

```prisma
model AcademySlugHistory {
  slug       String   @id
  academyId  String   @map("academy_id") @db.Uuid
  retiredAt  DateTime @default(now()) @map("retired_at") @db.Timestamptz(6)

  academy Academy @relation(fields: [academyId], references: [id], onDelete: Cascade)

  @@index([academyId])
  @@map("academy_slug_history")
}
```

The slug is the primary key: one retired slug can only ever have pointed at one
academy, and the database is the right place to say so.

### 4.2 A new slug must be free of both

A slug is rejected when it matches a live academy **or** a retired one.

Without the second check a retired slug could be given to another academy, and
its redirect would then be a lie — carrying somebody to an academy they were
never looking at. The one exception is an academy reclaiming a slug it retired
itself, which is unambiguous: that history row is removed as part of the
change.

### 4.3 The redirect

The web resolves an academy slug from the signed-in person's memberships, not
from a lookup, so a retired slug currently produces a plain 404 with nothing
consulted. `resolveAcademyRoute` gains one step: on a miss, ask the API whether
the slug was retired, and answer a hit with a permanent redirect to the current
one, preserving the rest of the path.

An unknown slug still answers 404. A redirect that guesses is worse than a page
that admits it does not know.

## 5. Implementation

### 5.1 API

- `platform-academy.service.ts` gains `update`, taking `{ academyId, name,
  slug }`. It locks the row as `setStatus` does — two operators renaming at
  once must not both read the old slug — refuses an `ARCHIVED` academy, writes
  the history row when the slug changes, and audits with before and after.
- A `resolveSlug` read for the redirect, answering the current slug for a
  retired one. Open to any authenticated caller: it reveals only what a working
  link already revealed.

### 5.2 Shared

`updatePlatformAcademySchema` for the input, reusing the slug rules the create
schema already applies so the two cannot disagree about what a slug is.

### 5.3 Web

The admin academy detail page gains an edit form beside the lifecycle
controls. The slug field carries a warning that old links will redirect rather
than break, so the operator knows the cost before pressing save.

## 6. Verification

The slug rules are where the risk is:

- a live collision is refused
- a retired collision is refused
- an academy may reclaim a slug it retired itself
- an archived academy refuses the edit
- a name-only change writes no history row
- renaming twice leaves both old slugs pointing at the academy

Redirects:

- a retired slug resolves to the current one, path preserved
- an unknown slug answers 404 and redirects nowhere

Concurrency: two renames of one academy do not both succeed against the same
starting slug.

## 7. Completion criteria

- [ ] A platform admin can change an academy's name and slug.
- [ ] A URL carrying any retired slug reaches the academy.
- [ ] A slug in use, live or retired, cannot be taken.
- [ ] An archived academy cannot be edited.
- [ ] Every change is audited with what it was and what it became.
- [ ] No deletion path is added.
