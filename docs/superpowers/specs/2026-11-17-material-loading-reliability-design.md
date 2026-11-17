# Material loading reliability and reference PDF metadata

Date: 2026-11-17 (Asia/Seoul)
Status: Draft for user review; implementation and deployment have not started.
Branch: `feat/web-courses`, based on the current work at `b74da53e`.
Evidence: [Material loading audit](../../research/2026-11-17-material-loading-audit.md).

## 1. Outcome

A student who can open an assigned course can open its visible programming exercises with an attached reference PDF. The workspace receives the document's real title and valid metadata. A server, network or response-validation failure shows a recoverable loading error; it does not claim that the student's academy or membership disappeared.

Apply the same distinction between unavailable content and failed loading to PDF, Turtle, written response, short answer, multiple choice, video and explanation entry points. Preserve the existing workspace layouts, class context, role permissions and learning behavior.

Example: the Mapo exercise `[실습] 시간복잡도와 공간복잡도` opens with its reference `[이론] 시간복잡도와 공간복잡도`. If the API temporarily fails, the student sees a translated loading-failure message and Retry. A hidden, removed or unauthorized activity still discloses no protected content.

## 2. Confirmed cause and audit scope

The incident is not failed OS account provisioning. The production test identity is active and enrolled; the class delivers the visible course/material. The deployed service produces an invalid exercise bootstrap because `readSubmissionAdmission(..., { workspace: true })` omits `reference.material.title`. `referencePdfMetadata` and the shared bootstrap schema require it. Adding the title to an in-memory diagnostic copy makes validation pass.

The reported course has seven visible programming activities with a reference PDF. The reported activity and a second reference-linked sample reproduced the defect. The same reader serves student opening, staff practice/preview and historical bootstrap paths, so cover those consumers without claiming every role was live-tested.

Representative deployed reads of plain programming, standalone PDF, Turtle, written response, short answer, multiple choice and explanation did not reproduce a missing-field failure. Video has source/unit coverage only because no visible Mapo video sample was available. Exact audit limits and the 105 API / 20 web passing existing tests are in the evidence document.

## 3. Approaches considered

| Approach | Trade-off | Decision |
| --- | --- | --- |
| Fix the SQL projection, preserve strict output validation, and classify material-read failures | Repairs the actual defect and makes a similar future fault diagnosable; requires reader, route and UI regression tests. | Recommended |
| Only add the PDF title | Smallest incident fix, but any later internal failure still becomes an academy-unavailable screen. | Insufficient for this reliability fix |
| Make the title optional, substitute an empty title, or discard the reference on failure | Conceals a broken response and can silently remove valid instructions from the exercise. | Rejected |

No new OS payload, SSO change, account migration or database data repair is necessary.

## 4. Reader and response correction

In `packages/api/src/learn/submission-admission-read.ts`, include the PDF material's `title` alongside its existing ID, visibility and ancestor scope fields in the same joined statement. Populate the field from `materials.title`, not the filename, programming title or a generic fallback.

Make the raw reference projection's declared shape explicit enough that the metadata mapper's requirements are reviewable. Do not let the entire asserted `AdmissionMaterial` graph stand in for evidence that a raw nested projection contains every required field. Keep this targeted to the reader/reference shape; do not redesign all SQL readers.

Preserve:

- `referencePdfMetadata` visibility, READY-state, same-course and placement checks.
- `null` metadata for missing/unavailable references under the existing policy; no hidden PDF title may leak.
- The strict existing `learnExerciseBootstrapSchema` and lean workspace schema.
- Automatic-only case selection on submission admission, sample-only client cases and solution redaction.
- Non-workspace submission admission behavior. Adding a workspace-only title must not load document content, solutions or extra relations for submissions.

Standalone PDF delivery keeps its separate authorization against both the requesting exercise and linked document. A reference within another lecture of the same course remains supported. Do not detach links, duplicate materials or modify publication flags to work around the bug.

## 5. Material-load outcome policy

| Outcome | User presentation | Recovery |
| --- | --- | --- |
| Actual academy identity/membership failure from `requireAcademyRoute` | Existing academy access behavior | Existing sign-in/academy navigation |
| Explicit API content/access denial for an activity | Neutral **activity unavailable** state, not a claim about the academy | Safe return to the known course or class list; no automatic retry of a denial |
| Network, 429/5xx, invalid JSON, output-schema failure or unknown exception | **Activity could not be loaded** with Retry | Re-run only the authorized read |
| Successful empty activity lists or multiple-class choice | Existing empty/choice UI | Existing navigation |

Define a small shared material-read classification policy, building on `ApiError`, `toApiError` and `isExplicitAccessDeniedError`. Include the legitimate content-specific codes (`EXERCISE_NOT_AVAILABLE`, `PDF_NOT_AVAILABLE`) used by these readers. Do not classify an untyped gateway/proxy 404 or arbitrary exception as proof of academy denial. Existing REST readers that return a bare 401/403/404 may show the neutral activity-unavailable state, but never the academy-unavailable message; retain their status and code when available so they can be distinguished from transport/JSON errors.

Preserve explicit 401/session-expiry behavior and the existing auth/session guards. Do not silently reauthenticate, change roles, relax a scope predicate or retry a write to make a page load.

Normalize errors on the read paths only. Leave unrelated upload, grading, billing, mutation and execution behavior outside this change.

## 6. Server routes and client recovery

### Programming and course outline

Replace the exercise page's unconditional rejection-to-null and broad material-type catch with a settled read outcome that preserves the cause. Keep material-type and bootstrap reads concurrent. A Turtle redirect must not create an unhandled rejection from the unused bootstrap; settle both promises and propagate unexpected errors only from the branch whose result is required.

Keep `redirect()` and `notFound()` outside broad catches: they use framework control flow. Read the installed Next documentation before implementation; this branch currently has Next 16.2.9. Its error-boundary guide recommends `unstable_retry()` for fetching/rendering fresh content and distinguishes it from `reset()`.

Only explicit inaccessible/missing content becomes an unavailable activity. Unexpected failures reach a recoverable boundary. Add material-scoped unavailable/error handling for fullscreen learning routes if needed so a missing exercise does not inherit academy-specific wording. The framed course-outline route needs the same unexpected-error distinction; retain its existing legitimate access denial behavior.

Preserve `classId`, `mode`, preview, selected submission and the existing validated return destination when retrying or leaving. Do not replace a failed explicit class context with another class.

### Other material families

- PDF: preserve the real title/breadcrumbs/metadata and signed-delivery guards; provide explicit loading-failure recovery instead of an undifferentiated unavailable message.
- Turtle, written response, short answer, multiple choice: use one manual-workspace error policy and retry action. Keep SSR preload/fallback behavior, draft ownership, assessment privacy and source code intact. A retry must not start a GUI session, save/submit an answer, award points or reset the learner's work.
- Video: retain its existing bounded read-retry policy and explicit retry button. Align classification/copy without adding faster polling or replaying progress checkpoints.
- Explanation: retain its existing retry button and SSR data; preserve status/code in read failures. Do not let recovery call the viewed/progress mutation beyond existing idempotent behavior.

All copy must be available in Korean and English. Generic client text must not include schema details, stack traces, student identifiers, solutions, private URLs or credentials. Retain safe server-side error code/digest/correlation evidence so an operator can diagnose the failure.

Saved-work and live-monitor route catches also mask unexpected errors in source. Align those two material-entry catches with the same classification while preserving existing teacher scope and `MONITORING_STUDENT_UNAVAILABLE` UI. Do not expand this into a monitoring, sharing or socket redesign. Monitoring's reference reader already includes the PDF title; do not replace it with the defective projection or claim its data read has the same bug.

## 7. Performance requirements

Follow current `AGENTS.md`:

- The reference projection remains **one SQL statement**, with the title added to the existing JSON. No extra per-reference lookup.
- No queries inside per-material loops. Use `readCurricula`/`withCurriculum` and existing access snapshots where applicable.
- No new deep Prisma includes, description/solution loads in outlines, or duplicate access/account resolution.
- Keep independent reads concurrent, server-rendered payloads shared and retry work bounded. Do not introduce polling.
- Measure the actual changed read path using Prisma query events against disposable Docker PostgreSQL through `COVE_INTEGRATION_DATABASE_URL`. Compare an exercise with/without a reference and a mixed course with one versus many materials.
- Record SELECT and total emitted statement counts separately if transaction/guard statements are included. The exact total bootstrap count is to be measured during implementation; this draft does not claim a measured budget.
- Include measured counts in the implementation commit when required by `AGENTS.md`. Never run fixture writes or performance tests against shared Supabase.

## 8. Required regression coverage

### Database projection to public output

Use self-contained disposable-PostgreSQL fixtures, not mocked raw-query rows, to exercise `readSubmissionAdmission` through `LearnService` and validate the real bootstrap/workspace output schema.

Cover:

1. A visible Python exercise with a READY BOTH or SUPPLEMENTARY reference PDF. Assert the exact PDF title, ID, filename, revision, page count and byte size.
2. No reference; a reference in another lecture of the same course; MAIN-only, hidden, unready and cross-course/campus cases under their existing rejection/null policy.
3. Student, eligible teacher, Team Lead and Manager staff-practice/preview access; historical-attempt opening where applicable. Unassigned Teacher and foreign student still fail.
4. `PRACTICE_ONLY`, `AUTOMATIC` with valid samples, and `MANUAL_REVIEW`. No hidden cases or solutions in student output; submission admission semantics unchanged.
5. A fixed mixed-material fixture: plain programming, PDF + programming, PDF, Turtle, written response, short answer, multiple choice, video and explanation. Validate the full existing schema where one exists; assert typed envelope fields plus existing sub-schemas where the full result is currently only a TypeScript type. Do not pretend configuration-only validation proves a complete response.

The older `pdf-reference.integration.spec.ts` targets a shared development database. Do not enable it for this feature; use/migrate to the loopback-guarded disposable pattern in `curriculum-read.integration.spec.ts` and `navigation-performance.integration.spec.ts`.

### Error behavior

- A bootstrap output-validation error, API 500, network failure and untyped proxy 404 render load-failure recovery rather than academy-not-found.
- Explicit content denial uses neutral unavailable copy without title/ownership leakage.
- Real academy membership failure retains the existing access guard.
- Turtle material redirection settles the parallel bootstrap without swallowing framework redirects or reporting an unrelated error.
- Retry succeeds after a simulated transient failure, retains the exact class/material/attempt and does not mutate learning state.
- PDF/manual/video/explanation client reads preserve enough status/code information for consistent classification.
- Korean/English copy and accessible retry controls render in both light/dark themes. Use the existing platform styles; no workspace redesign.

### Browser acceptance

With isolated fixtures and separate student/staff browser contexts, test Chromium and WebKit:

- Course outline -> linked-PDF programming exercise -> standalone PDF -> Turtle -> short/written answer -> quiz -> explanation -> video -> back.
- Direct URL, refresh, Prev/Next, material drawer, hidden content and wrong-class URL.
- Inject one failed read, retry, and verify the correct material opens without needing a new SSO login or losing saved work.
- Staff practice/preview and assigned-student monitoring retain role/class restrictions and valid PDF metadata.

Production acceptance after a separately authorized deployment is a narrow check of the reported activity and other approved test materials. Do not generate student submissions, alter grading data, modify OS enrollments or use real student work as fixtures.

## 9. Boundaries and completion

No schema migration, source payload change, account repair, role change, content reimport, PDF replacement, runtime upgrade or production data update is part of this fix. No implementation/deployment is authorized merely by creation of this spec.

Implementation is complete when the real SQL-to-output regression passes, the mixed-material and recovery matrix passes, measured statement counts meet the budget, and no expected access refusal becomes a successful read. Record the exact completed checks and any infrastructure-gated or browser gaps in a verification document.

Stop temporary task servers after verification. Per `AGENTS.md`, inspect identities and working directories before stopping relevant Cove API/Nest processes and verify port 4000 is free unless the user explicitly asks to keep it running. No server was started for this documentation/audit task.

Deployment and live acceptance remain separate from implementation. This document specifies work for review; the confirmed production defect is still present.
