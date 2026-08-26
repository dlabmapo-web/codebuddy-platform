# VPS Production Readiness and Staged Cutover Design

**Date:** 2026-08-26
**Branches:** `feat/cove-studio-v2` and `main`
**Status:** Approved for implementation

## 1. Purpose

Prepare Cove's repository and Contabo VPS deployment path for a controlled
production launch without interrupting the MVP currently served from Netlify.
The implementation ends with deployable, locally validated infrastructure. It
does not push branches, deploy containers, change Gabia DNS records, or write
production secrets.

## 2. Production topology

The target routing is:

| Host | Product | Source |
|---|---|---|
| `coveedu.com` | Marketing/Home | `packages/home` from `feat/cove-studio-v2` |
| `cs.coveedu.com` | Cove Studio v2 | `packages/web` from `feat/cove-studio-v2` |
| `api.coveedu.com` | Cove Studio API | `packages/api` from `feat/cove-studio-v2` |
| `mvp.coveedu.com` | Existing MVP/v1 | root application from `main` |
| `mail.coveedu.com` | Resend sending domain | DNS only |
| Grafana | Internal monitoring | SSH tunnel only |
| Redis | Internal queue/cache | no public domain |

At the start of the rollout, `coveedu.com` remains on Netlify. Gabia remains the
authoritative DNS provider. Public DNS changes occur only after the four VPS
applications pass private acceptance tests.

## 3. Selected rollout approach

Use a staged, reversible cutover:

1. repair and validate deployment infrastructure in Git;
2. configure the VPS and production secrets without changing public DNS;
3. publish the frozen MVP image from `main` and the v2 images from
   `feat/cove-studio-v2`;
4. test the VPS by resolving the production hostnames locally to the VPS;
5. create and test backup and rollback points;
6. lower Gabia DNS TTL before the migration window;
7. move `mvp`, `api`, and `cs` to the VPS;
8. move the apex `coveedu.com` from Netlify last; and
9. retain the Netlify deployment temporarily as the rollback target.

A direct cutover is rejected because it removes the working fallback before
the VPS is proven. Keeping MVP permanently on Netlify is also rejected because
it leaves two production release systems and prevents the intended four-host
VPS topology.

## 4. V2 branch changes

### 4.1 Reproducible VPS bootstrap

`deploy/scripts/bootstrap-vps.sh` will:

- add the deployment user to both `docker` and `sudo`;
- keep sudo password-protected instead of granting passwordless root access;
- install Cove's SSH configuration early enough to take precedence over
  Ubuntu cloud-init settings;
- validate the effective authentication settings before reloading SSH; and
- retain the two-session safety gate before hardening is activated.

The intended effective SSH settings are:

```text
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
```

The bootstrap remains idempotent so rerunning it on the prepared VPS does not
duplicate firewall rules or damage existing configuration.

### 4.2 Deployment asset synchronization

Release automation must preserve server-owned secret values while ensuring
the `.example` templates reach a fresh server. The synchronization contract is:

- never overwrite `/opt/cove/deployment.env`;
- never overwrite real files in `/opt/cove/secrets`;
- synchronize the tracked `deploy/secrets/*.example` files separately;
- preserve rendered secret-bearing files under `/opt/cove/generated`; and
- continue deleting obsolete non-secret deployment assets.

The production runbook will use the same contract as GitHub Actions.

### 4.3 V2 release provenance

A `v2.X.Y` tag may publish and deploy only when its commit is an ancestor of
`origin/feat/cove-studio-v2`. The release job will fetch that branch and verify
both the tag format and ancestry before logging in to GHCR or building images.
The protected GitHub `production` environment remains the human approval gate
for the deploy job.

### 4.4 Operations documentation

Create `docs/operations/contabo-vps-bootstrap.md` from the approved bootstrap
documentation design and link it from the production deployment runbook. Add
a Gabia-specific staged DNS and rollback section to the production runbook.
All examples use placeholders; live IP addresses, credentials, account IDs,
and fingerprints remain outside Git.

## 5. Main branch boundary

The existing MVP source remains unchanged on `main`. A separate, minimal main
branch commit will add only:

- `.github/workflows/release-mvp.yml`; and
- `deploy/docker/mvp.Dockerfile`.

The workflow checks out the requested full main commit, proves it belongs to
`origin/main`, builds the frozen MVP using the infrastructure Dockerfile,
scans the image, and asks the already-prepared VPS to activate it. Shared
Compose, Caddy, scripts, and secrets remain synchronized from the v2 branch;
they are not copied wholesale into `main`.

The main-branch commit will be prepared in an isolated Git worktree so current
v2 work and unrelated user changes cannot be mixed into it.

## 6. Error handling and rollback

- SSH hardening aborts if syntax or effective-value verification fails.
- A release aborts before publishing when its source branch cannot be proven.
- Deployment synchronization never deletes server-owned configuration or
  secrets.
- Public DNS stays on Netlify until VPS acceptance succeeds.
- Existing Gabia DNS records are recorded before editing and changed one host
  at a time.
- If a subdomain fails, its previous record is restored without moving the
  apex domain.
- If the Home cutover fails, the apex A record is restored to Netlify while
  the VPS is diagnosed.
- `mail.coveedu.com` records are not altered during application cutover.

## 7. Verification

Repository verification includes:

- Bash syntax checks for edited scripts;
- YAML parsing and workflow inspection;
- deployment configuration validation through `pnpm deploy:validate`;
- Docker Compose configuration validation;
- Caddy, Prometheus, and Alertmanager validation already included by the
  repository validator;
- tests for bootstrap SSH precedence and deployment synchronization where
  practical without mutating the host;
- comparison of the isolated main commit to ensure it contains only the two
  approved files;
- documentation link and placeholder checks; and
- scans preventing known live infrastructure identifiers or credentials from
  entering the diff.

Runtime acceptance, performed later with production authorization, includes:

- all containers healthy;
- private hostname tests for Home, Studio, API, and MVP;
- v2 authentication, callback, email, uploads, queue work, and migrations;
- MVP login and critical legacy flows;
- backup completion and restore testing;
- monitoring through an SSH tunnel; and
- a tested application and DNS rollback path.

## 8. Completion criteria

Repository preparation is complete when:

1. bootstrap creates a sudo-capable deployment user and produces the intended
   effective SSH policy;
2. release synchronization delivers templates without touching secrets;
3. v2 tags are rejected unless they belong to the v2 branch;
4. the minimal MVP release commit is ready for `main`;
5. the bootstrap and staged Gabia cutover procedures are documented;
6. local deployment validation passes; and
7. no push, live deployment, DNS mutation, or secret entry has occurred.
