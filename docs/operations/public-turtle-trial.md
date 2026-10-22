# Public turtle trial

`/turtle` is a guest classroom, independent of Studio login and course records.
See the [approved specification](../superpowers/specs/2026-10-22-public-turtle-trial-design.md).
The PPT stays with the teacher; it is not uploaded or published by this feature.

## Admission and secrets

### Academy manager controls

Managers open **Academy settings → Public Turtle access** to generate their
academy's shared six-digit code, show/hide it, copy it, or replace it. New
visitors open `/turtle` and enter only that code. Codes identify the academy;
visitors never need accounts, classes or enrollment. Each browser gets two
hours of access. The workspace header uses the admitted academy's name.

Only live `academy.settings.manage` authority can read or change a code.
Replacement requires confirmation and invalidates that academy's existing
guest grants on their next request; display leases expire within 30 seconds
without renewal. Other academies are unaffected. A stale manager view gets a
conflict and must refresh. The UI never writes the PIN to browser storage,
URLs or shared query caches. Secret read/generation intents are audited without
PIN values. A failed audit write refuses the operation.

### Operator configuration

Enable the matching web build/runtime flags and `TURTLE_TRIAL_ENABLED` only
when the dedicated guest runtime is ready. Configure a stable random
`TURTLE_TRIAL_PIN_PEPPER` privately on every API replica (at least 32 characters;
for example generate it with `openssl rand -base64 32` in a private terminal).
It keys the lookup digest and derives a separate AES-GCM encryption key.
Academy codes no longer require per-code environment changes or deployments.
Keep `BFF_SHARED_SECRET` identical in web and API configuration, and use an
independent guest-broker secret.

Back up Redis's AOF data together with a protected copy of the pepper. The
academy PIN registry is long-lived, while visitor grants expire. Production
Redis already uses AOF and noeviction. After Redis loss, managed codes and
access fail closed; restore the backup or have managers generate new codes.
Changing the pepper requires replacing academy codes. Retired lookup digests
remain reserved for two hours to avoid immediate reuse by another academy.

### Optional legacy operator code

`TURTLE_TRIAL_LEGACY_PIN_ENABLED` defaults to false. Enable it only when
intentionally retaining the older platform-wide code or running the dedicated
local fixture. Academy-generated codes are kept distinct from that code.
When legacy support is enabled, the API also requires the old digest/version:

```bash
pnpm --filter @cove/api exec tsx scripts/turtle-trial-pin.mts
```

The utility prints a legacy code and its API-only digest, pepper and version.
Never replace a live academy pepper with the utility's new one just to create
a legacy code: changing the pepper makes stored academy codes unreadable.
Do not collect its output in CI or commit it. Legacy version activation remains
`--activate-version <version>` with an operator-provided `REDIS_URL`. This
version does not control academy-generated grants.

The fixed guest cookie is HttpOnly, Secure, SameSite=Lax, host-only. The PIN is
never returned to the browser after verification. Access, runtime output and
student code are not cached. Caddy removes cookie/auth/display subprotocol
headers from access logs. The private BFF header is required by every guest
API endpoint; clients cannot bypass the web boundary to supply their own IP.

## Dedicated execution host

Use a **different Docker daemon** from the course broker. The runtime
checks pool labels before startup cleanup and refuses to remove another
pool's containers. This protection does not make sharing a daemon supported.
A separate execution host remains the recommended classroom deployment. The
limited rootless pilot below supports an existing VPS with a separate daemon.

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

## Limited pilot on an existing VPS

This option supports **one active drawing**, with a bounded waiting queue.
It shares the host kernel and physical resources with the application, so it
is not evidence of classroom capacity or the same isolation as a separate VM.
The guest Docker daemon and its student containers use a separate Unix socket,
data directory, user systemd service, and cgroup slice. The application Docker
context and course daemon are not changed. The guest slice is capped at 1 GiB,
1.5 CPUs and 256 tasks; each drawing retains its 512 MiB/one CPU/64-PID limits.
The private broker separately reserves 256 MiB and 0.5 CPU.

One-time prerequisites, run by the VPS administrator:

```bash
sudo apt-get update
sudo apt-get install -y uidmap slirp4netns
sudo loginctl enable-linger cove
```

As the deployment user over SSH, run `bash scripts/setup-turtle-rootless.sh`.
It creates `cove-turtle-docker.service` and `cove-turtle.slice` in the user's
systemd directory, validates rootless mode and cgroup v2 controllers, and prints
the socket path. It refuses to overwrite differing configuration. Re-run it
unchanged to check an existing setup. No system Docker service is restarted.
After daemon recovery, its post-start hook restarts only the private pilot
broker so its bind mount reconnects to the newly created Unix socket.

Prepare a private `turtle-trial-rootless.env` manifest (mode 600):

```dotenv
TURTLE_TRIAL_BROKER_IMAGE=ghcr.io/dlabmapo-web/cove-gui-service@sha256:APPROVED_DIGEST
TURTLE_TRIAL_DOCKER_SOCKET=/run/user/DEPLOYMENT_USER_UID/cove-turtle/docker.sock
TURTLE_TRIAL_DOCKER_UID=DEPLOYMENT_USER_UID
TURTLE_TRIAL_DOCKER_GID=DEPLOYMENT_USER_GID
TURTLE_TRIAL_CONTROL_NETWORK=cove-production_gui-control
```

Keep the independent broker secret and approved runtime digest in
`secrets/turtle-trial.env`. Pull the approved runtime using an explicit socket:
`docker --host unix:///run/user/DEPLOYMENT_USER_UID/cove-turtle/docker.sock pull IMAGE@sha256:DIGEST`.
Never change the deployment user's default Docker context. Then start the
private broker with:

```bash
docker compose --env-file turtle-trial-rootless.env \
  -f compose.turtle-trial-rootless.yml up -d --wait
```

The broker runs as the socket owner's UID/GID with all capabilities dropped.
It has no published ports, joins only the existing internal control
network, and mounts only the rootless socket. Its startup refuses rootful
Docker, missing resource controllers, or any capacity other than one. Configure
the API's guest URL as `http://trial-broker:4010`, the display upstream as
`trial-broker:4010`, and the public display URL as
`wss://cs.coveedu.com/turtle-display`. Generate the stable PIN pepper privately.
Verify resource enforcement and a real drawing before enabling the release
flag. A runtime failure closes admission; it never falls back to course Docker.

For rollback, disable public admission through the release manifest, stop this
separate Compose project, and stop the user service if needed. Keep its data
and PIN pepper for recovery. Do not remove course containers or shared networks.

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
