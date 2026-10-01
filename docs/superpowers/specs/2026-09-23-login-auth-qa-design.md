# Login and authentication QA fixes

Source: [QA표 — 1. 로그인](https://docs.google.com/spreadsheets/d/1_ZDd7sGiuWnZBc-mnV5fzFmR6IZdccIMJHZ3asyFtVo/edit?gid=794690727#gid=794690727).
Branch: `fix/login-auth-qa`, based on `feat/cove-studio-v2`.
The user approved implementing this scope on September 23, 2026.

## Approach

Use the existing auth form, server actions, OAuth callback, and shared profile menu. This keeps the requested behavior consistent across academy, applicant, and platform screens. A separate login redesign or authentication-provider replacement would add unrelated scope.

## QA mapping

| QA entries | Implementation |
| --- | --- |
| LOGIN-001-E-001, 002 | Heading is 로그인; remove the description below it. |
| LOGIN-001-E-003, 004 | Username placeholder is 아이디; remove its leading icon. |
| LOGIN-001-E-005, 006 | Username/password and submit button precede 또는 and the social buttons. |
| LOGIN-001-E-007 | Add 아이디가 기억나지 않으면 학원 선생님께 문의하세요. under the username field. |
| LOGIN-001-E-009 | Remove the first-time social-account explanation. |
| LOGIN-002-E-001, 002 | Password placeholder is 비밀번호; remove its leading lock icon. |
| LOGIN-002-E-003, 005 | Put the recovery link below the password input; remove the student-only hint. |
| LOGIN-002-E-007 | Distinguish an unknown username from a wrong password with the exact requested Korean messages. |
| Unnumbered failed-login row | Keep both inputs in mounted client state, including values entered by autofill, after failure. |
| LOGIN-002-E-008 | Rename the account-creation link 회원가입. |
| LOGIN-003-E-002 | New social users go directly to staff signup with the academy selector; remove the no-account notice. |
| LOGIN-007-E-001, 003 | Remove the confirmation modal, including its student-specific text. |
| LOGIN-007-E-005 | Remove logout from all three sidebars and add it to the existing header profile menu. |

Rows that only describe existing behavior remain regression expectations: username autocomplete, narrow-screen social buttons, Kakao availability, role-based landing, and student inactivity policy. Modal descriptions LOGIN-007-E-002/004 become obsolete with the explicitly requested modal removal.

## Behavior and error handling

- The existing server-side resolver returns `@unresolved.invalid` for unknown usernames. Only Supabase `invalid_credentials` is translated into the specific username/password message. CAPTCHA, provider rate limits, suspension, unconfirmed-email errors, and resolver failures retain their own messages.
- This deliberately reveals username existence, as requested by LOGIN-002-E-007. Legacy email login remains supported with a generic credential error. No password or typed credential is returned in server action state or persisted in browser storage.
- Login accepts nonempty passwords for provider verification; signup still enforces its existing minimum length. A short incorrect login password gets the requested error instead of a signup-policy validation error.
- Social signup clears the provider-only session before redirecting, preventing accidental account bootstrap before academy selection. Invitations and existing-account landing routes are retained.
- Logout guards duplicate activation, shows the busy state outside the closing menu, reports provider/network failure, and preserves Next.js redirect handling. A successful logout replaces the current history entry.
- The English translations accompany the exact Korean QA wording.

## Verification

Authentication action/callback tests cover known and unknown usernames, short passwords, CAPTCHA priority, legacy email sign-in, immediate logout, provider errors, new Google/Naver signup routing, existing users, invitations, expired intents, and cancelled consent. Existing session and landing tests cover unchanged behavior. The operator end-to-end test now selects logout from the profile menu and expects direct navigation to login.

Local HTTP rendering verifies login wording, placeholders, autocomplete, and staff signup selection. Browser visual and real-provider end-to-end verification remain unverified because the browser-control connection timed out twice.

Final checks: 174 web auth/session/landing tests and 115 translation tests passed. Web TypeScript and end-to-end TypeScript checks passed. Targeted lint passed with one pre-existing unused `studentSignupSchema` warning; `git diff --check` passed. Missing installed dependencies were restored from the existing frozen lockfile, and generated route types were regenerated; package versions and the lockfile were unchanged.
