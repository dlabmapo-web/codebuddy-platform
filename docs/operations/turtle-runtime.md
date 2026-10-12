# Turtle and written-response runtime

The turtle feature uses CPython 3.12 and Tk 8.6 in a fresh Docker sandbox, with Xvfb and x11vnc. Cove's browser viewer uses noVNC 1.6.0. Ordinary programming exercises continue to use their existing runtime and automatic judge. Turtle and written-response submissions receive explicit teacher reviews.

## Local setup

Use the development Supabase project. Never run the development fixture against production.

```bash
pnpm install --frozen-lockfile
pnpm --filter @cove/shared build
pnpm --filter @cove/api db:migrate:deploy
pnpm --filter @cove/api exec tsx scripts/setup-turtle-storage.mts

docker build -t cove-gui-runtime:dev packages/gui-runtime/docker
```

Generate a random secret of at least 32 characters and put it in an untracked environment file with mode 600. Load the same secret in the API and GUI service. Do not expose it in the browser configuration.

```dotenv
GUI_ENABLED=true
GUI_SERVICE_URL=http://127.0.0.1:4010
GUI_PUBLIC_WS_URL=ws://localhost:4010
GUI_SERVICE_SECRET=<random shared secret>
GUI_ALLOWED_ORIGINS=http://localhost:3000
GUI_RUNTIME_IMAGE=cove-gui-runtime:dev
GUI_SESSION_CAPACITY=2
```

Start Redis and the existing judge as usual. Load the environment file before starting the API and GUI service in separate terminals:

```bash
pnpm --filter @cove/gui-runtime start
pnpm --filter @cove/api dev
```

Start the web application with `NEXT_PUBLIC_GUI_ENABLED=true`. For localhost E2E use Cloudflare's always-pass **test** site key:

```bash
NEXT_PUBLIC_GUI_ENABLED=true NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm --filter @cove/web dev
E2E_GUI_ENABLED=1 pnpm e2e turtle-materials.spec.ts --project=chromium
E2E_GUI_ENABLED=1 pnpm e2e turtle-materials.spec.ts --project=webkit-turtle
```

GUI browser tests are opt-in (`E2E_GUI_ENABLED=1`); the ordinary E2E suite skips them when the separate GUI service is not configured. The normal E2E setup seeds development identities. The turtle test additionally resets only its disposable `E2E Turtle Materials` course. For an already seeded environment, `E2E_SKIP_SEED=1` skips the common seed; the turtle fixture still resets. Run projects sequentially because they share the disposable fixture. Runtime integration tests require a running GUI service and the same `GUI_SERVICE_SECRET`; otherwise those tests are explicitly skipped:

```bash
pnpm --filter @cove/gui-runtime test
```

## Production rollout

Both `GUI_ENABLED` (API) and `NEXT_PUBLIC_GUI_ENABLED` (web build) default to false. The release workflow reads the GitHub repository variable `NEXT_PUBLIC_GUI_ENABLED`, falling back to false; changing only a running web container environment does not enable the compiled authoring UI. This change does not enable production execution. Deploy the additive migrations, private storage bucket and API before enabling authoring.

Create the production `turtle-assets` bucket as **private**, with a 5 MiB per-object limit and allowed MIME types `image/gif`, `image/png`, `image/jpeg`, `text/plain` and `application/json`. The setup and fixture scripts deliberately refuse production; configure its bucket separately through the normal deployment process. Keep storage access restricted to the server service role; learners receive authorized bytes through the API, never public object URLs. Apply all three additive manual-material migrations, including the server-only RLS/client-grant migration.

Build/publish the execution image and record its registry digest. Use `GUI_RUNTIME_IMAGE=registry.example/cove-gui-runtime@sha256:<digest>` in production; mutable tags are rejected. The broker pins the resolved image ID at startup and stores that ID plus Python/Tk versions in author configuration and immutable submissions. A rerun whose saved version is unavailable returns an infrastructure error. Retain old images and their separately routed brokers if historical reruns are needed; there is no automatic runtime upgrade or fallback.

Build the separately deployable control plane:

```bash
docker build -f deploy/Dockerfile.gui -t cove-gui-service:<version> .
```

The packaged broker uses Docker CLI 29.x. Verify client/daemon compatibility on the execution host when upgrading either. Run one broker per dedicated execution Docker daemon. Startup removes abandoned containers labelled `cove.gui=true`, so multiple brokers must not share that daemon. The trusted broker requires Docker access. The learner containers have no Docker socket, host mounts, application environment or database credentials. Prefer a dedicated execution VM/host, separate from the API, database and ordinary judge.

Supply the API's private `GUI_SERVICE_URL`, a random shared `GUI_SERVICE_SECRET`, public `GUI_PUBLIC_WS_URL=wss://gui.example.com`, exact `GUI_ALLOWED_ORIGINS=https://your-cove-domain`, the approved image digest and explicit capacity. Bind the service to loopback by default, or to a private container network with `GUI_BIND_ADDRESS=0.0.0.0`. Restrict REST access to the API/control network. The public reverse proxy must expose **only** WebSocket upgrades matching `/sessions/<uuid>/display`, with TLS, normal upgrade headers, and an idle timeout exceeding the maximum lesson runtime. Reject other public paths. Never publish VNC ports 5900/5901 or Docker's remote API.

For nginx, the public vhost's relevant locations are:

```nginx
location ~ ^/sessions/[a-f0-9-]+/display$ {
    limit_except GET { deny all; }
    proxy_pass http://127.0.0.1:4010;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Origin $http_origin;
    proxy_read_timeout 1900s;
    proxy_send_timeout 1900s;
}
location / { return 404; }
```

Use the platform's usual TLS configuration and service supervision. The broker verifies Origin and a session capability in the WebSocket subprotocol before bridging. Avoid logging WebSocket subprotocol headers. The owner capability accepts input; teacher live viewing receives a separate expiring capability routed to x11vnc's view-only endpoint.

## Isolation and capacity

Every learner container runs as UID 1000 with a read-only root filesystem, no capabilities, no new privileges, `network=none`, a private PID/cgroup namespace, one CPU, 128–512 MiB memory with no extra swap, and 64 PIDs. The checked-in Moby seccomp allowlist is applied explicitly, including on Docker hosts whose default profile is unconfined. The original profile license is adjacent to it. Startup checks the actual Docker isolation configuration before executing source.

Writable `/work`, `/tmp` and shared memory are bounded to 16 + 8 + 8 MiB. Approved lesson assets have a separate 21 MiB root-owned tmpfs, with at most 20 MiB of immutable files and 5 MiB per file. Their bytes count toward the container memory limit. Combined retained terminal output is bounded to 1 MiB. Source is limited to 64 files and 1 MiB. Tk supports GIF shapes through its ordinary APIs; image assets are available under `assets/`.

Pending startup/queue manifests share a 64 MiB broker buffer limit; oversized aggregate admission returns a recoverable busy response. Admission is bounded by `GUI_SESSION_CAPACITY`; the queue is at most four times that size and expires after 60 seconds. Queued jobs consume no container slot. The wall timer includes input waiting and mainloop. Stop removes the entire container, including descendants. Owner polling renews a 30-second lease; a lost viewer gets 30 seconds to reconnect. Access is checked on API session operations; lease expiry cleans up abandoned runs. Broker restart cancels old executions instead of resuming them.

Local capacity is two. During a local run of the keyboard/drawing and asset scenarios, 12 Docker samples showed 29.09–36.03 MiB per 512 MiB sandbox, 5–6 PIDs, and 0.33–30.79% CPU. These are observed samples, not a stress-test peak or a production capacity guarantee. Set production capacity from **reserved execution resources**, accounting for the maximum configured memory per admitted run, display/asset memory, broker overhead, CPU and host headroom. Idle drawing memory is not a safe capacity estimate. Start with one slot on a dedicated host, exercise the maximum supported profile, and increase only after measuring concurrent peak demand and host pressure. Do not use the application's total RAM as the GUI budget.

## Persistent records and rollback

Postgres stores configurations, optimistic-lock drafts, immutable submitted source/answers and append-only review history. Supabase's private `turtle-assets` bucket stores immutable author assets. Learners never receive private solution code/assets or written model answers. Adopting a course copies configuration and references its immutable assets; it does not copy learner attempts or reviews.

Do not delete referenced assets. No automatic asset garbage collector ships in this release; apply the existing backup/retention policy to teaching records and the private bucket. Desktop files and final frames are ephemeral; the browser can retain its last received frame until navigation. Feedback and source are excluded from GUI lifecycle logs.

Rollback disables new admission/authoring with the flags and stops the broker cleanly. Preserve schema, submissions, drafts, reviews and assets. There is no automatic image grading. Latest submitted attempt and latest published review determine the manual result within a class; score inclusion and completion are independent controls. Existing point awards retain their once-only behavior when a review is revised.

Keep an API/web version that understands the new material types during rollback. An older binary that predates these types may fail to read courses containing them; turning the flags off is the supported rollback after authors have created turtle or written-response materials.

## Local verification — 2026-10-08

- Shared, API and web builds pass; API, web and E2E TypeScript checks pass.
- 88 affected API service/projection/import/adoption tests and the HTTP body-parser integration regression pass. The latter checks large manual source, ordinary JSON routes, unchanged limits outside manual routes and exact webhook bytes.
- All seven runtime tests pass against real Docker sandboxes: three policy/parser tests and four execution/isolation/lifecycle tests. The packaged GUI broker also passed the four execution tests.
- All 124 translation tests pass. Development database checks verify server-only client grants/RLS, immutable submissions and append-only reviews.
- Chromium's two turtle scenarios pass with real drawing, terminal input, keyboard/timer events, queue admission, reconnect, drafts, manual review, private assets, written responses and mobile Drawing/Terminal controls. The mobile assertion checks a visible painted canvas and a navigation footer below it.
- The existing PDF browser regression passes: private upload, reader, navigation and original-file download. All three ordinary Python browser scenarios pass: isolated interactive input, inline error coaching with editor markers, and output without a trailing newline. Their fixture selects the seeded class explicitly, and assertions follow the current terminal/result layout.
- Both WebKit turtle scenarios also pass with the updated visible-canvas/mobile-footer assertions. Across the targeted runs, all eight browser scenarios pass: two turtle scenarios in each browser, one PDF scenario and three ordinary Python scenarios. The API parser fix is exercised by the real PDF flow and the WebKit turtle flow.

Production was not enabled or modified. Docker resource samples above describe local observation only.

## Reference limitations

The researched Elice samples establish VNC, standard turtle event loops and callbacks, independent Submit/score controls, and manual assessment. Elice's exact numeric review publication, latest/best-attempt selection, completion threshold, provisional zero and reconnect/final-frame policies were not exercised against real reference submissions. Cove's explicit policies above are implemented choices; do not claim those unverified transitions are identical.

Implementation references: [noVNC API](https://github.com/novnc/noVNC/blob/master/docs/API.md), [Docker seccomp](https://docs.docker.com/engine/security/seccomp/), [Moby profile](https://github.com/moby/profiles/blob/main/seccomp/default.json). The web build applies a guarded in-memory compatibility fix to the pinned noVNC npm CommonJS package's optional H.264 capability probe; the x11vnc display path does not use H.264. Generated viewer assets and upstream licenses are rebuilt by the web predev/prebuild scripts.

## Repeatable v2 release integration

The v2 workflow publishes both `cove-gui-service` and `cove-gui-runtime`, and passes its public build flags into the candidate deployment manifest. The manifest's `GUI_ENABLED=true` also selects the private Compose `gui` profile. Configure `/opt/cove/secrets/gui.env` with the same random secret as the API, `GUI_ALLOWED_ORIGINS=https://cs.coveedu.com` and an explicit initial capacity of one. Configure the API with `GUI_SERVICE_URL=http://gui-service:4010` and `GUI_PUBLIC_WS_URL=wss://cs.coveedu.com/gui`.

The trusted broker alone mounts Docker's socket. Its network is internal, and no broker/VNC ports are published. Caddy exposes only GET WebSocket upgrades at `/gui/sessions/<uuid>/display`; every other `/gui/` path returns 404. WebSocket subprotocol capabilities are removed from request and response access-log headers. The release pulls the selected learner image, resolves its registry digest and atomically pins it in the private broker environment before restarting the broker. Do not share this daemon with a second GUI broker. The existing learner isolation checks still run before execution.

The default application memory ceiling remains below 9 GiB. Video encoding and GUI sessions are additional bounded workloads; preflight requires available memory for their configured maxima plus application headroom and 40 GiB free video scratch. The shared VPS configuration is an initial low-capacity rollout, not a concurrency guarantee. Keep one learner slot until host load is measured; move the broker/execution daemon to a dedicated host before increasing capacity significantly. Historical lessons retain their runtime version and need their original broker/image for historical reruns.

Admission flags live in `deployment.env`, independently from secrets, so rolling back to a manifest without the new flags disables new admission and stops optional runtimes. It does not undo database migrations or remove uploaded originals/submissions. The release's storage setup creates the required private buckets and fails if the project upload ceiling is too low; it never silently lowers the advertised PDF or video limit.
