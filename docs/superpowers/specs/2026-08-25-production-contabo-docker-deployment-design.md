# Production Contabo Docker Deployment Design

**Date:** 2026-08-25
**Branch:** `feat/cove-studio-v2`
**Status:** Implemented locally; live VPS and provider acceptance pending

## 1. Purpose

Cove needs a repeatable, secure production deployment on one Contabo VPS. The
deployment must serve Cove Home, Cove Studio v2, the v2 API and judge worker,
and the existing MVP without coupling their release lifecycles. Releases must
use immutable private Docker images, support controlled rollback, and expose no
internal service directly to the internet.

The database remains on Supabase. Resend remains the transactional email
provider. Contabo supplies compute and S3-compatible object storage; it does not
become the database or mail provider.

## 2. Goals

- Build reproducible production images for every runnable service.
- Publish private images to GitHub Container Registry (GHCR).
- Deploy only an explicitly approved version through GitHub Actions.
- Terminate HTTPS and route all public traffic through Caddy.
- Isolate applications, Redis, and monitoring on private Docker networks.
- Keep the MVP pinned and independently deployable from `main`.
- Apply database migrations exactly once before application rollout.
- Provide health checks, bounded logs, metrics, alerts, and encrypted backups.
- Verify the complete system with smoke, end-to-end, and staged load tests
  before public DNS cutover.
- Make application and DNS rollback procedures explicit and rehearsable.

## 3. Non-goals

- Moving PostgreSQL away from Supabase.
- Running an SMTP server on Contabo.
- Creating a multi-node high-availability cluster.
- Adopting Kubernetes for a single VPS.
- Automatically deploying every branch push.
- Making Grafana, Prometheus, Redis, or application origin ports public.
- Treating VPS snapshots as the only backup mechanism.
- Performing live DNS, Resend, or Supabase dashboard changes before the VPS
  exists and the pre-cutover checks pass.

## 4. Production topology

One Docker Compose project runs these containers:

| Container | Public host | Source | Network access |
|---|---|---|---|
| `home` | `coveedu.com` | `packages/home` on the v2 release | Caddy only |
| `studio` | `cs.coveedu.com` | `packages/web` on the v2 release | Caddy and API |
| `api` | `api.coveedu.com` | `packages/api` on the v2 release | Caddy, Redis, Supabase |
| `judge-worker` | none | `packages/judge-worker` on the v2 release | Redis, Supabase |
| `redis` | none | official pinned Redis image | API and judge worker |
| `mvp` | `mvp.coveedu.com` | pinned `main` commit | Caddy and its external dependencies |
| `caddy` | ports 80 and 443 | official pinned Caddy image | public edge and application origins |
| `prometheus` | none | official pinned image | monitoring network |
| `grafana` | none | official pinned image | monitoring network |
| `node-exporter` | none | official pinned image | monitoring network |
| `cadvisor` | none | official pinned image | monitoring network |

The deployment uses three explicit networks:

- `edge`: Caddy and HTTP application origins;
- `backend`: API, judge worker, and Redis; and
- `monitoring`: Prometheus, Grafana, node-exporter, and cAdvisor.

Only Caddy publishes host ports. Redis and application origin ports have no
public bindings. Monitoring access uses an SSH tunnel unless a later design
adds a separately authenticated administration host.

## 5. Image design

### 5.1 V2 monorepo images

Home, Studio, API, and judge worker each have a multi-stage Dockerfile. A shared
build pattern uses the repository's pinned pnpm version and lockfile, installs
dependencies with `--frozen-lockfile`, builds only the required workspace
closure, and copies only runtime artifacts into the final stage.

Next.js production images use Next.js standalone output so they do not carry a
complete development dependency tree. The API and worker images contain their
compiled JavaScript, generated Prisma client artifacts, required runtime
assets, and production dependencies. Final containers run as unprivileged
users. Writable paths are explicit volumes or temporary filesystems; other
runtime filesystems are read-only where supported.

Build-time public variables for Home and Studio are supplied deliberately by
CI. Runtime secrets are never Docker build arguments and never enter image
layers.

### 5.2 MVP image

The MVP Dockerfile is built from an explicit `main` commit SHA. Its image tag
records that SHA. A v2 release workflow cannot change `MVP_IMAGE_TAG`; updating
the MVP requires a separate manual workflow and acceptance test.

### 5.3 Image identity and scanning

GHCR repositories remain private. Every application image receives an
immutable commit-SHA tag and an approved semantic version tag. Production
Compose references immutable tags; `latest` never determines deployed state.

CI generates build provenance and a software bill of materials when supported
by the selected build action. Images are scanned before publishing. A release
is blocked by an unresolved critical vulnerability in a production dependency
or base image. Lower severities are recorded for triage without silently
breaking releases.

## 6. Caddy and HTTPS

Caddy is the sole ingress service. It obtains and renews public TLS
certificates, redirects HTTP to HTTPS, and routes by host:

```text
coveedu.com      -> home
cs.coveedu.com   -> studio
api.coveedu.com  -> api
mvp.coveedu.com  -> mvp
```

The configuration preserves WebSocket and server-sent-event connections,
forwards standard proxy headers, compresses eligible responses, and applies
production security headers. Request-body and timeout behavior must permit the
existing workbook imports and long-running submission streams without allowing
unbounded uploads or idle connections.

Caddy state and certificate data live on named volumes and are included in the
encrypted VPS backup. Caddy access and error logs use structured output and
bounded rotation. The API health URL is available through HTTPS for external
monitoring; internal service health URLs remain inaccessible from the public
internet unless explicitly routed.

## 7. Configuration and secrets

The repository contains production environment templates containing names and
safe examples only. Secret values are stored in GitHub production-environment
secrets and in root-owned or deployment-user-owned files on the VPS with mode
`0600`. They are not committed, printed by workflows, embedded in images, or
passed through public Next.js variables.

Required secret groups include:

- Supabase URLs and keys;
- pooled runtime and direct migration database URLs;
- the shared BFF secret;
- Redis authentication;
- Resend API and webhook credentials;
- Turnstile configuration;
- GHCR pull credentials scoped to packages read access;
- deploy SSH credentials;
- Contabo Object Storage credentials and Restic repository password; and
- `ALERT_EMAIL` for operational notifications.

The deployment preflight script rejects missing variables, known placeholder
values, mismatched BFF secrets, insecure production origins, and publicly bound
Redis configuration. It reports variable names, never secret values.

## 8. CI and release workflow

### 8.1 Continuous integration

Pull requests and relevant branch pushes run:

1. frozen dependency installation;
2. formatting or repository consistency checks that already exist;
3. linting and type checks;
4. unit and integration tests;
5. canonical route and i18n checks;
6. production application builds;
7. Docker image builds;
8. Compose configuration validation;
9. secret-placeholder scanning; and
10. container vulnerability scanning.

CI builds images but does not contact or mutate the VPS.

### 8.2 Production release

A semantic version tag identifies a candidate release. The production workflow
requires GitHub Environment approval and then:

1. verifies that the tag resolves to the tested commit;
2. builds and publishes private commit-SHA and semantic-version image tags;
3. records the currently deployed manifest as the rollback target;
4. connects as the dedicated deployment user using an SSH deploy key;
5. uploads or selects the new non-secret release manifest;
6. authenticates the VPS to GHCR with a read-only package token;
7. pulls images without changing running containers;
8. runs the deployment preflight;
9. runs `prisma migrate deploy` as a one-shot task;
10. starts backend services and waits for health;
11. starts Home and Studio and waits for health;
12. runs HTTPS smoke tests; and
13. records success or restores the prior manifest and containers.

The workflow is concurrency-locked so two production releases cannot overlap.
Deployments do not build source code on the VPS.

### 8.3 Database migration rule

Production migrations must be backward-compatible with the previous
application version. Destructive column or table removal uses expand-migrate-
contract across separate releases. Application rollback restores images but
does not automatically reverse database migrations.

## 9. VPS hardening and runtime policy

Bootstrap automation performs these idempotent operations:

- creates a dedicated non-root deployment user;
- configures SSH-key-only authentication;
- disables password authentication and direct root SSH login after verifying
  the deployment user's access;
- installs Docker from its official package repository;
- enables UFW with only SSH, HTTP, and HTTPS inbound;
- enables automatic operating-system security updates;
- configures brute-force protection for SSH;
- creates deployment, secret, backup, and log directories with least-privilege
  ownership; and
- validates adequate disk, memory, clock synchronization, and DNS resolution.

Containers use `restart: unless-stopped`, explicit health checks, bounded CPU
and memory resources, and graceful stop periods. The judge worker receives a
resource ceiling and tuned concurrency so CPU-bound Python execution cannot
starve Caddy, API, Redis, or SSH. Redis uses authentication, append-only
persistence with one-second fsync, a no-eviction policy, and a named volume.

The initial profile targets Cloud VPS 8 with eight vCPU and 24 GB RAM. Memory
ceilings reserve at least 4 GB for the operating system, filesystem cache,
Docker, deployment overlap, and emergency access. The first allocation is:

| Service group | Memory ceiling | CPU ceiling |
|---|---:|---:|
| Caddy | 256 MB | 0.50 CPU |
| Home | 768 MB | 0.75 CPU |
| Studio | 3 GB | 2.00 CPU |
| API | 3 GB | 2.00 CPU |
| Judge worker | 5 GB | 3.00 CPU |
| Redis | 1.5 GB container / 1 GB Redis maxmemory | 1.00 CPU |
| MVP | 2 GB | 1.50 CPU |
| Monitoring stack | 2.5 GB combined | 1.50 CPU combined |

CPU ceilings may be oversubscribed because ordinary peaks are not simultaneous;
memory ceilings must fit concurrently. Load-test evidence may lower judge
concurrency or revise these values before launch, but the operating-system
reserve is not consumed merely to make a failing test pass.

Docker log rotation bounds file size and retained file count. Disk alerts fire
before logs, images, or Redis persistence can exhaust the filesystem. Old
unreferenced images are pruned only through a controlled maintenance command
that preserves current and rollback releases.

## 10. Monitoring and alerting

Each application exposes or receives a meaningful health check:

- API health validates process readiness and reports a stable schema;
- Home, Studio, and MVP return successful HTTP responses from representative
  routes;
- Redis uses authenticated `PING`;
- the judge worker exposes its loopback health server and confirms queue
  connectivity; and
- Caddy is tested through each public hostname.

Prometheus collects host and container metrics from node-exporter and cAdvisor.
Grafana provides dashboards for CPU, memory, disk, network, restarts, and
container health. Application logs remain the initial source for endpoint and
delivery diagnostics; adding a centralized log database is outside the first
launch scope.

An independent external uptime provider checks:

- `https://coveedu.com`;
- `https://cs.coveedu.com/login`;
- `https://api.coveedu.com/api/health`; and
- `https://mvp.coveedu.com/login`.

It emails `ALERT_EMAIL`, ensuring total VPS failure is visible even though the
local monitoring stack is also offline. Alerts cover sustained CPU or memory
pressure, low disk space, unhealthy or restarting containers, API failures,
TLS expiration, Redis persistence failure, and stale or failed backups.

## 11. Backups and restore

Supabase remains the system of record for PostgreSQL. Before launch, its active
backup policy and a controlled restore procedure are verified and documented.

Restic creates encrypted nightly backups to a private Contabo Object Storage
bucket. Backups include:

- Redis persistence;
- Caddy state and certificate data;
- deployed manifests and operational scripts;
- Grafana provisioning and dashboards; and
- migration and operational artifacts that are not reproducible from Git.

Runtime secret files may enter only the encrypted Restic repository; plain
secrets are never uploaded as objects. The Restic repository password and
Object Storage recovery credentials are kept in an offline operator recovery
record, not in the bucket they unlock. The retention policy keeps seven daily,
five weekly, and twelve monthly snapshots. Backup jobs report success or
failure to the external monitoring service. A scheduled restore test extracts
the latest snapshot into a temporary directory, validates its contents without
printing secret values, and removes the temporary restore after recording the
result.

A Contabo VPS snapshot is taken before major releases when available. It is a
supplementary machine-level recovery point, not a substitute for Restic or
Supabase backups.

## 12. Verification strategy

### 12.1 Automated release gates

- All repository builds, type checks, lint checks, tests, route checks, and
  image builds pass.
- Every service starts using production configuration and becomes healthy.
- Compose has no unexpected public ports.
- Images contain no known repository secrets or unresolved critical runtime
  vulnerabilities.
- Migration preflight succeeds against the production schema before rollout.

### 12.2 End-to-end smoke tests

Playwright runs against the deployed environment with controlled test accounts
for platform admin, manager, team lead, teacher, and student roles. It covers:

- Home navigation into Studio and MVP;
- signup without mandatory email confirmation;
- login, logout, and browser-history behavior;
- role-specific entry and academy authorization boundaries;
- course, class, exercise, submission, and migrated curriculum access;
- invitation delivery and acceptance;
- password recovery and password update;
- canonical link generation; and
- existing MVP login and representative v1 workflows.

Test data is isolated from normal academy activity and is removed or clearly
marked after validation.

### 12.3 Load-test gates

A staged load profile exercises Home, Studio, ordinary API reads and writes,
login, course browsing, and submissions at increasing concurrency. The initial
launch passes when:

- unexpected request failures remain below one percent;
- ordinary non-AI API p95 latency remains below 750 milliseconds;
- dynamic page/server-response p95 remains below 1.5 seconds;
- no submission job is lost;
- the judge queue drains after the burst;
- no container restarts or is killed for memory; and
- CPU, memory, Redis, database connections, and disk remain inside documented
  operating margins.

AI-provider latency is measured separately and does not hide application
latency. Test results and the exact profile are stored as release artifacts.
Failure at the intended launch load blocks DNS cutover and triggers capacity or
application tuning rather than relaxing the gate without evidence.

## 13. External-service production checks

After the API has valid public HTTPS:

- Resend sends from `mail.coveedu.com` and delivers signed events to
  `https://api.coveedu.com/api/webhooks/email`;
- unsigned and replayed webhooks follow the existing rejection and
  idempotency rules;
- a controlled invitation, delivery, bounce, and password-recovery flow pass;
- Supabase Site URL is `https://cs.coveedu.com`;
- Supabase allows only the approved production callback and recovery URLs;
- Supabase custom SMTP uses the dedicated restricted Resend credential; and
- all generated user-facing links use canonical production hosts.

The detailed email procedure remains in `docs/operations/production-email.md`.

## 14. DNS cutover

DNS is unchanged until application, infrastructure, email, end-to-end, and
load-test gates pass. Before the migration window, the relevant record TTLs are
lowered. Cutover order is:

1. deploy and verify MVP at `mvp.coveedu.com`;
2. deploy and verify API, Studio, and Home using pre-cutover host resolution;
3. publish and validate `api.coveedu.com`;
4. publish and validate `cs.coveedu.com`;
5. publish and validate `mvp.coveedu.com`;
6. point `coveedu.com` to Home last; and
7. monitor application, external uptime, email, and Supabase signals during the
   cutover window.

Existing Gabia records unrelated to this deployment are preserved. DNS
changes use explicit record names and resolved VPS addresses; they never use
an unverified wildcard.

## 15. Failure handling and rollback

Before each release, the deployment records the current image tags and
manifest. If migration, health, or smoke checks fail, new containers are not
promoted and the previous manifest is restored. Caddy continues serving the
last healthy application set whenever possible.

If public routing fails, DNS records can return to their previous targets.
Because DNS caching is not instantaneous, the prior deployment remains
available throughout the rollback window. MVP has its own image pin and
rollback record and is not coupled to v2 rollback.

Redis recovery restores the most recent valid encrypted snapshot only after
stopping API and worker writers. Supabase database recovery follows the tested
Supabase procedure and requires an incident decision because it may discard
writes after the selected restore point.

Every production incident records the release tag, symptom, detection source,
rollback action, data impact assessment, and follow-up prevention work.

## 16. Implementation sequence

1. Add production standalone-output configuration and multi-stage Dockerfiles.
2. Add production Compose, networks, volumes, health checks, resource policy,
   and environment templates.
3. Add Caddy configuration and validation.
4. Add deployment preflight, release, rollback, backup, restore-test, and VPS
   bootstrap scripts.
5. Add Prometheus/Grafana provisioning and bounded logging.
6. Add CI, private-image publishing, MVP-image, and approved production-release
   workflows.
7. Add container smoke tests and staged load-test scripts.
8. Expand the production operations runbook with bootstrap, release, rollback,
   backup, monitoring, and cutover commands.
9. Run all local validation and push the existing and new commits.
10. After VPS provisioning, perform the bootstrap and pre-cutover verification.
11. Configure live GitHub, Contabo Object Storage, Supabase, Resend, external
    uptime, Gabia DNS, and alert values.
12. Execute the approved DNS cutover only after every gate is signed off.

## 17. Acceptance criteria

The deployment foundation is implementation-complete when:

1. Every service has a reproducible, non-root production image.
2. CI validates code, images, Compose, and security gates without touching the
   VPS.
3. A manually approved workflow deploys immutable private GHCR images and can
   restore the recorded previous release.
4. Only SSH, HTTP, and HTTPS are public on the hardened VPS.
5. Caddy serves all four approved hosts over valid HTTPS.
6. Redis, application origins, and monitoring stay private.
7. Health checks, bounded logs, metrics, external uptime, and email alerts are
   operating.
8. Encrypted off-server backups and a restore test succeed.
9. Production Supabase and Resend flows pass using canonical domains.
10. End-to-end and load-test gates pass with stored evidence.
11. MVP remains independently pinned and functional.
12. Public DNS changes occur only after the signed launch checklist passes.

Live-production acceptance criteria that require a provisioned VPS or provider
dashboard access remain explicitly blocked until those resources exist; local
implementation does not falsely mark them complete.
