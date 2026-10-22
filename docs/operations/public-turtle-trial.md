# Public turtle trial

`/turtle` is a guest classroom, independent of Studio login and course records.
See the [approved specification](../superpowers/specs/2026-10-22-public-turtle-trial-design.md).
The PPT stays with the teacher; it is not uploaded or published by this feature.

## Admission and secrets

### Who manages the classroom code

The developer/operator generates one shared six-digit code during setup and
gives it privately to the teacher. The teacher shares that code with trial
students. Students enter it at `/turtle`; a correct code gives that browser
two hours of access without creating an account. Refreshing the page or
changing language keeps that access. Exit ends it immediately. The shared
code remains usable until the operator rotates it; the two-hour limit applies
to each browser's access, not to the code itself. Incorrect attempts are limited.

There is currently no teacher-facing code-generation or change-code screen.
Generate, deploy and activate a replacement through the operator steps below;
activating it invalidates access granted with the old code on the next check.
The local test setup uses `012345` only as a disposable fixture.

### Operator configuration

The API and web flags default off. Set GitHub's build variable
`NEXT_PUBLIC_TURTLE_TRIAL_ENABLED=true` only for a release that is ready to admit
guests. Release selection writes the matching `TURTLE_TRIAL_ENABLED` runtime
flag to `deployment.env`. Setting it false stops API lease renewal and new Run
admission without changing the logged-in course turtle flags.

Generate a code locally in a private operator terminal:

```bash
pnpm --filter @cove/api exec tsx scripts/turtle-trial-pin.mts
```

The utility prints the teacher's code once, plus API-only digest, pepper, and
version. Do not capture its output in CI, paste it into git, or pass the PIN as
a shell argument. Put those settings in private API configuration. Use a
separate random `TURTLE_TRIAL_SERVICE_SECRET` for the guest broker. Keep
`BFF_SHARED_SECRET` identical in web and API configuration.

For rotation, deploy the new digest/pepper/version first, then run the operator
utility with `--activate-version <new-version>` and an operator-provided
`REDIS_URL` environment variable. Only the active Redis version can issue or
renew grants; older API replicas fail closed during the transition. Existing
grants are revoked on their next request, and their display/container leases
expire within 30 seconds after the last successful renewal. Grants expire
absolutely after two hours and never create Supabase identities.

The fixed guest cookie is HttpOnly, Secure, SameSite=Lax, host-only. The PIN is
never returned to the browser after verification. Access, runtime output and
student code are not cached. Caddy removes cookie/auth/display subprotocol
headers from access logs. The private BFF header is required by every guest
API endpoint; clients cannot bypass the web boundary to supply their own IP.

## Dedicated execution host

Use a **different Docker daemon/host** from the course broker. The runtime
checks pool labels before startup cleanup and refuses to remove another
pool's containers. This protection does not make sharing a daemon supported.

On that host, deploy `compose.turtle-trial.yml`, its private env file based on
`secrets/turtle-trial.env.example`, and an approved broker/runtime image pinned
by digest. Keep `GUI_TRIAL_ONLY=true`. Bind port 4010 to a private VPN/VPC
address and firewall it to the API and Caddy only. Do not open it to the public
Internet. The trusted broker needs its own daemon's Docker socket; student
containers never get that socket, a host bind mount, or application secrets.

Configure the API's `TURTLE_TRIAL_SERVICE_URL` to that private broker and
`TURTLE_TRIAL_PUBLIC_WS_URL=wss://cs.coveedu.com/turtle-display`. Set
`TURTLE_TRIAL_DISPLAY_UPSTREAM` in the main `deployment.env` to its private
address (for example `10.66.0.2:4010`). Caddy exposes only display WebSocket
upgrades at `/turtle-display/sessions/<uuid>/display`; REST, health, VNC and
Docker remain private. The course `/gui` gateway uses its original broker.
Never configure the guest URL to fall back to the course broker.

Each run reserves 512 MiB, one CPU, at most 64 PIDs, and 120 seconds including
input waiting and viewing the finished drawing. Output is capped at 256 KiB.
The guest grant allows one queued/active run, twelve accepted starts per minute,
sixty per hour, and 1,800 admitted container seconds. Reservations/refunds and
rate limits are atomic in Redis. An uncertain abandoned run is charged
conservatively; a repeated request key does not execute a second copy.

Set `GUI_SESSION_CAPACITY` from measured resources, not idle memory samples.
A 20-student class needs at least 10 GiB of container memory reservation alone,
plus broker/host/CPU headroom. A one-slot setup is for local testing only. Run
the actual expected class size in staging before classroom launch and record
peak usage, startup delays, queueing, reconnect, and cleanup. This implementation
does not automatically provision or validate a 20-seat production host.

## Local verification

Use an otherwise idle GUI execution daemon for the local fixture. The existing
application's dev servers need not be stopped: the harness uses independent
ports, `.next-turtle`, a guest-only Nest module, and no application database.

```bash
docker run --rm -d --name cove-turtle-trial-test-redis -p 127.0.0.1:6397:6379 redis:8-alpine
docker build -t cove-turtle-trial:dev packages/gui-runtime/docker
pnpm --filter @cove/shared build
pnpm --filter @cove/api build
TURTLE_TRIAL_TEST_REDIS_URL=redis://127.0.0.1:6397/1 pnpm --filter @cove/api exec vitest run src/turtle-trial/trial.spec.ts
node packages/gui-runtime/scripts/test-trial-helpers.mjs
pnpm exec playwright test --config e2e/turtle-trial.playwright.config.ts
docker stop cove-turtle-trial-test-redis
```

The local harness deliberately configures its own disposable `012345` PIN and
known fixture-only secrets. They are not application defaults and the harness
refuses `NODE_ENV=production`. It binds only loopback, requires the dedicated
localhost Redis port, and bypasses neither guest authorization nor real Docker
execution. Browser tests cover the actual public page and BFF, not mocked Run
responses. The generated helper bundle is also included in exported projects.

## Outages and rollback

Redis, broker, or PIN-version/configuration failures reject new admission and
lease renewal. The editor remains local and can download `main.py`; grant
expiry retains this tab's code so the student can re-enter the classroom code.
Explicit Exit revokes the grant, requests Stop, and clears that tab's draft.

Disable `TURTLE_TRIAL_ENABLED` to close admission. Shut down only the dedicated
trial broker to terminate all guest execution immediately. Restore the previous
release to roll back the page; no application database migration is involved.
Clean up test Redis/container resources without touching authenticated course
records, the provided PPT, or another service's containers.
