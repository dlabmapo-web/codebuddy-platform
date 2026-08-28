# Cove — Live Deployment Guide

**NOT COMMITTED TO GIT.** This file contains the live server address and
account details. It is untracked on purpose. Do not `git add -A` it.

Last updated: 2026-08-27

---

## 1. What is running, and where

Everything runs on **one Contabo VPS**, in Docker, behind one web server (Caddy).

| | |
|---|---|
| Provider | Contabo |
| Instance | `vmi3534134` |
| Plan | Cloud VPS 6 (2026) — 6 vCPU, 12 GB RAM, 200 GB SSD |
| Region | Japan |
| OS | Ubuntu 24.04 LTS |
| **Public IP** | **46.250.255.48** |
| Cost | ~$13.95 / month |
| Panel | https://new.contabo.com |

**Databases are NOT on this server.** They are on Supabase (section 4).

### Containers (12)

| Container | What it is | Port (internal) |
|---|---|---|
| `caddy` | Web server, HTTPS, routes all domains | 80 / 443 (public) |
| `home` | Marketing site → `coveedu.com` | 3100 |
| `studio` | Cove Studio v2 → `cs.coveedu.com` | 3000 |
| `api` | Backend API → `api.coveedu.com` | 4000 |
| `judge-worker` | Grades student code submissions | — |
| `mvp` | Old v1 app → `mvp.coveedu.com` | 3200 |
| `redis` | Queue + cache | 6379 |
| `prometheus` `alertmanager` `grafana` `node-exporter` `cadvisor` | Monitoring | Grafana 3300 (localhost only) |

Only Caddy is exposed to the internet. Everything else is on a private Docker network.

---

## 2. Domains — what each one is for

| Domain | Serves | Notes |
|---|---|---|
| `coveedu.com` | **Marketing home page** | The `home` container |
| `www.coveedu.com` | → redirects to `coveedu.com` | 301 permanent |
| `cs.coveedu.com` | **Cove Studio v2** — students, teachers, managers | The real platform |
| `api.coveedu.com` | Backend API | Used by the browser and by `studio` |
| `mvp.coveedu.com` | **Old MVP/v1 app** | Separate app, separate database |
| `mail.coveedu.com` | Email sending domain | DNS records only, no server |

All have valid Let's Encrypt certificates, renewed automatically by Caddy.

### DNS is at Gabia

https://dns.gabia.com → DNS Management → `coveedu.com` → **Update**

| Type | Host | Value | Purpose |
|---|---|---|---|
| A | `@` | `46.250.255.48` | Home page |
| CNAME | `www` | `coveedu.com.` | Redirect |
| A | `cs` | `46.250.255.48` | Studio |
| A | `api` | `46.250.255.48` | API |
| A | `mvp` | `46.250.255.48` | MVP |
| MX | `@` | `kr1-aspmx1/2.worksmobile.com.` | **Company email — NEVER TOUCH** |
| TXT | `@` | `v=spf1 include:spf.worksmobile.com ~all` | **NEVER TOUCH** |
| TXT | `resend._domainkey.mail` | (long key) | **Resend — NEVER TOUCH** |
| MX | `send.mail` | `feedback-smtp...amazonses.com.` | **Resend — NEVER TOUCH** |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | **Resend — NEVER TOUCH** |

TTL is 600 seconds (10 minutes) — DNS changes take about that long.

**Rollback:** the old Netlify site is still alive. To go back, set the `@`
A record to `75.2.60.5`. Do not delete the Netlify site yet.

---

## 3. Email

| Purpose | Service | Detail |
|---|---|---|
| **Company email** (your inbox) | Naver Works | The `worksmobile` MX records |
| **App email** (signup, password reset, invitations) | **Resend** | Sends from `no-reply@mail.coveedu.com` |

**Resend** — https://resend.com
- Domain `mail.coveedu.com` — **Verified**
- Two API keys, kept separate on purpose:
  - `Cove Studio Production API` → lives on the VPS, sends invitations
  - `Cove Studio Supabase SMTP` → lives in Supabase only, sends auth email
- **Click tracking and open tracking must stay OFF** — they rewrite links and break one-time login/reset links.

**Supabase SMTP settings** (v2 project → Authentication → Emails):
```
Host: smtp.resend.com    Port: 465    Username: resend
Sender: Cove Studio <no-reply@mail.coveedu.com>
```

---

## 4. Databases — there are THREE

They are completely separate. This is deliberate.

| | Studio v2 (live) | MVP (old app) | Development |
|---|---|---|---|
| Supabase project | `sfesugoedobirmeqjcvp` | `hsxaxlwlnbdwckimznvd` | `lnrmxjxsjxymgphgatwn` |
| Used by | `cs.coveedu.com` | `mvp.coveedu.com` | `localhost` only |
| Region | ap-northeast-2 | — | ap-northeast-2 |
| Plan | Pro | — | Free |
| Backups | Daily, 7 days kept | — | none — it is disposable |
| PITR | **Off** (paid add-on) | — | — |
| Login | Supabase Auth (email, Google, Naver) | Its own username/password + JWT | Supabase Auth |

Dashboard: `https://supabase.com/dashboard/project/<project-id>`

An account on one does **not** exist on the others.

### The development database

Local development points here, never at production. Before this existed,
`pnpm dev` read and wrote the live student database — a save while testing was
a save for real children.

**Where the connection lives**

```
packages/api/.env         SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL, DIRECT_URL
                          NODE_ENV=development   (the seed refuses to run otherwise)
packages/web/.env         NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
packages/web/.env.local   same
```

Originals that pointed at production are in `.env-backups/` (git-ignored).

**The connection is not obvious.** This project has no reachable `db.*` direct
host — only the pooler, and it is `aws-0-`, not the `aws-1-` production uses:

```
DATABASE_URL   ...@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL     ...@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

Transaction mode (6543) for the app, session mode (5432) for Prisma:
migrations take advisory locks that a transaction pooler drops.

**Building it from empty**

```bash
pnpm --filter @cove/api db:migrate:deploy      # schema
pnpm --filter @cove/api db:seed                # the cove-* accounts
pnpm --filter @cove/api db:demo                # 2 academies, classes, submissions
pnpm --filter @cove/api db:backfill:features   # all features on
pnpm --filter @cove/api db:demo:reset          # start the demo data over
```

**Signing in** — the form takes a **username**, not an email.

| Username | Role | Password |
|---|---|---|
| `cove-teamlead` | Team lead everywhere — curriculum, reordering | `CoveDev123!` |
| `cove-manager` | Manager everywhere | `CoveDev123!` |
| `cove-teacher` | Teaches the 3 Mapo classes | `CoveDev123!` |
| `cove-teacher2` | Teaches the 2 Gangnam classes | `CoveDev123!` |
| `cove-student` | Enrolled in all classes | `CoveDev123!` |
| `cove-admin` | Platform admin | `CoveDev123!` |

> `CoveDev123!` is committed in `prisma/seed/data/users.ts`. It is public.
> Never reuse it for anything real.

**Academies in it**

| Slug | What it is |
|---|---|
| `dlab-mapo` | A copy of the **real** curriculum — 5 courses, 61 lectures, 503 problems |
| `mapo-dlab` | Demo data — classes, rosters, 334 submissions |
| `gangnam-dlab` | Demo data |
| `development-academy` | From the base seed, empty |

`dlab-mapo` and `mapo-dlab` differ only in word order. The first is your real
curriculum; the second is demo. Check the URL before concluding something is
missing.

The curriculum was copied with production's own ids, but attributed to
`cove-teamlead`: the real authors do not exist here, and importing them would
have pulled real accounts across to satisfy a foreign key. **No student data
was copied** — no classes, rosters, or submissions came from production.

**Going back to production locally** (rarely a good idea):

```bash
cp .env-backups/packages_api_.env.<timestamp> packages/api/.env
```

---

## 5. GitHub — repository and branches

Repo: **https://github.com/dlabmapo-web/codebuddy-platform**

| Branch | Contains |
|---|---|
| `main` | The **old MVP** source |
| `feat/cove-studio-v2` | **Cove Studio v2** — the main development branch |

### Workflows (`.github/workflows/`)

| Workflow | Runs when | What it does |
|---|---|---|
| **CI** | Every push | Typecheck, lint, tests. Must pass before release. |
| **Release Cove v2** | You push a tag `v2.X.Y` | Builds 5 images → waits for approval → deploys |
| **Release Cove MVP** | You run it manually | Builds the MVP image → deploys |

### The `Production` environment

Settings → Environments → Production

- **Required reviewers:** `jurabek10`, `dlabmapo-web`
- **Allowed:** branch `main`, tags matching `v2.*.*`
- Nothing deploys until a reviewer clicks **Approve**

### Settings → Secrets and variables → Actions

**Repository variables** (public values baked into the browser bundle):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_KAKAO_AUTH_ENABLED
NEXT_PUBLIC_TURNSTILE_SITE_KEY
```
> These MUST be **repository** variables. Environment variables do not reach
> the build job, which is why builds failed with "Missing public environment
> variable".

**Production environment secrets:**
```
VPS_HOST  VPS_USER  VPS_SSH_KEY  VPS_HOST_KEY
GHCR_READ_USERNAME  GHCR_READ_TOKEN
```

Docker images live in GitHub Container Registry, tagged by commit:
`ghcr.io/dlabmapo-web/cove-studio:sha-<40 characters>`

---

## 6. HOW TO MAKE A CHANGE AND DEPLOY IT

This is the normal loop.

### Step 1 — Make the change on a branch

```bash
cd ~/Developer/codebuddy-platform
git checkout feat/cove-studio-v2
git pull
git checkout -b fix/what-you-are-fixing
```

Make your edits. Collect **several fixes** on one branch — one deploy for many
fixes is far better than one deploy per fix.

### Step 2 — Test locally

```bash
pnpm dev          # Studio + API      → http://localhost:3000
pnpm dev:home     # Marketing site    → http://localhost:3100
```

Local development uses the **development** database (§4), so break whatever
you like — nothing here touches a real student.

Sign in with `cove-teamlead` / `CoveDev123!`. If a login fails against an
account you know exists, the dev server is probably still holding an older
connection: stop it and start it again.

### Step 3 — Check it passes

```bash
pnpm typecheck
pnpm --filter @cove/web test
pnpm --filter @cove/api test
```

### Step 4 — Commit and merge

```bash
git add <files>
git commit -m "fix: describe what you fixed"
git push origin fix/what-you-are-fixing

git checkout feat/cove-studio-v2
git merge fix/what-you-are-fixing
git push origin feat/cove-studio-v2
```

Wait for **CI** to pass on GitHub before continuing.

### Step 5 — Tag a release

Version numbers go up: `v2.0.6` → `v2.0.7` → `v2.0.8`

```bash
git tag -a v2.0.7 -m "Cove Studio v2.0.7"
git push origin refs/tags/v2.0.7
```

### Step 6 — Approve the deploy

1. Go to https://github.com/dlabmapo-web/codebuddy-platform/actions
2. Open the running `Release Cove v2`
3. Wait for the 5 images to build (~3 minutes)
4. Click **Review deployments** → tick **Production** → **Approve and deploy**

The server then pulls the images, runs database migrations, restarts, and runs
health checks. About 3–5 minutes. **If it fails it puts the old version back
automatically** — except database migrations, which are not reversed.

### Step 7 — Check it worked

Open `https://cs.coveedu.com` and click through as a real user.

---

## 7. Deploying the MVP (rarely needed)

The MVP is built from `main`, not from the v2 branch.

1. Actions → **Release Cove MVP** → **Run workflow**
2. Paste the full 40-character commit SHA from `main`
3. Approve the deployment when it asks

---

## 8. Connecting to the server

```bash
ssh -i ~/.ssh/cove-production cove@46.250.255.48
```

- User: `cove` (not root — root login is disabled)
- Key only — passwords are disabled for SSH
- `sudo` asks for the `cove` password
- VNC is disabled; re-enable it in the Contabo panel only if SSH breaks

Everything lives in `/opt/cove`:

```
/opt/cove/deployment.env        which image versions are running
/opt/cove/secrets/              all secret files (mode 600)
/opt/cove/caddy/Caddyfile       domain routing
/opt/cove/scripts/              deploy, backup, rollback, smoke tests
```

### Common commands

```bash
cd /opt/cove
alias dc='docker compose --project-directory /opt/cove --env-file /opt/cove/deployment.env -f /opt/cove/compose.production.yml'

dc ps                    # what is running
dc logs studio --tail 50 # logs for one service
dc restart caddy         # restart the web server (fixes certificate delays)
dc up -d mvp             # restart after changing a secrets file

/opt/cove/scripts/smoke.sh      # internal health checks
/opt/cove/scripts/rollback.sh   # go back to the previous version
```

### Changing a secret

Secrets are **not** in Git. Edit them on the server, then restart that service:

```bash
nano /opt/cove/secrets/mvp.env      # or api.env, studio.env
chmod 600 /opt/cove/secrets/mvp.env
dc up -d mvp
```

---

## 9. Feature flags

A manager switches these from **Academy → Settings**. New academies get all
four on at creation.

> Not yet in production — this ships with the `feat/academy-feature-settings`
> branch. Until then, production has flags only on `dlab-mapo`, and the
> database command below is the only way to change one. After it deploys, run
> `pnpm --filter @cove/api db:backfill:features` against production once so
> every existing academy gets its rows.

Currently ON for `dlab-mapo`:
- `TEACHER_LIVE_MONITORING`
- `STUDENT_POINTS`
- `STUDENT_CLASS_LEADERBOARD`

To change one, SSH in and run (replace the feature name and `true`/`false`):

```bash
dc exec -T api node --input-type=module -e '
const {PrismaPg}=await import("@prisma/adapter-pg");
const m=await import("/app/dist/src/generated/prisma/client.js");
const p=new m.PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const academyId="eec3d5ca-cda7-4638-8875-c871e16b5c22";
await p.academyFeatureFlag.upsert({
  where:{academyId_feature:{academyId,feature:"STUDENT_POINTS"}},
  create:{academyId,feature:"STUDENT_POINTS",isEnabled:true},
  update:{isEnabled:true}});
console.log(JSON.stringify(await p.academyFeatureFlag.findMany({where:{academyId}})));
await p.$disconnect();'
```

Takes effect immediately — no deploy needed.

Academy IDs: `dlab-mapo` = `eec3d5ca-cda7-4638-8875-c871e16b5c22`

---

## 10. Backups

| | |
|---|---|
| What | Redis data, Caddy certificates, server config and secrets |
| Where | Contabo Object Storage, encrypted with Restic |
| Schedule | Daily 03:15 KST |
| Restore test | First Saturday of each month, 05:30 KST |
| Monitoring | healthchecks.io pings on every run |

```bash
systemctl list-timers 'cove-*'          # check the schedule
sudo systemctl start cove-backup.service # run one now
/opt/cove/scripts/restore-test.sh        # prove a backup restores
```

> **Your database is NOT in this backup.** Student accounts, courses and
> submissions live on Supabase and are covered by Supabase's own daily backups.

**Contabo snapshot**: `Pre-v2-deploy` exists, auto-deletes 25 Sep 2026. Take a
fresh one before any risky change (Contabo panel → your VPS → Snapshots).

---

## 11. Monitoring (Grafana)

Grafana is bound to the server's loopback only — reach it through an SSH tunnel:

```bash
ssh -i ~/.ssh/cove-production -L 3300:127.0.0.1:3300 cove@46.250.255.48
```

Then open http://localhost:3300 — credentials are in
`/opt/cove/secrets/monitoring.env`.

---

## 12. When something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| No HTTPS on a new subdomain | Caddy hasn't fetched a certificate | `dc restart caddy` |
| "Failed to find Server Action" | Browser tab is older than the deploy | Hard refresh (Cmd+Shift+R) |
| Server can't reach a domain you just created | Negative DNS cache (24h) | `sudo resolvectl flush-caches` |
| A page shows a blank error screen | JavaScript error | Browser F12 → **Console** → read the first red line |
| Login says "network error" | The API returned an error page, not JSON | Check `dc logs api` and `dc logs mvp` |

Always check the **browser Console tab** first for front-end problems, and
`dc logs <service>` for back-end ones.

---

## 13. Still open / known gaps

- [ ] **Rotate the Supabase service-role key** — it was pasted into a chat. It
      bypasses every row-level security rule on the student database.
      Supabase → Settings → API, then update `/opt/cove/secrets/mvp.env`.
- [ ] **Email verification is OFF** in Supabase — anyone can register with an address they do not own
- [ ] Supabase **PITR** is off; daily backups mean up to 24h of student work could be lost
- [ ] Netlify still hosts nothing but remains the apex rollback — keep it a while, then delete
- [ ] Run `/security-review` before real student traffic grows
