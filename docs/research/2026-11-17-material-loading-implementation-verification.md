# Material loading reliability — implementation verification

Date: 2026-11-17 (Asia/Seoul). Branch: `feat/web-courses`.
Scope: [approved design](../superpowers/specs/2026-11-17-material-loading-reliability-design.md).
Status: Implementation complete and verified locally. No deployment or production data changes.

## Change and cause

The programming workspace's joined SQL omitted the linked PDF material's `title`. The reference mapper returned a title-less object and the public bootstrap contract rejected it. Its page then converted the rejection into academy-not-found. The reader now selects `pm.title` in the existing statement; strict public validation remains unchanged.

Material entry routes preserve unexpected errors for a recoverable boundary, while known content denials render a neutral activity-unavailable state. The academy guard remains outside these catches. The parallel unused programming read is settled before a Turtle redirect. PDF, manual (Turtle/written/short answer/quiz), video and explanation GET adapters retain status/application codes. Their failure UI shares Korean/English copy, accessible controls and platform theme tokens. Mutations/uploads/execution policies are unchanged. PDF reader failures stay inside their pane, preserving the surrounding editor.

The web package resolves Next **16.4.1**; its own installed docs specify the error boundary's `retry()` prop. The root dependency copy is 16.2.9 and has an older API; the implementation follows the web package's docs.

## Completed automated checks

- **51 API tests passed**, including 12 new disposable-PostgreSQL SQL-to-bootstrap integration cases plus existing Learn/PDF-reference regressions.
- **44 web tests passed**: error classification, actual server-page branching, settled Turtle redirects, safe failure UI, PDF transport/context and reader recovery, reference panes, and video read retry policy.
- **150 i18n tests passed** and web i18n key checks passed.
- API, web and E2E TypeScript checks passed.
- Canonical-route check and focused ESLint checks passed; `git diff --check` passed.
- Full theme audit reports **9 existing violations** in unchanged rendering styles (manual/GUI/monitoring/video surfaces). The added UI uses Cove tokens; no palette violation was added.

The new integration suite uses loopback-only `COVE_INTEGRATION_DATABASE_URL` and the real Prisma reader/LearnService/output schema. Cases cover Student, Teacher, Team Lead, Manager, Unicode PDF title and all public metadata, no reference, another lecture, foreign course/academy, hidden/unready/MAIN-only references, hidden ancestors, historical saved code/draft ownership, and all three submission policies. Hidden test outputs and private solutions are absent from public output.

## SQL statement counts

Measured with Prisma query events against fresh **Docker PostgreSQL 17**, and reproduced on a disposable native PostgreSQL 17 cluster when Docker Desktop's management service stopped responding after host disk exhaustion.

| Read | Total statements | SELECT/WITH statements |
| --- | ---: | ---: |
| Workspace admission, linked PDF | 1 | 1 |
| Complete student bootstrap, 2 materials | 14 | 14 |
| Complete student bootstrap, 102 materials | 14 | 14 |
| Complete student bootstrap, no reference PDF | 14 | 14 |

The title uses the existing join. There is no per-reference query and no statement-count growth with curriculum size. No shared Supabase database was used for fixture writes or performance tests.

## Localhost browser checks

The test harness runs the real Cove API/Studio with separate student, manager and assigned-teacher browser contexts. OS/auth/storage are local test doubles. It seeds plain programming, PDF-linked programming, standalone PDF, Turtle, written answer, short answer, multiple choice, video and explanation materials. It checks the rendered PDF canvas (not Monaco's canvas), navigation, staff practice/monitoring, recoverable SSR and REST failures, typed content denial, wrong-class refusal and Korean/dark recovery.

Final Chromium/WebKit result: **2 passed (2.7 minutes)**. Both browser projects completed the complete matrix, including real PDF rendering, all material families, Prev/Next/sidebar navigation, manager/teacher practice, assigned-student monitoring, SSR and REST failure recovery, wrong-class refusal and Korean/dark recovery.

Screenshots are captured under [assets/2026-11-17-material-loading-localhost](assets/2026-11-17-material-loading-localhost/), separated by browser. The linked-PDF, recovery, Korean/dark and WebKit quiz/monitor screenshots were visually reviewed. Temporary API/Studio/provider and native database/Redis services were stopped; ports 4000, 3309, 4319, 4320, 55439 and 56399 are free.

Browser scope is opening/navigation/recovery and authorized monitoring, not executing Turtle/code, publishing grades, submitting student answers or uploading new production content. WebKit is Playwright's Safari engine; this is not a claim of testing the installed Safari application.

### Screenshot gallery

| Page | Chromium | WebKit |
| --- | --- | --- |
| PDF + programming | [Open](assets/2026-11-17-material-loading-localhost/chromium/01-linked-pdf-programming.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/01-linked-pdf-programming.png) |
| Written response | [Open](assets/2026-11-17-material-loading-localhost/chromium/material-WRITTEN_RESPONSE-lesson.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/material-WRITTEN_RESPONSE-lesson.png) |
| Short answer | [Open](assets/2026-11-17-material-loading-localhost/chromium/material-WRITTEN_RESPONSE-short.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/material-WRITTEN_RESPONSE-short.png) |
| Quiz | [Open](assets/2026-11-17-material-loading-localhost/chromium/02-quiz.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/02-quiz.png) |
| PDF document | [Open](assets/2026-11-17-material-loading-localhost/chromium/material-PDF_DOCUMENT-lesson.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/material-PDF_DOCUMENT-lesson.png) |
| Turtle | [Open](assets/2026-11-17-material-loading-localhost/chromium/material-TURTLE_EXERCISE-lesson.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/material-TURTLE_EXERCISE-lesson.png) |
| Video | [Open](assets/2026-11-17-material-loading-localhost/chromium/material-VIDEO_LESSON-lesson.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/material-VIDEO_LESSON-lesson.png) |
| Explanation | [Open](assets/2026-11-17-material-loading-localhost/chromium/material-EXPLANATION-lesson.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/material-EXPLANATION-lesson.png) |
| Staff monitoring | [Open](assets/2026-11-17-material-loading-localhost/chromium/staff-monitoring.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/staff-monitoring.png) |
| Simulated server failure / Retry | [Open](assets/2026-11-17-material-loading-localhost/chromium/03-server-error-retry.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/03-server-error-retry.png) |
| Content unavailable | [Open](assets/2026-11-17-material-loading-localhost/chromium/04-activity-unavailable.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/04-activity-unavailable.png) |
| Korean / dark recovery | [Open](assets/2026-11-17-material-loading-localhost/chromium/05-korean-dark-recovery.png) | [Open](assets/2026-11-17-material-loading-localhost/webkit/05-korean-dark-recovery.png) |

Development-server badges in the captures are Next.js tooling. Error captures intentionally inject upstream failures; the test removes the failure and verifies Retry succeeds.

## Reproduction and operational notes

Normal isolated run: `pnpm test:material-loading:local` (Docker + ffmpeg + Playwright browsers required). It creates fresh local PostgreSQL/Redis containers, migrates that disposable database, builds the API, runs the regressions, runs Chromium/WebKit and cleans up its resources.

After the host ran out of disk space, generated webpack cache was cleared. Docker Desktop's management API remained unresponsive; unrelated containers were not restarted. To complete local testing, PostgreSQL/Redis development binaries were installed with Homebrew and fresh temporary loopback-only database/Redis instances were used. No Homebrew service was enabled. Native verification uses the same API/Studio/browser tests and local test doubles.

Deployment, migration, SSO configuration and production acceptance are outside this task. The production incident remains unfixed until this branch is separately released.
