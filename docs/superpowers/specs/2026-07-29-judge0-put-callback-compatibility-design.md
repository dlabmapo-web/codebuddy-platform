# Judge0 PUT Callback Compatibility

**Date:** 2026-07-29  
**Status:** Approved for implementation  
**Deployment:** Next.js 16 on Netlify, Supabase, Judge0 CE

## Objective

Allow Judge0 to complete submissions through its documented HTTP `PUT`
callback while preserving the existing `POST` callback for compatibility.
Successful callbacks should finalize grading without waiting for the
client-side reconciliation fallback.

## Current Finding

Judge0 receives a per-case callback URL when a submission batch is created.
Judge0 documents that it sends the completed submission to that URL with
`PUT`. The application currently exports only a `POST` Route Handler at:

```text
/api/judge/callback/[callbackToken]
```

Next.js returns `405 Method Not Allowed` for an unimplemented method, so a
Judge0 `PUT` callback cannot reach the existing validation and finalization
logic.

## Considered Approaches

1. **Replace `POST` with `PUT`.** Smallest surface, but removes compatibility
   with any existing caller using `POST`.
2. **Copy the callback body into separate `PUT` and `POST` handlers.** Supports
   both methods, but duplicates security-sensitive logic.
3. **Use one shared handler for both methods.** Supports Judge0 and existing
   callers without duplicating validation or persistence behavior.

Approach 3 is selected.

## Design

Extract the existing callback body into a private shared function with the
same request and route-context types. Export thin `PUT` and `POST` handlers
that both delegate to that function.

Both methods must preserve the existing behavior:

- reject oversized bodies;
- validate the callback token;
- parse and validate the Judge0 result;
- locate the case using the hashed callback token;
- enforce the expected Judge0 submission token;
- record terminal case results idempotently;
- finalize the parent submission when every case is complete;
- return the existing safe API response.

No authentication, token, database, scoring, timeout, polling, or
reconciliation rule changes are included.

## Verification

Add a regression test that statically verifies the route exposes both `PUT`
and `POST` through the shared handler. Existing judge finalization tests must
continue to pass.

Run:

- focused callback regression test;
- judge test suite;
- ESLint for changed files;
- TypeScript validation;
- full test suite;
- Next.js production build.

## Rollout

Deploy with:

```text
JUDGE_CALLBACK_BASE_URL=https://coveedu.com
```

Then submit a production test problem and verify that grading completes before
the three-second fallback under normal Judge0 queue conditions. The fallback
remains available if callbacks fail.
