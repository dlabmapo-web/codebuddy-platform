# Cove v2 Database and Environment Bootstrap Design

**Date:** 2026-07-22

**Status:** Approved for implementation planning

## 1. Purpose

Establish a safe server-only environment and database connection boundary for the Cove v2 NestJS API. This setup connects `packages/api` to the separate Cove Studio development Supabase project without changing or disabling the working V1 configuration in `packages/web`.

## 2. Scope

This bootstrap includes:

- a local, ignored API environment file;
- a committed environment template;
- fail-fast NestJS environment validation;
- Prisma ORM 7 configuration for Supabase PostgreSQL;
- a reusable NestJS Prisma service and module;
- separate liveness and database-readiness checks;
- package scripts for validation, generation, migration, and Prisma Studio;
- automated checks for configuration and database infrastructure.

This bootstrap does not include application tables, multi-academy domain models, production credentials, V1 data migration, Supabase Auth migration, Storage, Realtime, or feature endpoint migration.

## 3. Environment Isolation

V1 and v2 use independent environment boundaries:

```text
packages/web/.env and .env.local
└── Existing V1 Supabase project and V1 server configuration

packages/api/.env
└── Cove Studio v2 development Supabase project
```

The V1 files remain unchanged. The v2 API must not read variables from `packages/web`, and the web package must not read API secrets.

### 3.1 API environment contract

`packages/api/.env.example` is committed with safe example values and documentation. `packages/api/.env` is ignored and contains the developer's actual local values.

```dotenv
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:3000

SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=replace_with_supabase_secret_key

DATABASE_URL=postgresql://replace_with_runtime_connection
DIRECT_URL=postgresql://replace_with_migration_connection
```

Variable ownership:

| Variable | Consumer | Purpose |
|---|---|---|
| `NODE_ENV` | NestJS | Runtime mode |
| `PORT` | NestJS | HTTP listen port |
| `WEB_ORIGIN` | NestJS | Allowed local web origin |
| `SUPABASE_URL` | Server-only Supabase client | Auth, Storage, or Realtime administration when introduced |
| `SUPABASE_SECRET_KEY` | Server-only Supabase client | Privileged Supabase access |
| `DATABASE_URL` | Prisma runtime adapter | Normal application queries |
| `DIRECT_URL` | Prisma CLI | Migrations and schema operations |

No server secret uses the `NEXT_PUBLIC_` prefix.

### 3.2 Connection selection

For the current persistent NestJS development server:

- `DATABASE_URL` uses the Supavisor session pooler on port `5432`, unless the eventual runtime requires transaction pooling.
- `DIRECT_URL` uses the direct database connection on port `5432` when IPv6 is available.
- If the development or CI network cannot reach Supabase's IPv6 direct endpoint, the Supavisor session pooler on port `5432` is the migration fallback.
- A future serverless deployment may use Supavisor transaction mode on port `6543` for `DATABASE_URL`; its required prepared-statement settings must be applied at that time.

The Supabase Dashboard's **Connect** dialog is the source of the connection strings. Passwords must be URL-encoded when they contain reserved URL characters.

## 4. Configuration Architecture

The API loads `.env` from its own package root and validates the complete environment at startup with Zod.

```text
packages/api/.env
        ↓
Nest ConfigModule
        ↓
Zod environment schema
        ↓
Typed application configuration
        ↓
Prisma service / HTTP configuration / future Supabase service
```

Validation requirements:

- `NODE_ENV` is one of `development`, `test`, or `production`.
- `PORT` is a valid TCP port and defaults to `4000`.
- `WEB_ORIGIN` is an HTTP or HTTPS URL.
- `SUPABASE_URL` is an HTTPS URL.
- `SUPABASE_SECRET_KEY` is non-empty and is never logged.
- `DATABASE_URL` and `DIRECT_URL` are PostgreSQL URLs.

Startup fails with a concise list of invalid variable names. Error messages never contain secret values.

## 5. Prisma Architecture

Use Prisma ORM 7 with its PostgreSQL driver adapter:

- `prisma` for CLI and migration tooling;
- `@prisma/client` for the generated client;
- `@prisma/adapter-pg` and `pg` for runtime PostgreSQL access;
- `dotenv` for Prisma CLI configuration;
- generated client output kept inside `packages/api`.

Files:

```text
packages/api/
├── prisma/
│   └── schema.prisma
├── prisma.config.ts
└── src/
    ├── config/
    │   ├── env.schema.ts
    │   └── env.ts
    └── database/
        ├── database.module.ts
        └── prisma.service.ts
```

`prisma.config.ts` uses `DIRECT_URL` for Prisma CLI operations. The NestJS `PrismaService` creates the `PrismaPg` adapter with `DATABASE_URL`, owns one application-scoped Prisma client, and disconnects during application shutdown.

The initial schema contains only the PostgreSQL datasource and client generator. Domain tables are deliberately deferred to the multi-academy schema design so accidental placeholder tables do not become migration history.

## 6. Health Model

Health endpoints have different meanings:

- `GET /api/health` is liveness. It confirms that the NestJS process can answer HTTP requests and does not query PostgreSQL.
- `GET /api/health/ready` is readiness. It executes a minimal database query such as `SELECT 1` through Prisma.

Successful readiness response:

```json
{
  "status": "ok",
  "service": "cove-api",
  "database": "reachable"
}
```

If PostgreSQL is unavailable, readiness returns HTTP `503` with a stable error code. Raw driver errors, hosts, usernames, and credentials are not returned to clients.

## 7. Package Commands

The API package provides:

```text
db:generate       Generate Prisma Client
db:validate       Validate Prisma configuration and schema
db:migrate:dev    Create/apply development migrations
db:migrate:deploy Apply committed migrations in deployment
db:studio         Open Prisma Studio
```

Root build and type-check commands generate the Prisma Client before compiling consumers. No command automatically runs a migration as a side effect of `dev` or `build`.

## 8. Security Rules

- `.env` and `.env.local` remain ignored at every package depth.
- `.env.example` contains names and safe examples only.
- Secret values are never committed, logged, included in thrown validation messages, or returned by health endpoints.
- The browser never connects to PostgreSQL.
- Only NestJS owns Prisma access.
- `SUPABASE_SECRET_KEY` is reserved for server-only operations.
- Production and development use different Supabase projects and credentials.
- Database migrations are committed and reviewed; tables are not created ad hoc in the Supabase Table Editor.

## 9. Error Handling

- Invalid environment: fail before the HTTP server starts and identify invalid variable names.
- Prisma initialization failure: log a sanitized infrastructure error and prevent readiness from succeeding.
- Runtime database outage: keep liveness operational, return `503` from readiness, and allow orchestration to remove the instance from service.
- Shutdown: stop accepting work and disconnect Prisma cleanly.

## 10. Verification

Implementation verification includes:

1. Confirm V1 environment files are unchanged.
2. Confirm `packages/api/.env` is ignored by Git.
3. Confirm no secret-like files appear in the staged diff.
4. Run Prisma schema validation and client generation.
5. Run API type-check and production build.
6. Test environment validation with valid and invalid synthetic values.
7. Start the API with developer-supplied Cove Studio values.
8. Verify `/api/health` succeeds independently of database state.
9. Verify `/api/health/ready` succeeds when PostgreSQL is reachable and returns sanitized `503` behavior when it is not.

Actual connectivity verification is blocked until the developer fills `packages/api/.env` with values copied from the Cove Studio Supabase project.

## 11. Acceptance Criteria

- V1 continues using its existing environment unchanged.
- V2 API reads only its own environment file.
- Missing or invalid API configuration fails safely.
- Prisma Client generates successfully.
- NestJS has one reusable Prisma service.
- Liveness and readiness are separate.
- No application table or migration is created in this bootstrap.
- No secret is tracked by Git.

## 12. References

- [Supabase: Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase: Prisma integration](https://supabase.com/docs/guides/database/prisma)
- [Prisma: Database connections](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
- [Prisma: Upgrade to Prisma ORM 7](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7)
