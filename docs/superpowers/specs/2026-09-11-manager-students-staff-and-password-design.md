# Manager Students & Staff Pages, Username as ID, and Manager-Typed Student Passwords

**Status:** Approved, implemented on the branch below (uncommitted)
**Date:** 2026-09-11
**Branch:** `feat/manager-people-pages` (from `feat/cove-studio-v2`)
**Scope:** Cove Studio manager surfaces: Members page, two new roster pages, and
the student password panel on the member profile

## 1. Purpose

Four improvements a manager asked for after launch:

1. The Members page shows every person's sign-in name, labelled **ID**.
2. A **Students** page lists every student in the academy with their ID, classes,
   and general information, and links to each profile.
3. A **Staff** page lists every teacher, team lead, and manager, and sorts and
   filters by role, including people who hold several roles.
4. A manager **types** a student's new password instead of receiving a random
   one that is hard to remember.

All three tables use the Studio's TanStack `DataTable`, and all three pages look
like the existing Members page.

## 2. Terminology: "ID"

Korean users read "ID" (아이디) as the name you sign in with. That is `User.username`.
Every new column and search hint that shows `username` is labelled:

| Locale | Label |
| ------ | ----- |
| `ko`   | 아이디 |
| `en`   | ID    |

`아이디` is already the sign-in label in `auth.json`, so the manager sees the same
word the student typed at login. Internal identifiers (`membershipId`, `userId`)
are never shown under this label.

An account without a username shows an italic **없음 / None**, not a dash. That
covers Kakao and Google sign-ups and accounts created before usernames existed.
A dash would look like data the page failed to load, which is the convention the
Members page already uses for "not joined".

## 3. Current state

- `/academy/[academySlug]/people` (`people-directory.tsx`) is a server-paged,
  URL-driven TanStack table fed by `academyPeople.list`
  (`PeopleDirectoryService`). The service already **selects and searches**
  `user.username` but never puts it on `PeopleRow`.
- **Bug:** The role filter, its facet counts, and "select all matching" in
  `PeopleBulkService` all compare only the **primary** role
  (`membership.role`). `AcademyMembershipRole.extraRoles` is ignored. A manager
  who also teaches does not appear under the "Teacher" filter, and the count
  beside "Teacher" leaves them out.
- `AcademyMembership.role` always holds the member's **highest** role
  (`primaryAcademyRole`). `STUDENT` never combines with a staff role.
- General information already exists and is manager-readable:
  - `StudentAcademyProfile`: `studentNumber`, `schoolName`, `schoolGrade`,
    `guardianName`, `guardianPhone`, and more.
  - `StaffAcademyProfile`: `academyTitle`, `employeeNumber`, and more.
  - `AcademyMemberProfile.contactPhone`, `academyDisplayName`.
- Classes: `ClassEnrollment` (student → class). `Class.teacherMembershipId`
  (homeroom teacher). `ClassAssistantTeacher` (assistants).
- The student password panel (`student-password-panel.tsx`) calls
  `academyStudentCredentials.issue`. That call always runs
  `generateIssuedPassword()` and returns a 10-character random string.
  `SupabaseAuthService.setPassword` reports every Supabase refusal as
  `STUDENT_CREDENTIAL_TARGET_INVALID` / 502, including a weak password.

## 4. Goals and non-goals

**Goals**

- One server-side, URL-driven table pattern across Members, Students, and Staff:
  paging, sort, search, facets, exact counts, and shareable URLs.
- A multi-role person is found under **every** role they hold, on every page and
  in every bulk selection.
- A manager can set a password a child can remember. That password gets the same
  storage, reveal, and audit guarantees as an issued one.

**Non-goals**

- Editing profile fields from the new tables. They are read-only; editing stays
  on `/people/[membershipId]`.
- Bulk actions on Students or Staff. Those stay on Members.
- Export to Excel or CSV.
- Password rules for staff accounts. Managers still cannot set a staff member's
  password.
- Showing internal database IDs anywhere.

## 5. Authorization

Both new endpoints require what `academyPeople.list` requires:
`ManagerScopeService.requireManager(identity, academyId, "academy.members.manage")`.
The new pages are server-rendered behind `requireAcademyRoute`. The sidebar shows
them only when `canManageAcademy` is true, the same condition as Members.

Guardian phone numbers and staff contact details are personal data. They are
returned one page at a time (25 / 50 / 100 rows) and never as the whole roster,
the same rule `PeopleDirectoryService` follows for emails.

## 6. Architecture

We rejected two alternatives:

- **One endpoint with an "audience" switch.** Its row would carry student-only
  and staff-only fields that are empty half the time.
- **Fetch everyone and page in the browser.** The Members page was moved off
  that approach deliberately, because it does not scale.

We chose **two new endpoints** with their own row shapes. They share the Members
page's primitives.

```
@cove/shared/memberships
  people-directory.ts   (existing)  + username on PeopleRow, + "username" sort
  people-query.ts       (new)       generic URL parse/serialize helpers, moved
                                    out of people-directory.ts and reused by all three
  student-roster.ts     (new)       list input, row, page, facets, URL (de)serialize
  staff-roster.ts       (new)       same, for staff

@cove/api/manage
  people-where.ts          (new)    one membership predicate: search + any-role +
                                    status. Used by the directory, both rosters,
                                    and PeopleBulkService's filter selection
  people-directory.service (edit)   uses people-where, returns username
  people-bulk.service      (edit)   filter selection uses people-where
  people-roster.service    (new)    listStudents(), listStaff()
  manage.router            (edit)   academyPeople.students, academyPeople.staff

@cove/web  app/(studio)/academy/[academySlug]/(framed)/
  people/                  (edit)   ID column, search hint
  students/                (new)    page.tsx, loading.tsx, _components/, _hooks/
  staff/                   (new)    page.tsx, loading.tsx, _components/, _hooks/
  _components/studio-sidebar.tsx (edit)  two links in the People group
```

The new routes are top-level (`/students`, `/staff`) rather than under
`/people/…`. That keeps them apart from the dynamic `/people/[membershipId]`
segment. Every row still links to the existing profile at
`routes.academyPerson(slug, membershipId)`.

`routes.ts` gains `academyStudents(slug)` and `academyStaff(slug)`. Callers never
build these paths by hand, as the Canonical Route Module requires.

### 6.1 One membership predicate (`people-where.ts`)

```ts
peopleWhere(academyId, {
  search: string,
  roles: AcademyRole[],       // empty = any
  statuses: MembershipStatus[], // empty = every status except LEFT
  audience?: "students" | "staff",
  classIds?: string[],        // students only
}): Prisma.AcademyMembershipWhereInput
```

- **Role match is "holds the role":**
  `OR: [{ role: { in: roles } }, { extraRoles: { some: { role: { in: roles } } } }]`.
- **Audience `students`:** `role: "STUDENT"`. The primary role is enough, because
  `STUDENT` never combines with a staff role.
- **Audience `staff`:** `role: { in: ["TEACHER", "TEAM_LEAD", "MANAGER"] }`.
- **Status, user, and search conditions** are unchanged from the current
  `buildWhere`: `LEFT` excluded, `DELETED` users excluded, case-insensitive
  `contains`.
- The Members page, both roster pages, and `PeopleBulkService`'s
  `mode: "filter"` selection all call this one function. A page and the bulk
  selection raised from it therefore always describe the same set of people.

### 6.2 Role facet counts

`groupBy(["role"])` counts only the primary role, so it is replaced. Each role
facet becomes one `count()` with `peopleWhere({ ...search, roles: [role] })`.
There are at most four roles, and the counts run in parallel.

**Documented consequence:** role counts can add up to more than the total,
because a Manager + Teacher is counted under both. The status facet is unchanged:
status is single-valued, so its counts still add up to the total.

## 7. Members page changes

- **`PeopleRow`** gains `username: string | null`. `peopleSortFields` gains
  `"username"`. The sort orders by `user.username`, with nulls last in both
  directions, then by `id asc`.
- **New column `username`**, labelled `people.column.id` (아이디 / ID):
  - placed directly after Person
  - `size: 128`, sortable, not hideable
  - monospace, `truncate`, with a `title` attribute holding the full value
  - an account with no username shows italic `people.no_username` (없음 / None)
- **Search placeholder** `people.search_placeholder` becomes
  "이름, 아이디 또는 이메일" / "Name, ID, or email".
- **Role filter and facets** move to the any-role predicate (§6.1, §6.2).
- **"Select all matching"** resolves with the same predicate (§6.1).

## 8. Students page — `/academy/[academySlug]/students`

### 8.1 Contract: `academyPeople.students`

**Input** (`listStudentRosterInputSchema`, strict):

| Field       | Type                                                                                   | Default       |
| ----------- | -------------------------------------------------------------------------------------- | ------------- |
| `academyId` | uuid                                                                                   |               |
| `page`      | int ≥ 1                                                                                | 1             |
| `pageSize`  | 25 \| 50 \| 100                                                                        | 25            |
| `search`    | string ≤ 120                                                                           | `""`          |
| `statuses`  | `MembershipStatus[]`                                                                   | `[]`          |
| `classIds`  | `uuid[]`, at most 50                                                                   | `[]`          |
| `sort`      | `displayName \| username \| studentNumber \| schoolGrade \| status \| joinedAt \| updatedAt` | `displayName` |
| `direction` | `asc \| desc`                                                                          | `asc`         |

The default sort is by name, ascending. The Members page defaults to "most
recently changed", but a student list is looked up by name.

**Row** (`studentRosterRowSchema`, strict):

```
membershipId, userId, displayName, username (nullable),
status, joinedAt (nullable), updatedAt,
studentNumber, schoolName, schoolGrade, guardianName, guardianPhone  (all nullable)
classes: { id, name }[]            // ACTIVE classes only, ordered by name
academyImageUrl, globalImageUrl, externalAvatarUrl   // resolveMemberAvatars
```

`displayName` uses the same fallback chain as `PeopleDirectoryService`: academy
override, then account name, then username, then displayable email.

**Page:** `rows`, `total`, `page`, `pageSize`, `pageCount`, `sort`, `direction`,
and `facets`:

- `statuses: { value, count }[]`
- `classes: { id, name, count }[]` covers every ACTIVE class in the academy,
  including classes with a count of 0.

Facets are computed against the search but not against the other facet. This is
the rule `peopleFacetsSchema` already follows.

**Search** matches account name, academy display name, username, and
`studentNumber`. It is case-insensitive.

**Sort:** `studentNumber` and `schoolGrade` put nulls last. `schoolGrade` is free
text, so it sorts lexically. That is acceptable for "초3 / 초4 / 중1"-style values
and is documented as a limitation. Every sort ends in `id asc`.

**URL** (`parseStudentRosterQuery` / `serializeStudentRosterQuery`):

- `page`, `size`, `q`, `status` (repeated), `class` (repeated), `sort`, `dir`
- defaults are omitted from the URL
- invalid values fall back to their defaults, never to an error
- unknown class ids are dropped server-side and do not cause an error

### 8.2 Table (`student-roster.tsx`)

`layout="fixed"`. The Student column is unsized and absorbs the slack.

| Column         | Content                                                                                   | Size | Sort | Hideable / initially hidden |
| -------------- | ----------------------------------------------------------------------------------------- | ---- | ---- | --------------------------- |
| Student (학생) | `ProfileAvatar` + name, as a `Link` to the profile                                        | flex | ✓    | no                          |
| ID (아이디)    | username, mono; italic "없음" if null                                                     | 128  | ✓    | no                          |
| Student no. (원생 번호) | mono, tabular; "—" if unset                                                      | 104  | ✓    | yes / no                    |
| Classes (반)   | first two class names as chips, then "+n" with the full list in `title`; italic "미배정" if none | 180 | —    | yes / no                    |
| School · Grade (학교 · 학년) | "school · grade", either part may be missing                                | 160  | ✓ (grade) | yes / no               |
| Guardian (보호자) | name, with the phone below (12px, `text-sub`), formatted by `@cove/shared/profile/phone` | 160 | — | yes / no                   |
| Status (상태)  | `statusTones` badge, as on Members                                                        | 104  | ✓    | no                          |
| Joined (합류일) | `compactDate`; "아직 없음" if invited                                                    | 112  | ✓    | yes / **yes**               |
| (actions)      | "프로필 보기" icon link (`UserPen`), with an `aria-label` naming the student              | 56   | —    | no                          |

**Toolbar:**

- search box, placeholder "이름, 아이디 또는 원생 번호"
- `FacetedFilter` for **Class**, with counts
- `FacetedFilter` for **Status**, with counts
- `PageSizePicker`
- column-visibility menu

No select column and no bulk bar.

**States:**

- **Empty:** `EmptyState` with an academy-level message when unfiltered ("아직
  학생이 없습니다") and a filtered message otherwise.
- **Error:** the Members page's danger `Panel` with Retry.
- **Loading:** `loading.tsx` skeleton, copied from `people/loading.tsx`.
- **Footer:** "N명 중 X–Y".

`compactDate`, `PageSizePicker`, and `usePeople…State`'s URL-sync logic are
currently private to `people-directory.tsx` and `use-people-directory.ts`. They
move to `(framed)/_lib/` and `(framed)/_hooks/`, and all three pages import them.
They are not copied.

## 9. Staff page — `/academy/[academySlug]/staff`

### 9.1 Contract: `academyPeople.staff`

**Input** (`listStaffRosterInputSchema`, strict):

| Field       | Type                                                                                        | Default       |
| ----------- | ------------------------------------------------------------------------------------------- | ------------- |
| `academyId` | uuid                                                                                        |               |
| `page`      | int ≥ 1                                                                                     | 1             |
| `pageSize`  | 25 \| 50 \| 100                                                                             | 25            |
| `search`    | string ≤ 120                                                                                | `""`          |
| `roles`     | `("TEACHER" \| "TEAM_LEAD" \| "MANAGER")[]`                                                 | `[]`          |
| `statuses`  | `MembershipStatus[]`                                                                        | `[]`          |
| `sort`      | `displayName \| username \| role \| employeeNumber \| status \| joinedAt \| updatedAt`      | `role`        |
| `direction` | `asc \| desc`                                                                               | `desc`        |

The default is role, descending: managers first, then team leads, then teachers,
and by name within each role.

**Row** (`staffRosterRowSchema`, strict):

```
membershipId, userId, displayName, username (nullable), email (nullable, displayable only),
role (highest), roles (all held, academyRoles order),
status, joinedAt (nullable), updatedAt,
academyTitle, employeeNumber, contactPhone   (all nullable)
homeroomClasses: { id, name }[]    // ACTIVE classes where Class.teacherMembershipId = this membership
assistantClasses: { id, name }[]   // ACTIVE classes via ClassAssistantTeacher
academyImageUrl, globalImageUrl, externalAvatarUrl
```

`contactPhone` is `AcademyMemberProfile.contactPhone`, the same value the member
profile page shows.

**Facets:**

- `roles: { value, count }[]` covers TEACHER, TEAM_LEAD, and MANAGER. Each is an
  any-role count (§6.2), so the three can add up to more than `total`.
- `statuses: { value, count }[]`

**Search** matches name, academy display name, username, email, and
`employeeNumber`.

**Sort by role (multi-role rule):**

- The sort key is the **highest held role** (`membership.role`), then
  `displayName asc`, then `id asc`. A Manager + Teacher therefore sorts with
  managers.
- Implementation uses Prisma's `orderBy: [{ role: direction }, { user: {
  displayName: "asc" } }, { id: "asc" }]`, the same approach Members already
  uses. This works because Postgres sorts enums by declaration order, and
  `enum AcademyRole` is declared `STUDENT, TEACHER, TEAM_LEAD, MANAGER`, which
  matches `academyRoleRank`.
- `roles.ts` warns that enum position must never decide authority, so this
  coupling is pinned by an API test that asserts the rank order. If someone
  reorders the enum, the test fails; nobody's position changes silently.

**Filter by role:** "Teacher" returns everyone who **holds** TEACHER, whether as
the primary role or as an extra role.

**URL:** `page`, `size`, `q`, `role` (repeated), `status` (repeated), `sort`,
`dir`, with the same lenient parsing as §8.1.

### 9.2 Table (`staff-roster.tsx`)

| Column          | Content                                                                                              | Size | Sort | Hideable / initially hidden |
| --------------- | ---------------------------------------------------------------------------------------------------- | ---- | ---- | --------------------------- |
| Staff (교직원)  | avatar + name, email below; `Link` to profile                                                         | flex | ✓    | no                          |
| ID (아이디)     | username, mono; italic "없음" if null                                                                | 128  | ✓    | no                          |
| Roles (역할)    | **every** held role as a `roleTones` chip, highest first (not "+n")                                   | 188  | ✓ (highest) | no                   |
| Title (직함)    | `academyTitle`; "—" if unset                                                                         | 132  | —    | yes / no                    |
| Classes (담당 반) | homeroom names first, then assistant names marked "(보조)"; two shown, then "+n" with the full list in `title`; italic "없음" if none | 180 | — | yes / no |
| Phone (연락처)  | formatted `contactPhone`                                                                             | 136  | —    | yes / no                    |
| Status (상태)   | badge                                                                                                | 104  | ✓    | no                          |
| Employee no. (사번) | mono                                                                                             | 104  | ✓    | yes / **yes**               |
| Joined (합류일) | `compactDate`                                                                                        | 112  | ✓    | yes / **yes**               |
| (actions)       | "프로필 보기" icon link                                                                              | 56   | —    | no                          |

The role chips are read-only here. Granting and revoking roles stays on Members
and on the profile.

**Toolbar:** search ("이름, 아이디, 이메일 또는 사번"), a **Role** faceted filter
(three options, with counts), a **Status** faceted filter, `PageSizePicker`, and
the column menu.

**Footnote under the table**, shown only when some visible row holds two or more
roles: "여러 역할을 가진 사람은 각 역할 필터에 모두 포함됩니다."

## 10. Sidebar

In the People group, after Members:

```
People (사람)
  Members (구성원)      /people        Users
  Students (학생)       /students      GraduationCap
  Staff (교직원)        /staff         BriefcaseBusiness
  Applications …
  Invitations …
```

All three require `canManageAcademy`. New `nav.json` keys: `link.students`,
`link.staff`.

The profile page's back link keeps pointing to Members (`backTo.academyPerson`).
A per-origin back link is out of scope. The browser's Back button already
returns to the exact roster URL, because roster state lives in the URL.

## 11. Manager-typed student password

### 11.1 Contract

`issueStudentPasswordInputSchema` gains an **optional** `password`:

```ts
export const studentPasswordSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/^[\x21-\x7E]+$/, "STUDENT_PASSWORD_CHARACTERS");
```

- **8–72 characters** matches `signUpStudent`. 72 is bcrypt's limit, and because
  only printable ASCII is allowed, 72 characters means 72 bytes.
- **Printable ASCII only, no spaces.** A password typed while the keyboard is in
  Hangul mode (e.g. `ㅡㅑㅜㅓㅑ`) cannot be typed back on a login form in
  English mode. It is refused up front with a specific message instead of
  becoming a password nobody can use.
- **`password` absent:** the server generates one as today. This keeps old
  clients working during a rolling deploy.

`studentPasswordSchema` lives in `@cove/shared/auth/student-password.ts` so the
browser form and the API validate with the same rule.

### 11.2 Service (`StudentCredentialService.issue`)

- Uses `input.password ?? generateIssuedPassword()`.
- Storage is unchanged: AES-GCM sealed, `visiblePrefix` = first 3 characters,
  `length`, reveal count reset to 0.
- The invariant comment is reworded. Before: "Cove stores only passwords **it
  generated**". After: "Cove stores only passwords **a manager set**, and destroys
  the row the moment the student replaces it." The reasoning is unchanged: the
  student never believed a manager-set password was private.
- **Audit:** the action stays `academy.member.password.issued`. The record's
  existing `after` field carries `{ source: "typed" | "generated" }`, so
  `AuditInput` needs no new field. The password is never written to the audit
  log or to application logs.
- **Defensive check:** the service re-checks a typed password before calling
  Supabase. Wrong characters raise `STUDENT_PASSWORD_CHARACTERS`; a password
  that is too short or too long raises `STUDENT_PASSWORD_REJECTED`.

### 11.3 Supabase refusals

`SupabaseAuthService.setPassword` distinguishes two cases:

- **Weak password** (`error.code === "weak_password"` or status 422) becomes the
  new error code `STUDENT_PASSWORD_REJECTED`, HTTP 422. Its i18n message is:
  "이 비밀번호는 사용할 수 없습니다. 더 길거나 덜 흔한 비밀번호를 입력하세요."
- **Anything else** stays `STUDENT_CREDENTIAL_TARGET_INVALID` / 502.

`STUDENT_PASSWORD_CHARACTERS` (400) is also added to `errors/codes.ts`, with
ko/en messages, for requests that bypass the form.

### 11.4 Panel UI (`student-password-panel.tsx`)

- **Read state is unchanged:** masked `hae•••••••`, Reveal, the issued-by meta
  line, and the explanation.
- The primary button changes from `credentials.issue` "새 비밀번호 발급" to
  `credentials.set` **"새 비밀번호 설정"**, with a `KeyRound` icon. Clicking it
  expands an inline form inside the same card. It is not a modal.
- **The form:**
  - `<input type="text">`, monospace 18px, with `autoComplete="off"`,
    `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}`,
    `data-1p-ignore`, and `data-lpignore="true"`. It is plain text on purpose:
    the manager is choosing a password to write down for a child, and a
    password-type field would let the browser offer to save it as the
    manager's own.
  - Label "새 비밀번호", with the hint "8자 이상 · 영문, 숫자, 기호".
  - **추천 (Suggest)** button (`RefreshCw`). It fills the box with
    `generateIssuedPassword()`, which runs in the browser via
    `crypto.getRandomValues`. The manager can edit the result before saving.
  - **Live validation** with `studentPasswordSchema`. Save stays disabled until
    the password is valid. Two inline messages:
    - `credentials.too_short` when fewer than 8 characters
    - `credentials.bad_characters` when there are Hangul, spaces, or other
      non-ASCII characters: "한글이나 공백은 쓸 수 없습니다. 키보드가 영문
      상태인지 확인하세요."
  - **저장 (Save)** and **취소 (Cancel)**. Escape cancels and Enter saves.
- **After save:** the form closes and the new password is shown in the revealed
  state, exactly as after an issue today, with the "기록되었습니다" note. The
  query cache is updated with the returned state.
- **Errors:** `STUDENT_PASSWORD_REJECTED` and the other API errors appear under
  the form through `useErrorText`. The typed value stays in the box so the
  manager can adjust it.
- **Sessions:** the student's existing sessions are not revoked, which is
  unchanged. The contract comment already states this.

New `profile.json` keys (ko/en): `credentials.set`, `credentials.new_password`,
`credentials.rule_hint`, `credentials.suggest`, `credentials.save`,
`credentials.cancel`, `credentials.too_short`, `credentials.bad_characters`.
`credentials.issue` is removed once nothing references it.

## 12. i18n

All new copy goes in both `ko` and `en`:

- `manager.json`: only the Members changes: people.column.id,
  people.no_username, and the updated people.search_placeholder. This adds
  about 80 bytes.
- **New namespace `people-rosters.json`** (ko/en) holds the `students.*` and
  `staff.*` blocks: titles, descriptions, columns, filters, empty states,
  footer, and the multi-role footnote.
  - It cannot go in `manager.json`: ko/manager.json is already 14.1 KB, and
    `locales.spec.ts` caps each namespace at 15 KB.
  - It is page-scoped, not a layout namespace. `namespaces.ts` gains
    `peopleRosterNamespaces = ['people-rosters', 'manager']`, and both roster
    pages mount it through `PageTranslationsProvider`, the way Members mounts
    `peopleOpsNamespaces`. Role and status labels (`role.*`, `status.*`) are
    reused from `manager` and not duplicated.
- `nav.json`: link.students, link.staff.
- `profile.json`: §11.4 keys.
- `errors`: `STUDENT_PASSWORD_REJECTED`, `STUDENT_PASSWORD_CHARACTERS`.

`locales.spec.ts` must stay green: the two locales have equal key sets and no
empty values.

## 13. Error handling summary

| Situation                                          | Behaviour                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Roster read fails on the server                    | page renders; client shows danger panel with Retry (as Members)                                                  |
| Stale or garbage URL (`?sort=foo&class=not-a-uuid`) | falls back to defaults; the URL is canonicalized with `replaceState`                                            |
| Class filter names an archived or deleted class    | ignored                                                                                                          |
| Non-manager opens `/students` or `/staff`          | `notFound()` after `requireAcademyRoute` (as `/applications` does), and the API refuses                         |
| Invalid typed password                             | blocked in the form; if sent anyway, 400 `STUDENT_PASSWORD_CHARACTERS` or a validation error                     |
| Supabase refuses the password                      | 422 `STUDENT_PASSWORD_REJECTED`, shown under the form                                                            |
| Target is not a student                            | unchanged, 404 `STUDENT_CREDENTIAL_TARGET_INVALID`                                                               |

## 14. Testing

**Shared (vitest)**

- `student-roster` / `staff-roster` parse and serialize round-trip. Defaults are
  omitted and invalid values fall back. Repeated `class` and `role` parameters
  are canonicalized.
- `studentPasswordSchema`:
  - accepts `minji1234`
  - rejects `ㅡㅑㅜㅓㅑ1234`, `abc 12345`, 7 characters, and 73 characters

**API**

- `peopleWhere` any-role: a MANAGER + TEACHER membership matches `roles:
  ["TEACHER"]` on Members, on Staff, and in the bulk filter selection.
- Role facets count that membership under both roles.
- Staff sort by role orders MANAGER, then TEAM_LEAD, then TEACHER, and a
  multi-role Manager + Teacher sits with managers. Order is stable across pages.
- Students: the class filter, the class facet counts, and the fact that
  archived classes are excluded from `classes`.
- `StudentCredentialService.issue`:
  - With a typed password, it calls `setPassword` with exactly that value,
    stores the correct prefix and length, and writes the audit `source:
    "typed"`.
  - Without one, it still generates.
  - A Supabase `weak_password` maps to `STUDENT_PASSWORD_REJECTED`.
- Integration tests use the disposable Docker Postgres
  (`COVE_INTEGRATION_DATABASE_URL`), never the shared dev database.

**E2E (Playwright, `e2e/specs`)**

- A manager opens Members and sees the ID column showing the seeded student's
  username.
- The manager opens Students, filters by a class, clicks a student, and lands on
  their profile.
- The manager opens Staff, filters by Teacher, and sees the seeded multi-role
  manager.
- The manager sets a student's password to a typed value, and the student signs
  in with that username and password.

**Verification before hand-off:** `pnpm typecheck`, plus the affected packages'
unit tests. Do not run `next build` while the dev server is running.

## 15. Found during implementation

Two more drifts were fixed along the way, because they sit on the paths this
work touches:

- **Bulk search did not match usernames.** `PeopleBulkService`'s filter search
  checked name, email, and academy name, but not username. The directory's
  search did check username. So "select all matching" after searching by ID
  resolved a different set from the one on screen. `peopleWhere` (§6.1)
  removes the second copy.
- **Facet counts never rendered in server mode.** `FacetedFilter` only drew
  counts from TanStack's faceted row model, which a server-paged table does not
  have. The Members page passed counts that were never shown. `FacetOption`
  now takes an optional server `count`, which all three tables pass. A count of
  0 is shown rather than hidden.

## 16. Delivery

1. Shared: `people-query.ts` extraction, the username on `PeopleRow`,
   `student-roster.ts`, `staff-roster.ts`, `studentPasswordSchema`, and the
   error codes.
2. API: `people-where.ts` and the any-role fix (Members and bulk), then
   `people-roster.service` with two procedures, then the credential changes.
3. Web: the Members ID column, the shared hooks and `_lib` moves, the Students
   page, the Staff page, the sidebar, and the password panel.
4. i18n ko/en, then tests, then typecheck.

All work happens on `feat/manager-people-pages`. The owner merges it into
`feat/cove-studio-v2` and deploys with the existing guide. No database
migration is required: every field already exists.
