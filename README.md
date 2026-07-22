# Cove Studio

Cove Studio is the Cove v2 learning platform. This branch keeps the existing Next.js MVP working while introducing an independently deployable NestJS API and shared contracts.

## Packages

```text
packages/
├── api/       NestJS backend
├── shared/    Shared schemas, contracts, types, enums, and error codes
└── web/       Next.js frontend and the preserved V1 route handlers
```

The V1 route handlers intentionally remain in `packages/web/src/app/api` during the incremental migration. Do not remove one until its NestJS replacement and web integration are verified.

## Requirements

- Node.js 22 or newer
- pnpm 9.15.9

## Setup

```bash
pnpm install
pnpm build
```

The existing local Next.js environment files live in `packages/web/` and remain ignored by Git. Add future NestJS-only secrets to `packages/api/.env`; never expose database or Supabase secret keys with a `NEXT_PUBLIC_` prefix.

### Cove v2 API environment

Create the local API environment from the committed template:

```bash
cp packages/api/.env.example packages/api/.env
```

Fill it with values from the Cove Studio Supabase project. Use `DATABASE_URL` for the runtime connection and `DIRECT_URL` for Prisma CLI operations. The local `.env` is ignored by Git, and the existing V1 web environment remains separate.

Validate the database setup without creating tables:

```bash
pnpm --filter @cove/api db:validate
pnpm --filter @cove/api db:generate
```

## Development

Run both applications:

```bash
pnpm dev
```

Or run them separately:

```bash
pnpm dev:web
pnpm dev:api
```

- Web: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:4000/api/health](http://localhost:4000/api/health)

## Verification

```bash
pnpm typecheck
pnpm build
```

The current V1 source has pre-existing lint violations. `pnpm lint` is available as a baseline and will become blocking after those violations are fixed or baselined separately.

## Design

- [Cove v2 system design](docs/design/2026-07-22-cove-v2-system-design.md)
- [Phase 0 migration plan](docs/design/2026-07-22-cove-v2-phase-0-migration-plan.md)
