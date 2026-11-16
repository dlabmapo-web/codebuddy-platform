# Elice web courses: what they contain and what Cove still needs

Date: 2026-11-16. Source: `dlab.elice.io`, staff view (Manager / Head TA), read
only. Nothing was edited or submitted on Elice.

Screenshots: `docs/research/assets/2026-11-16-elice-web-courses/`. The slides
carry a D.LAB "confidential, internal only" footer, so decide before committing
that folder.

## The three courses

| Course | Elice id | Lectures | Materials | Subject |
| --- | --- | --- | --- | --- |
| DM-WB-1 | 793620 | 11 | 158 | HTML tags and CSS basics |
| DM-WB-2 | 793621 | 9 | 91 | Building whole pages (YouTube, Google, nav bars, grid, own homepage) |
| DM-WB-3 JavaScript | 793623 | 9 | 99 | JS basics, then small web apps |

Material counts are the "n / N" totals Elice shows per lecture, summed.

Each course ends with a project lecture (weeks 9 to 11) that holds a single
PDF.

## The main finding

**Students do not write code inside Elice in these courses.** There is no
in-browser editor, no preview pane and no automatic grading. Students code in
Visual Studio Code on their own machine (week 1 installs it, and the demo
videos show Live Server at `127.0.0.1:5500`). Elice only delivers reading
material, expected-result pictures and videos, and quizzes.

Only four material types appear, identified from Elice's own icon ids on 20 of
the 29 lecture pages (the other 9 did not finish loading during the survey):

| Elice type | Used for | Cove equivalent |
| --- | --- | --- |
| PDF (`file-lines`) | Theory slides, titled "[알아보기]" | `PDF_DOCUMENT` |
| Markdown text (`MarkdownText`) | Practice "[실습]" and mission "[미션]" pages | `EXPLANATION` |
| Quiz (`Quiz`) | Multiple choice or short answer, 2 to 5 at the end of a lecture | `MULTIPLE_CHOICE`, or `WRITTEN_RESPONSE` with a short-answer definition |
| Video (`LiveLink`) | Short silent screen recordings of the finished result | `VIDEO_LESSON` |

So Cove already has a material type for everything. The work left is in the
details below and in moving the content over.

Follow-up source inspection on 2026-11-16 corrected the original assumption that
every Quiz is multiple choice: DM-WB-1 week 1 has three single-answer
multiple-choice questions and two short-answer questions. Their authoring forms
configure manual grading for the short answers. A later local content transfer
preserved those definitions using Cove's existing short-answer support.

## What each type looks like (UI and UX)

Shared frame, all types: dark top bar with a material-list button, breadcrumb
"lecture > material", and a red Leave button. Bottom bar with Prev, "7 / 27",
a purple Next, and Fullscreen. The material-list drawer slides in from the
left, numbers every material, shows a type icon and a green tick for each one
already visited (`05-material-drawer-progress.jpg`).

**PDF slides** (`01`, `14`, `15`). One slide at a time, centred on a dark
background. Its own toolbar: fit-to-width, zoom percent, previous and next
page, a page number box "1 / 2", and a download button. Some PDFs have a
collapsible side panel on the left.

**Text page, practice** (`02`, `07`, `08`). White page on a dark background.
Fixed recipe: a title, a full-width coloured banner with one sentence (orange
for practice), then "입력 ( filename )" above a dark syntax-highlighted code
block, one block per file (HTML, then JS), then "출력" above a picture of the
expected browser result or DevTools console. Small round icons (VS Code, HTML,
JS, Chrome) mark each section.

**Text page, mission** (`03`). Same recipe with a yellow banner and a "미션"
badge, a question, and only the expected output. No code is given.

**Text page, two panes** (`10`, `11`). Used in DM-WB-2. The page is split by a
draggable divider: instructions, hint boxes listing the tags and properties to
use, and an animated GIF of the result on the left; reference HTML on the
right. On a narrow screen the two panes stay side by side and get cramped.

**Quiz** (`04`, `09`, `13`). Two cards side by side: the passage on the left
(often a picture and a highlighted sentence, sometimes a code block), the
question, radio options and a Submit button on the right. Submit stays
disabled until an option is chosen. On a narrow screen the cards become two
tabs, "Passage" and "Answer". Staff also see a Tutoring button.

**Video** (`06`, `12`). Full-width player with play, volume, time, a seek bar,
settings and fullscreen. The clips are around 30 seconds and show the finished
app being used.

Not captured: what a quiz shows after Submit (that would have recorded an
answer), and the authoring screens.

## Teacher dashboard

Looked at for DM-WB-1 (`16` to `19`). The section had no students enrolled, so
the tables were empty and only their structure is known.

**Course level.** Three tiles: Completed Students, Avg. Progress ("tests
excluded"), Total Runs. Below, one row per member with the columns Role,
Lecture Progress, Total Test Score, Avg. Quiz/Exercise Score, Completions,
Run/Submit Count, Time Programmed, Enroll Date, Enroll End Date, EPS. A search
box, a role filter and a Course Report download sit above it.

**Lecture level.** A summary table of the lecture's quizzes (Avg. Score, Avg.
Runs, Avg. Submission), then a wide grid: one row per member and one column
per material, all 27 of them, reading pages included. Each column header has a
Tutoring button. Quiz columns split into Score and submitCount. What a cell
shows for a reading page could not be seen without a student row.

A left tree switches between "All Lectures" and a single lecture, and a second
tab lists members.

## What is left to do in Cove

From reading Cove's schema and shared code. The rendered Cove pages were not
compared side by side, so items marked "check" need a look in the running app.

1. **A course type for web courses.** `Course.language` is `PYTHON` or
   `C_CPP` and nothing else, so a web course would be created and badged as
   Python. Add a third value (for example `WEB`) that offers no coding
   exercise language and shows its own badge.

2. **Two-pane text pages.** `ExplanationMaterial.body` is one HTML document
   and the sanitizer has no layout element, so the DM-WB-2 split pages cannot
   be reproduced. Either add a second body (a "reference" pane) to the
   explanation, or accept stacking the reference code under the instructions.

3. **Moving 348 materials.** The Excel import only has sheets for structure,
   problems, solutions, test cases and hints. It cannot create explanations,
   PDFs, quizzes or videos. Without an importer, every page is authored by
   hand. This is the largest item. Whether Elice can export these courses was
   not checked.

4. **Text page formatting, check.** The explanation sanitizer already allows
   what the Elice pages use: HTML, CSS and JavaScript code blocks, images
   including GIF, text and background colours, alignment and tables. Font size
   stops at 32px. Check that a full-width coloured banner and the "file name
   above code block" pattern look right in the editor and the student page.

5. **Visit-based progress, check.** Elice counts every material in "11 / 27"
   and ticks a page once it is opened. Cove's outline lists explanations and
   PDFs, but no completion write was found in the explanation service.
   Confirm that opening a text page or PDF marks it done for the student.

6. **Quiz layout, check.** Cove's multiple choice has a passage
   (`problemDescription`), a question and options, single or multiple
   selection. Confirm the student page puts passage and answers side by side
   and collapses sensibly on a phone.

7. **PDF viewer, check.** Confirm zoom, page jump and download exist for the
   student, since the Elice slides rely on them.

## Not needed for parity

An in-browser HTML/CSS/JS editor with live preview, and automatic checking of
web pages. Elice does not provide either in these courses. They would be an
improvement over Elice, not a match for it.

## Suggested order

1. Course type `WEB` (small, unblocks creating the courses correctly).
2. Check items 4 to 7 in the running app by hand-building one lecture of
   DM-WB-1 (PDF, practice page, mission page, quiz) and fix what differs.
3. Decide on the two-pane page.
4. Decide how the 348 materials get in: hand authoring or an importer.
