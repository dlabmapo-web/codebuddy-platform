# Supabase Browser Client Lifecycle Design

## Goal

Eliminate the browser warning about multiple `GoTrueClient` instances and prevent duplicate Supabase Auth and Realtime lifecycle work in the same browser context.

## Current Problem

`src/lib/supabase/client.ts` creates a new Supabase client every time `supabaseBrowser()` is called. The problem-solving page, feedback page, and realtime channel helpers call this function independently. Each client creates its own `GoTrueClient` using the same default storage key, which produces the warning and can cause competing listeners or refresh behavior.

The platform authenticates users with its own `pc_token` cookie. Browser-side Supabase Auth persistence, token refresh, and OAuth URL detection are not used.

## Considered Approaches

### A. Module singleton only

Create one client at module scope and return it from `supabaseBrowser()`.

- Simple and sufficient for normal production bundles.
- Development hot-module replacement can reload the module and recreate the client.

### B. Browser-global singleton with unused Auth behavior disabled — selected

Store the client under a private, typed `globalThis` property and reuse it across module reloads. Configure browser Auth with:

- `persistSession: false`
- `autoRefreshToken: false`
- `detectSessionInUrl: false`

This prevents duplicate clients in production and during Next.js development refreshes while matching the platform's custom-auth architecture.

### C. Different storage key for every client

This suppresses the warning but leaves duplicate clients, connections, and listeners. It is rejected because it hides rather than fixes the lifecycle problem.

## Design

`supabaseBrowser()` remains the public API so existing callers do not need behavioral changes. On the first browser call it creates one configured `SupabaseClient`; subsequent calls return the same object.

The module must not initialize the client on the server. Creation remains lazy and browser-only because the client belongs to interactive Client Component and Realtime code. Server-side privileged Supabase clients remain separate and unchanged.

Existing channel ownership remains local to the consuming component. Components must continue unsubscribing their channels during effect cleanup. This change consolidates the underlying client; it does not make channels global.

## Validation and Error Handling

- Validate the public Supabase URL and anonymous key before creating the client and fail with a clear configuration error if either is absent.
- Add unit coverage proving repeated calls return the same client.
- Add unit coverage proving the selected Auth options and existing Realtime throttling are passed to `createClient`.
- Run the full unit test suite, TypeScript checking, and production build.
- In a browser, navigate repeatedly between student problem and teacher feedback screens and confirm:
  - the multiple `GoTrueClient` warning no longer appears;
  - realtime presence and session updates still connect;
  - leaving a screen still removes its channel.

## Scope Boundary

This change fixes client lifecycle duplication only. Migrating public Realtime channels to private channels with RLS and Supabase-compatible authorization is a separate production-security change and is not included here.
