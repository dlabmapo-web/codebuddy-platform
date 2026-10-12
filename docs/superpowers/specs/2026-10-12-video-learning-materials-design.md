# Recorded video learning materials

Date: 2026-10-12
Status: implemented with localhost verification; production rollout remains disabled
Verification: [operations and test evidence](../../operations/video-lessons.md)
Branch: `feat/lecture-pdf-materials`, alongside PDF, turtle, short-answer, and multiple-choice changes
Reference: [Elice inspection and evidence limits](../../research/2026-10-12-video-learning-materials.md)

## 1. Goal and parity boundary

Teachers upload an explanatory video into a lecture. Students watch it inside Cove with Elice-style playback controls and ordinary material navigation. Authors manage captions, placement, visibility, and scoring participation. Accessible videos survive application deployments and library adoption.

Verified reference UI: integrated player, autoplay in the inspected Chrome session, Play/Pause, volume/mute, seek bar, elapsed/duration display, speed menu 0.5–2, Auto/720p quality menu, player and lesson fullscreen, upload/drop zone, Main/Supplementary/Both placement, `.vtt` captions with language selection, advertised 5 GB/six-hour limits. Elice documentation says score-excluded materials are excluded from learning progress too.

Unverified reference behavior remains explicit: exact watch/completion/score rules, resume persistence, caption playback, seek behavior, end controls, auto-next timing, processing recovery, and student download policy. The concrete policies below are **proposed Cove behavior**, not claims of measured Elice parity. No live Elice edits or submissions are needed to implement this spec.

## 2. Scope and approach

| Approach | Decision and trade-off |
|---|---|
| Private originals + isolated processing + integrated HLS player | Recommended. Supports the observed upload formats, consistent codecs, quality selection, and captions using Cove's existing infrastructure. Adds a media worker and storage/egress operations. |
| Browser MP4-only player | Smaller first implementation; cannot offer the advertised input-format support or prepared quality variants. A reduced scope requiring explicit approval, not the full feature described here. |
| Managed video provider | Can outsource encoding/delivery; introduces a new vendor, account, cost, and signed-playback integration. No provider account or purchase is authorized by this spec. |

Required: uploaded prerecorded lessons, advertised formats/limits subject to deployment capacity, private playback, quality/speed/fullscreen controls, VTT captions, author preview, resume/watch progress, optional score participation, mixed navigation/resources, copying, and localhost E2E.

Excluded: live classrooms/WebRTC meetings, webcam recording, YouTube/arbitrary embeds, DRM, guaranteed prevention of recording/downloads, video editing, automatic transcription/translation, timed embedded quizzes, AI tutoring, and certificate generation. Existing certificates/AI help are separate features. No Python judge, ManualSubmission, or ManualReview is created by playing a video.

## 3. Content model and module boundaries

Add `VIDEO_LESSON` to MaterialType. Add focused shared `video.ts` contracts, an API video module, a separate processing worker, an author dialog, and a learner player. Keep encoding out of API request handlers and the Python judge process. Reuse existing material CRUD/permissions/ordering patterns and extract shared navigation helpers when necessary; do not enlarge the manual assessment service with video branches.

| Record | Responsibilities |
|---|---|
| VideoAsset | Immutable original key/hash/filename/byte size, uploader/academy/course ownership, verified duration/dimensions/codecs, state, processing version, ready rendition manifest/poster, safe failure code |
| VideoLesson | Material relation, current asset, revision, sanitized optional description, MAIN/SUPPLEMENTARY/BOTH placement, includeInScore=false default, maximumHundredths=10000, completionThresholdBasisPoints=9000 |
| VideoCaption | Immutable validated VTT asset, language tag and display label; lesson revision references selected tracks |
| VideoProcessingJob | Durable asset/job identity, lease, attempt count, phase, bounded diagnostic code, retry state |
| VideoWatchProgress | User/material/class/asset identity, merged watched intervals, last acknowledged position, completed time, policy/max-score snapshot and mutation version |

Use **BigInt** for byte size: 5,000,000,000 bytes exceeds a signed 32-bit Int. Serialize byte sizes as validated decimal strings at API boundaries, or bounded safe numbers through an explicit mapper; choose decimal strings for the shared DTO contract. Duration and positions use integer milliseconds. UUID object prefixes avoid user filenames as paths. Titles follow the existing 128-character material limit.

Progress is scoped by asset identity, not wording revision: title/description/caption changes preserve watching; replacing video bytes creates a fresh asset and active progress. Historical asset progress remains readable to the learner and assigned teachers. Changing threshold or maximum after watching has begun is locked; create a new video material for different assessment policy. includeInScore may be toggled without rewriting watched intervals, with an audited projection change.

## 4. Author workflow

Add an independent Add video lesson action. New material starts hidden, MAIN, excluded from score, with no selected video. Fields: title, optional sanitized rich explanation/description, placement, video picker/drop zone, current filename/size/status, caption files with language/label, and score participation. Show limits before selection and effective lower deployment limits honestly.

Accept these extension candidates: mxf, gxf, ps, mp4, mpg, wmv, avi, mkv, mov, flv, ts, asf, 3gp. Validate actual container/decodable video, not extension or claimed MIME alone. Limit original bytes to 5,000,000,000 and verified duration to 21,600 seconds; reject zero-duration/audio-only/corrupt/encrypted inputs. Streams exceeding supported decoding bounds receive a clear unsupported-video result. Do not promise every codec inside a permitted extension will work.

Allocate an authorized upload session and immutable quarantine key, then upload directly using signed resumable TUS. Show byte progress, cancellation, interrupted-upload resume, and separate Preparing video status. Storage completion is not readiness. The API verifies the stored object and owns job admission; client metadata cannot mark READY. Signed upload grants allow only the reserved object with no overwrite, listing, read, or cross-course privilege. Re-issue expired grants only after reauthorization and validation of the upload reservation. No service credential reaches the browser. [Supabase's TUS documentation](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) supports this upload mechanism.

Authors may save a hidden processing material; Publish is disabled until the selected asset is READY. Preview uses the same player with watch tracking and automatic navigation disabled. A failed or pending replacement leaves the published previous asset and progress intact. Swap to a new READY asset atomically under an optimistic revision check; never point students to partial output. Save retries are idempotent and do not create duplicate materials.

Add/remove caption tracks and edit/reorder/move/show/hide through existing author permissions. Leaving unfinished author changes warns; cancel retains local form and upload status. Confirmed discard cancels the draft reservation, not an already-published asset. Reopening interrupted draft uploads is limited to the originating authorized author and valid reservation.

## 5. Storage, processing, and recovery

Use a dedicated private `course-videos` bucket for quarantined originals and immutable output prefixes. Persist binaries in object storage, not Git, database blobs, app-container disk, or manual/turtle asset manifests. Temporary worker disk is disposable. Bucket/global maximum and tenant quotas must support intended input sizes. Supabase's [file-limit documentation](https://supabase.com/docs/guides/storage/uploads/file-limits) distinguishes global and bucket restrictions; a lower project ceiling cannot be fixed by changing the web input alone.

Lifecycle: RESERVED → UPLOADING → VERIFYING → PROCESSING → READY, with FAILED/CANCELLED terminal draft states and explicit retry for transient processing failures. Durable queue/job reconciliation recovers lost enqueue, worker restart, and expired leases. Exactly one lease owner publishes a processing version's output. Partial results remain inaccessible. Retry cleans only that job's temporary prefix; it never changes a READY version referenced by a lesson or copy.

An isolated FFmpeg/ffprobe worker probes the local verified source, creates a poster, normalized H.264/AAC HLS with six-second target segments, and an MP4 compatibility fallback. Produce 360/480/720/1080 height variants only where supported by source dimensions, never upscale, preserving aspect ratio; below 360 use the source height. UI lists real encoded renditions only. A source may expose fewer quality choices than another. Keep media URIs relative and validate every generated manifest against a persisted output allowlist.

Initial worker envelope: one concurrent encoding job per instance, two CPU cores, 2 GiB memory, 40 GiB scratch/output budget per job, probe deadline 60 seconds, processing deadline 24 hours, maximum decoded dimensions 8192×8192 and frame rate 60. Resource breaches fail explicitly, preserve old published media, and require a supported replacement or audited capacity configuration. Run a pinned patched media image without privileges; ffprobe/FFmpeg cannot access the network or arbitrary filesystem paths. Fetch/upload is performed by the worker's trusted storage adapter. Use argument arrays, never shell interpolation of filenames/metadata.

Transient failures get at most three automatic attempts with increasing delay; invalid input is not retried. Author Retry may create a new job after reauthorization. Report actionable safe codes, not raw command output, signed URLs, or credentials. Expired unconsumed reservations are collected after 24 hours; deletion uses reference-aware retries, preserving every lesson/copy/history reference. Reconcile stored objects and database references before garbage collection. Object backups/restoration are required separately from database backups.

## 6. Captions and descriptions

Support `.vtt` with a required valid BCP 47 language tag and nonblank label, maximum 2 MB per track, up to ten tracks, one per language. Parse and validate WEBVTT, UTF-8, cue ordering/times, and bounded cue count. Reject malformed content and cues past verified duration. Render supported caption text only; do not allow script, arbitrary HTML, remote imports, or executable styling. Store validated tracks privately and serve as text/vtt.

Player offers Off plus available caption languages; no menu if none exist. Persist language preference per user locally, selecting it only when present on the new asset. Captions are off by default. Caption changes do not re-encode video. A failed caption upload does not discard valid video or existing tracks.

Descriptions use the existing safe rich-text subset and private authorized assets. Keep teacher-only solutions out of learner descriptions. Reuse existing supplementary PDF links and add supplementary video links through a typed resource DTO; no unrelated general attachment engine.

## 7. Student player and navigation

Canonical route: `/academy/[academySlug]/learn/videos/[materialId]`, with classId and permission-scoped author preview. The lesson shell retains material title/breadcrumb, material list, Previous/Next, position, and fullscreen. A centered player fills the main area when description/resources are empty; populated descriptions/resources use the existing side-panel pattern and stack on mobile.

Use a browser HTML video element with Cove-owned accessible controls. Prefer native HLS on supporting Safari; otherwise use a bundled compatible hls.js implementation, with normalized MP4 fallback when HLS support is absent. [hls.js documentation](https://github.com/video-dev/hls.js) explains the native/MSE distinction. Do not embed Elice's authenticated player or fetch Elice content.

Controls: Play/Pause, time/duration, seek, Mute/volume, playback speed 0.5/0.75/1/1.25/1.5/1.75/2, quality Auto plus real renditions, captions, player fullscreen, and separate lesson fullscreen. Settings preserve position and prior playing/paused state. Unavailable quality switches return to Auto with a message. Keyboard controls: Space when player-focused, arrows for ±5-second seek, accessible sliders/buttons; shortcuts do not intercept text inputs. Label selection and loading/error states without relying on color.

Request autoplay on opening a main video, matching the observed request; handle browser rejection by showing Play without an error or changing mute unexpectedly. Use inline mobile playback. Explicit pause remains paused across settings and renewal. On re-entry resume the last server-acknowledged position when incomplete; completed videos open at zero for replay. Show a Resume indicator and Start over action. These resume rules are proposed Cove policies.

On natural playback end, show Replay and Next. Main video auto-next is enabled by default with a visible five-second countdown and Cancel; after the countdown open the next accessible main material, which need not be a video. No next material means Replay only. Seeking directly to the end does not trigger automatic next or completion. Preview and supplementary viewers never auto-next. End/countdown timing is proposed; Elice's actual end behavior was not tested.

Supplementary-only videos are excluded from the ordered main list, cannot open as standalone main lessons, and open in a resource panel/dialog within another accessible material. Both placement appears in both locations. Opening a supplementary player pauses the main video; closing stops its playback and returns focus. Supplementary-only watching is resumable but contributes no course score/progress. No explicit student video download button is added; access protection is not a promise of DRM or download prevention.

## 8. Watch progress and scoring policy

Proposed completion policy version `video-watch-v1`: completed after **90% unique watched duration**. This threshold is a Cove proposal, not a measured Elice rule. Seek position, opening the lesson, or an ended event alone never grants completion.

Create one active playback session per user/material/class. Send sequential, idempotent checkpoints approximately every ten seconds while playing and on pause/end/navigation. Each carries asset identity, previous/current media positions, rate, and session sequence. Backend validates class/access, bounds and monotonic sequence, and elapsed server wall time. Checkpoints capture a monotonic elapsed timestamp at the client; the server rejects backward timestamps and values beyond its session lifetime plus two seconds. Credit uses capture-time deltas so delayed sequential uploads do not compress legitimate watch time. Credit contiguous playback intervals only up to elapsed time × allowed rate plus two seconds tolerance; seek discontinuities update resume position without crediting skipped ranges. Merge interval unions, never sum overlapping replay or simultaneous sessions. Paused/buffering time earns no credit. Checkpoint retries cannot double count; concurrent new sessions replace the older lease for crediting. Progress is an approximate learning signal, not proctored proof of attention or identity.

Background natural playback may count; pause/seek/buffering never simulate watching. A failed checkpoint leaves playback usable and shows Progress not yet saved with retry. Only acknowledged progress is shown as saved. Revalidate identity after expiry; do not fabricate completion offline. Leaving pauses/stops playback and attempts the final bounded checkpoint, without treating a failed save as permission to mark watched.

Default excluded-from-score video: resume/watch history remains available, but it contributes neither numeric score nor course completion denominator, matching documented exclusion semantics. Included MAIN/BOTH videos contribute binary zero/full maximum based on completion. No proportional partial grade. Teacher class views show last position, watch percentage, and completion through the same projection; no manual score override is introduced in this release. Optional included scoring and the binary formula are proposed policies requiring review.

Extend course/class/final-score projections deliberately for included videos. Do not create programming submissions, count video time as coding time, grant exercise difficulty points, or trigger monitoring/help sessions. Videos earn no ranking/currency points in this release; assessment completion awards and existing exercise semantics stay unchanged.

## 9. Authorization and media delivery

Every author operation requires existing curriculum permissions and academy/course scope. Every learner metadata, media, caption, and progress request checks active identity/student session, enrollment/class-course assignment, and material/lecture/module/course visibility. Teacher progress reads require assigned-class access. Preview uses explicit author permission and writes no learner history.

Deliver player media through a dedicated authenticated **same-origin streaming gateway**, with the web session translated to a verified API identity server-side. Validate material, active asset/revision, rendition, and relative path against the output allowlist; never accept arbitrary URLs or filesystem paths. Proxy from private storage without buffering entire videos. Stream cancellations close upstream reads. Forward safe content/range headers only; support valid byte ranges for MP4, including 206/416, and serve HLS/captions with correct MIME types. Use private/no-store browser responses and preserve current COOP/COEP isolation for Python workspaces. Do not weaken global security headers to make playback work.

The browser receives no storage service credential, public bucket URL, or unrestricted source-original endpoint. Originals are author-owned assets, not a student download route. Storage processing prefixes and unreferenced objects cannot be reached through the gateway. Check access on each media request; recently buffered media cannot be recalled after revocation. RLS and revoked direct anonymous/authenticated privileges protect private records; upload grants are narrowly scoped exceptions, not general bucket access.

Gateway bandwidth/capacity must be measured before production. CDN or managed delivery optimization can be introduced later with a separately reviewed authorization/revocation design; do not silently switch to public media. Logs omit URLs with tokens and learner playback payloads. No analytics vendor is introduced.

## 10. Integration, rollout, and acceptance

Update mixed course outlines, resource lists, author ordering/moves, library metadata/copy/adoption, learner drawer and all Previous/Next transitions. Library copies reuse immutable assets with authorized copy references, copy captions/config, start hidden at revision one, and copy no upload sessions/watch history. Removing/replacing the source must not break an adopted asset. Mixed Excel import either preserves videos or rejects destructive exercise-only replacement explicitly.

Independent flags: `VIDEO_LESSONS_ENABLED` API and `NEXT_PUBLIC_VIDEO_LESSONS_ENABLED` studio, false by default. API capability discovery protects author saves against older APIs. Flag-off blocks new uploads/author changes/checkpoints; READY published metadata/media/history reads remain available, with tracking-unavailable text. Existing admitted jobs can finish when new admission is disabled. Configure separate worker processing enablement and drain behavior. Wire studio build flags into Docker/release workflow.

Use additive migrations and separate development/production buckets and worker configuration. Verify project upload ceiling, quotas, processing disk/CPU/time, private gateway throughput, backups, and media headers before enabling production. Do not change the secret local deployment guide, production limits, account plan, release tags, or deployment during specification work. All changes stay on the current feature branch.

| Acceptance area | Required evidence |
|---|---|
| Author/storage | Picker/drop zone; resume/cancel; true byte/duration/format limits; processing statuses/retries; idempotent Save; stale edit; readiness publication gate; failed replacement preserves old video |
| Media worker | Probe failure; invalid/huge dimensions; resource timeout; restart/lease recovery; duplicate job; no partial output; unsupported codec; deterministic allowed rendition paths |
| Player | Play/pause/mute/volume; seek; all speeds; Auto/manual quality; fullscreen/inline mobile; autoplay blocked; resume/start over; natural end/countdown/cancel/replay; no auto-next after seek-to-end |
| Captions | VTT language upload; valid rendering/on/off; invalid timing/HTML rejected; track update without video loss; keyboard controls |
| Progress | Seek skipping; overlap/replay; faster playback wall-time bound; pause/buffer; duplicate/out-of-order/concurrent checkpoints; class isolation; asset replacement; excluded/included score projection; no code points |
| Access/integration | Hidden/inactive/unassigned/cross-academy denial for media and captions; student original denial; assigned teacher progress; PDF/video/choice/short-answer/turtle/code transitions; three placements; library asset retention |
| Operations | Private table/storage policies; no token logging; COEP-compatible streaming; byte ranges and aborted requests; worker drain/recovery; object backup/restore; flag-off readable history |

Local E2E must use original synthetic short videos and VTT files with disposable Cove teacher/student fixtures. Cover upload → processing → preview → publish → student playback in Chromium and WebKit, including actual decoded playback, controls/captions, checkpoint persistence, included/excluded completion, mixed navigation, and failed replacement. Test oversize/six-hour boundaries through meaningful API/worker fixtures; do not upload a multi-gigabyte artifact just to exercise a web input. Run relevant unit/integration tests, storage checks, typechecks, production builds, and route checks. Do not claim Elice parity for unverified policies merely because Cove tests pass.

Before implementation, review especially the proposed 90% unique-watch rule, binary included score, and auto-next countdown. The user may revise these without changing the verified reference observations.
