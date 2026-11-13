# Instructor classroom verification

Date: 2026-11-13
Branch: `fix/v2-feedback`
Design: [Instructor classroom for projection](../superpowers/specs/2026-11-13-instructor-classroom-design.md).

## Delivered behavior

Enter Classroom opens the first published lesson assigned to the class, independently of a student tutoring session. A dedicated unframed teaching route reuses the existing coding, manual/quiz/Turtle, explanation, PDF and video workspaces. The class picker and previous/next controls stay within that class's published outline. The header offers fullscreen and return to class, hides tutoring/authoring/history controls, and explains projection/screen-sharing. Student devices are not synchronized.

The provider delegates navigation to each workspace's existing save, unsent-answer and running-session guards. Demonstrations use the instructor's staff-practice identity. Classroom video disables learner tracking explicitly, PDF observation is suppressed, and explanation/manual/coding retain their staff modes. PDF/video main data is read during the server render and seeds the existing client queries. Classroom navigation does not fetch a second course outline after hydration.

The entry action is primary blue; the adjacent class-edit action uses a softer blue treatment. Mobile layouts keep the class identity above the lesson controls.

## Role audit

| Capability | Manager only | Team Lead only | Teacher only |
| --- | --- | --- | --- |
| Import from Library / New Course blue actions | Yes | Yes | Existing read/review scope |
| Class Management navigation | Yes | Yes | Hidden |
| Enter My Classes navigation | Yes | Yes | Yes |
| Edit class information from class entry | Yes | Yes | Denied |
| Edit class times | Yes | Yes | Denied |
| Enter Classroom | All active academy classes | All active academy classes | Active homeroom/assistant assignments |

The existing role definitions already enforce Manager ≥ Team Lead ≥ Teacher. UI gates use permissions rather than requiring extra Teacher roles. Stale enrollment/schedule comments were corrected. The browser audit now provisions primary-role-only Managers and Team Leads, preventing extra Teacher grants from masking a missing capability.

## Executed verification

- Shared role inheritance: 34 tests passed.
- API class and staff-practice unit tests: 68 passed.
- Disposable PostgreSQL class feedback/classroom integration: 8 passed. Covered single-role staff inheritance, homeroom and assistant assignments, unassigned Teacher/Student/foreign/archived/suspended denials, hidden/supplementary/unready content exclusion, and independence from the live-monitoring rollout flag.
- Web capability/practice regressions: 42 passed. Classroom save/leave guard tests: 2 passed, including canceled and failed saves.
- Translation parity and budgets: 144 passed. Catalog and canonical route checks passed.
- Chromium: Manager English passed; Team Lead Korean and Teacher English passed in a follow-up run. Both senior roles completed all four previous feedback flows, including schedule creation, overnight changes, clearing, editing through class entry, returning/back navigation, and blue course actions. Teacher mutation requests returned 403.
- Classroom browser flows covered entry without a student selection, coding/written/short-answer/quiz navigation, discard confirmation cancellation and acceptance, empty classes, return to class, desktop/mobile layouts, and no duplicate class/course-outline client reads. Manager also opened PDF, video and explanation renderers. Before/after comparisons confirmed student draft, progress status and latest submission remained unchanged, while the instructor's draft stayed private.
- Desktop and mobile classroom screenshots were visually inspected under `test-results/class-feedback/`. The suite uses provider/storage doubles; it verifies media view/navigation rather than production playback, and does not launch the existing Turtle runtime.
- Focused ESLint passed with two existing manual-workspace hook warnings. Web, API and E2E type checks passed. No schema migration was needed.

Initial browser attempts exposed untranslated labels and a conflicting button background; both were fixed. Subsequent cold compilation timeouts required larger startup/navigation waits. The Korean legacy-login helper was corrected to match localized password-toggle labels.

## SQL evidence

Prisma query-event counts used `COVE_INTEGRATION_DATABASE_URL` against disposable local Docker PostgreSQL. No shared Supabase database was used for these tests.

| Service read | Small fixture | Large fixture |
| --- | ---: | ---: |
| New `academyClasses.getClassroom` | 4 | 4 |
| Existing teaching class list | 4 | 4 |
| Existing teaching roster | 13 | 13 |
| Existing class-management detail | 26 | 26 |

The classroom fixture grew from 1 to 6 courses, modules and lectures, and from 1 to 46 lessons. Its four statements resolve academy access, membership, the authorized class, and one narrow batched curriculum projection. Picker rows contain only IDs, titles and material types; lesson bodies, solutions and student records are excluded. Existing page fixtures grew from 1 to 13 classes and from 1 to 21 students without changing their statement counts.
