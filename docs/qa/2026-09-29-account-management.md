# Account-management QA — 2026-09-29

Branch: `fix/login-auth-qa`.
Source: [QA표, 2. 계정관리](https://docs.google.com/spreadsheets/d/1_ZDd7sGiuWnZBc-mnV5fzFmR6IZdccIMJHZ3asyFtVo/edit?gid=1225886866), A2:I120: all 119 items, regardless of priority. Slides are deferred at the user's request.

## Result and limits

115 items have implementation evidence (source review, automated tests, and local browser checks as specified below). Three remain pending external/data verification; one is superseded by the previously approved OAuth flow. “Implementation verified” does not mean production deployment or a full live test of every external-provider operation. Spreadsheet checkboxes use this same meaning, with per-cell notes describing the evidence.

- Campus creation: the dry-run-first script in `packages/api/src/migrations/qa-campuses/cli.ts` covers all 31 requested names, preserves existing records, requires an explicit database and organization, and audits applied creations. It has not been run against a database. The target question remains unanswered.
- Email confirmation: format validation and server audit are complete. Actual mailbox delivery and confirmation remain untested. Confirmation settings must remain enabled at the provider.
- Social disconnection: buttons, server ownership validation, last-identity protection, and audit are complete. Live unlink requires Supabase Manual Linking and a disposable linked test identity; neither was changed during QA.
- The obsolete unknown-social-account panel stays removed; restoring it would undo the earlier approved authentication correction.

## Changes

- Student signup returns to login with the existing success notice and preserves invitation context.
- Unauthorized academy members receive an applications permission explanation. Rejection reasons are visible and accessible, and a new review starts with fresh role/reason state.
- Issued passwords remask after 30 seconds, blur, hiding the page, navigation, or explicit Hide. Late responses cannot re-expose a hidden password. Plaintext no longer enters the React Query mutation cache.
- My Page stacks password fields, exposes global photo controls at /account, explains theme versus saved preferences, and protects unsaved account/preference drafts on academy switches.
- Global account identity no longer incorrectly says “No academy yet” when memberships exist, and one-membership accounts can use the academy strip.
- Email validation is shared between form/API. Email changes use a user-scoped provider request with audit intent and dispatch records; no admin confirmation bypass or plaintext email in audit payloads.
- Social disconnect resolves identity IDs server-side and refuses the last identity. Operator grant/revoke buttons name their actions; existing last-operator errors remain explicit.

## Verification

- Web authentication, profile, session, student-password UI and audit vocabulary suites: 201 tests passed.
- API profile, identity, applications, invitations, student credential, operator and recovery suites: 76 tests passed.
- Shared profile/phone/email validation suites: 27 tests passed.
- EN/KO translation suites: 115 tests passed.
- Web and API TypeScript checks passed; web lint has no errors (existing repository warnings remain).
- Local browser: seeded manager and teacher login/logout; global and academy My Page; password field geometry; global photo controls; preference guidance; unsaved draft warning/discard; manager empty applications list; teacher permission denial; student email DOM removal; staff email appearance; stacked signup passwords and tabbable visibility toggles; duplicate username availability feedback preserves the entered name.
- No production deployment, account creation, password change, email change, social unlink, destructive account operation, role grant, or campus import was performed in this pass.

Spreadsheet readback confirmed 115 checked rows, pending rows 15/96/100, superseded row 27, all 119 evidence notes, and preserved BOOLEAN validation. Google-rendered checkbox and note views were visually verified. Original feedback and priorities were not changed.

## Item-by-item evidence

| Sheet row | QA ID | Priority | Status | Evidence / remaining work |
| --- | --- | --- | --- | --- |
| 2 | ACCOUNT-001-S-001 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 3 | ACCOUNT-001-S-002 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 4 | ACCOUNT-001-S-003 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 5 | ACCOUNT-001-S-004 | — | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 6 | ACCOUNT-001-S-005 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 7 | ACCOUNT-001-S-006 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 8 | ACCOUNT-001-S-007 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 9 | ACCOUNT-001-S-008 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 10 | ACCOUNT-001-S-009 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 11 | ACCOUNT-001-S-010 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 12 | ACCOUNT-001-S-011 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 13 | ACCOUNT-001-S-012 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 14 | ACCOUNT-001-S-013 | — | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 15 | ACCOUNT-001-S-014 | P3 | Pending | Pending data import: Korean sorting exists and the 31-campus dry-run import is prepared. Database/organization target has not been selected; no campuses created. |
| 16 | ACCOUNT-001-S-015 | — | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 17 | ACCOUNT-001-S-016 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 18 | ACCOUNT-001-S-017 | — | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 19 | ACCOUNT-001-S-018 | P1 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 20 | ACCOUNT-001-S-019 | — | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 21 | ACCOUNT-001-S-020 | P1 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 22 | ACCOUNT-002-E-001 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 23 | ACCOUNT-002-E-002 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 24 | ACCOUNT-002-E-003 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 25 | ACCOUNT-002-E-004 | — | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 26 | ACCOUNT-002-E-005 | — | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 27 | ACCOUNT-002-E-006 | — | Superseded | N/A — superseded by the earlier approved OAuth flow: unknown social users go to staff signup. The old no-Cove-account panel was intentionally removed. |
| 28 | ACCOUNT-002-E-007 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 29 | ACCOUNT-002-E-008 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 30 | ACCOUNT-002-E-009 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 31 | ACCOUNT-002-E-010 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 32 | ACCOUNT-002-E-011 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 33 | ACCOUNT-002-E-012 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 34 | ACCOUNT-002-E-013 | P2 | Implementation verified | Signup form source and local browser review; auth action tests. No new account was created in this pass. |
| 35 | ACCOUNT-003-E-001 | P3 | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 36 | ACCOUNT-003-E-002 | — | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 37 | ACCOUNT-003-E-003 | — | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 38 | ACCOUNT-003-E-004 | — | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 39 | ACCOUNT-003-E-005 | — | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 40 | ACCOUNT-003-E-006 | — | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 41 | ACCOUNT-003-E-007 | — | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 42 | ACCOUNT-004-E-001 | P3 | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 43 | ACCOUNT-004-E-002 | — | Implementation verified | Application UI/source review and API approval/rejection tests. Manager empty list and teacher permission denial checked in localhost. |
| 44 | ACCOUNT-005-E-001 | — | Implementation verified | Welcome/username source review and authentication destination tests. |
| 45 | ACCOUNT-005-E-002 | — | Implementation verified | Welcome/username source review and authentication destination tests. |
| 46 | ACCOUNT-005-E-003 | P2 | Implementation verified | Welcome/username source review and authentication destination tests. |
| 47 | ACCOUNT-005-E-004 | P2 | Implementation verified | Welcome/username source review and authentication destination tests. |
| 48 | ACCOUNT-005-E-005 | P2 | Implementation verified | Welcome/username source review and authentication destination tests. |
| 49 | ACCOUNT-005-E-006 | — | Implementation verified | Welcome/username source review and authentication destination tests. |
| 50 | ACCOUNT-005-E-007 | P2 | Implementation verified | Welcome/username source review and authentication destination tests. |
| 51 | ACCOUNT-006-E-001 | — | Implementation verified | Welcome/username source review and authentication destination tests. |
| 52 | ACCOUNT-007-E-001 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 53 | ACCOUNT-007-E-002 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 54 | ACCOUNT-007-E-003 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 55 | ACCOUNT-007-E-004 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 56 | ACCOUNT-007-E-005 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 57 | ACCOUNT-008-E-001 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 58 | ACCOUNT-008-E-002 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 59 | ACCOUNT-008-E-003 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 60 | ACCOUNT-008-E-004 | — | Implementation verified | Invitation page/component review and invitation action/API tests; no real invitation accepted. |
| 61 | ACCOUNT-009-E-001 | — | Implementation verified | Recovery UI/action/API tests and source review; email delivery and real device revocation not exercised. |
| 62 | ACCOUNT-009-E-002 | — | Implementation verified | Recovery UI/action/API tests and source review; email delivery and real device revocation not exercised. |
| 63 | ACCOUNT-009-E-003 | — | Implementation verified | Recovery UI/action/API tests and source review; email delivery and real device revocation not exercised. |
| 64 | ACCOUNT-009-E-004 | — | Implementation verified | Recovery UI/action/API tests and source review; email delivery and real device revocation not exercised. |
| 65 | ACCOUNT-009-E-005 | — | Implementation verified | Recovery UI/action/API tests and source review; email delivery and real device revocation not exercised. |
| 66 | ACCOUNT-009-E-006 | — | Implementation verified | Recovery UI/action/API tests and source review; email delivery and real device revocation not exercised. |
| 67 | ACCOUNT-009-E-007 | — | Implementation verified | Recovery UI/action/API tests and source review; email delivery and real device revocation not exercised. |
| 68 | ACCOUNT-009-E-008 | — | Implementation verified | Recovery UI/action/API tests and source review; email delivery and real device revocation not exercised. |
| 69 | ACCOUNT-010-E-001 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 70 | ACCOUNT-010-E-002 | P2 | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 71 | ACCOUNT-010-E-003 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 72 | ACCOUNT-010-E-004 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 73 | ACCOUNT-010-E-005 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 74 | ACCOUNT-010-E-006 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 75 | ACCOUNT-011-M-001 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 76 | ACCOUNT-011-M-002 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 77 | ACCOUNT-011-M-003 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 78 | ACCOUNT-011-M-004 | — | Implementation verified | Password UI/source review and password-change/student-credential service tests. No real passwords changed. |
| 79 | ACCOUNT-012-M-001 | P1 | Implementation verified | Student credential service tests and five rendered component tests: 30-second remasking, blur, navigation, stale response, explicit hide/error. |
| 80 | ACCOUNT-012-M-002 | — | Implementation verified | Student credential service tests and five rendered component tests: 30-second remasking, blur, navigation, stale response, explicit hide/error. |
| 81 | ACCOUNT-012-M-003 | — | Implementation verified | Student credential service tests and five rendered component tests: 30-second remasking, blur, navigation, stale response, explicit hide/error. |
| 82 | ACCOUNT-013-E-001 | — | Implementation verified | Local account browser review and profile concurrency tests. Global photo controls and unsaved account draft discard verified; no photo uploaded. |
| 83 | ACCOUNT-013-E-002 | — | Implementation verified | Local account browser review and profile concurrency tests. Global photo controls and unsaved account draft discard verified; no photo uploaded. |
| 84 | ACCOUNT-013-E-003 | — | Implementation verified | Local account browser review and profile concurrency tests. Global photo controls and unsaved account draft discard verified; no photo uploaded. |
| 85 | ACCOUNT-013-E-004 | — | Implementation verified | Local account browser review and profile concurrency tests. Global photo controls and unsaved account draft discard verified; no photo uploaded. |
| 86 | ACCOUNT-013-E-005 | P2 | Implementation verified | Local account browser review and profile concurrency tests. Global photo controls and unsaved account draft discard verified; no photo uploaded. |
| 87 | ACCOUNT-013-E-006 | — | Implementation verified | Local account browser review and profile concurrency tests. Global photo controls and unsaved account draft discard verified; no photo uploaded. |
| 88 | ACCOUNT-013-E-007 | — | Implementation verified | Local account browser review and profile concurrency tests. Global photo controls and unsaved account draft discard verified; no photo uploaded. |
| 89 | ACCOUNT-013-E-008 | — | Implementation verified | Local account browser review and profile concurrency tests. Global photo controls and unsaved account draft discard verified; no photo uploaded. |
| 90 | ACCOUNT-014-E-001 | — | Implementation verified | Local account browser review: preference guidance, timezone, email display and controls. |
| 91 | ACCOUNT-014-E-002 | P2 | Implementation verified | Local account browser review: preference guidance, timezone, email display and controls. |
| 92 | ACCOUNT-014-E-003 | — | Implementation verified | Local account browser review: preference guidance, timezone, email display and controls. |
| 93 | ACCOUNT-015-E-001 | — | Implementation verified | Local account browser review: preference guidance, timezone, email display and controls. |
| 94 | ACCOUNT-015-E-002 | — | Implementation verified | Local account browser review: preference guidance, timezone, email display and controls. |
| 95 | ACCOUNT-015-E-003 | P2 | Implementation verified | Shared email validation and provider/profile audit tests; confirmation is requested using the user's token, not an admin bypass. |
| 96 | ACCOUNT-015-E-004 | — | Pending | Implemented and unit-tested, but live email delivery/confirmation and retention of the old address still require a deliverable test mailbox and provider confirmation settings. |
| 97 | ACCOUNT-015-E-005 | P2 | Implementation verified | Shared email validation and provider/profile audit tests; confirmation is requested using the user's token, not an admin bypass. |
| 98 | ACCOUNT-016-E-001 | — | Implementation verified | Connected-account UI review and user-scoped unlink tests; no actual provider disconnected. |
| 99 | ACCOUNT-016-E-002 | — | Implementation verified | Connected-account UI review and user-scoped unlink tests; no actual provider disconnected. |
| 100 | ACCOUNT-016-E-003 | P3 | Pending | Disconnect UI, audit, ownership and last-identity guards implemented and unit-tested. Live unlink remains unverified; Supabase Manual Linking must be enabled and a disposable linked account is needed. |
| 101 | ACCOUNT-016-E-004 | — | Implementation verified | Connected-account UI review and user-scoped unlink tests; no actual provider disconnected. |
| 102 | ACCOUNT-017-A-001 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 103 | ACCOUNT-017-A-002 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 104 | ACCOUNT-017-A-003 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 105 | ACCOUNT-017-A-004 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 106 | ACCOUNT-018-A-001 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 107 | ACCOUNT-018-A-002 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 108 | ACCOUNT-018-A-003 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 109 | ACCOUNT-019-A-001 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 110 | ACCOUNT-019-A-002 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 111 | ACCOUNT-019-A-003 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 112 | ACCOUNT-019-A-004 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 113 | ACCOUNT-020-A-001 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 114 | ACCOUNT-020-A-002 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 115 | ACCOUNT-020-A-003 | P2 | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 116 | ACCOUNT-020-A-004 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 117 | ACCOUNT-021-A-001 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 118 | ACCOUNT-021-A-002 | — | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 119 | ACCOUNT-021-A-003 | P2 | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
| 120 | ACCOUNT-021-A-004 | P2 | Implementation verified | Admin action UI/source review and platform-user service tests, including last-operator protection. No live account suspended/deleted or privileges changed. |
