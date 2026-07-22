# Cove v2 Phase 0 Migration Plan

**Date:** 2026-07-22

**Branch:** `feat/cove-studio-v2`

**Purpose:** Establish the Cove v2 monorepo without changing production behavior.

## Outcome

The existing Next.js application continues to work from `packages/web`, while the repository gains independent NestJS API and shared-contract packages. Existing Next.js API routes remain operational during this phase and are migrated to NestJS incrementally in later phases.

## Target Repository Shape

```text
codebuddy-platform/
├── docs/
│   └── design/
├── packages/
│   ├── api/                 # NestJS API (new)
│   ├── shared/              # Cross-package schemas, contracts, and types (new)
│   └── web/                 # Existing Next.js application (moved intact)
├── package.json             # Workspace commands only
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Migration Rules

1. Preserve the existing application behavior and URLs.
2. Do not migrate feature endpoints merely to complete the folder restructure.
3. Do not modify the production Supabase schema in Phase 0.
4. Keep secrets out of Git. Existing local web environment files move with the web application.
5. The browser never receives Supabase secret keys or database connection strings.
6. Package imports flow inward: `web -> shared` and `api -> shared`; `shared` imports neither application.
7. Every later backend migration uses a vertical slice: contract, Nest implementation, tests, web client switch, then legacy route removal.

## Execution Sequence

### 1. Establish workspace configuration

- Replace the application-level root `package.json` with workspace commands.
- Add `pnpm-workspace.yaml` for `packages/*`.
- Add a shared TypeScript base configuration.
- Replace `package-lock.json` with `pnpm-lock.yaml` after successful installation.

### 2. Move V1 into `packages/web`

Move the existing Next.js application source and configuration without redesigning it:

- `src/`
- `public/`
- `next.config.ts`
- `postcss.config.mjs`
- `eslint.config.mjs`
- `tsconfig.json`
- local `.env` and `.env.local`, when present

The web package initially keeps all existing route handlers under `src/app/api`. This makes the restructure reversible and lets feature migration happen independently.

### 3. Add `packages/shared`

Create a framework-neutral TypeScript package for:

- Zod validation schemas
- oRPC contracts
- API request and response types inferred from schemas
- enums and stable error codes

Phase 0 starts with a health response schema to verify that both applications can consume the package. Database models, React components, Nest providers, and environment secrets do not belong here.

### 4. Add `packages/api`

Create a minimal NestJS service with:

- global `/api` prefix
- `/api/health` endpoint
- environment validation boundary ready for later configuration
- dependency on `@cove/shared`
- build and type-check commands

No V1 endpoint is removed yet.

### 5. Verify

Run from the repository root:

```bash
pnpm install
pnpm typecheck
pnpm build
```

Then smoke-test the development processes:

```bash
pnpm dev:web
pnpm dev:api
```

Expected API response:

```json
{
  "status": "ok",
  "service": "cove-api"
}
```

## Environment Layout

Phase 0 keeps V1 browser/server variables in `packages/web/.env.local`. The new API later receives its own `packages/api/.env` containing server-only values such as:

```dotenv
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_REDACTED
DATABASE_URL=postgresql://REDACTED
DIRECT_URL=postgresql://REDACTED
```

Only publishable values use `NEXT_PUBLIC_` in the web package. `SUPABASE_SECRET_KEY`, `DATABASE_URL`, and `DIRECT_URL` must never use that prefix.

## Acceptance Criteria

- The repository installs with pnpm from the root.
- `packages/web` builds with the same routes and UI as V1.
- `packages/api` builds and exposes `/api/health`.
- `packages/shared` type-checks and is consumed by the API.
- Existing Next.js API routes remain present.
- No production database migration is executed.
- No secret or local environment file is committed.

## Rollback

Phase 0 is isolated on `feat/cove-studio-v2`. If verification fails, the branch can return to the system-design commit (`65f8044`) without affecting `main` or the deployed V1 application. Production remains deployed from the existing V1 release throughout the v2 build.

## Next Phase

After this foundation is stable, migrate one low-risk vertical slice first (authentication session/profile or academy membership reads). Each slice must keep an explicit compatibility boundary until the NestJS endpoint is verified. Security-sensitive judge and submission flows require a dedicated design and must not be copied unchanged from V1.
