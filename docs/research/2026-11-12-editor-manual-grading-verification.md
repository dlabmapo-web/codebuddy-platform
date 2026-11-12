# Manual grading in the editor workspace

Date: 2026-11-12

The full-screen student-work review now keeps the course/problem list, problem description and submitted code in the existing workspace. Manual grading opens in the editor's lower pane, beside private Run output. It no longer takes up a page-level card above the code.

## Behavior

- The submitted code starts read-only. **Try changes** enables a private test copy; restoring returns to the selected submission. Grades always refer to that saved submission.
- The lower pane shows the assessment status, score/maximum and inclusion policy. Score and feedback appear together, with completion and **Publish grade / Update grade** docked below the scrolling form.
- Corrections still require a reason. Decimal scores, maximum validation, version checks, publication permissions and review history use the existing controller/API.
- Switching Run/Grade or opening review history keeps the grading draft mounted. Unsaved grading edits join the existing navigation/unload guard.
- The description and terminal dividers support keyboard resizing. The Run/Grade tabs support arrow keys. Phones use **Problem / Code & grading** tabs. The course list starts collapsed below the desktop breakpoint; its trigger opens the existing overlay, and Escape closes it and restores trigger focus.
- Backend services, SQL, authorization and polling are unchanged. No additional review fetch runs on mount; the pane uses the assessment already returned with the submission. Explicit History/Refresh retains the existing review read.

Design: [editor manual grading](../superpowers/specs/2026-11-12-editor-manual-grading-design.md).

## Validation

| Check | Result |
| --- | --- |
| Web full suite | 1,592 passed, 211 files |
| Grading controller refresh/history/dirty-state checks | 2 passed |
| Web typecheck | Passed |
| E2E typecheck | Passed |
| Changed web-file ESLint | Passed without warnings |
| i18n catalogs and checks | 144 passed; no stale keys/copy markers |
| Fresh disposable database integration checks | 26 passed, four files |
| Chromium/WebKit full-screen workflow and geometry | Both passed; 5.5 minutes total |

Browser verification uses the isolated PostgreSQL/Redis/auth fixture harness:

```sh
bash packages/api/scripts/test-manual-programming.sh
```

The browser scenario covers Teacher publication, Team Lead and Manager corrections, student live results, correction history, unsaved-edit navigation, draft retention between tabs, keyboard resizing, maximum validation, 1440×1000 and 1280×800 workspace bounds, and 390×844 mobile grading. Korean/dark and English/light remain covered.

The first browser attempt timed out during the existing author-save return navigation before opening the review workspace. Trace showed successful saves and slow development route responses; the assertion now allows 60 seconds for that cold navigation. The next visual run exposed a mobile course list left open over the editor and developer controls overlapping the docked buttons. Responsive/Escape handling now closes that list, React Query debug controls are suppressed on staff full-screen workspaces as on student lessons, and the isolated E2E server disables only the floating Next.js indicator (runtime errors still surface). Desktop capture was unavailable, and a separate localhost sign-in could not proceed past its disabled CAPTCHA-gated button; no grade was written to the user's development submission. The final phone-width adjustment removes the fieldset's intrinsic minimum width and hides the redundant submitted-code label in the narrow editor toolbar. That final appearance was visually inspected in WebKit; the earlier Chromium mobile image was omitted because it predates this width adjustment. The final E2E source also checks that the decimal score input and feedback textarea stay inside the phone viewport.


## Screenshots

All images use disposable local fixtures.

- [Desktop, 1440×1000](../qa/assets/2026-11-12-editor-manual-grading/chromium-teacher-workspace-1440.png)
- [Desktop, 1280×800](../qa/assets/2026-11-12-editor-manual-grading/chromium-teacher-workspace-1280.png)
- [Phone grading, 390×844, WebKit](../qa/assets/2026-11-12-editor-manual-grading/webkit-teacher-workspace-mobile.png)
- [Published correction history](../qa/assets/2026-11-12-editor-manual-grading/chromium-manager-grading-history.png)
- [Korean/dark correction history, WebKit](../qa/assets/2026-11-12-editor-manual-grading/webkit-manager-grading-history-ko-dark.png)

No API/database schema, service query counts, or production deployment changed. The original large card presentation remains available for the separate legacy direct-submission route; the reported full-screen student-work review uses the terminal presentation.
