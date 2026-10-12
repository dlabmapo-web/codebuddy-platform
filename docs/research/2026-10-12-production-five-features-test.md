# Production learning feature verification

Tested through Chrome on https://cs.coveedu.com on 2026-10-12, release v2.0.31
(6b9dd415). GitHub deployment completed successfully. API, studio and GUI broker
were healthy; video worker was running.

## Scope and fixtures

All five supplied accounts authenticated: platform admin, manager, team lead,
teacher and john10. Passwords are intentionally omitted.

Synthetic course: `1b7df903-66dd-451e-b7d0-0a0866b57257`.
Separate QA class: `d45e30ff-16e6-4583-87b0-c6def9bd5219`, enrolled only john10,
assigned only mapo-teacher1. Every scored activity was excluded from course score.
Existing lessons, grades, drafts and class assignments were not edited.

## Verified live

| Feature | Browser evidence |
| --- | --- |
| PDF | Team lead uploaded the two-page fixture; student rendered both pages, navigated pages, downloaded the file (browser download event), and returned from turtle to PDF without reload. |
| Turtle | Student ran CPython/Tk, saw a square and `QA square drawn` terminal output, submitted for manual review and stopped the session. Teacher reran immutable submitted code, saw the square, published 100/100 + Completed + feedback. Student reopened and received that review. |
| Short answer | Empty Submit disabled; exact answer `3` returned Incorrect 0/100, resubmission `4` returned Correct 100/100. |
| Multiple choice | Empty Submit disabled; selected single radio remained selected on repeated click; wrong choice returned 0/100, correction returned 100/100; result survived navigation. |
| Video | Synthetic nine-second MP4 uploaded and reached READY. Student decoded visible frames, played to Completed, changed speed to 1.5x and quality to 360p, muted, replayed, and saw saved watch history (99%, nine seconds, Completed). Manager uploaded WebVTT; student selected English and saw the caption over the video. |
| Mixed navigation | PDF → turtle → short answer → choice → video maintained QA classId; tested video → choice → video and turtle → PDF; direct reloads recovered stored submissions, review and watch completion. |
| Staff access | Manager and admin could open the course and see all five author controls; manager edited video and saved captions. Teacher accessed assigned QA assessment review. |

## Findings

1. **Reproducible admin editor crash:** clicking an existing multiple-choice or
   turtle material from the platform admin course builder throws
   `useAcademySlug must be used inside an academy route`. The editor depended on
   the learning-route provider even though admin authoring has a content-route
   provider. Fixed in source to use `useContentAcademySlug`; three regression
   cases render turtle, written response and multiple choice in the console
   content context without a learning provider.
2. **Misleading outline label:** the exact-match short-answer item was labelled
   Teacher graded in the course outline, while its workspace and grading were
   automatic. Removed the blanket teacher-grading badge for written responses;
   turtle and multiple-choice retain their known grading badges.
3. **Intermittent first video navigation:** first choice → video navigation
   eventually displayed "This video is unavailable." Reload succeeded; the
   second choice → video transition succeeded, including autoplay. No cause
   was established. Recovery is now implemented for read queries: at most two
   retries for network failures, malformed gateway responses, HTTP 429 and
   HTTP 5xx, with an explicit Retry button if loading still fails. HTTP 4xx
   access/content errors do not automatically retry. The original cause is
   unconfirmed; do not describe that first navigation as passed.

The source fixes are not part of the live v2.0.31 release tested here.
TypeScript and 17 regression tests pass, including query recovery, bounded
failure exhaustion and a later explicit refetch; targeted ESLint has no errors
(one pre-existing useCallback dependency warning in the author dialog).

## Limits

This verifies the core five-feature workflows, not all configuration combinations
or exact Elice parity. Manual/regex short-answer modes, multiple-answer/shuffle
choice variants, supplementary placement, keyboard turtle events, simultaneous
GUI capacity, mobile browsers and maximum-size uploads were not exercised in
this production run. A two-page 880-byte PDF and a roughly 2 MB video were used;
95 MB PDF / 5 GB video limits were verified as configuration, not load-tested.

QA content and submission history are retained for reproduction. After testing,
the QA course was hidden and the separate class archived through the manager UI;
both states were visibly verified. Test sessions were signed out. No submission
history was permanently deleted.

## v2.0.32 retest

Deployment and public smoke checks passed. Platform admin opened all three
assessment editors, loaded saved data, verified published grading locks and
saved the existing short-answer question successfully. The student outline's
incorrect teacher-grading label is gone. PDF pages and download passed; fresh
short-answer and multiple-choice submissions returned 100/100. First video
navigation and three additional quiz → video transitions succeeded without
reload; completion and caption controls remained available.

The retest exposed a separate deployment regression: changing the default GUI
image prevented an existing turtle lesson from running its recorded runtime.
The broker reported "The saved runtime version is not available." The only
production turtle configuration used the prior approved image. Restoring that
digest in the private broker environment recovered drawing, terminal output,
submission and Stop without editing lesson data or immutable work.

A permanent runtime registry and release retention fix is prepared separately:
new lessons use the current approved image, historical configurations and
submissions select their exact retained approved image, and arbitrary learner
image references are rejected. Five real Docker integration checks pass,
including execution after a default-image upgrade and exact container-image
verification, plus the isolation/lifecycle cases. Six policy/registry checks
and eight rollout checks pass. This follow-up source fix requires release;
the operational runtime restoration is already applied to production.

## v2.0.33 final runtime-retention verification

[Release run 38286594823](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/38286594823)
completed successfully for commit `2491c7c891026d4762711cd1412692d71d5d9194`.
Production public smoke checks passed after the release and after QA cleanup.
The permanent retention fix is now deployed; the temporary default-image
restoration described above is no longer required.

The broker reported a new default runtime image beginning `d2b70e928297`, while
the existing QA lesson and saved submission recorded the older approved image
beginning `89dc2d6a560b`. Student john10 ran the existing lesson successfully:
the square rendered and the terminal displayed `QA square drawn`. Teacher
mapo-teacher1 then reran the immutable saved submission with the same result.
Server Docker inspection confirmed both sessions used image `89dc2d6a560b`,
rather than the broker's newer default. Both sessions stopped successfully.
No new submission or published review was created during this verification;
the existing 100/100, Completed status and feedback remained intact.

The QA course was hidden and the separate QA class archived again, with both
states verified in the team-lead UI. Test accounts were signed out. The final
broker health check reported ready with zero active sessions. This release
check specifically exercised retained turtle execution and teacher replay;
the other four core feature workflows were covered by the preceding live
tests, with the configuration and parity limits above still applicable.
