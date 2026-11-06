<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database reads: keep every page to a few statements

Every SQL statement is a round trip to Supabase (about 1.5 ms from the Seoul
server, about 35 ms from anywhere else) plus pool time, and one page load can
trigger many requests. v2.0.51 halved the statements per page; any new API,
page or feature must not undo that.

1. **No query inside a loop.** Read a list in one statement (`in: ids`, a join
   or raw SQL) and assemble it in memory. A statement count that grows with
   the number of rows is a bug.
2. **Deep Prisma `include` costs one statement per relation level.** Reuse the
   one-statement readers instead of writing a new deep include: course trees
   through `readCurricula`/`withCurriculum`
   (`packages/api/src/learn/curriculum-read.ts`), academy access through
   `packages/api/src/authorization/academy-access-read.ts`. Extend them when
   they lack a field.
3. **Select only what the response uses.** Lists and outlines never load
   descriptions, starter code, solutions or manual content.
4. **Start independent reads together** with `Promise.all`, in services and in
   server components. Chain a read only when it needs the previous result.
5. **Resolve each thing once per request.** In the API, pass resolved access,
   account or membership down instead of checking again. In the web app, share
   server reads through React `cache()` like `getAccount`,
   `getAcademyFeatures` and `resolveAcademyRoute`
   (`packages/web/src/lib/orpc-server.ts`, `academy-route.ts`).
6. **Read a page's main data during the server render** and hand it to the
   client (`packages/web/src/lib/server-read.ts`), rather than fetching after
   hydration and then fetching what depends on it.
7. **Background refreshes multiply by every open tab.** Prefer the existing
   socket/SSE channels; keep `refetchInterval` and polling at 15 s or slower
   unless the design spec justifies less.

Check a new or changed read path by counting its statements in an integration
spec, as `packages/api/src/content/navigation-performance.integration.spec.ts`
does (Prisma `log: [{ emit: "event", level: "query" }]` and `$on("query")`),
against a disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`,
never the shared Supabase databases. State the count in the commit message when
it changes.
