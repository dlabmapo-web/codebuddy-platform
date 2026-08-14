# My Page, Academy Member Profiles, and Profile Images

**Date:** 2026-08-14

**Status:** Draft for review

**Scope:** A role-aware My Page for all Cove Studio users, academy-scoped
student and staff profiles, manager editing, account security entry points, and
profile-image storage.

**Reference product:**
[Kichkintoy](https://github.com/jurabek10/kichkintoy), especially its common
profile, security, preferences, notifications, teacher biography, assigned
classes, and role-specific My Page sections.

**Companion designs:**

- `docs/design/2026-07-22-cove-v2-authentication-authorization-design.md`
- `docs/design/2026-07-22-cove-v2-system-design.md`
- `docs/design/2026-07-24-cove-v2-internationalization-design.md`

## 1. Product decision

Cove Studio will provide one **My Page** for the signed-in person's global
account and one academy-profile section for each active academy membership.
The page adapts its academy section to `STUDENT`, `TEACHER`, `TEAM_LEAD`, or
`MANAGER`. A platform `ADMIN` sees normal account controls and sees an academy
profile only when the same account also has an academy membership.

Global identity and academy-managed information remain separate:

```text
User account
├── sign-in identity and global personal preferences
├── DLAB Mapo membership
│   └── Mapo student or staff profile
└── DLAB Gangnam membership
    └── Gangnam student or staff profile
```

The user owns global identity and security. A student and an active manager of
the selected academy may both update the student's academy profile. Staff may
update their self-presentational academy fields; managers maintain operational
staff fields. Managers never change another person's password, sign-in email,
username, connected providers, or sessions.

Profile-image bytes will be stored in a private Supabase Storage bucket.
PostgreSQL will store asset metadata and ownership relations, not image bytes
or expiring signed URLs. The API will authorize each caller before returning a
short-lived URL.

## 2. Why this differs from Kichkintoy

Kichkintoy demonstrates a useful presentation pattern: a common profile area
followed by role-specific sections such as a teacher biography, assigned
classes, children, security, and notifications. Cove should retain the common
plus role-specific structure.

Cove cannot copy Kichkintoy's single-center profile ownership directly. A Cove
account can belong to multiple academies and can hold a different role in each.
Allowing one academy manager to edit `User.displayName`, `User.avatarUrl`, or
sign-in details would unexpectedly change the person's identity in every other
academy. The academy profile is therefore a required boundary, not an optional
extension.

## 3. Goals

- Give every authenticated user one understandable place to maintain their
  profile, preferences, and security.
- Let students maintain their own academy profile.
- Let academy managers correct and maintain the academy information needed to
  support students and staff.
- Keep global identity separate from academy membership and role data.
- Show useful read-only context such as roles, membership status, classes, and
  courses without turning My Page into an administration dashboard.
- Support one account across multiple academies without cross-academy edits.
- Store student and staff photos privately with explicit access control.
- Reuse the existing Supabase Auth, NestJS/orpc, Prisma, Studio design system,
  English/Korean localization, and audit-log foundations.
- Make concurrent student/manager edits detectable rather than silently losing
  one person's changes.

## 4. Non-goals

- Adding a parent or guardian login role.
- Building billing, contracts, attendance, medical-record, or document flows.
- Collecting a home address, government identifier, gender, or social profile.
- Giving teachers or team leads general permission to edit student profiles.
- Letting users grant themselves academy roles or change membership status.
- Letting managers administer authentication credentials.
- Creating a public people directory.
- Copying external OAuth profile photos into Cove without user action.
- Keeping full-resolution originals after Cove has produced the normalized
  profile image.
- Replacing academy member management, class enrollment, or teacher assignment
  screens.

## 5. Users and jobs

### 5.1 Student

A student needs to:

- recognize the account and current academy;
- correct academy contact, school, grade, and guardian information;
- describe coding interests and a personal learning goal;
- see current classes and courses;
- change personal preferences and security settings; and
- understand which fields the academy can also maintain.

### 5.2 Teacher

A teacher needs to:

- maintain a short academy biography, specialties, and teaching languages;
- see the classes currently assigned to them;
- maintain their personal account and security; and
- distinguish self-editable presentation fields from manager-owned employment
  fields.

### 5.3 Team lead

A team lead needs the staff profile plus a responsibility/title and a read-only
summary of academy authority. Team-lead permissions remain defined by the
authorization map; the profile never implies extra permissions.

### 5.4 Manager

A manager needs to maintain their own profile and open a member's academy
profile from member management. When editing another member, the manager needs
clear field ownership, audit history, and conflict protection.

### 5.5 Platform admin

A platform admin needs ordinary personal account and security controls.
`PlatformRole.ADMIN` is shown read-only. Platform administration does not make
the admin an academy-profile editor unless a separately authorized recovery
operation applies; routine profile correction belongs to academy managers.

## 6. Information architecture

### 6.1 Routes

The canonical signed-in account route is:

```text
/studio/my-page
```

An academy link carries optional selected context:

```text
/studio/my-page?academy={academyId}
```

The `academy` value must name one of the caller's active memberships. When it
is absent, My Page selects the academy from the entry link, the user's last
valid selection, or the first active membership. Invalid, inactive, or
unauthorized values are removed with replace navigation. A user with no active
membership still sees global account, preferences, and security sections.

Manager editing remains academy-scoped:

```text
/studio/academies/:academyId/members/:membershipId/profile
```

The manager route reuses academy-profile fields and validation but does not
render the member's global account/security forms. The academy members table
links to this route. My Page is opened from a profile control in the persistent
Studio header, next to the existing theme and language controls.

On academy-scoped Studio routes, that profile control represents the current
membership and uses the same visible avatar fallback as other academy surfaces:

```text
academy image -> global Cove image -> external OAuth image -> generated initials
```

On global routes it begins at the global Cove image. A successful image change
must update or refresh the persistent header immediately; navigating away must
not leave a cached initials fallback visible.

### 6.2 Page order

My Page uses one narrow reading column, approximately the Kichkintoy
`max-w-3xl` pattern, with independently saved sections:

1. account summary;
2. selected academy profile, when applicable;
3. role-specific academy information;
4. classes and courses, read-only;
5. preferences; and
6. account and security.

On a student page, academy information appears before global account settings
because it is the student's most common profile task. Staff see their staff
profile and assignments first. The page must not use a dense dashboard grid or
hide every section behind tabs.

## 7. Field ownership

### 7.1 Global account

| Field | User | Academy manager | Behavior |
|---|:---:|:---:|---|
| Global display name | Edit | No | Used outside academy context and as academy fallback |
| Global profile image | Edit/remove | No | Used when no academy override exists |
| Sign-in email | Verified change | No | Supabase Auth owns the identity change |
| Contact phone | Verified change | No | Optional; verification required before trusted use |
| Username | Read | No | Immutable sign-in handle after initial claim |
| Password | Change | No | Available only to password-capable identities |
| Connected providers | Manage | No | Supabase Auth operation |
| Active sessions | View/revoke | No | User may revoke other sessions |
| Preferred language | Edit | No | Uses the existing English/Korean locale source |
| Theme | Edit | No | Uses the existing theme preference |
| Timezone | Edit/reset | No | Defaults from academy/browser; stored as an IANA name |
| Platform role | Read | No | Never editable from My Page |

Changing email or phone requires re-verification. The old verified value stays
effective until the new value is verified. OAuth-only accounts see provider-
appropriate controls instead of a nonfunctional password form.

### 7.2 Academy member profile: common fields

| Field | Member | Manager | Notes |
|---|:---:|:---:|---|
| Academy display name | Edit | Edit | Falls back to global display name |
| Academy profile image | Edit/remove | Edit/remove | Falls back to global image, then initials |
| Academy contact phone | Edit | Edit | Not a sign-in credential |
| Membership role | Read | Existing role-management flow | Not changed on profile form |
| Membership status | Read | Existing membership flow | Not changed on profile form |
| Academy name | Read | Read | Comes from membership |
| Joined date | Read | Read | Comes from membership |

The interface labels academy overrides explicitly. Removing an override reveals
the global value; it does not copy the global value into the academy profile.

### 7.3 Student academy fields

| Field | Student | Manager | Requirement |
|---|:---:|:---:|---|
| Date of birth | Edit | Edit | Optional ISO date; never shown to classmates |
| School name | Edit | Edit | Optional, 120 characters maximum |
| School grade/year | Edit | Edit | Optional localized choice plus free-text fallback |
| Guardian name | Edit | Edit | Optional until academy policy makes it required |
| Guardian relationship | Edit | Edit | Optional localized choice plus `OTHER` label |
| Guardian phone | Edit | Edit | Optional normalized phone value |
| Emergency-contact name | Edit | Edit | Optional |
| Emergency-contact phone | Edit | Edit | Optional normalized phone value |
| Coding interests | Edit | View | Optional tags selected from a controlled list |
| Personal learning goal | Edit | View | Optional, 280 characters maximum |
| Internal student number | Read | Edit | Optional, unique only inside one academy |

Guardian and emergency-contact information is academy-private. It is visible
only to the student, active academy managers, and future explicitly authorized
operational workflows. Teachers do not receive it merely because they teach a
class.

Managers may read but do not rewrite a student's coding interests or personal
learning goal. These are the student's own expression, not an academy record.

### 7.4 Staff academy fields

`TEACHER`, `TEAM_LEAD`, and `MANAGER` use one staff-profile shape:

| Field | Staff member | Manager | Requirement |
|---|:---:|:---:|---|
| Short biography | Edit | Edit | 280 characters maximum |
| Teaching specialties | Edit | Edit | Controlled tags with localized labels |
| Teaching languages | Edit | Edit | Controlled language list |
| Academy title/responsibility | View | Edit | Examples: Python teacher, curriculum lead |
| Employee number | View | Edit | Optional and academy-local |
| Assigned classes | Read | Existing class flow | Never changed on My Page |

A manager edits their own biography, specialties, and languages through My
Page. Manager-owned operational fields on their own membership continue to use
member-management safeguards and may not bypass the last-manager rule.

### 7.5 Manager-private notes

Manager-private notes are deliberately excluded from this release. If added,
they must use a separate audited model and permission, not a column returned by
the student's My Page endpoint. This prevents an accidental API response from
exposing private staff commentary to a student.

## 8. Read-only role sections

### 8.1 Student learning context

Show active class memberships and visible assigned courses. Each item links to
the existing authorized learning route. Do not show public rank, manager notes,
other students, or sensitive analytics.

### 8.2 Staff assignments

Teachers see currently assigned active classes and may navigate to the existing
class teaching experience. Team leads and managers see a concise authority
summary and links to existing management pages. The profile page does not
duplicate academy dashboards.

### 8.3 Multiple academy roles

The account summary can list all active academy memberships. Only the selected
academy profile is expanded. Switching academy context must refetch authorized
academy data and must not retain unsaved form state from the previous academy.
If edits are unsaved, the switcher asks the user to discard or remain.

## 9. Data model

The final Prisma names may follow repository conventions, but the boundaries
must remain equivalent to the following conceptual models.

### 9.1 Global additions

```text
User
  avatarAssetId       UUID? -> MediaAsset
  contactPhone        String?
  preferredLocale     String
  timezone            String?
```

`User.avatarUrl` remains temporarily as an external OAuth/legacy fallback.
Once a user uploads a Cove image, `avatarAssetId` becomes authoritative. Signed
URLs are response data and are never persisted in `avatarUrl`.

### 9.2 Academy profile models

```text
AcademyMemberProfile
  membershipId          UUID primary key -> AcademyMembership
  academyDisplayName    String?
  avatarAssetId         UUID? -> MediaAsset
  contactPhone          String?
  createdAt             timestamptz
  updatedAt             timestamptz

StudentAcademyProfile
  membershipId          UUID primary key -> AcademyMembership
  dateOfBirth           date?
  schoolName            String?
  schoolGrade           String?
  guardianName          String?
  guardianRelationship String?
  guardianPhone         String?
  emergencyContactName  String?
  emergencyContactPhone String?
  codingInterests       String[]
  learningGoal          String?
  studentNumber         String?
  createdAt             timestamptz
  updatedAt             timestamptz

StaffAcademyProfile
  membershipId          UUID primary key -> AcademyMembership
  bio                   String?
  specialties           String[]
  teachingLanguages     String[]
  academyTitle          String?
  employeeNumber        String?
  createdAt             timestamptz
  updatedAt             timestamptz
```

Use a partial/nullable academy-local uniqueness rule for student and employee
numbers. Normalize phone values before persistence while retaining localized
display formatting in the client.

Role-specific records are created lazily when first edited. An academy role
change does not delete the old role-specific record because a later correction
or reversal must not destroy data. Endpoints expose only the fields appropriate
to the current role.

### 9.3 Media assets

```text
MediaAsset
  id                 UUID primary key
  bucket             String
  objectKey          String unique
  purpose            USER_AVATAR | ACADEMY_MEMBER_AVATAR
  uploaderUserId     UUID -> User
  contentType        String
  sizeBytes          Int
  width              Int
  height             Int
  checksumSha256     String
  createdAt          timestamptz
  supersededAt       timestamptz?
  deletedAt          timestamptz?
```

Business ownership is expressed by `User.avatarAssetId` or
`AcademyMemberProfile.avatarAssetId`. `uploaderUserId` records who performed the
upload; it does not decide who may view the image. A manager-uploaded student
photo therefore remains attached to the student's academy profile.

## 10. Profile-image storage

### 10.1 Storage choice

Use Supabase Storage because it is already the platform's selected object store
and client dependency. Create a dedicated private bucket:

```text
profile-images
```

Do not reuse the existing public rich-text upload bucket. Public bucket URLs
bypass read access control, while Cove profile images can identify minors and
should be limited to authorized product contexts.

Object keys are immutable and include business scope:

```text
global/{userId}/{assetId}.webp
academy/{academyId}/{membershipId}/{assetId}.webp
```

The UUID asset ID prevents cache collisions. Replacing a photo creates a new
object and atomically changes the database relation; it never overwrites the
old object in place.

### 10.2 Upload and normalization

For this small-file workflow, the authenticated API owns the upload rather
than exposing the Supabase service key or accepting a client-chosen object key.

```text
browser selects and optionally crops image
  -> API authenticates user and authorizes target profile
  -> API accepts multipart upload with a strict byte limit
  -> server verifies file signature and decodes image
  -> server removes metadata and normalizes orientation
  -> server center-crops/resizes to 512 x 512 WebP
  -> server uploads immutable object to private bucket
  -> server creates MediaAsset and changes profile relation transactionally
  -> old asset is marked superseded for asynchronous cleanup
```

Accepted input types are JPEG, PNG, and WebP. SVG, GIF, HEIC, and animated
images are rejected in the first release. The input limit is 5 MiB. The server
must validate decoded content and magic bytes rather than trusting the browser
MIME type or extension. The normalized result must be no larger than 512 KiB.
Image metadata, including EXIF location data, must not survive normalization.

The browser shows a square crop preview, upload progress, validation errors,
and the final server-normalized image. If normalization or persistence fails,
the prior image remains active.

### 10.3 Read authorization and delivery

The bucket stays private. The NestJS API authorizes the asset using Cove's
database permissions and returns a short-lived signed URL, normally valid for
one hour:

- a user may read their own global and academy images;
- an active member may read academy-profile images needed in authorized
  academy experiences such as rosters, class pages, and feedback;
- an active manager may read images of members in the same academy;
- cross-academy access is denied; and
- a platform admin receives no routine read access solely from `ADMIN`.

List endpoints that render many people return already-authorized image URLs in
the same response or through a batch media resolver. The browser must not make
one authorization request per table row. Signed URLs may be cached only until
their expiry and must never be written into application tables.

The Supabase service-role key stays server-only. Storage RLS remains deny-by-
default for browser writes; an accidental direct client upload must fail.

### 10.4 Replacement, deletion, and fallback

When a photo is removed, the database relation is cleared immediately and the
UI falls back in this order:

```text
academy image -> global Cove image -> external OAuth image -> generated initials
```

Superseded objects are retained for 24 hours to make transient failures
recoverable, then deleted by an idempotent cleanup job. Failed/orphan uploads
that never become attached are also removed after 24 hours. Deleting a user or
academy profile follows the platform retention policy and schedules its
attached objects for deletion; storage deletion is not performed inside the
database transaction.

## 11. API boundaries

The exact contract package syntax belongs to the implementation plan. The API
must expose equivalent operations:

```text
profile.getMe
profile.updateGlobalProfile
profile.updatePreferences
profile.beginEmailChange
profile.beginPhoneChange
profile.listSessions
profile.revokeSession

academyProfile.getMine
academyProfile.updateMine
academyProfile.updateStudentSelfExpression
academyProfile.getForManager
academyProfile.updateForManager

profileImage.uploadGlobal
profileImage.removeGlobal
profileImage.uploadAcademy
profileImage.removeAcademy
```

Global and academy updates are separate operations. A form must not send
manager-owned fields merely because they appeared read-only in its response.
Manager operations accept `academyId` and `membershipId`, verify an active
`MANAGER` membership, and write an audit record containing changed field names
and safe before/after values. Passwords, tokens, raw image bytes, and full
signed URLs never enter audit logs.

Every mutable profile response includes `updatedAt`. Updates submit the last
seen value. A mismatch returns `PROFILE_CHANGED`; the UI retains the user's
draft and offers to reload current values. This protects concurrent student and
manager edits from last-write-wins loss.

## 12. Authorization rules

- Any active Cove user may read and update permitted fields on their global
  profile.
- A user may read an academy profile only for their own active membership or
  through an academy permission that explicitly requires it.
- A student may update self-editable fields only on their own current
  `STUDENT` membership.
- Staff may update self-editable fields only on their own current staff
  membership.
- Only an active `MANAGER` in the academy may use the manager profile endpoint.
- Teachers and team leads cannot edit student academy profiles in this release.
- Profile endpoints never alter `AcademyMembership.role` or `.status`.
- A suspended/left membership remains historical but is not editable through
  My Page.
- The authorization decision is enforced in NestJS and is not inferred from
  hidden controls in Next.js.

## 13. Validation and errors

- Trim human-entered text and reject control characters.
- Enforce all length and enum constraints in shared schemas and again at the
  API boundary.
- Normalize phone numbers to a canonical international form when a country can
  be established; otherwise reject ambiguous values rather than guessing.
- Reject a birth date in the future or an implausible date.
- Reject academy-local student/employee number conflicts without revealing
  information outside the academy.
- Preserve the user's draft on validation, authorization, network, and conflict
  errors.
- Show section-level success, not a generic page success that implies unrelated
  fields were saved.
- Return stable error codes for invalid image type, image too large, decode
  failure, unauthorized target, storage failure, and profile conflict.

If an academy role changes while the page is open, the next read or write
returns the new authorized shape. Removed fields disappear and the UI explains
that academy access changed.

## 14. Accessibility, localization, and responsive behavior

- Ship English and Korean copy with the first release.
- Use semantic headings and forms; every control has a persistent label.
- Image controls include descriptive text, keyboard-operable crop controls, and
  a non-image fallback.
- The avatar's alt text identifies the person only when that adds information;
  decorative duplicates use empty alt text.
- Save status and errors are announced to assistive technology.
- Role, status, verification, and ownership never rely on color alone.
- Mobile uses the same vertical section order with full-width primary actions.
- Long academy, school, and user names wrap without hiding actions.
- Avatar wrappers have explicit width and height at every size. The image is
  absolutely contained with `object-fit: cover` so its intrinsic dimensions
  cannot resize a flex item in Safari or turn a circular avatar into a large
  oval.
- Dates, phone display, and grade labels are localized; stored values remain
  locale-independent.
- Light and dark themes use existing Studio tokens.

## 15. Audit, privacy, and retention

Manager edits to another member always write `AuditLog` with actor, academy,
target membership, action, request ID, changed fields, and timestamp. Student
self-edits may use a lighter profile event log but must still be observable.
Security changes use Supabase's identity/session audit sources where available.

API responses follow least disclosure:

- class rosters receive display identity, not guardian or emergency details;
- teacher analytics receive only the student fields required by that feature;
- member management receives operational fields according to role; and
- only self and managers receive the full academy profile shape.

Logs and analytics must not contain birth dates, guardian phone numbers,
emergency contacts, raw uploaded images, or signed URLs. Product analytics may
record that a section was saved or an upload succeeded without recording field
values.

## 16. Testing and acceptance criteria

### 16.1 API and data

- A user can update global fields without changing any academy profile.
- A student can update permitted fields on their own active membership.
- A manager can update permitted student/staff fields only in their academy.
- A manager cannot change another user's sign-in fields through profile APIs.
- Teacher, team lead, suspended, left, and cross-academy manager attempts fail.
- Role and status never change through profile mutations.
- Academy-local number uniqueness and all validation rules are covered.
- Stale `updatedAt` produces `PROFILE_CHANGED` and preserves the newer row.
- Manager changes create safe, academy-scoped audit entries.
- Role changes return only the current role's profile shape.

### 16.2 Image security and lifecycle

- Direct anonymous and ordinary browser writes to `profile-images` fail.
- JPEG, PNG, and WebP inputs normalize to a metadata-free 512-square WebP.
- Oversized, spoofed, corrupt, SVG, animated, and unsupported files fail safely.
- A manager can upload only for a member in their own academy.
- Signed image access obeys self, same-academy, membership-status, and manager
  rules.
- Replacing/removing an image preserves the old image until the database change
  succeeds.
- Cleanup deletes superseded/orphan objects after the grace period and is safe
  to retry.
- Batch list responses avoid one media authorization request per row.

### 16.3 Web experience

- Users with zero, one, and multiple academy memberships see the correct page.
- Student, teacher, team lead, manager, and platform-admin variants render only
  their authorized sections.
- Academy switching handles unsaved changes and unauthorized query values.
- Each section saves independently and retains drafts on failure.
- OAuth-only and password-capable security states render correctly.
- Image selection, crop, progress, removal, and fallback are keyboard and screen
  reader usable.
- Uploaded avatars stay circular and at their intended `sm`, `md`, `lg`, or
  `xl` dimensions in current Safari, Chromium, and Firefox.
- Academy headers show the academy image first and update after upload without
  requiring a hard reload.
- English/Korean, narrow mobile, desktop, light theme, and dark theme receive
  component or end-to-end coverage proportional to risk.

## 17. Delivery sequence

1. Add profile contracts, academy-profile models, permissions, and audit rules.
2. Add the private storage bucket, media metadata, normalization, delivery, and
   cleanup lifecycle.
3. Build global My Page summary, preferences, and safe account controls.
4. Build student academy profile and manager editing with concurrency checks.
5. Build staff role sections and read-only class/course summaries.
6. Complete localization, accessibility, privacy checks, observability, and
   end-to-end coverage.

The first releasable slice may omit phone verification, connected-provider
management, and session revocation UI if Supabase integration work is larger
than the profile foundation. Those controls must then render as clear read-only
status or remain absent; they must not use simulated behavior. The academy
profile boundary, manager restrictions, and private profile-image storage are
not optional slices.

## 18. Acceptance summary

The feature is complete when every user type has an appropriate My Page, a
student and their academy manager can safely maintain the student's academy
profile, staff fields respect self-versus-manager ownership, global credentials
remain user-only, multiple academies cannot affect one another, and profile
images are normalized, privately stored, authorized, replaceable, and cleaned
up without exposing permanent public URLs.
