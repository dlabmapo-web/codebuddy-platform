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
