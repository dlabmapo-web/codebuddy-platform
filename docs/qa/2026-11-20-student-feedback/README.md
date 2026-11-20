# Student QA feedback (학생 시트) — 2026-11-20

Source: `QA_Feedback_학생.pdf`, the student (학생) sheet. It holds eleven items, registered 2026-10-27 to 11-06 by Sunny and Jay, all marked "Brooks 검토 OK".

This batch plans the seven UI items. S-06, S-07, S-10 and S-11 are features or realtime bugs and get their own plans later.

| ID | Sev | Item | Status (2026-11-20) | Plan |
| --- | --- | --- | --- | --- |
| S-01 | P2 | Two exits in a lesson: "코스로 돌아가기" (bottom left) and "나가기" (top right) | **Fixed on `qa-feedback`**; checked on localhost | [s-01-duplicate-exit.md](s-01-duplicate-exit.md) |
| S-02 | P2 | Course card reads "문제 95개 · 15 PDF"; wanted "이론 15개 · 문제 95개" | **Fixed on `qa-feedback`** (option A); checked on localhost, ko and en | [s-02-course-card-counts.md](s-02-course-card-counts.md) |
| S-03 | P2 | Unlabelled "92" in the module header | **Fixed on `qa-feedback`**; checked on localhost | [s-03-module-count.md](s-03-module-count.md) |
| S-04 | P2 | "My Page" in the student's left sidebar | **Already fixed** in `37b9491a` (2026-11-19, v2.0.70); checked on localhost, verify on production | [s-04-my-page-sidebar.md](s-04-my-page-sidebar.md) |
| S-05 | P1 | Short-answer hint shown twice (above the box and as its placeholder) | **Fixed on `qa-feedback`**; checked on localhost | [s-05-short-answer-hint.md](s-05-short-answer-hint.md) |
| S-06 | P2 | No exam (midterm/final) feature | Product decision first | — |
| S-07 | P1 | Grading mode that tells the student a teacher grades it by hand | **Already fixed** in `4d6881de` (2026-11-12, v2.0.62): submission policy **수동 채점** (`MANUAL_REVIEW`) beside 자유 연습 and 자동 채점; the student sees "코드를 제출하면 담당 선생님이 확인한 후 점수와 피드백을 등록합니다" and "수동 채점 대기" instead of a score, and staff record score and feedback. Verify on production and close | — |
| S-08 | P1 | "보충 자료" strip under the PDF reader | **Fixed on `qa-feedback`**; checked on localhost | [s-08-pdf-supplementary-strip.md](s-08-pdf-supplementary-strip.md) |
| S-09 | P1 | PDF page controls sit above the document; wanted at the bottom | **Fixed on `qa-feedback`**; checked on localhost; compared with Elice | [s-09-pdf-page-controls.md](s-09-pdf-page-controls.md) |
| S-10 | P1 | Student's screen shrinks when a teacher joins it | **Fixed on `qa-feedback`**: the student's own layout is the shared canvas; the teacher mirrors the student's width. Checked on localhost with two sessions; pointers within 1px both ways | [s-10-s-11-live-monitoring.md](s-10-s-11-live-monitoring.md) |
| S-11 | P1 | Student back from a break, without F5, shows as not connected | **Not reproduced** on current code (4 break scenarios recover); likely fixed by `0f74f813` / `e05775a2` (v2.0.64). QA to retest on production | [s-10-s-11-live-monitoring.md](s-10-s-11-live-monitoring.md) |

## Groups

- **Quick removals** (web only, no API, no read-path change): S-01, S-03, S-05, S-08. S-04 needs only a check.
- **Small UI changes**: S-02 (locale keys and one card; no new statement), S-09 (PDF toolbar layout, shared by five screens).

## Decided (2026-11-20)

- **S-02**: "이론" = main PDF documents + explanation materials, one number, before the problem count. Videos stay under "문제" only when they are scored, as they already are in the progress total.

## Implemented on `qa-feedback` (2026-11-20)

| Item | What changed | Verified |
| --- | --- | --- |
| S-01 | `WorkspaceCurriculumNavigator.footer` is optional; the six student lessons no longer pass it; teacher surfaces keep theirs. `navigator.footer_student` and `workspace.back_to_records` removed | localhost: coding (also from Answer records, Leave returns to records), PDF, explanation, video, quiz, short answer |
| S-02 | Card reads `이론 N개 · 문제 N개`; reading-only course shows theory only. `courseSummaryFor` counts only main/both PDFs. `pdf.documents_*` removed, `catalog.theory` added | `course-card.spec.tsx` (4), `course-summary-counts.spec.ts`; localhost as a student: "3 theory lessons · 16 problems" / "이론 3개 · 문제 16개" (1 BOTH PDF + 2 explanations), light and dark |
| S-03 | Unlabelled module count removed | localhost student course page |
| S-04 | — | localhost: sidebar has no My Page; avatar menu has it |
| S-05 | Hint paragraph is `sr-only`; placeholder kept | `assessment-ui.spec.tsx`; localhost: one visible copy, `aria-describedby` still set |
| S-08 | Strip removed; `resources` dropped from `PdfReadResult` and the PDF read; `pdfIsResource` and `content:pdf.resources` removed | localhost: BOTH-placement PDF shows no strip |
| S-09 | Page arrows and page input moved to a bar under the PDF in `PdfCanvas` (all five screens); invalid-page message under it | `pdf-canvas.spec.tsx`; localhost desktop and 390px, ko dark as a student, fullscreen (fallback overlay) with page turning |

**Statement counts.** No read path gained a statement. The PDF read builds the same outline in memory and returns less.

**Live check data (2026-11-20).** The gangnam-dlab course "Library Sync Practice — All Material Types_sync" was assigned to the demo class 파이썬 기초 주말반 for the student check as `woojin-jang`, then unassigned; the class is back to its one course (its "last change" date now reads Nov 20). The student's language and theme were set back to English and light.

**Elice (`dlab.elice.io`, read only).** Elice's PDF reader has one toolbar *under* the page: fit and zoom on the left, ‹ page / total › in the middle, download on the right; the lesson bar (Prev · 20/20 · Next Lecture, Share, Feedback, Fullscreen) sits below it, and nothing sits above the page. Cove now matches the page-turning position; zoom, fit, download and fullscreen are still above the page. Moving them into the bottom bar would match Elice fully and free a row; not done, as QA asked only for page turning.

## Suggested order

1. S-04 check (minutes).
2. S-01, S-03, S-05, S-08: one small web commit each.
3. S-02 after the decision.
4. S-09: largest of the seven; check Elice's PDF reader first.

## Verification for every item

```sh
pnpm --filter @cove/web typecheck
pnpm --filter @cove/web test <touched spec paths>
pnpm --filter @cove/api typecheck     # S-08 if the API field is removed
pnpm --filter @cove/i18n test         # S-01, S-02, S-08 if locale keys change
pnpm typecheck:e2e                    # if e2e specs change
```

Check each item on localhost as a student, in Korean and English, light and dark, at desktop width and at 390px. Compare with Elice (`dlab.elice.io`, read only) where the plan says so. Do not run `next build` for `@cove/web` while the dev server runs. Stop any API process on port 4000 afterwards.
