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
   was established. Keep as an unresolved intermittent finding, not a passed
   first-navigation test.

The two source fixes are not part of the live v2.0.31 release tested here.
TypeScript and the three regression tests pass; targeted ESLint has no errors
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
