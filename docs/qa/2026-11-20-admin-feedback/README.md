# Admin QA feedback (관리자 시트) — 2026-11-20

Source: `QA_Feedback_관리자.pdf`, the admin (관리자) sheet. It holds six items, registered 2026-10-27 to 11-06. While checking QA-001 on localhost, a seventh problem turned up and is filed as QA-001b.

The goal set for this batch is to **behave like Elice** wherever QA compared the two. Elice was checked live at `dlab.elice.io` (read only; nothing was created there).

| ID | Sev | Item | Status (2026-11-20) | Plan |
| --- | --- | --- | --- | --- |
| QA-001 | P0 | Existing problem opens with a blank editor | **Fixed**; saved code loads by every route tried on localhost | [qa-001-saved-code.md](qa-001-saved-code.md) |
| QA-001b | P1 | After Next, Previous or the drawer, "Last submit" shows the first problem's score | **Fixed on `qa-feedback`** | [qa-001-saved-code.md](qa-001-saved-code.md#qa-001b--wrong-last-submit-score-after-moving-between-problems) |
| QA-002 | P2 | Image-heavy PDFs over about 4 MB fail with "PDF 처리 제한을 초과했습니다"; also accept PPT/PPTX like Elice | **Fixed on `qa-feedback`**; converter's memory budget needs a decision | [qa-002-pdf-upload-and-ppt.md](qa-002-pdf-upload-and-ppt.md) |
| QA-003 | P1 | Explanation-only material (GIFs keep moving) | **Fixed** in v2.0.59 | [qa-003-explanation-only.md](qa-003-explanation-only.md) |
| QA-004 | P2 | Delete in the course editor does nothing | **Fixed on `qa-feedback`**: managers and team leads delete problems, lectures, modules and courses even with submissions | [qa-004-delete-with-submissions.md](qa-004-delete-with-submissions.md) |
| QA-005 | P3 | Up to 50 test cases; Elice allows 200 | **Fixed on `qa-feedback`** | [qa-005-test-case-limit.md](qa-005-test-case-limit.md) |
| QA-006 | P1 | Imported Elice images break; uploading a replacement failed | Upload fixed in v2.0.53. Copy on save **fixed on `qa-feedback`**; backfill script ready, production run needs a go-ahead | [qa-006-external-images.md](qa-006-external-images.md) |

## Implemented on `qa-feedback` (2026-11-20)

| Item | What changed | Verified |
| --- | --- | --- |
| QA-001b | `workspace.tsx` seeds the last-submit summary from the exercise on screen, not the first one loaded | web typecheck, workspace specs |
| QA-002 | PDF check skips decoding pictures, memory cap grows with the file, one check at a time. PPT/PPTX converted once on upload by a capped Gotenberg container | 11–27 MB image decks that failed now pass; 4 real decks converted and opened in the reader on localhost |
| QA-004 | `deleteStudentWork` removes submissions, manual submissions and their reviews in the delete's transaction; `deleteImpact` counts them for the dialog; the dialog shows the count and any error inline | integration spec on disposable PostgreSQL (6 tests); localhost dialog for a problem and a lecture |
| QA-005 | `maxExerciseTestCases = 200` in the schema, editor, workbook import and library sync | shared schema tests (200 accepted, 201 refused) |
| QA-006 | Problem and explanation saves copy pictures from Elice, Jungol and Biko into the course's storage; `pnpm --filter @cove/api images:backfill` for existing content | unit tests with a fake host and storage; dry run on the dev database |

**Statement counts.** `deleteExercise` with submissions: 38 statements, the same for 1 and 12 submissions. `deleteImpact`: 3 statements. Copy on save: one read and one insert for any number of pictures; none for a statement without outside pictures.

**Decided 2026-11-20.**
- **Memory budget for the 16 GB Lightsail host.** `validate-local.sh` allows 12 GiB of always-on container limits (was 9 GiB, written for the 12 GB Contabo VPS); with `pdf-converter` the stack uses 9.72 GiB. `preflight.sh` now requires a host with at least 15 GiB, so a release can no longer land on a 12 GB host. `deploy.sh` pulls `pdf-converter` before the switchover.
- **Image backfill on production** follows [docs/operations/remote-images-backfill.md](../../operations/remote-images-backfill.md): after this release is live, on a quiet evening, dry run, a trial batch of 20, then the rest — at the latest two weeks before the Elice contract ends.

## Suggested order

1. **QA-001b**: small web fix, wrong scores are visible to students and teachers.
2. **QA-004**: API and web, needs one transaction per delete and a clearer confirm.
3. **QA-002 part 1** (PDF check memory): one option and one limit in `pdf-files.ts`.
4. **QA-005**: schema, editor and grading budget.
5. **QA-006**: copy on save, then a backfill (production run needs its own go-ahead).
6. **QA-002 part 2** (PPT/PPTX): a small converter container that runs once per upload, one at a time, under hard CPU and memory caps; reading stays a direct download from storage. The largest piece.

## Decisions (2026-11-20)

- **QA-004**: deleting a problem, lecture, module or course also deletes its students' submissions and scores, after a confirm that states how many.
- **QA-002**: PPT/PPTX are converted to PDF once at upload, in a separate, capped container; nothing is converted when a deck is read.
- **QA-005**: up to 200 test cases, like Elice.

## Verification for every item

```sh
pnpm --filter @cove/web typecheck
pnpm --filter @cove/api typecheck
pnpm --filter @cove/web test <touched spec paths>
pnpm --filter @cove/api test <touched spec paths>
pnpm --filter @cove/i18n test        # if locale keys change
pnpm typecheck:e2e                   # if e2e specs change
```

Statement counts for any changed read path go in an integration spec against a disposable Docker PostgreSQL (`COVE_INTEGRATION_DATABASE_URL`), never the shared Supabase databases. Check in the browser in Korean and English, light and dark, at desktop width and at 390px. Do not run `next build` for `@cove/web` while the dev server runs. Stop any API process on port 4000 afterwards.
