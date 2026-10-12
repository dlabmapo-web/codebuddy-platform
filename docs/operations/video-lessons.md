# Recorded video lessons

Video lessons are implemented on `feat/lecture-pdf-materials`. Production enablement is separate from merging the code. No production settings were changed during implementation.

## Storage and deployment

- Apply the additive video migrations before deploying the matching API and studio. They introduce private video records and a narrowly scoped Storage INSERT policy for a current author’s reserved original. No direct learner read/list/update policy is required.
- Create a **private** `course-videos` bucket. Permit `application/octet-stream`, `video/mp4`, `video/mp2t`, `application/vnd.apple.mpegurl`, `text/vtt`, and `image/jpeg`. Set the bucket and project ceilings to the intended source size, up to 5,000,000,000 bytes. The development bucket is deliberately capped at 50,000,000 bytes. An existing 95 MB PDF limit does not support 5 GB video uploads.
- Set `VIDEO_MAX_UPLOAD_BYTES` to the effective storage ceiling. `VIDEO_COURSE_QUOTA_BYTES` defaults to 100,000,000,000 bytes for originals; generated renditions need additional storage capacity. The UI displays the API’s effective admission limit.
- Build/pin `cove-video-worker` from the same release as the API. Its Docker target installs FFmpeg independently of the API and judge. Scan and update that image with decoder security fixes.
- Configure the separate worker environment from `deploy/secrets/video-worker.env.example`; never commit real values. The optional Compose `video` profile enables processing. The worker needs external PostgreSQL and Supabase connectivity.
- Provision the scratch bind mount (`VIDEO_SCRATCH_HOST_PATH`, default `/opt/cove/video-scratch`) writable by UID/GID 1001, with at least 40 GiB free per concurrent worker and a filesystem quota. Do not use a 40 GiB memory-backed tmpfs with the 2 GiB worker memory limit. The worker checks free capacity, monitors job disk usage every two seconds, and removes its temporary directory on handled completion/failure.
- Enable API `VIDEO_LESSONS_ENABLED` and rebuild studio with `NEXT_PUBLIC_VIDEO_LESSONS_ENABLED` only after the private upload/processing/playback smoke test succeeds. Both default to false. Existing READY media remains readable with flags off; progress saving is shown as unavailable. Processing admission is independent of worker draining.

## Runtime and recovery

Each worker handles one leased job at a time, creates HLS variants up to source resolution plus MP4/poster, and publishes only after all outputs upload. A lease heartbeat prevents another worker from publishing the same attempt. Lost leases abort the encoder. Invalid sources fail; transient errors retry up to three attempts. SIGTERM drains the current job, with a 24-hour Compose grace period. Forced termination is recovered after the two-minute lease expires.

Capacity defaults: two CPU cores, 2 GiB RAM, 40 GiB scratch, 60-second probing, 24-hour encoding deadline, six-hour source duration, maximum 8192×8192 and 60 fps. Source formats are candidates, not a guarantee that every codec in a permitted extension is decodable.

Unreferenced expired reservations and failed/cancelled/READY assets are collected after 24 hours, preserving lesson/copy/history references. A hard process/host crash can leave scratch directories or partial object prefixes: reconcile these against active leases and persisted output manifests before removing them. Do not delete by filename or age alone. Monitor pending-job age, FAILED assets, scratch capacity, worker restarts, gateway latency and storage/egress usage.

Database backups do not back up video objects. Back up originals, generated outputs, captions and database references together; verify a restored private lesson with an enrolled student before treating a restore as successful. Keep old immutable assets while any adopted lesson or watch-history record references them.

The same-origin gateway rechecks lesson access for media and captions, streams Range responses, and never exposes original source objects. Benchmark concurrent playback and upload/encoding throughput in staging before production enablement. Existing COOP/COEP headers must remain intact.

## Local verification

Use only the guarded development scripts `prepare-video-storage.mts`, `seed-video-e2e.mts`, and prepared development auth states. Generate an original short MP4 with FFmpeg at `/tmp/cove-video-test/original.mp4`; no Elice media is copied. Enable video in the local API/studio and start `pnpm --filter @cove/api dev:video` with `VIDEO_PROCESSING_ENABLED=true`.

Run `e2e/specs/video-materials.spec.ts` with `E2E_VIDEO_ENABLED=1`, `E2E_VIDEO_API=http://localhost:4500/api/videos`, `E2E_BASE_URL=http://localhost:3000`, `E2E_SKIP_SEED=1`, and the prepared `E2E_AUTH_STATE_DIR`, for projects `chromium` and `webkit-video` with one worker. The tests upload and decode real media, use VTT captions, verify private/Range access and completion history, and reject a corrupt replacement without changing the published video.

The 90% unique-watch threshold, binary included score, and five-second auto-next behavior are Cove policies. Exact Elice behavior for those policies was not verified.

## Verification recorded on 2026-10-12

- 101 focused/regression API tests passed across eight files, including unique watch credit, client/server clock bounds, VTT validation, six-hour/dimension/frame-rate limits, scoped reads, idempotency, library copying and score projections.
- Four localhost E2E scenarios passed: the main student flow and failed replacement in Chromium and WebKit. These exercised real upload/transcoding, decoded playback, controls/captions, private original denial, anonymous denial, 100-byte Range streaming, completion persistence, mobile overflow, teacher history and video-to-code navigation.
- One additional Chromium E2E passed against the optimized production web build with HLS blocked: MP4 fallback decoded, quality switching was disabled appropriately, preview sent no tracking requests, and invalid replacement preserved the old published asset.
- API and production web builds passed; web/E2E typechecks, canonical routes, translation suite (126 tests), Compose validation with dummy environments, and whitespace checks passed.
- The guarded storage verification passed for the private bucket, all five private tables, reservation INSERT policy, private originals and READY manifest immutability. Real FFmpeg separately produced HLS/MP4 and verified 640×360 H.264 metadata from the original synthetic fixture.

Production was not enabled, deployed, or pushed. Full-size six-hour/5 GB media, concurrent gateway load, production image execution, and backup/restore drills remain staging/rollout validation; the local fixtures deliberately use small synthetic media and a 50 MB storage limit. The local tests do not establish exact parity for unverified Elice completion/resume/auto-next policies.

## Run all five lesson types together on localhost

Start one API and one studio with turtle, short-answer, multiple-choice and video flags enabled together (`GUI_ENABLED`, `SHORT_ANSWER_ENABLED`, `MULTIPLE_CHOICE_ENABLED`, `VIDEO_LESSONS_ENABLED` and their `NEXT_PUBLIC_` counterparts set to `true`). PDF is not feature-gated. The GUI broker/image and video worker must also be running, with the private development buckets prepared as described in the respective runbooks. Use the synthetic MP4 fixture described above and prepared development auth states. Avoid editing/restarting the app while browser tests are active: development refreshes can discard the unsent answers being tested.

Against an already running studio at port 3000 and API at port 4500:

```bash
export E2E_BASE_URL=http://localhost:3000
export E2E_SKIP_SEED=1
export E2E_AUTH_STATE_DIR=/tmp/cove-combined-auth
export E2E_GUI_ENABLED=1 E2E_SHORT_ANSWER_ENABLED=1
export E2E_MULTIPLE_CHOICE_ENABLED=1 E2E_VIDEO_ENABLED=1
export E2E_PDF_API=http://localhost:4500/api/documents
export E2E_TURTLE_API=http://localhost:4500/api/manual
export E2E_SHORT_ANSWER_API=http://localhost:4500/api/manual
export E2E_MULTIPLE_CHOICE_API=http://localhost:4500/api/manual
export E2E_VIDEO_API=http://localhost:4500/api/videos

pnpm exec playwright test --config e2e/playwright.config.ts \
  e2e/specs/pdf-materials.spec.ts e2e/specs/turtle-materials.spec.ts \
  e2e/specs/short-answer-materials.spec.ts e2e/specs/multiple-choice-materials.spec.ts \
  e2e/specs/video-materials.spec.ts --project=chromium --workers=1

E2E_MIXED_ENABLED=1 pnpm exec playwright test --config e2e/playwright.config.ts \
  e2e/specs/mixed-material-navigation.spec.ts \
  --project=chromium --project=webkit-mixed --workers=1
```

Run the feature suites before the mixed suite on a fresh development fixture: the mixed seed reuses their synthetic READY video and turtle runtime version. It owns its own private synthetic PDF and resets only its `ee060…` course; its guard rejects other Supabase projects. The mixed course contains coding → PDF → turtle → short answer → multiple choice → video → coding across two lectures, plus supplementary PDF/video resources. Tests cover both navigation directions, the coding course drawer, class context, resource exclusion from the main sequence, supplementary playback without auto-next, browser history and reload. Run with one worker because the fixture is reset between browser projects.

### Combined verification, 2026-10-12

All five feature flags were enabled on the same localhost API/studio. All **11 feature E2E scenarios passed across the initial run and targeted reruns**. Initial failures exposed assumptions in the tests (GUI disabled, a fixed previous lesson, a score selector matching both the result and history) and one development refresh interrupted an unsent-answer check; the corrected/repeated scenarios passed. PDF used real private upload/render/download, turtle used the isolated GUI runtime including teacher read-only viewing/mobile controls, and video used real encoding and decoded playback.

Fixes on the current branch keep the floating query debug button off fullscreen lesson navigation, remove the inaccurate blanket “Teacher graded” label from the course drawer, and treat a video client disconnect as cancellation instead of a server error. Three focused API cancellation regression tests passed; API build and API/web/E2E typechecks passed. Production settings were not changed.

The final mixed-course E2E run passed in **both Chromium and WebKit (2/2)** against the rebuilt API. It exercised the seven main lessons in both directions, cross-lecture navigation, drawer selection/labels, resource isolation and decoded resource playback, class-scoped URLs, browser Back/Forward and reload. The updated API logged no media AbortError/server errors during that run. Together with the feature suites, this is 13 passing browser scenarios (including targeted reruns), plus the three cancellation unit tests. Local development verification does not replace staging load, production storage/worker configuration, or deployment checks.

## Release integration repair

The release workflow now passes its four public feature flags into the candidate deployment manifest; Compose injects the matching API flags. `VIDEO_LESSONS_ENABLED=true` selects the `video` profile automatically. Every v2 release pins `VIDEO_WORKER_IMAGE` to the same release SHA, pulls it, and includes worker state in health checks. Prepare `/opt/cove/secrets/video-worker.env` with only the matching API database/Supabase credentials and provision its scratch directory for UID 1001 with at least 40 GiB free. Preflight checks that these values match without printing them.

The migration phase runs `scripts/setup-learning-storage.mts --production`. It configures private PDF/asset/video buckets, requires the effective video ceiling from `VIDEO_MAX_UPLOAD_BYTES`, refuses to adopt public buckets, and fails the deployment when Supabase rejects a ceiling. Raise the project global Storage limit before rollout: 95,000,000 bytes for PDFs, and up to 5,000,000,000 bytes for full-size video support. A service-role key cannot override that project limit. Changing plans/billing is an operator action.

The deployment explicitly reloads Caddy after updating its configuration; updating a bind-mounted Caddyfile alone does not activate new upload limits or the GUI WebSocket route. Application rollback restores release-controlled admission flags and optional image selection, while retaining compatible database migrations and private originals/history.
