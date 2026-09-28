# Authentication QA — 2026-09-28

Branch: `fix/login-auth-qa` (existing login fixes in `c13f2b5`).

Sources:
- [Login QA sheet](https://docs.google.com/spreadsheets/d/1_ZDd7sGiuWnZBc-mnV5fzFmR6IZdccIMJHZ3asyFtVo/edit?gid=794690727#gid=794690727), plus authentication-related account-creation rows.
- [Visual QA slides](https://docs.google.com/presentation/d/1l6yB1eTXZVKzbeR1t-zpdnl_70coIEerFugwchjNfo0/edit), slides 3, 5–8 and 46, inspected as images along with the slide text and notes.

## Branch update

The checkout was clean. Fetched origin and switched from `docs/cove-v2-korean-documentation` to the existing `fix/login-auth-qa`. There is no remote branch named `fix/login-auth-qa`. Its recorded base is `feat/cove-studio-v2`; `git pull --ff-only origin feat/cove-studio-v2` reported already up to date. Did not substitute the unrelated `main` history or rewrite existing commits.

## Corrections

| QA reference | Correction |
| --- | --- |
| ACCOUNT-001-S-018; slide 5 | Signup keeps name, username, staff email and both passwords in mounted client state, including values captured from submitted FormData. Failed submissions retain the fields. Passwords are not returned in action state or stored in browser storage. |
| Slide 5 | Username availability button beside the input uses the existing rate-limited API. Editing the username invalidates its previous check; stale responses cannot approve a different value. Signup requires a successful check; existing server-side uniqueness validation remains authoritative. |
| ACCOUNT-001-S-020 | Password visibility controls are keyboard-focusable, including the shared login/recovery control. |
| ACCOUNT-001-S-001–012, 016; ACCOUNT-002-E-001–003, 007–013 | Signup heading, placeholders and guidance updated in Korean/English; removed requested explanatory text and leading field icons; passwords stacked vertically; staff social divider shortened. The consistent, explicit username rule from ACCOUNT-002-E-010 is used for both account types instead of the student row's repeated underscore wording. |
| ACCOUNT-001-S-014; slide 6 | Campus picker is highlighted with nearby guidance while unselected. Actual available campuses are sorted using Korean collation. |
| Slide 3 | Naver is hidden and direct starts are rejected unless `NEXT_PUBLIC_NAVER_AUTH_ENABLED=true`. Example environments document the default off setting. Google remains available; Kakao's existing gate remains. |
| Slide 7 | After a student account is created, automatic sign-in still takes the student to welcome. If automatic sign-in fails or loses the network, redirect to login with a creation-success notice instead of leaving a spent signup form. Staff email-verification behavior stays intact. |
| Slide 8 | Brand-panel name links to login. |
| ACCOUNT-005-E-003–005, 007 | Username claim uses the corrected placeholder/guidance without an icon. The no-academy message waits until a username has been chosen. |
| Slide 46; LOGIN-006-S-006 | Resume offer moved into the framed academy content column and centered, so the fixed sidebar cannot cover its text. Dismissal and safe return-path validation remain. |

## Validation

- Web authentication, OAuth callbacks, recovery, invitation actions, session utilities and role landing: **177 tests passed** across 17 files.
- API authentication/session tests: **77 tests passed** across 9 files.
- Translation tests: **115 tests passed** across 4 files.
- Web TypeScript, end-to-end TypeScript, targeted ESLint and `git diff --check` passed.
- Browser: existing development session redirected signed-in signup to its academy; profile menu contained logout; logout went directly to login without confirmation; password visibility worked using Tab then Space.
- Browser: username availability succeeded; a deliberately invalid one-character name caused server validation failure without creating an account; screenshot confirmed the other entered fields and both masked passwords remained. Editing the username then disabled signup until rechecked.
- Browser: student/staff field switching and Google-only provider row inspected. English and Korean signup checked at 390px width; desktop and mobile password fields stay stacked, and the availability control fits beside the username.
- Browser testing used local web/API services. The local web process used an empty CAPTCHA site key for validation-only form checks; no environment file or production CAPTCHA setting was changed. Provider/CAPTCHA failure behavior remains covered by automated tests.

Commands:

```sh
pnpm --filter @cove/web test 'src/app/(auth)' src/lib/session src/lib/academy-access-state
pnpm --filter @cove/api exec vitest run src/auth src/student-session
pnpm --filter @cove/i18n test
pnpm --filter @cove/web typecheck
pnpm typecheck:e2e
```

Targeted lint used `eslint --no-ignore` with the changed source paths because the existing ESLint config excludes the entire `(auth)` route group as legacy code.

## Remaining verification and scope limits

- Live Google consent, OAuth provider configuration, email delivery and recovery-link round trips were not exercised. Their application-side routes and error handling passed unit tests.
- The full 30-minute idle expiration and multi-tab flow were not replayed in a live student browser. Session logic passed automated tests; the resume-banner placement was checked in code, not after a live idle expiration.
- The sheet's request to create 31 named campuses is an academy-data operation, not an authentication code correction. No academy records were created or renamed. Sorting applies to campuses that actually exist.
- Account administration, profile editing, classes, courses and exercise functionality are outside this authentication-only pass. Nothing was deployed during the QA pass. Login-sheet completion cells were subsequently updated as recorded below; slide completion labels were not changed.

## Follow-up source review and publication

Re-read the live Google Sheet login rows A1:J41 and account-management rows A1:J51, and the Slides presentation after the user requested commits and a push. At that review, the authentication completion cells were unchecked; slide 3 already had a development-complete label. After the user explicitly requested checking completed feedback, 18 login-sheet checkboxes in column G were set to true and verified by API readback and browser inspection: rows 2–8, 10, 12–18, 36, 38 and 40. Other rows and tabs were left unchanged.

Implementation commit: `b1489a2` (`fix(auth): complete signup and session QA corrections`). This report is committed separately, and both commits are published on `fix/login-auth-qa`.

The feedback is **not entirely complete**:

- ACCOUNT-001-S-014 is partial: Korean sorting is implemented, but the 31 campus records were not created.
- Slide 7 is partial: failed automatic sign-in redirects a newly created student to login with a success notice, but successful automatic sign-in still goes to welcome. The slide requests a login-page transition after successful signup; that broader behavior was not implemented.
- Slide 46 has a code correction but still needs an actual idle-expiration/re-login browser check.
- Live OAuth consent and email/recovery delivery remain unverified. Passing application-side unit tests is not a claim that external provider configuration or delivery works.
- Feedback about account administration and non-authentication features remains outside this branch's QA scope.

The previously reported 369 passing tests and browser checks apply to the committed implementation; subsequent source reviews and supplied-account retesting changed only this report.

## Supplied-account browser retest

Tested the supplied accounts against the deployed site and localhost with the normal CAPTCHA configuration. The user completed the initial localhost Cloudflare challenge; subsequent local challenges passed automatically.

| Account | Localhost result |
| --- | --- |
| `cove-admin` | Password rejected. The same supplied password worked on the deployed site. |
| `mapo-manager` | Username does not exist. |
| `mapo-teamleader1` | Username does not exist. |
| `mapo-teacher1` | Username does not exist. |
| `john10` | Username does not exist. |

A read-only query of the database configured for the local API confirmed that only `cove-admin` exists among these five usernames. No accounts were created and no passwords were changed. These results block successful local role-landing, session and logout verification using the supplied accounts; they do not establish a regression in the login code. Matching local test accounts or the intended QA backend configuration are required.

Localhost displays the corrected login layout and the distinct unknown-username / incorrect-password messages. The deployed site still displays the earlier layout, Naver button, sidebar logout and logout confirmation dialog. Production account checks therefore do not verify deployment of this branch's fixes. No additional sheet rows were marked complete based on these account attempts.

All five supplied accounts successfully signed in on the deployed site: the administrator reached `/admin/academies`; manager, team leader, teacher and student reached `/academy/dlab-mapo` with their expected role shown. Each production session was signed out after its check. This was a login/landing/logout smoke test, not a complete permissions, OAuth or idle-expiration test.
