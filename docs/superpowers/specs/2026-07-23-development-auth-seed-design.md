# Cove Studio Development Authentication Seed Design

**Date:** 2026-07-23

**Status:** Approved design; awaiting implementation planning

## Objective

Add an idempotent development seed workflow for Cove Studio authentication. The
workflow will follow DocQuery's separated seed-data and runner pattern while
respecting Cove's boundary between Supabase Auth credentials and Prisma-owned
application data.

The resulting accounts must be able to sign in immediately through the existing
email/password form and exercise every current platform or academy role.

## Scope

The seed will create:

- one development organization;
- one development academy in that organization;
- one login-ready platform administrator;
- one login-ready academy manager;
- one login-ready academy team lead;
- one login-ready academy teacher;
- one login-ready academy student; and
- active academy memberships for the four academy-scoped users.

OAuth identities, invitations, join requests, audit history, production seed
data, and curriculum data are outside this change.

## Architecture

Seed files will live under `packages/api/prisma/seed/`:

```text
packages/api/prisma/seed/
├── data/
│   ├── organizations.ts
│   └── users.ts
└── seed.ts
```

The API package will expose `pnpm db:seed`. The command will load the API
environment, enforce the development-only guard, initialize a Supabase Admin
client and Prisma client, apply seed data in dependency order, and disconnect
cleanly.

Prisma continues to own only Cove's application tables. Supabase Auth users are
created or updated through the supported Admin API; the seed must not insert into
or modify the `auth` schema directly.

## Seed Accounts

The five accounts use stable `@cove.test` email addresses and the shared
development password `CoveDev123!`:

| Account | Platform role | Academy role |
| --- | --- | --- |
| `admin@cove.test` | `ADMIN` | None |
| `manager@cove.test` | `USER` | `MANAGER` |
| `teamlead@cove.test` | `USER` | `TEAM_LEAD` |
| `teacher@cove.test` | `USER` | `TEACHER` |
| `student@cove.test` | `USER` | `STUDENT` |

The shared password is intentionally committed development test data, not an
environment secret or a production credential. The runner must refuse to execute
in production.

Supabase users will be email-confirmed by the Admin API so every account can sign
in immediately without receiving email. Cove-owned organization, academy, user,
and membership records will use stable UUIDs declared in the data modules.
Supabase-generated Auth user IDs will be copied into each matching
`User.authUserId`.

## Data Flow and Idempotency

The runner applies data in this order:

1. Validate all required API environment variables.
2. Exit with an error when `NODE_ENV` is `production`.
3. Resolve each Supabase Auth user by normalized email.
4. Create missing Auth users or update existing development users so their
   password, confirmation state, and approved profile metadata match the seed.
5. Upsert the development organization and academy with their stable UUIDs.
6. Upsert Cove users by stable UUID and synchronize email, display name,
   `authUserId`, platform role, and active status.
7. Upsert the four academy memberships by the existing academy/user compound
   identity and synchronize role, active status, and join time.

Running `pnpm db:seed` repeatedly must converge on the same records and must not
create duplicate users, academies, or memberships. It also restores the expected
development password and role assignments if they have drifted.

Application-table writes will run in a Prisma transaction after all Supabase Auth
identities have been resolved. Supabase Auth and PostgreSQL application writes
cannot share one transaction. If an application write fails after Auth users are
created, the next run safely resumes and converges because every operation is
idempotent.

## Safety and Error Handling

- The runner must reject `NODE_ENV=production` before any mutation.
- It must use the existing server-only Supabase secret key and never expose it to
  the web package.
- It must never log passwords, tokens, database URLs, or Supabase secret values.
- Errors should identify the seed stage and affected email where useful without
  printing sensitive identity metadata.
- Email matching is case-normalized to avoid duplicate development identities.
- If an email belongs to a conflicting Cove record with a different stable ID,
  the seed must fail clearly instead of silently taking ownership of that record.
- Clients must be disconnected in a `finally` path on success or failure.

## Package Integration

`packages/api/package.json` will add:

```json
{
  "scripts": {
    "db:seed": "tsx prisma/seed/seed.ts"
  }
}
```

The implementation will add `tsx` as an API development dependency so the seed
can use TypeScript data modules and the generated Prisma client without a
separate build step. No seed command will run automatically during `dev`,
`build`, migration, or deployment commands.

## Verification

Automated tests will cover the deterministic seed manifest and independently
testable runner functions, including:

- all five unique normalized emails are present;
- all platform and academy roles are represented correctly;
- only the academy-scoped users receive memberships;
- the production guard rejects execution;
- existing records take the update path rather than creating duplicates; and
- conflicting Cove email ownership fails safely.

Implementation verification will run:

1. Prisma generation and schema validation.
2. API type-check and test suite.
3. `pnpm db:seed` against the configured Cove development Supabase project.
4. A second `pnpm db:seed` run to confirm idempotency.
5. Email/password login for representative seeded roles through the existing
   `/auth/login` flow.
6. A check that `/auth/welcome` returns the matching platform role and academy
   membership without creating duplicate Cove users.

Live database and login verification requires valid development values in
`packages/api/.env` and the corresponding web Supabase configuration.

## Acceptance Criteria

- `pnpm --filter @cove/api db:seed` creates all five login-ready development
  accounts.
- The platform administrator has `platformRole=ADMIN` and no academy membership.
- Manager, team lead, teacher, and student accounts have active memberships with
  their expected academy roles.
- Every Auth identity has exactly one matching Cove user linked through
  `authUserId`.
- All five accounts can use the existing email/password login flow with
  `CoveDev123!`.
- Re-running the seed produces no duplicate records and restores expected seed
  values.
- Production execution is rejected before mutation.
- The runner never writes directly to Supabase-owned Auth tables or logs secrets.
