# Cove Production Deployment Runbook

This runbook deploys Cove Home, Cove Studio v2, API, judge worker, Redis,
monitoring, and the preserved MVP to one Contabo Cloud VPS 6. PostgreSQL stays
on Supabase and transactional mail stays on Resend.

The deployment source of truth is
`docs/superpowers/specs/2026-08-25-production-contabo-docker-deployment-design.md`.
Do not change public DNS until the launch checklist at the end of this runbook
passes.

## 1. Accounts and resources

Prepare these resources before deployment:

- Contabo Cloud VPS 6 with six vCPU, 12 GB RAM, Ubuntu 24.04 LTS, and an SSH public key;
- private GHCR packages under `ghcr.io/dlabmapo-web`;
- Contabo Object Storage bucket dedicated to encrypted Cove backups;
- Supabase Pro v2 project and the unchanged MVP project;
- verified Resend sending domain `mail.coveedu.com`;
- external uptime/cron monitoring account; and
- Gabia DNS access for `coveedu.com`.

Never send the VPS root password, SSH private key, Supabase secret key, Resend
key, database URL, or Restic password through chat or commit them to Git.

## 2. Bootstrap the VPS

Record the VPS IPv4 address as `VPS_IP`. From the operator computer, upload the
bootstrap script and the public half of the deployment key:

```bash
scp deploy/scripts/bootstrap-vps.sh root@VPS_IP:/root/
scp ~/.ssh/cove-production.pub root@VPS_IP:/root/cove-production.pub
ssh root@VPS_IP
bash /root/bootstrap-vps.sh cove /root/cove-production.pub
```

Open a second terminal and prove the non-root account works before hardening
SSH:

```bash
ssh -i ~/.ssh/cove-production cove@VPS_IP
docker version
```

Keep that session open. In the original root session, disable passwords and
direct root login:

```bash
HARDEN_SSH=1 bash /root/bootstrap-vps.sh cove /root/cove-production.pub
```

Open one more fresh `cove` session before closing root. Confirm the firewall:

```bash
sudo ufw status verbose
```

Only OpenSSH, 80/tcp, 443/tcp, and 443/udp may be allowed inbound.

## 3. Install deployment assets

From the repository root on the operator computer:

```bash
rsync -az \
  --exclude deployment.env \
  --exclude generated/ \
  --exclude secrets/ \
  -e "ssh -i ~/.ssh/cove-production" \
  deploy/ cove@VPS_IP:/opt/cove/
ssh -i ~/.ssh/cove-production cove@VPS_IP \
  'chmod 700 /opt/cove/scripts/*.sh /opt/cove/scripts/*.py'
```

The GitHub release workflow repeats this synchronization. It never overwrites
`deployment.env`, `secrets/`, or rendered secret-bearing configuration.

## 4. Create production configuration

On the VPS, copy templates and immediately restrict them:

```bash
cd /opt/cove
cp deployment.env.example deployment.env
cp secrets/api.env.example secrets/api.env
cp secrets/studio.env.example secrets/studio.env
cp secrets/mvp.env.example secrets/mvp.env
cp secrets/monitoring.env.example secrets/monitoring.env
cp secrets/backup.env.example secrets/backup.env
cp secrets/redis-password.example secrets/redis-password
chmod 600 deployment.env secrets/api.env secrets/studio.env \
  secrets/mvp.env secrets/monitoring.env secrets/backup.env \
  secrets/redis-password
```

Generate independent random values. Capture them directly into the appropriate
server file or password manager; do not paste command output into logs:

```bash
openssl rand -hex 32   # BFF_SHARED_SECRET
openssl rand -hex 32   # Redis password
openssl rand -hex 32   # Grafana administrator password
openssl rand -hex 48   # Restic repository password
```

Edit the files on the VPS. Required values and ownership are documented in the
corresponding `.example` files. Important rules:

- API and Studio use exactly the same `BFF_SHARED_SECRET`.
- `REDIS_URL` and `MONITORING_REDIS_URL` use the password stored in
  `secrets/redis-password`.
- The Redis password contains only letters, numbers, `_`, and `-`, so it is
  safe inside a Redis URL.
- Studio uses the v2 Supabase project; MVP uses the old project.
- `DIRECT_URL` is available only to the one-shot migration container.
- Alerting uses a dedicated restricted Resend credential.
- The Restic password and Object Storage recovery credentials also have an
  offline recovery copy outside the VPS and bucket.
- `deployment.env` contains only immutable `sha-<commit>` image tags.

Render and validate configuration:

```bash
/opt/cove/scripts/render-monitoring-config.sh
/opt/cove/scripts/preflight.sh
```

## 5. Configure GitHub production controls

Create a GitHub Environment named `production`, enable required reviewer
approval, and prevent unreviewed branches/tags from using it.

Add these repository/environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_KAKAO_AUTH_ENABLED
NEXT_PUBLIC_TURNSTILE_SITE_KEY
MVP_NEXT_PUBLIC_SUPABASE_URL
MVP_NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Add these production environment secrets:

```text
VPS_HOST
VPS_USER
VPS_SSH_KEY
VPS_HOST_KEY
GHCR_READ_USERNAME
GHCR_READ_TOKEN
```

`VPS_USER` is `cove`. `VPS_SSH_KEY` is the dedicated private deployment key.
Create `VPS_HOST_KEY` with `ssh-keyscan`, but compare its fingerprint with the
host key shown through the Contabo console before trusting it. The GHCR token
has package read permission only and no repository-write permission.

## 6. Publish and deploy the frozen MVP

Select the exact full SHA from `main` that currently serves the MVP. Run the
`Release Cove MVP` workflow with that SHA. The workflow verifies that it is an
ancestor of `origin/main`, builds a private image, scans it, and updates only
`MVP_IMAGE`.

Before DNS cutover, verify the origin inside Docker:

```bash
/opt/cove/scripts/wait-healthy.sh
/opt/cove/scripts/smoke.sh
```

The old Supabase project is never migrated or modified by this deployment.

## 7. Publish and deploy Cove v2

All CI jobs must pass on the release commit. Create and push an annotated
semantic release tag:

```bash
git tag -a v2.0.0 -m "Cove Studio v2.0.0"
git push origin v2.0.0
```

GitHub builds and scans Home, Studio, API, judge, and migration images. The
deployment pauses at the protected `production` Environment. Review the commit,
CI results, and image scan before approving.

The VPS then pulls immutable images, runs `prisma migrate deploy` once, starts
services, waits for health, and runs internal smoke checks. On failure it
restores the previous application manifest. Database migrations are not
reversed, so every production migration must remain backward-compatible.

Manual rollback remains available:

```bash
/opt/cove/scripts/rollback.sh
```

## 8. Monitoring and backups

Install the systemd timers after deployment assets and secrets exist:

```bash
sudo /opt/cove/scripts/install-systemd.sh cove
systemctl list-timers 'cove-*'
```

Run both operations manually before relying on their schedules:

```bash
systemctl start cove-backup.service
journalctl -u cove-backup.service --no-pager
systemctl start cove-restore-test.service
journalctl -u cove-restore-test.service --no-pager
```

Open Grafana through an SSH tunnel; port 3300 is bound only to VPS loopback:

```bash
ssh -i ~/.ssh/cove-production -L 3300:127.0.0.1:3300 cove@VPS_IP
```

Then open `http://localhost:3300` and sign in with the credentials from
`secrets/monitoring.env`.

Configure external monitors for:

```text
https://coveedu.com/
https://cs.coveedu.com/login
https://api.coveedu.com/api/health/ready
https://mvp.coveedu.com/login
```

Configure the backup/cron monitor URL as `BACKUP_HEALTHCHECK_URL`. Trigger one
test alert and one deliberately failed check, confirm `ALERT_EMAIL` receives
both, then return the services to healthy state.

## 9. Supabase and Resend

Follow `docs/operations/production-email.md`. Do not register the Resend webhook
until `api.coveedu.com` has valid public HTTPS.

Required Supabase Auth values are:

```text
Site URL: https://cs.coveedu.com
Allowed redirect: https://cs.coveedu.com/auth/callback
Allowed redirect: https://cs.coveedu.com/auth/recovery/confirm
```

The Resend webhook is:

```text
https://api.coveedu.com/api/webhooks/email
```

Test a signed delivery, replay, controlled bounce, invitation, and recovery
message. Confirm every user-facing link uses `cs.coveedu.com`.

## 10. DNS cutover at Gabia

Lower relevant TTLs before the cutover window. Preserve unrelated Gabia
records. Create explicit A records pointing to `VPS_IP` in this order:

```text
api.coveedu.com
cs.coveedu.com
mvp.coveedu.com
coveedu.com
```

Verify HTTPS and production smoke tests after each of the first three records.
Move the root domain last. Add `www` only as an explicit redirect decision; do
not introduce a wildcard record.

After DNS propagation:

```bash
/opt/cove/scripts/smoke.sh --public
```

## 11. Production E2E and load tests

Set the `PRODUCTION_*` variables required by
`e2e/production.global-setup.ts` in the operator shell or CI secret store. Use
dedicated controlled accounts in `dlab-mapo`; never use a student's real
password.

```bash
pnpm e2e:production
```

Run the staged public load profile and retain its JSON evidence:

```bash
pnpm load:production
```

To include an authenticated read path, provide a short-lived controlled test
session only for the duration of the test:

```bash
AUTHENTICATED_PATH=/academy/dlab-mapo/learn/courses \
AUTHENTICATED_COOKIE='short-lived-controlled-cookie-header' \
pnpm load:production
```

Revoke the session immediately afterward. Separately run a controlled burst of
student submissions and confirm the judge queue drains with no lost job. AI
provider timing is reported separately from ordinary application latency.

## 12. Launch checklist

Public launch is approved only when every item is true:

- [ ] CI, production builds, Docker builds, Compose validation, and critical
  vulnerability gates pass.
- [ ] All containers are healthy and only Caddy plus loopback Grafana publish
  host ports.
- [ ] MVP login and representative v1 workflows pass on `mvp.coveedu.com`.
- [ ] Home, Studio, API, and judge workflows pass on production domains.
- [ ] Manager, team lead, teacher, student, and platform-admin smoke accounts
  reach their canonical destinations.
- [ ] Migrated Dlab-Mapo courses and problems open successfully.
- [ ] Signup, invitation, recovery, password update, and Resend webhook evidence
  pass.
- [ ] Supabase redirect, CAPTCHA, custom SMTP, and backup settings are verified.
- [ ] External downtime and local resource alerts reach `ALERT_EMAIL`.
- [ ] Encrypted Object Storage backup and restore test pass.
- [ ] Staged load thresholds pass with no lost submission and no OOM/restart.
- [ ] A Contabo snapshot exists immediately before cutover.
- [ ] Previous image manifest and DNS targets are recorded for rollback.
- [ ] Operator has tested `/opt/cove/scripts/rollback.sh` before real traffic.

Record the release tag, image SHAs, test artifacts, DNS values, backup snapshot,
and reviewer approval in the launch record.
