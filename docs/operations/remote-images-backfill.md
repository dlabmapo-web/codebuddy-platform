# Copy outside pictures into Cove storage (production)

Imported Elice, Jungol and Biko problems show pictures from those sites. They break when a file is deleted there or the site stops allowing other sites to show it — for Elice, at the latest when the contract ends (QA-006, `docs/qa/2026-11-20-admin-feedback/qa-006-external-images.md`).

Since the release that contains copy-on-save, **every problem or explanation saved from then on** copies its pictures into the course's private storage. This runbook copies the pictures of everything saved before that, once.

## When

1. **After** the release containing `src/migrations/remote-images/cli.ts` is live and healthy, and after one picture copy was checked by hand (step 1 below). Not in the release window itself.
2. **On a quiet evening**, after classes end (from about 23:00 KST). The run only reads lesson content and writes new picture assets; students keep working, but it downloads from Elice and uploads to Supabase Storage, so it is kinder outside class hours.
3. **Well before the Elice contract ends** — at the latest two weeks before, so there is time to re-upload anything that cannot be copied. There is no benefit in waiting: every day of waiting is a day a picture can disappear.

Expected size, from the dev database on 2026-11-20: 198 statements, 201 distinct pictures (540 uses), none broken. Production holds more; the dry run gives the real numbers.

## How it behaves

- **Dry run is the default.** It writes nothing, downloads each picture once to check it, and reports counts per host, academy and course, plus every picture that can no longer be fetched.
- **`--apply` needs the target typed back** as `--confirm-database <project-ref>@<host>`, printed by the dry run. Dev and production share the Seoul pooler host, so the project ref is what tells them apart.
- **Safe to repeat.** Copied pictures become `cove-asset:` and are not found again. A statement edited during the run is skipped (compare-and-set) and copies on its next save.
- **Traceable and reversible.** The original URL stays in each picture's `data-source-url`, and the apply log lists every rewrite with its before and after.
- **Cost per statement:** one read for reusable assets, one insert for new ones, one update. Downloads: 4 at a time, 10 s and 5 MiB per picture.

## Steps (on the production host, as `cove`)

`ssh-add` the production key first. The commands use the `migrate` service, which has the API secrets, internet access (`egress`) and the source with `tsx`. `MIGRATION_IMAGE` in `deployment.env` must be the release that contains this script.

```sh
cd /opt/cove
mkdir -p state/remote-images
dc() { docker compose --project-directory /opt/cove --env-file deployment.env -f compose.production.yml --profile operations "$@"; }
backfill() { dc run --rm -T --entrypoint node migrate node_modules/tsx/dist/cli.mjs src/migrations/remote-images/cli.ts --out - "$@"; }
```

**0. Check by hand that copy-on-save works.** In the studio, open one imported problem with an Elice picture, save it without changes, reopen it: the picture must still show, and in the editor's HTML its `src` is now `cove-asset:…` with a `data-source-url`.

**1. Dry run.** Writes nothing.

```sh
backfill > state/remote-images/dry-run-$(date +%F).json
```

The summary on screen shows `host` (the `<project-ref>@<host>` to confirm), the number of statements and pictures, and how many are broken. Check that the project ref is **production's**. The JSON file lists every broken picture with the problems that use it: send that list to content staff to re-upload by hand (uploading works since v2.0.53).

**2. Trial batch of 20.**

```sh
backfill --apply --confirm-database '<project-ref>@<host>' --limit 20 > state/remote-images/apply-trial-$(date +%F).json
```

Open two or three of the rewritten problems from the log as a student: every picture shows. If not, stop here; the log's `before` field holds each original statement.

**3. Everything else.**

```sh
backfill --apply --confirm-database '<project-ref>@<host>' > state/remote-images/apply-$(date +%F).json
```

**4. Confirm.** A second dry run should report no statements, except those whose pictures could not be copied (the broken list).

```sh
backfill > state/remote-images/after-$(date +%F).json
```

One academy at a time is possible with `--academy <slug>` on any step.

## Undo

Each entry of an apply log has the statement's `before` text. Restoring it puts the original outside URLs back; the copied assets can stay (they are only shown while a statement references them).
