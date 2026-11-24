# Public Turtle usage monitoring: design and implementation

Date: 2026-11-24 · Branch `qa-feedback`

Some campuses use only public Turtle (`/turtle`), not the main Cove platform.
Platform admins need to see which academy uses it, when, how many students
(as anonymous devices) and how many runs. Course Turtle is out of scope.

## 1. Decisions

| Question | Decision |
| --- | --- |
| Who is counted? | Anonymous browsers ("devices"). No name, email, IP address, code or drawing is stored. |
| Who sees it? | Platform admins only, at `/admin/turtle`. Campus managers may get their own view later. |
| Which academy? | The academy whose 6-digit code was entered. |
| Time detail | Hourly, shown in Asia/Seoul. |
| History | 180 days. Counting starts at release; nothing earlier can be recovered. |
| Student impact | None. Counting never delays or refuses an entry or a run. |

### What the numbers mean

| Number | Meaning | Limit |
| --- | --- | --- |
| Active now | Devices seen in the last 5 minutes | "Seen" is entering, starting a run, or a run still drawing. An idle page is not seen. Up to 15 s late. |
| Devices | Different browsers that entered or ran in the period | A shared PC is one; two browsers or cleared cookies are two. |
| Entries | Successful code entries | Entering again after two hours counts again. |
| Runs | Runs accepted by the server, either engine | A retried request counts once. |

A device keeps its cookie across academies but is hashed separately for each,
so one academy's devices cannot be matched with another's. Devices across all
academies is therefore a sum.

## 2. Recording

1. **Device cookie.** On code entry the web route sets a random 32-hex-character
   `__Host-cove-turtle-device` cookie (HTTP-only, Secure, SameSite=Lax, 180 days)
   if the browser has none, and sends it to the API as `X-Cove-Turtle-Device`.
2. **Hash.** The API stores `HMAC(pepper, "device:" + academyId + ":" + cookie)`
   in the two-hour grant. The raw cookie value is never stored. A grant issued
   before this release uses its own grant hash.
3. **Events.** An entry after the grant is issued; a run after it is accepted
   and only when its reservation is new; a sighting on each browser-run renewal.
4. **Batching.** `TurtleUsageRecorder` keeps counts in memory by academy, hour
   and device, and writes them every 15 s as one statement per at most 500 rows.
   A failed write is kept and retried (a lost reply may, rarely, count twice). The buffer stops accepting new keys at
   20,000. A normal shutdown flushes; a crash loses at most about 15 s.
5. **Retention.** Once a day, rows older than 180 days are deleted.

Counts are not kept in Redis: production Redis is `noeviction` and shared with
grading, so usage data must not compete for its memory. Drawing requests gain
no database statement.

### Table `turtle_usage_hours`

| Column | Type | |
| --- | --- | --- |
| `academy_id` | uuid | FK to `academies`, deleted with the academy |
| `hour` | timestamptz | start of the hour, UTC |
| `device_hash` | char(32) | truncated HMAC |
| `entries`, `runs` | int | added to on conflict |
| `last_seen_at` | timestamptz | greatest wins |

Primary key `(academy_id, hour, device_hash)`; index on `hour`. The insert joins
`academies`, so a row for a just-deleted academy is dropped rather than failing
the batch. With 1,750 students a day for two hours each, about 630,000 rows at
full retention.

The old platform-wide code has no academy and is not counted. It is off by
default in production.

## 3. Reading

`platformTurtle.usage({ from, to, academyId? })`, guarded by the platform
permission `platform.analytics.read`. Dates are Seoul days, at most 180 apart.

- **Academies:** every active academy, plus any with use in the range: active
  now, devices, entries, runs, last used (within 180 days).
- **Series:** devices, entries and runs per hour for one day, per day for longer
  ranges, filtered by `academyId` when given.

Two usage statements, run together, whatever the number of academies.

## 4. Page

`/admin/turtle`, in the Operations group of the console sidebar.

- Period: today, yesterday, 7, 30 or 90 days, or a chosen from/to date. The
  address holds the selection.
- Four tiles: active now, devices, entries, runs.
- Chart by hour or day, with the same figures available as a table.
- Academy table, searchable, most runs first. Choosing one filters the tiles
  and chart to it.
- The first view is read during server render. It refreshes every 30 s only
  when the range includes today and the tab is visible.
- A short note says devices are not people.
- English and Korean.

## 5. Implementation steps

1. Shared schema, contract and date helpers.
2. Migration and Prisma model.
3. Recorder and hooks in public Turtle; web device cookie.
4. Platform read service and route.
5. Admin page, sidebar row and translations.
6. Tests: cookie and hash, counted-once runs, batching and retry, academy
   isolation, hour and day boundaries in Seoul, permission, and a statement
   count against disposable PostgreSQL.

## 6. Release

Deploy the migration with the release. After it: enter one academy's code, run a
drawing, and confirm the row within 30 s. Each campus needs its own Cove academy
and its own code, created by that academy's manager; a shared code mixes their
figures. Check whether the privacy notice should mention the anonymous cookie.
