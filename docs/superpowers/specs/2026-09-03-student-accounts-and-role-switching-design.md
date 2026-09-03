# Student Accounts Without Email, Multi-Role Membership, and Social Sign-In Recovery

**Date:** 2026-09-03
**Status:** Implemented
**Scope:** Signup account types, email-free student credentials, manager-issued
passwords, multiple academy roles per member, and the social sign-in dead end

## 1. Summary

Cove Studio is used by elementary school students who do not have an email
address. Today every account must have one: `signupAction` calls
`supabase.auth.signUp({ email, password })` from the browser, `User.email` is
the only address Cove holds, and password recovery is delivered to it. A child
cannot complete signup, and if they could, they could never recover a password.

This design makes four changes that belong together because they all turn on
the same question — *what does Cove know about how this person gets back in*.

1. **Signup asks what kind of account this is** before it asks for anything
   else. A student is not asked for an email; everyone else is required to give
   one. Both kinds sign up on the same page, and neither chooses a role.
2. **A student's password is recovered by their academy, not by email.** A
   manager issues one, can read back the one they issued, and cannot read one
   the student has since chosen. Staff keep the existing self-service email
   recovery unchanged.
3. **One member may hold several roles inside one academy** — Manager, Teacher,
   and Team Lead in any combination — and picks which one they are working as
   from a switcher. `STUDENT` is exclusive and combines with nothing.
4. **Signing in with Google or Naver before signing up says so.** It currently
   creates an orphaned account and strands the visitor on `/welcome`.

## 2. Goals

- Let a student create and use a Cove account with no email address anywhere in
  the flow.
- Keep one signup page for every kind of user, as today.
- Keep signup free of role selection: an academy role still comes only from a
  manager's approval or invitation (authentication design §5.1).
- Give a manager a workable credential surface for the students they are
  responsible for, without Cove storing every student password in readable form.
- Let one person be a Manager and a Teacher at the same academy, and see the
  right surface for whichever they are being at that moment.
- Turn the social sign-in dead end into a sentence that tells the visitor what
  to do, and stop it creating accounts nobody asked for.

## 3. Non-goals

- Parent or guardian accounts, and parent email on a student record.
- SMS, phone-number, or magic-link authentication.
- Letting a teacher reset the passwords of students in their own classes. It is
  the natural next request and the design leaves room for it (§6.6), but the
  authority to change how a child signs in is a manager's in this version.
- Changing what any role is permitted to do. Multi-role membership grants the
  union of sets that already exist; no permission is added or moved.
- Turning Supabase email confirmation on. It is off platform-wide (deployment
  guide §13) and this design neither depends on that nor fixes it.
- Migrating existing students. Every account today has a real email and keeps
  working exactly as it does now.

## 4. Current behavior

### 4.1 Signup

`/signup` collects name, username, email, password, and academy.
`signupAction` checks the username is free, then calls Supabase directly from
the server action. Supabase requires `email`. There is no confirm-password
field. The academy becomes `requested_academy_id` in user metadata, which
`bootstrap` turns into an `AcademyJoinRequest` for a manager to approve.

### 4.2 Identity and recovery

`User.email` is unique and is both the contactable address and the address
Supabase authenticates against. `resolveSignInEmail` exchanges a username for
it so the login form can accept a username. `PasswordRecoveryService` looks a
username up, and mails the account's `email` — answering `{ accepted: true }`
for every input so the endpoint cannot be used to discover which usernames
exist.

### 4.3 Roles

`AcademyMembership` is unique on `[academyId, userId]` and carries exactly one
`role`. The academy root page selects one of four overviews from it, and
`StudioChrome` builds the sidebar from it. An academy switcher already exists;
a role switcher does not, because there has never been more than one role to
switch between.

### 4.4 Social sign-in without an account — the present fault

A visitor on `/login` clicks Google. `SocialLoginButtons` there passes no
academy, so `startSocialAuthAction` deletes the onboarding-intent cookie and
hands off to the provider. The callback exchanges the code — the visitor now
holds a valid Supabase session — and calls `completeOAuthOnboarding` with no
intent token. No Cove user exists, so it throws
`OAUTH_ONBOARDING_INTENT_REQUIRED` and the callback redirects to
`/signup?error=academy-required`.

`/signup` then calls `currentAccountDestination()`, which calls `auth.me`.
**`auth.me` falls through to `bootstrap` when the user row is missing**
(`auth.service.ts:418`). `bootstrap` creates the account. There is no
`requested_academy_id`, so it has no join request and no membership, and
`authDestination` sends the visitor to `/welcome`.

The result: the visitor never sees the signup form or the message meant for
them, an account is created that they did not complete, and a later proper
signup with the same address is refused as `email_taken`. The remedy today is a
password reset for a password they never set.

## 5. Account kinds

### 5.1 The choice on the form

The first field on `/signup` is 회원 유형, a two-option segmented control:

```
회원 유형
┌────────────────────┬────────────────────┐
│       학생          │      교직원         │
└────────────────────┴────────────────────┘
```

`학생` (student) is preselected, because most signups are students.

Choosing 교직원 (staff) adds the email field and nothing else. The rest of the
form — name, 아이디, 비밀번호, 비밀번호 확인, academy — is identical, and the
academy picker stays for both. A student's academy still becomes a join request
a manager approves; that queue and the `/pending` screens are unchanged.

This control is **not a role**. The copy under it says so, reusing the existing
`signup.role_notice` string: 역할은 여기서 선택하지 않습니다. It decides one
thing only — whether Cove asks for an email — and a staff signup that a manager
later approves as a STUDENT is a legal, if odd, outcome.

The type is `signupKind: 'STUDENT' | 'STAFF'`, named for what it governs rather
than for a role, so nothing downstream is tempted to read authority out of it.

### 5.2 Confirm password

Both kinds get 비밀번호 확인. It is checked in the browser as the second field
is typed, and again in the server action — a mismatch that only the browser
refuses is not refused at all. A child who mistypes a password they cannot
recover by email loses their account, so this field earns its place here in a
way it would not on a staff-only form.

### 5.3 Why a student cannot go through `supabase.auth.signUp`

Supabase requires an address, and any address Cove invents on the browser's
behalf would be one the browser could choose. Worse, an account created by
`signUp` has an unconfirmed email, and `ensureSignupRequest` returns early when
`emailVerified` is false (`academy-onboarding.service.ts:39`) — so the student's
academy request would never be created and they would land on `/welcome` with
no way forward, whatever the form did.

Student accounts are therefore created **server-side by the API**, through the
service-role client that `SupabaseAuthService` already holds.

## 6. Email-free student credentials

### 6.1 The placeholder address

A student account has a Supabase address that can never receive mail:

```
s-<uuid>@no-email.cove.invalid
```

`.invalid` is reserved by RFC 2606 and resolves nowhere, so a message sent
there cannot arrive and cannot be misdelivered. The local part is a fresh UUID
rather than the username: an address derived from the username would publish
the username into the auth table and into every provider log that touches it,
and would tie a rename to an identity change.

`no-email.cove.invalid` is a **different** reserved domain from the
`unresolved.invalid` that `resolveSignInEmail` already returns for unknown
usernames. Sharing one would make "this username has no email" and "this
username does not exist" the same string, and the second is the enumeration
answer the resolver exists to avoid.

The domain is a constant in `@cove/shared` with an `isPlaceholderAddress()`
predicate beside it, so the API and the web agree on what one looks like.

### 6.2 One new column, not two

`User.email` keeps holding the Supabase address for every account, placeholder
or real, and gains a companion:

```prisma
/// Whether `email` is a generated `no-email.cove.invalid` address rather than
/// one the account holder can read. A placeholder authenticates and nothing
/// else: it is never displayed, never mailed, and never matched against an
/// invitation.
emailIsPlaceholder Boolean @default(false) @map("email_is_placeholder")
```

The alternative — nulling `email` and adding a second `authEmail` column — was
rejected. `resolveSignInEmail` must find the address to sign a student in, so
it would have to read `authEmail ?? email`; recovery and invitation matching
would read `email`; and staff would carry the same string in two columns that
nothing keeps in step. One boolean beside the address that is already there
leaves every existing unique index and identity-conflict check working
unchanged, and turns each downstream decision into an explicit question.

`SupabaseIdentity` gains `emailIsPlaceholder`, derived at the boundary in
`verifyAccessToken` from the address in the token. `bootstrap` persists it, so
the flag cannot drift from the address it describes.

Where each site reads:

| Site | Reads | Behavior for a placeholder |
|---|---|---|
| `resolveSignInEmail` | `email` | Unchanged — the student signs in by username |
| `PasswordRecoveryService.recoveryTarget` | `email` + `emailIsPlaceholder` | Returns `null`, so the outcome is `undeliverable` and the response is the same `{ accepted: true }` |
| Invitation acceptance email match | `email` + flag | Never matches; an invitation to a student is accepted while signed in, by id |
| My Page identity card | flag | Shows 이메일 없음 with an 이메일 추가 action |
| People directory, exports | flag | Renders `—`, never the placeholder string |

A placeholder address must never reach a screen. It is meaningless to the
reader and looks like a mistake in the data.

### 6.3 Creating the account

New unauthenticated contract endpoint `auth.signUpStudent`, rate-limited per
address like its neighbours, and carrying the same Turnstile token the form
already collects:

```
{ username, displayName, password, academyId, captchaToken? }
  -> { email: string }     // the placeholder, for the browser to sign in with
```

The service, in order:

1. Verifies the captcha, exactly as the password path does.
2. Creates the Supabase user through
   `auth.admin.createUser({ email: placeholder, password, email_confirm: true,
   user_metadata: { username, full_name, requested_academy_id } })`.
   `email_confirm: true` is what makes `emailVerified` true in the token, which
   is what lets `ensureSignupRequest` create the join request (§5.3). It is
   honest rather than a trick: there is nothing to confirm, and the account is
   as confirmed as it will ever be.
3. Creates the Cove `User` with `emailIsPlaceholder: true`, and the
   `AcademyJoinRequest`, in one transaction.
4. If step 3 fails, deletes the Supabase user it just created. A Supabase
   identity with no Cove row is the orphan state §4.4 is about, and this is the
   one place that can still avoid it.

The username is checked for availability before step 2 and the unique index
decides at step 3, as `createWithUsername` already does. A student who loses the
race is not left with an unusable account: the transaction rolls back, the
Supabase user is deleted, and the form says the name is taken.

The browser then calls `signInWithPassword` with the returned placeholder
address and the password the person typed, and follows the existing redirect.
The address is returned to the browser rather than being derivable by it,
because it is not a secret and the alternative is a second round trip.

### 6.4 Signing in

Nothing changes. The login form already takes a username, `resolveSignInEmail`
already exchanges it for an address, and a placeholder address is an address.
A student who mistypes their username gets the same rejection as a student who
mistypes their password, for the same reason as today.

### 6.5 Recovering a student password

There is nowhere to send a link, so recovery is an act by the academy.

`/forgot-password` keeps asking for a username and keeps answering identically
for every input — this is what stops it becoming a way to discover which
usernames exist, and it must not learn to say "that is a student account".
What changes is the confirmation copy, which now names both paths:

> 이메일이 등록된 계정이라면 재설정 링크를 보냈습니다.
> 학생 계정은 이메일이 없습니다. 학원 선생님이나 관리자에게
> 비밀번호 재설정을 요청하세요.

The page tells a child exactly what to do without the server having looked
anything up. `/login` gains the same sentence as a quiet link beside
비밀번호를 잊으셨나요?, which involves no lookup at all.

### 6.6 What a manager can see, and what Cove refuses to store

The request was a student list showing each password as `abc•••••` with a
show button.

**Cove cannot show a password it did not issue.** Supabase stores a bcrypt
hash; there is no plaintext to reveal, and creating one would mean Cove holding
every student's password in recoverable form — turning one leaked server key
into every child's account. That is not a trade this design will make.

What Cove *can* do is remember the password **it generated**, for as long as
that is still the password. A manager issues a password; at that instant Cove
knows the value; it keeps it encrypted until the student replaces it. In an
academy where most children never change what they were given, this is the list
the manager actually wants, and it never claims to know something it does not.

```prisma
/// The password a manager issued to a student, retained only while it is still
/// the student's password.
///
/// This exists because a student has no email and therefore no self-service
/// recovery: the manager who issued the credential is the recovery mechanism,
/// and a credential they cannot read back is one they must reissue every time
/// a child forgets. The row is destroyed the moment the student chooses their
/// own password, so Cove never holds a secret its owner believes is private.
model StudentIssuedCredential {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @unique @map("user_id") @db.Uuid
  academyId      String   @map("academy_id") @db.Uuid
  ciphertext     Bytes
  iv             Bytes
  authTag        Bytes    @map("auth_tag")
  keyVersion     Int      @default(1) @map("key_version")
  issuedByUserId String   @map("issued_by_user_id") @db.Uuid
  issuedAt       DateTime @default(now()) @map("issued_at") @db.Timestamptz(6)
  revealCount    Int      @default(0) @map("reveal_count")
  lastRevealedAt DateTime? @map("last_revealed_at") @db.Timestamptz(6)

  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  academy   Academy @relation(fields: [academyId], references: [id], onDelete: Cascade)
  issuedBy  User    @relation("IssuedCredentialIssuer", fields: [issuedByUserId], references: [id], onDelete: Restrict)

  @@map("student_issued_credentials")
}
```

AES-256-GCM under a new server secret `STUDENT_CREDENTIAL_KEY` (32 random
bytes, base64), kept in `/opt/cove/secrets/api.env` and never in Git.
`keyVersion` exists so the key can be rotated without a migration that decrypts
everything at once.

**When the key is absent** — every local development environment on day one —
issuing still works and shows the password once; nothing is stored and the row
is not written. The feature degrades to "show once" rather than failing, and
the manager screen says so. A hard failure here would make an unconfigured
environment unable to reset a password at all.

**The row is deleted** when: the student changes their own password through My
Page; a manager issues a new one (replaced); the membership is removed; or the
account is deleted. Because a student has no email, Cove's own My Page is the
only path by which a student can change their password, so there is no route
that silently invalidates the stored value without Cove noticing.

### 6.7 The manager's screen

On the member detail page — `/academy/<slug>/people/<membershipId>` — for a
member whose role set is `STUDENT`, a 비밀번호 panel:

```
비밀번호
┌──────────────────────────────────────────────────────┐
│  hae•••••••                    [ 표시 ]  [ 새 비밀번호 발급 ] │
│  2026-09-03 김관리 발급 · 3회 열람됨                      │
└──────────────────────────────────────────────────────┘
```

Once the student has chosen their own:

```
비밀번호
┌──────────────────────────────────────────────────────┐
│  학생이 직접 변경했습니다                  [ 새 비밀번호 발급 ] │
│  코브는 이 비밀번호를 알 수 없습니다.                        │
└──────────────────────────────────────────────────────┘
```

The two states are the whole point. The second is not an error and is not
styled as one — it is the system working, and the copy says plainly that Cove
does not know it rather than leaving the manager to guess why the button is
gone.

**The first three characters are shown unmasked**, as asked. That is a real
concession: anyone who can see the manager's screen learns three characters. It
is made safe by the generator rather than by hiding it. Passwords are **10
characters** drawn from `abcdefghjkmnpqrstuvwxyz23456789` — 31 unambiguous
symbols, with `i`, `l`, `o`, `0`, and `1` removed because a seven-year-old will
be typing this from a slip of paper. That is ~49 bits, and the seven characters
behind the mask are still ~34 bits against an online endpoint that Supabase
rate-limits. The prefix is what lets a manager confirm they are looking at the
credential they wrote down without revealing it; a manager who wants the rest
can click 표시, which they were always able to do.

`표시` fetches the plaintext on demand — it is never in the page's initial
payload, never in the people-directory list response, and never in the CSV
export. Every reveal writes an `AuditLog` entry naming the manager, the
student, and the time, and increments `revealCount`, which is shown back to the
manager. Being told that reads are counted and attributed is what keeps a
convenience from quietly becoming a habit.

Issuing a new password: `auth.admin.updateUserById({ password })`, then encrypt
and store, then audit. It does **not** revoke the student's existing sessions —
a child mid-lesson should not be thrown out because an office computer clicked
a button. It also does not force a change at next sign-in: a forced change
screen is one more thing between a child and their work, and the manager
already knows the password either way.

### 6.8 Who may do it

A new academy permission, `academy.members.credentials.manage`, held by
`MANAGER` only — added to `managerOnlyPermissions`, not to the shared
`teamLeadPermissions` set. A Team Lead runs the curriculum; changing how a
child signs in is not curriculum.

Every operation additionally requires that the target membership's role set is
exactly `{ STUDENT }` and that the target is in the actor's academy. A manager
must not be able to issue themselves a password for a colleague's account, so
the endpoint refuses any target holding a staff role, including their own.

A platform `ADMIN` may do the same through the console under
`platform.academies.support`, which the admin-console branch is already
building as an audited support grant. That integration is deliberately left to
the merge (§10) rather than duplicated here.

## 7. Several roles inside one academy

### 7.1 Schema

`AcademyMembership.role` stays, and keeps meaning what it means today: the
member's **primary** role — their highest authority and the one every existing
query, index, and analytic already reads. Additional roles are rows beside it:

```prisma
/// An additional role this member holds in this academy, beyond `role`.
///
/// A small academy staffs one person as several things — the director who also
/// teaches a class and also writes the curriculum. Before this they had to be
/// given the widest role and lost the surfaces of the others, because
/// `AcademyMembership` is unique on `[academyId, userId]` and a second
/// membership is a second person as far as every foreign key is concerned.
model AcademyMembershipRole {
  id              String      @id @default(uuid()) @db.Uuid
  membershipId    String      @map("membership_id") @db.Uuid
  role            AcademyRole
  grantedByUserId String?     @map("granted_by_user_id") @db.Uuid
  grantedAt       DateTime    @default(now()) @map("granted_at") @db.Timestamptz(6)

  membership AcademyMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  grantedBy  User?             @relation("MembershipRoleGranter", fields: [grantedByUserId], references: [id], onDelete: SetNull)

  @@unique([membershipId, role])
  @@map("academy_membership_roles")
}
```

Additional rows rather than an array column or a widened unique key, for three
reasons: every existing `membership.role` read keeps compiling and keeps
meaning the right thing; each grant carries who made it and when, which is what
an audit of "why can this person see the whole academy" needs; and the
membership id — which `ClassEnrollment`, `TeacherFeedback`, `PointAward`, and
`StudentCourseLearningDay` all point at — stays one row per person per academy.

**The effective set** is `{ role } ∪ { extras }`, computed in one place in
`@cove/shared` and never assembled at a call site.

### 7.2 STUDENT is exclusive

A membership whose effective set contains `STUDENT` contains nothing else.
Enforced in the granting service and by a partial unique constraint, and
asserted in `academy-access.service.ts` where the set is loaded.

This is not squeamishness about hierarchy. A student's rows are *about* them —
their submissions, their points, their class standing, the feedback their
teacher wrote them — while every staff role reads *across* students. A
membership that was both would make "whose work is this page showing" a
question with two answers, and every monitoring, points, and analytics query
would need a new opinion about which one it meant. Keeping them apart costs a
person with both a second academy account, which is rare and honest, and keeps
the invariant that a membership id names one subject.

### 7.3 Permissions are the union; the view is a choice

Two separate things, and collapsing them is how a manager ends up on a page
built to be about one teacher's own classes.

**Authorization** uses the union. `roleHasPermission(role, permission)` gains
a sibling `rolesHavePermission(roles, permission)`; the API's academy access
service resolves the set once per request and every guard asks the set. No
permission changes, and a member with one role gets a one-element set, so the
existing behavior is the degenerate case rather than a special path.

**Presentation** uses one chosen role, the *view role*. The academy header
gains a switcher when the set has more than one member:

```
┌───────────────────────────────┐
│  디랩 마포        [ 관리자 ▾ ]   │
│                   ├ 관리자      │
│                   ├ 교사        │
│                   └ 팀 리드     │
└───────────────────────────────┘
```

- Stored in a cookie, `cove_academy_role`, holding `<academyId>:<role>`.
  Scoped to the academy, because being a Manager at Mapo says nothing about
  which hat you wear at Gangnam.
- **Validated against the held set on every request.** An unknown, stale, or
  hand-edited value is not an error page: it falls back to the primary role and
  the cookie is rewritten, the way `selectAcademy` already handles a stale
  academy query.
- The academy root page renders the overview for the view role. Its existing
  exhaustive switch over `academyRoles` is untouched — it is simply handed the
  view role instead of `membership.role`.
- `StudioChrome` builds the sidebar from the **view role alone**, not the
  union. A switcher that left every role's navigation on screen would not be a
  switcher.

**The API is never gated by the view role.** It authorizes against the held
set, always. The view role decides what is offered, and an offer is not an
authority: a member who reaches a Manager URL while viewing as a Teacher is
served it, because they are a Manager. Anything else would make a presentation
cookie into a security boundary, which §3 of the authorization design refuses
in the same words for frontend route protection.

> **Collision to resolve at merge.** `feat/platform-admin-console` already
> introduces a `cove_view_role` cookie and an `X-Cove-View-Role` header for a
> platform operator standing in an academy role. That is a different actor
> answering a different question, and the two must not share a cookie name.
> This design uses `cove_academy_role` and forwards no header. See §10.

### 7.4 Granting a second role

On the member detail page, a manager sees the member's roles as a set, and adds
or removes one. `approvableRoles` already says which roles an actor may grant —
a Manager may grant any, a Team Lead only STUDENT and TEACHER — and grant and
revoke both reuse it unchanged.

Two refusals, both with their own message:
- Adding any role to a STUDENT, or STUDENT to anyone holding a staff role
  (§7.2).
- Removing the last role. A member with no role is not a member; the action for
  that is removing the membership, which already exists.

Revoking the **primary** role promotes the highest remaining role into
`AcademyMembership.role` and deletes its extra row, so the invariant that
`role` is the highest held role survives every edit.

## 8. Social sign-in before signup

### 8.1 Stop creating the orphan

The callback signs the Supabase session out before redirecting whenever
onboarding is refused:

```
completeOAuthOnboarding throws
  -> supabase.auth.signOut()
  -> delete cove_oauth_intent
  -> redirect to /signup?error=<reason>
```

Without the sign-out, `/signup` calls `auth.me`, `auth.me` calls `bootstrap`,
and `bootstrap` creates exactly the account the callback just refused to create
(§4.4). The sign-out is the fix; the friendlier copy below is only worth having
once the visitor can actually reach the page it is on.

`auth.me` falling through to `bootstrap` is left alone. It is load-bearing for
the ordinary password signup, where the Cove row is created on the first
authenticated call — and with the session gone, it is no longer reachable from
this path.

### 8.2 Say the true thing

`OAUTH_ONBOARDING_INTENT_REQUIRED` raised from the *no existing user* branch
means one specific thing: the provider authenticated them, and they have no
Cove account. It gets its own reason, `no-account`, distinct from the
`academy-required` used when an intent expired mid-flight, and its own panel
above the signup form:

```
┌──────────────────────────────────────────────────┐
│ ⓘ  아직 코브 스튜디오 계정이 없습니다                 │
│                                                  │
│    Google 로그인은 확인되었지만, 이 계정으로 만든      │
│    코브 스튜디오 계정이 아직 없습니다.                │
│    아래에서 학원을 선택한 뒤 Google로 계속하면        │
│    가입이 완료됩니다.                              │
└──────────────────────────────────────────────────┘
```

It names the provider the visitor actually used — the callback knows it from
`identity.provider` and passes it in the redirect — because "소셜 계정" is
vaguer than the button they just pressed.

`/login` gains a matching line under its own social buttons, before anyone
clicks: 처음이신가요? 소셜 계정으로 시작하려면 회원가입에서 학원을 먼저
선택하세요. Prevention is better than the panel.

### 8.3 Provider cancel is not provider failure

A visitor who closes the Google consent screen returns with
`?error=access_denied` and no `code`. Today that is
`/login?error=callback` → 로그인을 완료하지 못했습니다, which reads as a fault
in Cove for something the visitor chose. The callback reads the provider's
`error` parameter and distinguishes a cancel — which gets no error styling at
all, just the login page — from a genuine failure.

## 9. Security invariants

1. A placeholder address never appears on a screen, in an export, or in an
   email. It authenticates and does nothing else.
2. `/forgot-password` answers identically for every username. It must never
   become able to say that an account is a student, an OAuth account, or absent.
3. A stored issued-password is readable only by a Manager of the academy that
   issued it, only for a target whose role set is exactly `{ STUDENT }`, only
   through an endpoint that audits every call, and never in a list response.
4. The stored value is destroyed when it stops being the student's password.
   Cove never holds a secret whose owner believes it is private.
5. `cove_academy_role` carries no authority. Every API decision reads the held
   role set from the database; the cookie only decides what is rendered.
6. A refused OAuth onboarding leaves no Supabase session and no Cove user.
7. `STUDENT` never coexists with a staff role in one membership.
8. `academy.members.credentials.manage` is Manager-only and is never added to
   the shared Team Lead set.

## 10. Relationship to `feat/platform-admin-console`

That branch is 290 files and ~33.7k insertions ahead of `feat/cove-studio-v2`
and is not merged. This work will merge and deploy first. Four real overlaps,
and one of them is the reason this section exists:

| File | Their change | Collision |
|---|---|---|
| `shared/src/auth/roles.ts` | +274 lines — platform permissions, support grants | **High.** Both add permissions and helpers to the same file. Resolvable by hand; expect a conflict every time. |
| `web/src/lib/orpc.ts`, `orpc-server.ts` | `cove_view_role` cookie + `X-Cove-View-Role` header | **Design-level.** Same concept name, different actor. As built, this uses `cove_academy_role` and sends no header, so the two coexist; at merge, decide whether an operator's view role and a member's view role become one mechanism. |
| `web/src/app/(auth)/signup/` | Reads the invited academy server-side and passes its name down | **High.** This design rewrites the same three files. Their change is small and clearly reasoned — keep it, and re-apply it onto the new form. |
| `api/prisma/schema.prisma` | +79 lines — support grants, directory indexes | **Textual only.** Migrations are timestamp-named directories and do not collide; only the schema file does. |

Migration ordering is safe in either merge order: this work's migrations are
dated `202609*` and theirs `20260831*`, and `migrate deploy` applies only what
the database has not recorded.

**Recommended order.** Finish and deploy this branch, merge it to
`feat/cove-studio-v2`, then immediately rebase or merge `feat/cove-studio-v2`
into `feat/platform-admin-console` and resolve the four above while this design
is still fresh. Do not do it the other way around: merging the console branch
first puts 33.7k lines of unrelated, undeployed change under an authentication
release, and if the release has to be rolled back it takes the console with it.

## 11. Schema and data impact

New:
- `User.emailIsPlaceholder Boolean @default(false)`
- `AcademyMembershipRole` table
- `StudentIssuedCredential` table
- `academy.members.credentials.manage` permission, in `managerOnlyPermissions`

No backfill. Every existing account has a real email, so the default `false` is
correct for all of them; every existing membership has one role, so an empty
extras table is correct for all of them.

New environment variable `STUDENT_CREDENTIAL_KEY`, optional, validated as
32 base64 bytes when present. Absent means issued passwords are shown once and
not stored (§6.6). It must be added to `/opt/cove/secrets/api.env` and to
deployment guide §8 before the manager screen is useful in production.

## 12. Testing strategy

### 12.1 Shared

- The effective role set is the union of primary and extras, deduplicated.
- `rolesHavePermission` matches `roleHasPermission` for every single-role set,
  for every role and every permission. This is the guard that keeps multi-role
  from changing what one role means.
- `isPlaceholderAddress` accepts the generated form and rejects
  `unresolved.invalid`, a real address, and a lookalike domain.
- The generated password uses only the unambiguous alphabet and is 10 long.

### 12.2 API

- `signUpStudent` creates Supabase user, Cove user, and join request; the
  account is `emailIsPlaceholder` and `ACTIVE`.
- A failure after the Supabase user exists deletes it. Asserted by making the
  transaction throw.
- A username taken between check and insert rolls back and deletes the Supabase
  user; the caller gets `USERNAME_TAKEN`, not a half-made account.
- `recoveryTarget` returns null for a placeholder account, and
  `requestPasswordRecovery` still answers `{ accepted: true }`.
- Issuing a password stores ciphertext that round-trips; with no key
  configured, nothing is stored and the call still succeeds.
- Reveal refuses a Team Lead, refuses a Manager of another academy, refuses a
  staff target, and writes an audit row on success.
- The stored row is gone after the student changes their own password.
- Granting STUDENT to a member holding TEACHER is refused, and the reverse.
- Revoking a primary role promotes the highest remaining one.

### 12.3 Web

- The signup form hides the email field for 학생 and requires it for 교직원, and
  refuses a confirm-password mismatch on the server even when the browser check
  is bypassed.
- A `cove_academy_role` naming a role the member does not hold falls back to the
  primary role and rewrites the cookie.
- `StudioChrome` builds the sidebar from the view role, not the union.
- The callback signs out and redirects on a refused onboarding — the regression
  test for §4.4, asserting no Cove user is created.
- `/signup?error=no-account&provider=google` renders the panel naming Google.

### 12.4 Verification commands

Everything CI runs, in CI's order (deployment guide §6 step 3):

```bash
pnpm --filter @cove/shared --filter @cove/i18n build
pnpm -r typecheck
pnpm -r lint
pnpm --filter @cove/web routes:lint
pnpm --filter @cove/web i18n:check
pnpm -r test
pnpm -r build          # never while pnpm dev is running
```

### 12.5 Browser smoke test

Against the development database, signed out:

1. Sign up as 학생 with no email. Land on `/pending`.
2. As `cove-manager`, approve them as a STUDENT.
3. Sign out, sign in as the student by username. Reach the academy.
4. As `cove-manager`, open the student, issue a password, read the prefix,
   click 표시, sign in as the student with it.
5. As the student, change the password at My Page. The manager's panel now says
   학생이 직접 변경했습니다.
6. As `cove-manager`, grant themselves TEACHER. The header switcher appears;
   switching to 교사 changes the overview and the sidebar.
7. Signed out, on `/login`, click Google with an account that has never signed
   up. Land on `/signup` with the panel, signed out, with no account created.

## 13. Acceptance criteria

- [ ] A student completes signup, signs in, and uses Cove without an email
      address existing anywhere in the flow.
- [ ] `회원 유형` selects between 학생 and 교직원 and grants no role.
- [ ] 비밀번호 확인 is enforced in the browser and on the server.
- [ ] No placeholder address is rendered on any screen or in any export.
- [ ] `/forgot-password` answers identically for every username and names both
      recovery paths in its confirmation copy.
- [ ] A Manager issues a student password, sees it as `abc•••••••`, reveals it,
      and every reveal is audited and counted.
- [ ] After a student changes their own password, the manager sees
      학생이 직접 변경했습니다 and can only issue a new one.
- [ ] With `STUDENT_CREDENTIAL_KEY` unset, issuing works and stores nothing.
- [ ] A member holds Manager, Teacher, and Team Lead in one academy, and the
      switcher changes both the overview and the sidebar.
- [ ] A member's permissions are the union of their roles, and the view role
      changes no API decision.
- [ ] STUDENT cannot be combined with any staff role.
- [ ] Social sign-in without an account leaves no session and no user, and lands
      on `/signup` with a panel naming the provider.
