# Cove v2 Database and Environment Bootstrap Implementation Plan

**Date:** 2026-07-22

**Design:** `docs/design/2026-07-22-cove-v2-database-environment-bootstrap-design.md`

## Goal

Give the NestJS API an isolated, validated Cove Studio environment and a Prisma 7 database boundary without changing V1 configuration or creating domain tables.

## Implementation Steps

### 1. Environment boundary

- Update `.gitignore` so local `.env*` files stay ignored while `.env.example` can be committed.
- Add `packages/api/.env.example` with safe example values.
- Add ignored `packages/api/.env` with blank Cove Studio values for the developer to fill.
- Add `packages/api/src/config/env.schema.ts` with Zod validation and sanitized errors.
- Register the global NestJS `ConfigModule` from the API package root.

### 2. Prisma 7 infrastructure

- Install Prisma 7, PostgreSQL driver adapter, `pg`, and required types.
- Add `packages/api/prisma.config.ts` using `DIRECT_URL` for CLI operations.
- Add an empty PostgreSQL schema with the `prisma-client` generator and package-local output.
- Configure generated Prisma code for the API's module format.
- Add database scripts and generation prerequisites to API build/type-check commands.

### 3. NestJS database boundary

- Add a global `DatabaseModule`.
- Add one `PrismaService` using `PrismaPg` and runtime `DATABASE_URL`.
- Disconnect Prisma during NestJS shutdown.
- Load port and CORS origin from validated configuration.

### 4. Health behavior

- Preserve `GET /api/health` as database-independent liveness.
- Add `GET /api/health/ready` with a minimal Prisma query.
- Return sanitized HTTP `503` with `DATABASE_UNAVAILABLE` when the query fails.
- Add the successful readiness response contract to `@cove/shared`.

### 5. Tests and verification

- Test valid environment parsing, invalid environment reporting, and secret redaction.
- Test liveness, readiness success, and sanitized readiness failure.
- Confirm V1 environment files remain byte-for-byte unchanged.
- Confirm the new API `.env` is ignored and `.env.example` is tracked.
- Run Prisma format/validate/generate using synthetic non-secret URLs where connectivity is not required.
- Run tests, type-checks, and production builds.
- Run real readiness only after the developer adds Cove Studio values.

## Acceptance Commands

```bash
pnpm --filter @cove/api db:format
pnpm --filter @cove/api db:validate
pnpm --filter @cove/api db:generate
pnpm --filter @cove/api test
pnpm typecheck
pnpm build
```

No migration command is part of the bootstrap acceptance run because the approved scope creates no application table.
