# Elice recorded-video lesson inspection

Date: 2026-10-12
Purpose: identify the video lesson behavior to reproduce in Cove. Research and specification only.

## Sources and method

Inspected the user's signed-in Chrome session in the [requested course](https://dlab.elice.io/courses/765886/lectures/all), its [introductory chapter](https://dlab.elice.io/courses/765886/lectures/6637911#list), the [first video material](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487940), and its [author editor](https://dlab.elice.io/courses/765886/lectures/6637911/lecturepages/54487940/edit). Observations use rendered accessibility information and screenshots, not hidden application state or backend requests.

The video initially showed a blank loading area, then loaded and automatically played. Paused it and opened the speed/quality menus. Inspected the editor, subtitle dialog, and Achievement tab. Cancelled the subtitle dialog and discarded the editor's unsaved-state warning when returning. No video/subtitle upload, Save, publication, deletion, certificate edit, or deliberate completion was performed. Playback occurred during inspection and re-entry autoplay; Elice may have recorded viewing activity. No claim is made that viewing telemetry was unchanged.

Do not store player URL query credentials, download the reference video, or copy its teaching content. The player host was visibly `videoplayer.app.elice.io`, embedded in the Elice lesson. Its student configuration requests autoplay, automatic next-material behavior, and end controls; its author preview requests no tracking. These configuration signals do not prove end behavior or backend progress semantics.

## Student observations

| Area | Observed behavior |
|---|---|
| Lesson shell | Top breadcrumb/title, material list, Edit for the manager account, Leave; bottom Previous/Next, material position `1 / 28`, Share, Feedback, and lesson Fullscreen |
| Presentation | Large integrated video area with black letterboxing; no code editor, terminal, Run, or Submit |
| Playback | Autoplay succeeded in this Chrome session; Pause changed to Play and time stopped advancing |
| Timing | Current time and duration shown separately from material position; example duration `1:59` |
| Sound | Mute button and volume slider, initially 100 |
| Seeking | Progress slider visible; seeking behavior was not exercised |
| Settings | Playback-speed and Quality menus |
| Speed choices | 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2; current speed 1 |
| Quality choices | Auto and 720p for this asset; current quality 720p |
| Fullscreen | Player fullscreen control and separate lesson fullscreen action |
| Download | No explicit video Download action observed |

The same material played again on return from editing. Timing was not sampled immediately on load, so this does not establish whether playback resumes or starts over. Only the manager account was available; access denial and a student-role account were not tested.

## Author observations

The editor has a left rich Description/Solution panel and a supplementary-material selector. Main tabs are Basic Info, Achievement, and AI Helpy Guide.

Basic Info exposes a required title, a Don't include in score switch (enabled for this example), placement choices Main / Main and supplementary / Supplementary, a video picker/drop zone, existing filename/size, delete control, embedded preview, and subtitle management. The uploader advertises **5 GB maximum** and **six hours maximum duration**. Listed input extensions are `mxf`, `gxf`, `ps`, `mp4`, `mpg`, `wmv`, `avi`, `mkv`, `mov`, `flv`, `ts`, `asf`, and `3gp`. These are advertised limits, not tested backend validation results. The inspected existing source is approximately 35 MB.

Add subtitles opens a dialog requiring a `.vtt` file and a selected language. Confirm is disabled while these are missing. The actual upload, language choices, replacement, and playback of caption tracks were not tested.

Achievement contains a certificate toggle, certificate image, title, and description. It does not establish video completion criteria. AI Helpy behavior is outside this feature's scope.

Elice's [material-authoring help](https://help.elice.io/help/docs/elicelxp/for-admin/lecture/material) confirms the three placement concepts: supplementary-only material is referenced from another material instead of opening as a standalone main lesson. The same help says excluding a material from grades also excludes it from learning progress. This documented policy is distinct from a measured video completion threshold.

## Evidence limits

Unverified: upload validation/transcoding and failure recovery; additional quality levels on other assets; actual playback-rate/seek changes; subtitle language selection/rendering; autoplay restrictions on other browsers; resume persistence; end/replay/auto-next behavior; completion threshold and whether seeking counts; video score calculation; progress across classes/devices; download restrictions; library-copy lifecycle; teacher analytics and overrides. Do not invent a 90% Elice threshold or claim that a video-end event proves full watching.

The [Elice backend interview](https://elice.io/en/resources/blog/ai-a-z-part) discusses WebRTC classrooms and live-media servers. It is not evidence that this prerecorded-video player uses WebRTC. The observed lesson is an uploaded prerecorded video, not a live meeting.

## Cove baseline and design direction

Cove currently has programming/native quizzes, PDF documents, turtle/written responses, short answers, and multiple-choice materials on `feat/lecture-pdf-materials`. No dedicated video material or video progress schema was found in the current content models. The PDF asset lifecycle, placement, permissions, library adoption, and mixed-material navigation are relevant precedents; PDF's 95 MB limit and signed-document route must not be reused unchanged for multi-gigabyte video.

Recommended: a distinct video material, private uploaded originals, an isolated media-processing worker, an integrated HTML video player, private adaptive playback, VTT captions, and class-scoped watch history. A simple MP4-only player would leave advertised formats and quality handling incomplete. A managed video provider is an alternative but introduces an unapproved service dependency.

Technical feasibility references: [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) documents TUS and signed-upload tokens; [storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits) separates project/bucket ceilings; [hls.js](https://github.com/video-dev/hls.js) documents HLS playback with native Safari support and an MSE implementation for other supported browsers. These describe possible Cove mechanisms, not Elice's internal implementation.

The concrete design, proposed progress rules, and acceptance checks are in the [video spec](../superpowers/specs/2026-10-12-video-learning-materials-design.md).
