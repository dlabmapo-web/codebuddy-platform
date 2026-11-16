# Web courses: localhost verification

Date: 2026-11-16 (Asia/Seoul).

These screenshots use synthetic local fixtures, not the confidential Elice course files. All database changes for testing used disposable Docker PostgreSQL. The source Elice screenshots in the adjacent folder were left unchanged.

## What was implemented

- `WEB` course type, badges, filters, creation/editing. The type is chosen from one dropdown. A Web course's picker shows every material kind; coding practice, PDF + coding practice and Turtle are disabled there and refused by the server, as is the Excel problem import.
- Permanent student views for explanations and main PDFs, including PDFs placed in both the lesson and resources. Views are separate from exercise progress and award no points.
- Web course completion over every navigable material; coding courses retain graded-material totals. Student overview continuation supports reading, quiz, and video destinations.
- Teacher reading reports with Students and Curriculum lenses, lecture/material drill-down, search, viewing filters, and 25-student pages. Existing quiz/video reports are reused.
- Sanitized practice/mission/note/warning banners, code filenames, practice/mission templates, and an Add file action.
- Two-pane authoring and lessons, full-height cards with independently scrolling panes, a shared accessible divider, saved browser sizing across reloads, phone tabs, and reference-pane monitoring anchors.

## Follow-up fixes and coverage

- Quiz submission and video completion refresh the lesson list immediately: the walkthrough asserts `5 / 6` after the quiz and `6 / 6` after the video without navigating away first.
- The teacher report uses Cove's table, panel, dropdown, pager, and date components. Material students open under the selected row; search is debounced; quiz/video rows use completion wording; the Viewed filter interpolates its counts.
- Mixed classes expose both Web and coding courses. The browser test switches from the Web report to a Python companion course and uses browser Back to restore the Web curriculum lens.
- The reference pane has a quiet label; banners and editor file controls fit their available space.
- Platform library creation offers Web, describes the next step as Material, opens the Web builder, and supports the Web language filter.
- Korean light/dark lessons, a dark phone reference pane, the Korean dark teacher report, and the Korean dark platform library are covered by screenshots.
- The standalone Turtle solution-file test no longer requires Supabase environment variables: it mocks the unrelated authenticated lesson chrome. All four tests pass directly.
- The material picker scrolls inside its dialog in a short window instead of running under the Cancel / Next footer; the walkthrough checks this at 620px tall.
- Video watch progress is saved on playback changes and every ten seconds, not per frame. With each save delayed by 700 ms, the walkthrough asserts that a video watched to the end shows Completed within five seconds (4 saves for the 10-second clip); the earlier per-frame saving failed that check.
- The small round coloured icon was the TanStack Query development launcher. Explanation lessons now suppress it with the other fullscreen workspaces; it is absent from these production screenshots.

## Reproduce

Run `COVE_WEB_COURSES_PRODUCTION=1 pnpm test:web-courses:local` from the repository root. It creates disposable PostgreSQL and Redis containers, applies migrations, runs API checks, builds the production web app with isolated local service URLs, serves it on localhost, runs Playwright, and removes its temporary containers/API build/media afterwards. Requires Docker, ffmpeg, and Playwright Chromium. Without `COVE_WEB_COURSES_PRODUCTION=1`, the same command uses the development web server.

The screenshots are written directly into this folder. The final verification also used a production build on `http://127.0.0.1:3309`, with the API on port 4319 and an isolated test identity/storage provider on port 4320.

## Verification results

- Production Next.js build and web TypeScript checks: passed.
- API TypeScript compilation and Playwright TypeScript check: passed.
- API checks in the isolated follow-up run: 127 passed, including Web regressions, `BOTH` PDFs, teacher aggregates, and SQL budgets.
- Focused Web component/helper checks: 33 passed across six files, including the four standalone Turtle solution-file tests.
- Production localhost Playwright acceptance: passed (30.0 seconds; 34.1 seconds including startup), covering author, student desktop/phone, teacher, mixed-class switching, and platform library, including the locale/theme checks below.
- Targeted ESLint and `git diff --check`: passed.
- Six pilot materials completed; teacher report shows 6 / 6 and 1 / 1 quiz correct.
- 28 screenshots captured in this folder; authoring, full-height desktop/phone lessons, Korean/dark teacher, and platform library images visually reviewed.
- The results above are from the production-build run. The final run, after the course type dropdown, the disabled coding kinds, the picker scrolling fix and the video progress fix, used the development web server: 127 API checks and the Playwright walkthrough passed.
- Temporary services stopped; ports 4000, 3309, 4319, and 4320 left free. Disposable PostgreSQL/Redis containers and temporary API/media files removed.

## SQL budgets

Asserted in `packages/api/src/explanations/web-courses.integration.spec.ts`, using Prisma query events against the disposable database:

| Read/write | Statements |
| --- | ---: |
| Student explanation GET, without image assets | 6 |
| Mounted student visit POST, including permission/scope checks | 4 |
| Reading-only outline including curriculum, 1 material / 27 materials | 2 / 2 |
| Mixed reading/quiz/video outline including curriculum, 29 materials | 7 |
| Teacher material aggregation | 1 |
| Teacher student completion aggregation | 1 |
| Teacher quiz results aggregation (skipped without quizzes) | 1 |
| Teacher material student page, including target validation and total | 1 |

Teacher aggregate budgets exclude the existing class access resolver. No query runs per student or material. Explanation image metadata remains one batched statement when images exist.

Successful quiz submission invalidates the cached outline, causing one extra outline read so the current lesson list updates immediately. Video completion does the same once when its completion threshold is reached. These are event-triggered refreshes, not polling; the mixed-outline projection above counts its curriculum and status reads, excluding the existing route access resolver.

Next.js's bundled prefetch guide states that server page reads can run before a visit. Reading writes therefore use a mount-triggered POST; GETs, staff reads, previews, and monitoring never record views. Repeated POSTs preserve the original timestamp and one primary-key row.

## Screenshot index

| Files | Coverage |
| --- | --- |
| `01`–`03` | Web course creation, material picker with the coding kinds disabled, templates, filenames, side-pane authoring |
| `01a`, `02a` | Course type dropdown open; material picker in a short window |
| `04`–`08` | Student practice/mission, desktop divider, phone Instructions/Reference tabs |
| `09` | PDF viewer |
| `10`–`11` | Quiz submission and phone layout |
| `12` | Video playback and completion |
| `13` | Completed six-material course outline |
| `14`–`16` | Teacher students, curriculum, and material student report |
| `17`–`19` | Korean two-pane lesson: light desktop, dark desktop, dark phone |
| `20` | Korean dark teacher report |
| `21`–`22` | Mixed-class course picker and coding report |
| `23`–`24` | Platform library Web creation and builder |
| `25` | Platform library Web language filter in English light mode |
| `26` | Platform library in Korean dark mode |

The pilot covers all six acceptance material variants. The original 27-material week and its timed hand-authoring trial remain incomplete: no complete source lesson files/export were found in the repository or connected-file search, and the user does not know where they are stored. The research screenshots and a supplementary-video index do not contain all original lesson bodies, PDFs, quiz definitions, images, and videos. The 348-material migration and bundle importer remain deferred, as specified in Part E. No substitute lessons were presented as the original course.
