# Public Turtle browser runtime operations

Implementation branch: `feat/public-turtle-browser-runtime`; activation wiring:
`feat/public-turtle-browser-pilot`. Defaults remain disabled. A selected academy
pilot requires the protected release approval described below; classroom-wide
performance acceptance remains separate. See the
[design](../superpowers/specs/2026-10-28-public-turtle-browser-runtime-design.md).
Course Turtle/Tkinter, official grading and the one-slot full-Python guest broker
keep their existing execution paths and limits.

## Artifact and hosting

`pnpm --filter @cove/turtle-browser-runtime build` produces `dist/manifest.json`
and a content-addressed `brython-3.15.0-<20 hex>` directory. The web image contains
this artifact at `/opt/cove/turtle-browser-runtime`; it is **not** published under
the application origin. The engine is pinned in pnpm and includes its BSD license.
The build embeds `TURTLE_BROWSER_PARENT_ORIGIN` (Docker uses the built site URL).
Never publish the local HTTP fixture build.

After image pull, `publish-turtle-browser.sh` extracts the artifact from the
pinned web image without starting it. It verifies every filename, SHA-256,
version digest, parent origin and compressed-size budget before atomic publish
under `deploy/runtime/turtle-browser/`. It refuses an ID mismatch. Set the
reviewed runtime ID from that exact image's manifest before upgrading the
runtime; ordinary app releases with identical runtime contents retain the ID.

Caddy mounts these host-owned files read-only. The generated optional virtual
host serves only allowlisted immutable files using GET/HEAD. Frame and worker
have different CSPs; only the worker permits compiler evaluation. Worker CSP
blocks networking and nested workers. COOP/COEP remain enabled, and CORP allows
the isolated frame to load under the application's existing COEP. There are no
application, proxy, auth, BFF or upload routes on this origin. Do not add them.
Do not set parent-domain authority cookies. No credentials go to the iframe.

No DNS/certificate activity or artifact extraction occurs with the default-off,
unconfigured manifest. Provision the dedicated hostname/TLS only as part of a
reviewed pilot. Existing configured static assets remain available when
admission is switched off.

## Pilot selection

Non-secret values live in `deployment.env` and override secret-file settings in
both API and web through Compose:

- `TURTLE_TRIAL_BROWSER_ENABLED=false`: feature switch.
- `TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED=false`: separate kill switch.
- `TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN`: dedicated HTTPS origin on a different
  hostname from Studio.
- `TURTLE_TRIAL_BROWSER_RUNTIME_ID`: approved image's immutable runtime ID.
- `TURTLE_TRIAL_BROWSER_PARENT_ORIGIN=https://cs.coveedu.com`: artifact parent.
- `TURTLE_TRIAL_BROWSER_PILOT_ACADEMY_IDS`: comma-separated UUID allowlist.
  Empty means no managed production grant is selected. Legacy production PINs
  remain server mode. Local fixtures deliberately support their synthetic PIN.
- `TURTLE_TRIAL_BROWSER_RETAINED_RUNTIME_IDS`: previous immutable IDs still
  serving live grants, at most 16. Grants pin their version for two hours.

Existing grants stay server mode; existing server sessions remain recoverable.
Browser admission contains UUID/hash/profile/helper/starter metadata, never
source/output/stdin. It checks current PIN/academy/grant and shared quotas,
reserves atomically, renews every 15 seconds, and expires within a 30-second lease
or the 120-second hard run deadline. A browser is not an execution attestation.
No client result is used for official grading.

A disabled browser grant retains its preferred-engine marker in bootstrap;
refresh cannot silently turn its Run button into a source upload. Browser
unsupported calls offer **Run with full Python**. That explicit click
retires browser admission first, then submits source through the existing guest
path. Preparation errors do not automatically upload source or allocate guests.
Server capacity remains one; broad automatic fallback is intentionally absent.

## Activation through the protected release

The v2 workflow accepts optional repository variable
`TURTLE_BROWSER_RELEASE_CONFIG_BASE64`: base64-encoded JSON containing only the
non-secret `TURTLE_TRIAL_BROWSER_*` manifest fields listed above. Values must be
strings. Enabling admission requires a pinned artifact, canonical dedicated
HTTPS origin, public Turtle enabled, and an explicit academy UUID allowlist.
Unknown keys, invalid booleans, multiline values and invalid IDs fail before
deployment. Never include credentials or classroom codes in this variable.

The protected Production job passes this configuration to `set-v2-release.sh`,
which merges it into its private candidate manifest. It does not replace the
active manifest before normal preflight, rollback capture and deployment.
Without the optional variable, releases preserve the installed selection.
The runtime ID must match the artifact in that exact release's Studio image;
update the reviewed value when runtime content changes. Disabled/current and
retained static versions remain available according to the existing policy.

The release does not automatically remove the persistent drain marker. If an
operator previously drained the browser engine, explicitly resume it only after
the reviewed pilot switches are enabled and validation is complete.

After a successful one-time activation, remove the optional repository variable
so future releases preserve installed switches instead of replaying activation.
Existing native grants need Exit followed by a new code entry to select the
browser profile; refreshing alone preserves their original engine.

## Disable and rollback

For a routine kill, set admission false for both web/API and restart those
services through the normal approved release process. Controlled runs stop
when renewal is denied, at most the existing 30-second lease. Drafts survive.
Retain static directories and their manifest records while grants can live.
There is no automatic garbage collection; never delete versions earlier than
two hours after the last grant that selected them plus an operational margin.

**Before restoring any API unaware of browser records**, run
`deploy/scripts/drain-turtle-browser.sh` using the current manifest/image. Both
automatic deployment rollback and manual `rollback.sh` invoke this before the
previous API starts. The tool selects the installed API container's immutable local image, so a bad
or unpulled candidate does not prevent rollback. It can run even if Nest cannot boot: it mounts a
version-aware Node script into an API image that already contains ioredis.
It does not require the database or public broker.

The tool atomically blocks browser reservations/renewals using the persistent
`cove:turtle:v1:browser:draining` marker, settles browser usage once, clears matching
active bindings, removes only browser run/ownership records, and revokes browser-only/inactive
grants so an old release cannot silently reuse a browser session as server
mode. Active native fallback grants remain valid, with browser selection fields
removed. It leaves native server run records,
PIN registry, course data and unrelated Redis keys intact. Scan/time bounds and
unknown profiles fail closed: do not start an old API after failure. The wrapper
waits 31 seconds for controlled clients' old leases to expire. It does not flush
Redis, pause grading, stop rootless guests or convert browser work to guests.

The marker deliberately survives rollback and ordinary redeploy. After fixes,
acceptance and explicit pilot re-enablement, `drain-turtle-browser.sh --resume`
removes it only when both runtime/admission flags are true. New grants are
needed to select browser mode after a drain. Never automatically resume on rollback.

If the current API image cannot even run Node/ioredis, use an approved prior API
image with the same mounted script and private Redis network/env. Do not expose
Redis or pass its URL on a public shell command line. The tool logs counts only.

## Local verification

Runtime-only fixture: build with `COVE_TURTLE_BROWSER_LOCAL=1` and
`TURTLE_BROWSER_PARENT_ORIGIN=http://localhost:3128`, then run
`node packages/turtle-browser-runtime/scripts/local-server.mjs`. It binds only
localhost:3128 / 127.0.0.1:4128 and uses no application env, PIN or API.

The optional real-workspace fixture uses a dedicated Redis on 127.0.0.1:6398
DB 2, API fixture port 4028, Next port 3028 and `.next-turtle-browser`. See
`packages/api/scripts/turtle-browser-fixture.mts`; it requires explicit opt-in,
uses synthetic PIN `012345`, and throws on any broker call. Build the runtime
for parent localhost:3028, start the asset server with
`COVE_TURTLE_BROWSER_PRODUCT_FIXTURE=1`, and set the fixture's runtime ID to that manifest.
Use synthetic web BFF configuration, never production credentials or data.
With `COVE_TURTLE_BROWSER_E2E=1` in development, the fixture uses a separate
`cove-turtle-browser-fixture` guest cookie and nonce namespace so it does not
overwrite an ordinary localhost development guest. Production cookie names
are unchanged.

Run admission tests only with
`TURTLE_BROWSER_TEST_REDIS_URL=redis://127.0.0.1:6398/1`. They refuse other hosts,
ports/databases and clean only fixture-prefix keys in that isolated DB.

With the optional API fixture running, this independent-visitor admission
cohort exercises twenty simultaneously active browser reservations and renewals:

```sh
COVE_TURTLE_BROWSER_FIXTURE=1 node packages/turtle-browser-runtime/scripts/admission-fixture-load.mjs
```

It refuses non-fixture execution and cleans up its own grants/runs. The fixture
throws on broker calls. Its timings exclude production academy reads, Next BFF,
network and browser rendering; it is not a twenty-device performance result.

Required acceptance evidence remains: actual classroom laptop/Chromebook/iPad
and supported-browser cohorts, cold 10 Mbps/50 ms readiness, end-to-end admission
to visible stroke, twenty visitors, output/drawing stress, effective production
CSP, and the exact previous release rollback rehearsal. Local timings excluding
API admission cannot establish production first-stroke performance.
