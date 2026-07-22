# Cove v2 Authentication and Authorization Design

**Product:** Cove Studio

**Status:** Approved design; implementation pending

**Date:** 2026-07-22

**Scope:** Identity, academy membership, roles, permissions, and Cove v1 account migration

## 1. Decision summary

Cove Studio will use Supabase Auth for identities and sessions, and the NestJS API with PostgreSQL/Prisma for application authorization.

The important decisions are:

- Users can sign in with email/password, Google, Kakao, and Naver.
- A Cove account is global and can belong to multiple academies.
- The same account may have a different role in each academy.
- Public signup never grants an academy role.
- An academy manager chooses a new member's academy role through an invitation or join-request approval.
- The Cove platform admin does not perform routine academy role assignment.
- A platform admin may designate the first manager when an academy is created and may perform an audited emergency recovery when an academy has no active manager.
- Each academy membership has one highest role: `STUDENT`, `TEACHER`, `TEAM_LEAD`, or `MANAGER`.
- `ADMIN` is a separate platform role, not an academy role.
- Supabase access tokens are accepted by NestJS, but roles and permissions are always loaded from the Cove database.
- Cove does not create a second password system or issue a second application JWT.
- Existing Cove v1 accounts will be migrated progressively without directly modifying Supabase Auth tables.

## 2. Goals

- Provide secure authentication for the Cove Studio web and API applications.
- Support many DLab academies while keeping academy data isolated.
- Let academy managers control their own members and roles.
- Allow one person to work or study at multiple academies with different roles.
- Prevent users from assigning privileged roles to themselves.
- Keep platform administration separate from academy operations.
- Preserve existing Cove v1 users and their learning data during migration.
- Keep authorization rules explicit, testable, and enforced by NestJS.

## 3. Non-goals

- Implementing authentication in this design task.
- Reproducing every Elice permission type immediately.
- Adding `TEMPORARY_TEAM_LEAD` as a permanent role.
- Storing passwords, OAuth secrets, or refresh tokens in Cove application tables.
- Using frontend route protection as the security boundary.
- Encoding academy roles permanently inside JWT custom claims.
- Designing detailed course, classroom, or content-assignment schemas here.

## 4. System boundary

```text
Browser / Next.js
    |
    | Supabase Auth: login, callback, refresh, logout
    | Cove API: Bearer access token
    v
NestJS API
    |
    +-- verifies Supabase JWT
    +-- loads Cove user and academy membership
    +-- evaluates explicit permissions
    v
Supabase PostgreSQL
    |
    +-- auth schema: owned by Supabase Auth
    +-- public/application schema: owned through Prisma migrations
```

### 4.1 Ownership

Supabase Auth owns:

- Auth identities and provider links.
- Password credentials.
- Email verification.
- Access and refresh sessions.
- OAuth state and PKCE processing.

Cove owns:

- User profile and lifecycle status.
- Platform administration role.
- Organizations and academies.
- Academy memberships and roles.
- Invitations and join requests.
- Permission evaluation.
- Audit records.
- The relationship between migrated v1 users and Supabase identities.

Prisma must not create, update, or migrate Supabase's `auth.users` table. The application stores the Supabase Auth user UUID as `User.authUserId`, but it does not own that identity row.

## 5. Identity and access model

Authorization has three separate levels:

```text
Global account
├── Platform role: USER or ADMIN
├── Academy membership at DLab Mapo: TEACHER
├── Academy membership at DLab Gangnam: TEAM_LEAD
└── Future course/class assignments inside each academy
```

These concepts must not be collapsed into one global `role` column.

### 5.1 Global account

A global account represents one person. Authentication providers are sign-in methods for that account, not separate Cove users.

A newly authenticated person initially has:

- A Supabase identity.
- A Cove user profile.
- `platformRole = USER`.
- No academy access unless an invitation is accepted or a manager approves a join request.

### 5.2 Platform role

| Role | Meaning |
|---|---|
| `USER` | Normal Cove account. Access comes from academy memberships. |
| `ADMIN` | Cove company/platform operator with platform-wide responsibilities. |

`ADMIN` must not be used as the normal manager of academy users. Its academy-related authority is limited to platform operations, initial academy bootstrap, and audited recovery.

### 5.3 Academy roles

| Role | Business meaning |
|---|---|
| `STUDENT` | Learner enrolled in academy courses/classes. |
| `TEACHER` | Teacher approved by an academy manager. |
| `TEAM_LEAD` | Academy sub-manager/content lead. |
| `MANAGER` | Academy director responsible for the academy and its members. |

Each active academy membership has exactly one role. A role represents the member's highest general authority in that academy. Lower-level abilities are inherited through an explicit permission map.

The implementation must not rely on enum ordering or numeric comparisons such as `role >= TEACHER`. It must map each role to named permissions.

### 5.4 Temporary authority

`TEMPORARY_TEAM_LEAD` will not be a permanent academy role in the initial version. If Cove later needs temporary authority, it should use a time-limited delegation with:

- Named permissions.
- `startsAt` and `expiresAt`.
- Granting manager.
- Revocation state.
- Audit history.

This prevents a temporary operational need from permanently changing the user's academy identity.

## 6. Role and permission policy

### 6.1 Permission matrix

| Capability | Student | Teacher | Team lead | Manager | Platform admin |
|---|:---:|:---:|:---:|:---:|:---:|
| View assigned learning content | Yes | Yes | Yes | Yes | Support-only |
| Submit student work | Yes | No | No | No | No |
| Manage assigned classes/students | No | Yes | Yes | Yes | No |
| Review submissions and progress | Own | Assigned | Academy | Academy | Support-only |
| Create/edit curriculum content | No | Assigned/draft only | Yes | Yes | No |
| Publish curriculum content | No | No by default | Yes | Yes | No |
| View academy analytics | Own | Assigned | Yes | Yes | Support-only |
| Invite academy members | No | No | No | Yes | First-manager/recovery only |
| Choose or change academy roles | No | No | No | Yes | First-manager/recovery only |
| Suspend academy memberships | No | No | No | Yes | Recovery only |
| Change academy settings | No | No | No | Yes | Platform lifecycle only |
| Create/suspend academies | No | No | No | No | Yes |
| Manage platform admins | No | No | No | No | Controlled bootstrap only |

Course and class assignments will further restrict teacher and student access. For example, `TEACHER` means the person may teach, but it does not automatically grant access to every class or every student in the academy.

### 6.2 Academy manager authority

An active academy manager may:

- Invite a person and choose their academy role.
- Approve a join request and choose the role during approval.
- Change an active member's role.
- Suspend or restore a membership.
- Appoint another manager.

An academy manager may not:

- Grant the platform `ADMIN` role.
- Manage members of another academy unless they are also its manager.
- Demote or remove the last active manager.
- Change their own role when doing so would leave no active manager.

Role changes must use a database transaction, lock or otherwise serialize the affected manager memberships, enforce the last-manager rule, and write an audit record.

### 6.3 Platform admin exception

When a platform admin creates an academy, the admin must designate its first manager. After that, routine membership and role management belongs to the academy's managers.

Emergency platform-admin recovery is allowed only when an academy has no usable active manager. It must require:

- A documented reason.
- A separately authorized endpoint or command.
- An immutable audit entry.
- Notification to the affected academy when notification infrastructure exists.

## 7. Signup and membership flows

### 7.1 Public signup

```text
User selects email/password or an OAuth provider
    -> Supabase authenticates the identity
    -> Next.js completes the PKCE callback
    -> Cove API bootstraps an application profile idempotently
    -> User has a global USER account with no academy role
```

The signup UI must not offer a teacher, team-lead, manager, or admin role selector.

### 7.2 Manager invitation

```text
Manager enters an email and chooses academy role
    -> Cove creates a single-use, expiring invitation
    -> Recipient signs in or creates an account
    -> Recipient verifies the invited email
    -> Recipient accepts invitation
    -> Cove activates membership with manager-selected role
```

The invitation stores a hash of the token, never the plaintext token. Acceptance requires the authenticated account to control the invited email, except for a separate manager-approved correction flow.

### 7.3 Join request

An academy may optionally allow people to request membership.

```text
Authenticated user requests to join academy
    -> Request is PENDING
    -> User does not choose an authoritative role
    -> Academy manager reviews request and chooses role
    -> Approved membership becomes ACTIVE
```

If the UI asks why the person is joining, that answer is only application information. It must not become a role until a manager explicitly approves it.

### 7.4 Existing account invited to another academy

The existing global account accepts the invitation and receives another academy membership. No duplicate Cove user is created.

Example:

```text
One user account
├── DLab Mapo: TEACHER
└── DLab Gangnam: TEAM_LEAD
```

### 7.5 Profile bootstrap

After a valid first Supabase session, Next.js calls an idempotent API operation such as `POST /auth/bootstrap`.

The API:

1. Verifies the Supabase access token.
2. Finds a Cove user by `authUserId`.
3. Creates a profile if it does not exist.
4. Copies only approved profile claims such as verified email, display name, and avatar.
5. Returns the user's platform role and academy memberships.

Authenticated API middleware may repeat the safe upsert as a fallback so interrupted callbacks do not leave an unusable identity. A database trigger on `auth.users` is not required.

## 8. Authentication providers

### 8.1 Email and password

- Supabase stores and verifies password credentials.
- Email verification is required before accepting an academy invitation or join request.
- Password reset and email-change flows use Supabase Auth.
- Cove never receives or stores the password except during the tightly scoped v1 migration flow described later.

### 8.2 Google

Google uses Supabase's native Google provider with PKCE and an explicit redirect allowlist.

### 8.3 Kakao

Kakao uses Supabase's native Kakao provider. Provider configuration must request the required profile scopes. Because email availability depends on Kakao application settings and user consent, Cove must treat provider email as possibly absent until verified.

### 8.4 Naver

Naver is not a built-in Supabase provider at the time of this design. It will use Supabase Custom OAuth with the identifier `custom:naver`.

Implementation must begin with a staging compatibility test covering:

- Authorization endpoint.
- Token endpoint.
- UserInfo response.
- Stable provider subject.
- Email and email-verification behavior.
- Logout and account-linking behavior.

If Naver's UserInfo response is not compatible with the standard claims expected by Supabase, Cove will expose a narrow server-side adapter that converts the Naver response into standard fields such as `sub`, `email`, `name`, and `picture`. Supabase will still issue and manage the Cove session; this adapter must not become a second authentication system.

### 8.5 Missing email

An authenticated provider identity may not provide a usable email. In that case:

- The Cove user is created with `status = PENDING_PROFILE`.
- The user can access only profile-completion routes.
- The user must add and verify an email through a controlled flow.
- No academy invitation or membership can be accepted until verification succeeds.

## 9. Identity linking

One person may sign in using more than one provider. Provider identities should resolve to one global Cove account.

Rules:

- Supabase automatic linking may be used when providers supply the same verified email.
- An authenticated user may explicitly link another provider from account settings.
- Cove must not link accounts based only on a display name, an unverified email, or a provider-specific ID from another provider.
- If an email collision is ambiguous, access is denied and a support/recovery flow is required.
- Academy memberships attach to the Cove user, not to an individual OAuth identity.

## 10. Session and API authentication

### 10.1 Web session

Next.js uses `@supabase/ssr` and cookie-based server-side session handling. OAuth uses Authorization Code with PKCE.

The web application may use the publishable Supabase key. It must never contain the Supabase secret/service-role key or database credentials.

### 10.2 NestJS authentication

The web application sends the Supabase access token to NestJS as a bearer token. A NestJS authentication guard verifies:

- Signature using the project's trusted JWKS/key configuration.
- Issuer.
- Audience where applicable.
- Expiration and not-before constraints.
- Required subject claim.

It then loads the Cove `User` by `authUserId` and rejects users whose application status does not permit access.

### 10.3 Academy authorization

Academy-scoped API operations must receive academy context through a validated route parameter or resource relationship. A membership guard loads the active membership and evaluates a named permission.

```text
valid Supabase token
    -> active Cove user
    -> requested resource belongs to academy
    -> active membership in that academy
    -> membership role has named permission
    -> optional course/class assignment permits resource
```

JWT metadata is not the source of truth for academy roles. This prevents stale tokens from preserving permissions after a manager changes or suspends a membership.

### 10.4 Logout and revocation

- Normal logout revokes/clears the Supabase session according to the selected scope.
- Suspending a Cove user immediately blocks API access even if a token is not yet expired.
- Suspending one academy membership blocks only that academy.
- Sensitive role changes may additionally revoke active Supabase sessions when appropriate.
- Cove application tables do not store refresh tokens.

## 11. Proposed application data model

This is a design-level Prisma model. Naming and indexes may be refined during the implementation plan, but the ownership and relationships are required.

### 11.1 Enums

```prisma
enum PlatformRole {
  USER
  ADMIN
}

enum UserStatus {
  PENDING_PROFILE
  ACTIVE
  SUSPENDED
  DELETED
}

enum OrganizationStatus {
  ACTIVE
  SUSPENDED
  ARCHIVED
}

enum AcademyStatus {
  ACTIVE
  SUSPENDED
  ARCHIVED
}

enum AcademyRole {
  STUDENT
  TEACHER
  TEAM_LEAD
  MANAGER
}

enum MembershipStatus {
  INVITED
  ACTIVE
  SUSPENDED
  LEFT
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}

enum JoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}
```

### 11.2 Core models

```prisma
model User {
  id                 String       @id @default(uuid()) @db.Uuid
  authUserId         String?      @unique @map("auth_user_id") @db.Uuid
  email              String?      @unique
  displayName        String?      @map("display_name")
  avatarUrl          String?      @map("avatar_url")
  platformRole       PlatformRole @default(USER) @map("platform_role")
  status             UserStatus   @default(PENDING_PROFILE)
  legacyUserId       String?      @unique @map("legacy_user_id")
  legacyUsername     String?      @unique @map("legacy_username")
  legacyPasswordHash String?      @map("legacy_password_hash")
  migratedAt         DateTime?    @map("migrated_at") @db.Timestamptz(6)
  lastSignInAt       DateTime?    @map("last_sign_in_at") @db.Timestamptz(6)
  createdAt          DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)

  memberships        AcademyMembership[]

  @@map("users")
}

model Organization {
  id        String             @id @default(uuid()) @db.Uuid
  name      String
  slug      String             @unique
  status    OrganizationStatus @default(ACTIVE)
  createdAt DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  academies Academy[]

  @@map("organizations")
}

model Academy {
  id             String        @id @default(uuid()) @db.Uuid
  organizationId String        @map("organization_id") @db.Uuid
  name           String
  slug           String
  status         AcademyStatus @default(ACTIVE)
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization   Organization  @relation(fields: [organizationId], references: [id])
  memberships    AcademyMembership[]

  @@unique([organizationId, slug])
  @@index([organizationId, status])
  @@map("academies")
}

model AcademyMembership {
  id               String           @id @default(uuid()) @db.Uuid
  academyId        String           @map("academy_id") @db.Uuid
  userId           String           @map("user_id") @db.Uuid
  role             AcademyRole
  status           MembershipStatus @default(INVITED)
  invitedByUserId  String?          @map("invited_by_user_id") @db.Uuid
  approvedByUserId String?          @map("approved_by_user_id") @db.Uuid
  joinedAt         DateTime?        @map("joined_at") @db.Timestamptz(6)
  suspendedAt      DateTime?        @map("suspended_at") @db.Timestamptz(6)
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  academy          Academy          @relation(fields: [academyId], references: [id])
  user             User             @relation(fields: [userId], references: [id])

  @@unique([academyId, userId])
  @@index([userId, status])
  @@index([academyId, role, status])
  @@map("academy_memberships")
}
```

The final schema must also include:

#### `AcademyInvitation`

- Academy ID.
- Normalized invited email.
- Manager-selected role.
- Hashed single-use token.
- Status and expiration.
- Inviting manager.
- Accepting user, when accepted.
- Creation, acceptance, revocation, and update timestamps.

Only one usable pending invitation should exist for the same normalized email and academy. If Prisma cannot express the required partial uniqueness, it will be added through a reviewed SQL migration and enforced transactionally in the service.

#### `AcademyJoinRequest`

- Academy ID and requesting user.
- Optional message/application metadata.
- Status.
- Reviewing manager.
- Manager-selected role, populated only on approval.
- Review timestamp and reason.

Only one pending join request may exist per user and academy.

#### `AuditLog`

- Actor user ID.
- Academy ID when academy-scoped.
- Action name.
- Target type and ID.
- Redacted before/after JSON.
- Request/correlation ID.
- IP address and user agent where appropriate.
- Timestamp.

Audit data must never contain passwords, access tokens, refresh tokens, invitation plaintext tokens, provider secrets, or full sensitive credential payloads.

### 11.3 Why `User.id` and `authUserId` are separate

New Cove users normally receive both values during profile bootstrap. They remain separate because Cove v1 users and their learning records can be imported before a Supabase identity exists. Later, successful progressive migration attaches `authUserId` without rewriting every foreign key in the imported learning data.

## 12. API contract outline

Exact oRPC contracts and Zod schemas will be defined during implementation planning.

### 12.1 Authentication/profile

- `POST /auth/bootstrap` — idempotently create or refresh the Cove profile.
- `GET /auth/me` — return account status, platform role, academy memberships, and available academies.
- `POST /auth/complete-profile` — complete required fields after a provider returns incomplete data.
- `POST /auth/v1-migrate` — tightly controlled temporary progressive-migration endpoint.

### 12.2 Academy membership

- `POST /academies/:academyId/invitations` — manager chooses email and role.
- `GET /academies/:academyId/invitations` — manager lists invitations.
- `POST /invitations/:token/accept` — authenticated recipient accepts.
- `POST /academies/:academyId/join-requests` — authenticated user requests access.
- `PATCH /academies/:academyId/join-requests/:id` — manager approves/rejects and chooses role.
- `GET /academies/:academyId/members` — permitted academy member list.
- `PATCH /academies/:academyId/members/:userId/role` — manager changes role.
- `PATCH /academies/:academyId/members/:userId/status` — manager suspends/restores membership.

### 12.3 Platform operations

- `POST /platform/academies` — platform admin creates academy and designates initial manager.
- A separate recovery command or endpoint appoints a manager only when normal academy governance is unavailable.

## 13. Stable authorization errors

Shared contracts should define stable codes such as:

- `AUTHENTICATION_REQUIRED`
- `TOKEN_INVALID`
- `PROFILE_INCOMPLETE`
- `USER_SUSPENDED`
- `EMAIL_VERIFICATION_REQUIRED`
- `ACADEMY_MEMBERSHIP_REQUIRED`
- `ACADEMY_MEMBERSHIP_SUSPENDED`
- `PERMISSION_DENIED`
- `INVITATION_INVALID`
- `INVITATION_EXPIRED`
- `INVITATION_EMAIL_MISMATCH`
- `JOIN_REQUEST_ALREADY_PENDING`
- `LAST_MANAGER_REQUIRED`
- `IDENTITY_LINK_CONFLICT`
- `LEGACY_ACCOUNT_ALREADY_MIGRATED`

Clients may translate these codes into user-facing messages. They must not depend on parsing backend error strings.

## 14. Cove v1 account migration

Cove v1 uses a custom username/password system with bcrypt hashes and does not consistently have a verified email for every user. Supabase Auth cannot safely adopt those application password hashes by inserting rows directly into its internal tables.

The recommended strategy is progressive migration.

### 14.1 Preparation

Before cutover:

1. Import v1 users into Cove v2 application `users` with stable `legacyUserId`, `legacyUsername`, and the existing bcrypt hash.
2. Import academy membership and learning data using the application-owned `User.id`.
3. Keep `authUserId` null for users who have not migrated.
4. Encrypt or otherwise strictly restrict access to legacy password hashes.
5. Record migration status and retain reconciliation reports.

### 14.2 First v2 login

```text
User enters existing v1 username and password
    -> temporary migration endpoint rate-limits request
    -> endpoint verifies existing bcrypt hash once
    -> user provides or confirms an email
    -> email ownership is verified
    -> Supabase Auth identity is created/linked
    -> User.authUserId is attached transactionally
    -> existing v2 profile and learning data remain on User.id
    -> legacy hash is cleared after successful finalization
```

The user's submitted password may be set as their new Supabase password after successful legacy verification, allowing them to continue with the same password without Cove retaining it.

### 14.3 Migration security

- Never link a legacy profile to an OAuth account based only on a matching unverified email.
- Require the legacy password plus verified email, or a separately audited recovery process.
- Rate-limit by account, IP, and device risk signals where available.
- Return generic failures that do not reveal whether a username exists.
- Make the migration operation idempotent and transaction-safe.
- Clear `legacyPasswordHash` after successful migration and the defined rollback/grace requirements are satisfied.
- Disable and remove the migration endpoint after the migration window.
- Provide password-reset or manager-assisted recovery for users who cannot complete migration.

## 15. Security requirements

- NestJS is the authoritative boundary for protected business operations.
- Every academy-owned query must prove academy ownership and active membership.
- Role changes are server-side only and audited.
- Service-role/secret Supabase keys exist only in NestJS deployment secrets.
- Database URLs never appear in the web application.
- Redirect URLs are allowlisted separately for local, staging, and production environments.
- OAuth uses state and PKCE protections supplied by the supported flow.
- Credential errors do not disclose account existence.
- Signup, password reset, invitation, join request, and legacy migration endpoints are rate-limited.
- CAPTCHA may be enabled for public authentication flows when abuse risk warrants it.
- Invitation tokens are high entropy, hashed at rest, expiring, and single-use.
- Membership and platform-role changes generate audit logs.
- Logs redact authorization headers, cookies, passwords, tokens, database credentials, and provider secrets.
- Privileged operations require recent authentication when supported.
- Production admin bootstrap is not exposed as a public signup path.

## 16. Platform bootstrap

The first Cove `ADMIN` is created through a one-time controlled script or command, not through a public API or signup parameter.

The bootstrap process must:

- Require an existing verified Supabase identity.
- Require an explicit allowlisted email or user ID from secure environment configuration.
- Refuse to run accidentally against an unexpected environment.
- Be idempotent.
- Write an audit record.
- Be disabled or removed after bootstrap.

Additional platform admins require a separately designed high-assurance process.

## 17. Testing strategy

### 17.1 Unit tests

- Permission map for every role.
- Invitation and join-request transitions.
- Email normalization and matching.
- Last-active-manager rule.
- Profile bootstrap idempotency.
- Provider claim normalization.
- Legacy login migration state machine.

### 17.2 Integration tests

- Supabase JWT verification with valid, expired, malformed, and wrong-project tokens.
- Active, suspended, and incomplete Cove users.
- Membership lookup and academy isolation.
- Role changes and audit creation in one transaction.
- Invitation replay and expiration.
- Concurrent manager demotions cannot leave an academy without a manager.
- One account with different roles in multiple academies.
- V1 migration retry and rollback behavior.

### 17.3 End-to-end tests

- Email signup, verification, login, refresh, reset, and logout.
- Google and Kakao callback flows in staging.
- Naver Custom OAuth compatibility in staging.
- New signup receives no academy role.
- Manager invites a student, teacher, team lead, and another manager.
- Manager selects a role while approving a join request.
- Non-manager cannot assign a role.
- Platform admin cannot use the normal manager endpoint without an academy manager membership.
- Cross-academy access is denied.
- Existing v1 user migrates and retains imported data.

## 18. Delivery sequence

1. Finalize Prisma models, constraints, permission names, and shared contracts.
2. Implement Supabase JWT verification, profile bootstrap, and `/auth/me`.
3. Implement organizations, academies, memberships, and explicit permission guards.
4. Implement manager invitations, join approval, role changes, and audit logging.
5. Implement email/password authentication UI and SSR session handling.
6. Add Google and Kakao providers.
7. Complete the Naver compatibility spike and add Custom OAuth or the narrow adapter.
8. Build and test the v1 progressive migration flow.
9. Run tenant-isolation, concurrency, security, and migration tests before production cutover.

## 19. Acceptance criteria

This design is correctly implemented when:

- A user can authenticate with all four required methods.
- Public signup cannot select or obtain a privileged academy role.
- A manager chooses roles for invitations and approved join requests.
- One account can hold different roles in different academies.
- All protected API operations verify the Supabase token and current database permissions.
- Suspending a user or membership takes effect without waiting for role claims in a JWT to expire.
- No normal academy workflow requires a platform admin.
- An academy cannot lose its final active manager through an ordinary role mutation.
- Role and membership mutations are audited.
- V1 users can migrate without losing their imported academy or learning data.
- Authentication secrets and database credentials remain server-only.

## 20. References

- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase server-side authentication for Next.js](https://supabase.com/docs/guides/auth/server-side)
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Kakao login](https://supabase.com/docs/guides/auth/social-login/auth-kakao)
- [Supabase social login providers](https://supabase.com/docs/guides/auth/social-login)
- [Supabase Custom OAuth providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Naver Login developer guide](https://developers.naver.com/products/login/userguide/userguide.md)
- [Elice institution join settings](https://help.elice.io/help/docs/elicelxp/admin/set-org/join)
- [Elice institution member management](https://help.elice.io/help/docs/elicelxp/admin/set-lxp/member)
- [Elice course member permissions](https://help.elice.io/help/en/docs/elicelxp/for-admin/course/member/02-01)
