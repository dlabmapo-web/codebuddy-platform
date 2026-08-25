# DLAB Mapo Temporary Staff Bootstrap Design

**Date:** 2026-08-25
**Status:** Implemented and verified
**Commit policy:** Keep this design and its implementation uncommitted until the user requests a commit.

## Scope

Create exactly two temporary staff accounts in the v2 Supabase project and add
them to the existing active `dlab-mapo` academy:

| Username | Temporary email | Academy role |
| --- | --- | --- |
| `mapo-teamlead` | `mapo-teamlead@temporary.invalid` | `TEAM_LEAD` |
| `mapo-teacher` | `mapo-teacher@temporary.invalid` | `TEACHER` |

The existing manager account and membership are left unchanged. No student,
curriculum, class, submission, or source-MVP data is modified by this bootstrap.

## Identity and credentials

Each account receives a distinct cryptographically random temporary password.
The password is never printed to terminal logs, chat, source code, reports, or
Git. A single owner-readable credentials file is written beneath the existing
gitignored `.migration-artifacts/dlab-mapo-bootstrap/` directory with directory
mode `0700` and file mode `0600`.

Because `.invalid` is a reserved non-deliverable domain, these accounts cannot
receive password recovery or invitation email. They are temporary launch-setup
accounts and must be replaced with real staff email identities before public
production use.

## Operation

A repository-owned one-time TypeScript command performs the bootstrap:

1. Resolve exactly one active academy with slug `dlab-mapo`.
2. Resolve exactly one active `MANAGER` membership to act as the audit actor.
3. Preflight both usernames and emails in Cove and Supabase Auth.
4. Stop on any partial or conflicting identity rather than overwriting it.
5. Create both confirmed Supabase Auth identities with username metadata.
6. In one target database transaction, create both active Cove users, active
   academy memberships, staff profiles, and audit records.
7. If the database transaction fails, delete only the newly created Supabase
   Auth identities as compensation.
8. Verify both Auth identities, Cove users, roles, academy ownership, and active
   statuses before writing the credentials artifact.

The command is explicit and idempotent. A rerun after complete success reports
that both identities already exist and performs no mutation. It never changes
passwords or roles on an existing account.

## Audit and failure handling

The existing active manager is the audit actor. Each created membership gets an
audit entry with action `academy.membership.bootstrap`, the membership as its
target, the assigned role in `after`, and reason `temporary-launch-bootstrap`.

No credential is written until verification succeeds. If compensation itself
fails, the command reports only the affected Auth user UUID and stops; it never
logs passwords, keys, or database URLs.

## Acceptance criteria

- The existing manager remains unchanged.
- `mapo-teamlead` can sign in and has one active `TEAM_LEAD` membership only in
  `dlab-mapo`.
- `mapo-teacher` can sign in and has one active `TEACHER` membership only in
  `dlab-mapo`.
- No account is created with a shared password.
- Credentials exist only in an owner-readable ignored artifact.
- Audit records identify the existing manager and both created memberships.
- Re-running the command creates no duplicates and changes no existing data.
