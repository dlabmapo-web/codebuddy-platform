# Web courses (HTML, CSS, JavaScript)

Date: 2026-11-16 (Asia/Seoul)
Status: Parts A–D implemented on 2026-11-16; localhost evidence and SQL budgets are recorded in [the verification folder](../../research/assets/2026-11-16-web-courses-localhost/README.md). Part E content migration remains deferred. The user's instruction for every open decision was "do as Elice"; section 12 records how each was resolved.

Follow-up verification covers full-height split cards, persisted divider sizing, immediate quiz/video completion ticks, mixed Web/coding class navigation, Korean/dark layouts, and platform library Web creation/filtering in a production localhost build. The original 27-material week and timed hand-authoring trial still require the complete source files/export; the six-material synthetic pilot does not close that trial.

Branch: `feat/web-courses`
Base: `origin/feat/cove-studio-v2` at `cf1db2f3`.
Research: [Elice web courses parity audit](../../research/2026-11-16-elice-web-courses-parity-audit.md), with screenshots in `docs/research/assets/2026-11-16-elice-web-courses/`.

## 1. Outcome

A team lead can build D.LAB's three web courses (DM-WB-1, DM-WB-2, DM-WB-3) in Cove, and a student can take them with the same flow they have on Elice: read a slide deck, follow a practice page, attempt a mission, watch a short result video, answer a quiz, and see how far through the lecture they are.

Example: a student opens "1주차", reads the PDF on the `div` tag, opens the practice page, copies the HTML into VS Code, compares their browser with the expected-result picture, presses Next, and sees that page ticked in the lecture list.

## 2. What the Elice courses are

The audit covered all three courses (29 lectures, 348 materials). The facts that shape this design:

- Students do not write or run code inside Elice. They use VS Code and Live Server on their own computer. There is no editor, preview or automatic grading to match.
- Only four material types are used: PDF slides, text pages, single-answer quizzes and short videos.
- Text pages follow two fixed recipes. A practice page is a title, a coloured one-line banner, a file name above each code block, and a picture of the expected result. A mission page is the same without the code.
- DM-WB-2 uses a two-pane text page: instructions on the left, reference HTML on the right, with a draggable divider.
- Every material counts toward the lecture's "11 / 27", and a page is ticked once it has been opened.

## 3. What Cove already has

Read from the code on the base commit. No work is planned for these.

| Need | Cove today | Where |
| --- | --- | --- |
| PDF slides with page jump, zoom, fit, download, fullscreen | Present | `packages/web/src/components/pdf/pdf-canvas.tsx` |
| Quiz with passage beside the options, tabs on a phone | Present | `packages/web/src/components/manual/manual-workspace.tsx` |
| Video player and upload | Present | `packages/web/src/components/video/` |
| Text page with HTML, CSS and JS code blocks, images including GIF, colours, tables | Present | `packages/api/src/explanations/explanation-html.ts` |
| Lesson frame: breadcrumb, Leave, Prev, "7 / 27", Next, material list drawer | Present | `packages/web/src/components/workspace/lesson-chrome` and `curriculum-navigator.tsx` |

These were confirmed in source, not in the running app. Section 10 includes a hand-built lecture to confirm them on screen.

## 4. What is missing

| # | Gap | Why it matters |
| --- | --- | --- |
| A | A course can only be Python or C/C++ | A web course would be badged Python and would offer Python problems |
| B | Reading a text page or PDF records nothing | A web course is almost all reading, so its progress would sit near zero and nothing would be ticked |
| C | A text page has one body | The DM-WB-2 two-pane pages cannot be built |
| D | No banner block and no file name on a code block | Every practice page needs both; without them 250 or so pages are styled by hand |
| E | No way to bring 348 materials in except one at a time | Section 9 |

## 5. Part A: web course type

### Data

Add `WEB` to the `CourseLanguage` enum. PostgreSQL cannot use a new enum value in the transaction that adds it, so the migration contains only the `ALTER TYPE ... ADD VALUE` and nothing that reads `WEB`.

`packages/shared/src/content/language.ts`:

- `courseLanguages` becomes `["PYTHON", "C_CPP", "WEB"]`.
- `exerciseLanguagesFor("WEB")` returns an empty list.
- `defaultExerciseLanguage` is not defined for `WEB`. Callers must check `exerciseLanguagesFor(course).length` first, so its signature narrows to the two coding families.

### Rules

- A web course holds no programming exercise, no PDF-with-coding-practice and no Turtle exercise. `course.service.ts` and `manual.service.ts` reject creating one with `CONTENT_VALIDATION_FAILED`, under the same course lock that reads the language today. Every other kind is accepted, written response and short answer included (revised on 2026-11-16 at the user's request).
- The existing rule stays: the language is fixed once the course has problems. So a Python course with no problems can become a web course, and a web course can change back while it has none.
- The Excel problem import refuses a web course with a message that says problems are not part of web courses, and its link is hidden in a web course's builder.
- Copying to and from the library keeps the language. `course-tree-copy.ts` and `platform-library.service.ts` are checked for places that assume two values.

### UI

- Course create and edit dialogs (`course-language-field.tsx`): one dropdown labelled "Course type" (revised on 2026-11-16; it was three cards). The closed field shows the chosen type's mark and name, with its description on the line below; the menu lists Python, C / C++ and Web, each with its mark and description. Web reads "HTML, CSS and JavaScript. Students code in their own editor, so coding practice is not offered."
- Badge (`CourseLanguageBadge`): the three marks, in a new `lang-web` tone added beside `lang-python`.
- New material dialog (`material-creation.ts`): a web course's picker shows every kind a Python or C / C++ course does (revised on 2026-11-16 at the user's request). Coding practice, PDF + coding practice and Turtle exercise are greyed, labelled "Not in web courses" and cannot be selected by pointer or keyboard (`unavailableMaterialKinds`). Explanation, PDF, Written response, Multiple choice, Short answer and Video can be created. Where Turtle replaces the written response in other courses, a web course keeps the written response beside the disabled Turtle card. Written and short answers count towards web progress when completed and appear in the teacher report, linking to the existing manual report.
- Courses table, library table and library browser show the new badge. Any language filter gains the third option.
- Korean and English strings in `packages/i18n` for every new label.

## 6. Part B: reading progress

### Behaviour

Opening a text page or a main PDF as a student marks it viewed, once, permanently. Staff, preview and monitoring never write. A viewed page shows the same green tick the navigator uses for a solved exercise.

Course and lecture progress:

- In a web course, every navigable material counts, as on Elice. A lecture shows "11 / 27".
- In Python and C/C++ courses nothing changes. Their progress still counts graded materials only, because stored scores and the points design depend on that meaning. Text pages there gain the tick and nothing else.

Viewing never awards points and never appears in class standing.

### Data

A new table rather than `StudentExerciseProgress`, because that table's `SOLVED` rows are read by points, analytics and "who solved this" queries as solved exercises.

```prisma
model StudentMaterialView {
  userId        String   @map("user_id") @db.Uuid
  materialId    String   @map("material_id") @db.Uuid
  firstViewedAt DateTime @default(now()) @map("first_viewed_at") @db.Timestamptz(6)
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  material      Material @relation(fields: [materialId], references: [id], onDelete: Cascade)

  @@id([userId, materialId])
  @@index([materialId])
  @@map("student_material_views")
}
```

### Write path

The view is recorded inside the read the page already makes, not by a second request from the browser.

`ExplanationService.read` and the PDF read, for a student who is not previewing: one `INSERT ... ON CONFLICT DO NOTHING`, started in the same `Promise.all` as the images and the outline. The outline for that response sets the current material to viewed in memory, so the tick is right without waiting for the insert.

Cost: one extra statement on a student's text or PDF page. Staff and preview reads are unchanged.

Risk to check first: if the framework prefetches a lesson page when a link becomes visible, a student would be credited for pages they never opened. Read the prefetch guide in `node_modules/next/dist/docs/` before choosing. If prefetch runs the page's data reads, move the write to a small `POST` fired once from the lesson component after mount, and accept one extra request.

### Read path

`CurriculumOutlineService.statusByMaterial` already runs three reads together. Add a fourth, `studentMaterialView.findMany` over the reading material ids, and skip it when the list has none. Cost: one extra statement per outline in courses that contain text pages or PDFs, none elsewhere.

The outline schema in `packages/shared/src/content/learn.ts` gains `status` on `explanations` and `documents` items, with the values `NOT_STARTED` and `SOLVED`.

`countProgress` receives the course language. For `WEB` its id list is every navigable material; otherwise it stays `gradedMaterialIds`.

Both counts are asserted in an integration spec in the style of `navigation-performance.integration.spec.ts`, against a disposable Docker PostgreSQL, and stated in the commit message.

### UI

- Navigator drawer: tick on viewed text pages and PDFs.
- Course outline page, lecture rows and the continue panel: "n / N" and the bar use the new count in web courses. "Continue" goes to the first material that is not viewed or solved.
- Teacher views: see "Teacher view" below.

### Teacher view

What Elice shows (audit, screenshots `16` to `19`): a course table with one "Lecture Progress" figure per student, and for each lecture a wide grid with one row per student and one column per material, reading pages included.

What Cove has today: the class Progress page (`teach/classes/[classId]/progress`) with two lenses, Students and Curriculum. Both are built only on programming exercises; `teacher-progress.repository.ts` joins `programming_exercises` in every query. A class whose course is a web course would show "No graded problems yet". Videos already have their own per-material class report (`components/video/video-class-report.tsx`): a searchable, filterable, paged list of students with a status badge.

The design keeps Cove's shape, summary first and drill down, instead of copying the wide grid. A 27-column grid does not fit Cove's table style or a laptop screen, and the same information is reachable in two clicks.

For a class whose selected course is a web course, the Progress page shows the same two lenses with different content:

**Students lens.** One row per student: name, "Viewed 12 / 27" with the existing completion bar, quiz score as "3 / 5 correct" when the course has quizzes, and last activity. The attempts, accepted and attention columns are not shown, because they describe code submissions. Sorting by name, viewed and last activity. This is Elice's course table.

**Curriculum lens.** Lectures as today, each with "viewed pairs / eligible pairs" in place of solved pairs. Opening a lecture lists its materials in order: title, a type mark (text, PDF, quiz, video), and "Viewed by 9 / 14" with a bar. Opening a text or PDF row shows the students for that material in the video report's layout: search, a filter for all, viewed and not viewed, 25 per page, each row a name and either the date first viewed or "Not yet". Quiz and video rows link to the reports those types already have instead of repeating them. This is Elice's lecture grid, one material at a time.

A student row links to that student's live view where monitoring is enabled, which is Cove's equivalent of Elice's Tutoring button. The existing route is reused. Whether it already opens on a text page or PDF for every staff role was not checked; confirm before adding the link, and leave the link out if it does not.

Data and budget:

- New shared schemas beside the existing ones in `teacher-progress.ts`: a reading row per student, a material row per lecture, and a student row per material. The exercise schemas are not widened, since their fields (difficulty, attempts, median solve time) have no meaning here.
- Students are named by class membership id, as the existing schemas require.
- Students lens: two statements started together. One groups views by student over the course's reading materials and the class's active students. The other reads each student's quiz results from the store the quiz reports already use; it is skipped when the course has no quiz.
- Lecture materials: one statement, materials left-joined to views and grouped by material.
- Students for a material: one statement, paged, with the total from a window count.
- The primary key `(user_id, material_id)` and the `material_id` index on `student_material_views` cover all three. No query runs per student or per material.
- Access goes through `teacher-progress-access.service.ts` unchanged, resolved once per request.

Counts are asserted in an integration spec and stated in the commit message.

## 7. Part C: two-pane text page

### Data

`ExplanationMaterial` gains `sideBody String? @db.Text`. Null means a single page, which is every existing row. No backfill.

- `saveExplanationSchema` gains optional nullable `sideBody`, same length limit as `body`.
- `sanitizeExplanation` runs on both. An empty side body is stored as null.
- `lessonImageIds` and `assertLessonImages` take both bodies, so a picture used only on the right is still owned and still cleaned up.
- `readDocumentRow` selects the column in its existing statement. No new statement.
- `course-tree-copy.ts` copies it.
- `revision` covers both bodies, so an edit conflict is detected whichever side changed.

### Student UI

From `md` (768px) up: two cards side by side filling the height under the header. Instructions on the left at 42 percent by default, reference on the right. Each scrolls on its own. A vertical divider between them can be dragged or moved with the arrow keys, clamps between 25 and 70 percent, and remembers the last position per browser.

Below `md`: two tabs, "Instructions" and "Reference", one pane at a time at full width. This is Cove's existing rule for every split lesson page: `manual-workspace.module.css` switches to tabs under 768px, and the quiz page already shows "Passage" and "Answer" this way. Elice keeps the two panes side by side at this width and they become too narrow to read code (screenshot `11-narrow-two-pane.jpg`), so this is a deliberate difference from Elice in favour of Cove's own pattern. The chosen tab is kept while the student stays on the page. A code block scrolls sideways inside its pane instead of wrapping.

The divider: there is no reusable horizontal splitter today. `WorkspaceResizeHandle` only resizes rows, reads the manual workspace's grid, and clamps to 20 to 65. `submission-workspace.tsx` has the right behaviour written inline (a `role="separator"` with `aria-orientation="vertical"`, 25 to 70, arrow keys). Move that into a shared component under `components/workspace/` and use it in both places, so the two pages cannot drift apart.

A single page looks exactly as it does today.

Monitoring: the right pane is a second anchor (`statement:reference`) so a shared pointer lands in the correct pane. Check `lib/monitoring/awareness/surfaces` for how anchors are registered before adding it.

### Author UI

In `explanation-author-workspace.tsx`, a switch "Side pane" in the page settings. Turning it on shows a second editor to the right of the first, arranged as the student will see it. Turning it off when the pane has content asks for confirmation and says the content will be removed. Preview shows the real split.

## 8. Part D: lesson blocks and templates

Two small additions to the editor, then two templates built from them.

### Banner

A block with one line of text and a fixed tone. Stored as `<div data-callout="practice">`, with the tones `practice`, `mission`, `note` and `warning`. The sanitizer gains `div` with only that attribute and only those values. Colours follow Elice: a solid orange bar with white centred text for `practice`, a solid yellow bar with white centred text for `mission`, full width with slightly rounded corners (screenshots `02` and `03`). The two colours are added as named tokens (`lesson-practice`, `lesson-mission`) sampled from the screenshots, not written as raw values in components. `note` and `warning` have no Elice counterpart and use Cove's neutral and warning tokens.

Editor: an "Insert banner" menu with the four tones. The tone can be changed from a small menu on the block.

### File name on a code block

`pre` gains `data-filename`, at most 80 characters, limited to letters, digits, dot, dash, underscore and slash. The student page shows it as a label on the top edge of the block with the language mark, beside the existing copy button. `code-example-frame.ts` and `code-example.tsx` render it; `RichTextFrame` already isolates authored HTML in a sandboxed iframe, so its stylesheet gains the two new rules.

Editor: a file name field in the code block's toolbar, beside the language picker.

### Templates

Offered when a text page is empty, as two buttons under the placeholder:

- Practice page: practice banner, a code block named `index.html` set to HTML, a heading "Expected result", an image placeholder. The template never guesses a second file; for a JavaScript page the author adds `script.js` with one click from "Add file".
- Mission page: mission banner, a heading for the question, the "Expected result" heading and image placeholder.

Templates insert ordinary content. Nothing about a page records which template made it.

## 9. Part E: getting the content in

348 materials: roughly 85 PDFs, 200 text pages, 50 quizzes and a dozen videos. The counts by type are estimates from the 20 lectures whose types were read.

Three ways, cheapest first:

| Option | Work | Result |
| --- | --- | --- |
| 1. Author by hand with Parts C and D | None beyond this spec | Slow but exact. PDFs and videos are a file upload each. Text pages are paste, add pictures, save. |
| 2. Add "Duplicate material" to the builder | Small | A practice page is copied and edited instead of started empty. Worth doing if it does not already exist; not checked. |
| 3. Bundle import: a zip with a manifest, HTML bodies, pictures, PDFs and quiz definitions, previewed and applied through the existing import session pattern | Large | Fast, but only if the source files exist in a usable form. Whether Elice or D.LAB can export these courses is unknown. |

Recommendation: do not build option 3 yet. After Parts A to D, build week 1 of DM-WB-1 by hand (27 materials), time it, and decide then. The same exercise is the acceptance test in section 10.

## 10. Verification and acceptance

Per package after each part: typecheck and build. The web package is never built while its dev server is running. Any API process left on port 4000 is stopped before handing back.

- Unit: language helpers for `WEB`; sanitizer accepts the banner and file name and strips anything else on `div`; `availableMaterialKinds` for a web course; `countProgress` for both families.
- Integration (Docker PostgreSQL, `COVE_INTEGRATION_DATABASE_URL`): creating a programming exercise in a web course is refused; a student read writes one view row and a second read writes none; staff and preview reads write none; statement counts for the text page read and the outline. The three teacher statements are counted the same way, and a teacher of another class is refused.
- Browser: create a web course; build week 1 of DM-WB-1 with one PDF, one practice page, one mission page, one two-pane page, one video and one quiz; take it as a student at desktop and phone width; confirm ticks, "n / N", Prev and Next, the divider at desktop width, and the tabs at phone width for both the two-pane page and the quiz. As a teacher, open the class Progress page and confirm both lenses, the lecture's material list and the students list for one text page.

Accepted when a student can finish that lecture with every material ticked, and the Python and C/C++ courses show the same progress numbers as before.

## 11. Order of work

1. Part A, web course type. Small and everything else depends on being able to create the course.
2. Part B, reading progress, in two steps: the student side (record, ticks, counts), then the teacher view. The largest part; both steps touch read paths with a statement budget.
3. Part D, banner and file name. Needed for almost every text page.
4. Part C, two-pane page. Needed only by DM-WB-2.
5. Hand-build week 1 of DM-WB-1, then decide Part E.

Each part is its own set of commits and can be released on its own.

## 12. Decisions

The user answered all six with "do as Elice" on 2026-11-16.

| # | Question | Resolution |
| --- | --- | --- |
| 1 | Does web course progress count every material? | Yes, as Elice does (section 6). |
| 2 | Two-pane pages on a phone | Tabs below 768px, side by side with a divider above it. Revised on 2026-11-16 after checking Cove's own split pages, at the user's request to fit Cove's design (section 7). |
| 3 | Teacher view of a web course | Elice's dashboard was inspected. Its content is matched, in Cove's two-lens, drill-down layout instead of a wide grid (section 6). |
| 4 | Banner colours | Elice's orange and yellow (section 8). |
| 5 | Getting content in | Hand authoring, which is how the Elice courses were built. An importer is decided after week 1 (section 9). |
| 6 | Material types in a web course | Every kind is shown; the three that are code to run (coding practice, PDF + coding practice, Turtle) are disabled, the rest can be created. Revised on 2026-11-16 at the user's request; it was only the four the Elice courses use (section 5). |

## 13. Out of scope

- An in-browser HTML, CSS and JS editor with live preview.
- Automatic checking of a student's web page.
- Collecting the student's project files.

Elice provides none of these in the three courses. Each would be a separate design.
