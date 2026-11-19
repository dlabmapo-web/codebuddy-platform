# QA-01 — Login: Google / DLAB login buttons

> **Status: fixed on `qa-feedback`.** The logo DLAB supplied was traced into an inline `DlabLogo` SVG component (`currentColor`) rather than a `public/brand` file, so one asset serves both themes. The *Inputs needed* section below is resolved. Google is on the left and DLAB on the right.

Registered 2026-10-27 · Sunny · P2 · Brooks OK

## Request

1. The placement of the Google and DLAB login buttons is unclear.
2. Fix: put Google and DLAB **side by side** so the two methods are easy to tell apart.
3. Build the DLAB button from the **D·LAB logo** (the black boxed mark in the QA sheet) so the brand is recognized at a glance.
4. Make the two buttons **equal-width columns**, and make the row exactly as wide as the existing login (submit) button.

## Current behaviour

| Where | What |
| --- | --- |
| [login/page.tsx:32](../../../packages/web/src/app/(auth)/login/page.tsx#L32) | When `DLAB_SSO_ENABLED=true`, a full-width text link `디랩 계정으로 로그인` (`auth:dlab.login`) sits **above** the ID field. It is a plain `<a href="/sso/start">`. |
| [login-form.tsx:145-146](../../../packages/web/src/app/(auth)/login/_components/login-form.tsx#L145-L146) | Below the submit button there is an `또는` divider, then `<SocialLoginButtons iconOnly />`: one 72px (`w-18`), centered, Google-icon-only button. |
| [social-login-buttons.tsx](../../../packages/web/src/app/(auth)/_components/social-login-buttons.tsx) | Without `iconOnly`, it already renders a `grid-cols-{n}` row of equal buttons (`h-12 rounded-xl border`), which is the layout the QA asks for. Signup uses that mode. |
| [submit-button.tsx](../../../packages/web/src/app/(auth)/_components/submit-button.tsx) | The submit button is `w-full rounded-xl` inside the form column, so the full form width already is "the login button's width". |
| `public/dlab-wordmark.svg` | The only DLAB asset is the orange `D·LAB | CODING` wordmark used in the auth card header ([auth-card.tsx:72](../../../packages/web/src/app/(auth)/_components/auth-card.tsx#L72)). **The black boxed D·LAB mark is not in the repo.** |

`dlabEnabled()` reads a server-only env var ([lib/dlab-sso.ts](../../../packages/web/src/lib/dlab-sso.ts)), so the client form cannot read it itself. It has to be passed down from the page.

## Target layout

```
[ 아이디            ]
[ 비밀번호          ]
[ captcha           ]
[      로그인       ]   ← AuthSubmitButton, w-full
──────── 또는 ────────
[ G  Google ][ D·LAB ]   ← grid-cols-2 gap-3, same total width as 로그인
아직 계정이 없나요? 계정 만들기
```

- DLAB off: Google alone, full width (`grid-cols-1`).
- DLAB on and no social providers: DLAB alone, full width.
- Kakao or Naver turned on later: the same grid with up to 3 columns (`columnsForCount` already covers 1–3). DLAB stays last.

## Implementation plan

1. **Asset**: add the official boxed D·LAB mark as `packages/web/public/brand/dlab-logo.svg`. The mark is solid black, so dark mode needs either a white or knockout variant (`dlab-logo-dark.svg`) or `dark:invert` on the `<img>`. Prefer a real variant if DLAB supplies one.
2. **Login page**: delete the top DLAB link at [page.tsx:32](../../../packages/web/src/app/(auth)/login/page.tsx#L32) and pass `dlabEnabled={dlabEnabled()}` to `<LoginForm>`.
3. **LoginForm**: take `dlabEnabled?: boolean` and render `<SocialLoginButtons dlab={dlabEnabled} />`. Drop `iconOnly` here so the buttons use the full-width grid.
4. **SocialLoginButtons**:
   - Add `dlab?: boolean`. The column count becomes `providers.length + (dlab ? 1 : 0)`.
   - Render DLAB as an `<a href="/sso/start">` with the same row classes (`h-12 rounded-xl border bg-card …`). The route handler does a full-page redirect, so this must not be a server action. Inside it, put `<img src="/brand/dlab-logo.svg" alt="" class="h-6 w-auto">` and set `aria-label={t('dlab.login')}`.
   - Show the provider label (`Google`) at every width on login. Today it is `hidden sm:inline`, which leaves an icon-only Google button beside a logo button on phones. Keep the `hidden sm:inline` behaviour for signup's 3-column case if needed (for example behind a `compactLabels` flag), or decide that 2 columns always fit. At 390px each column is about 170px, which is enough.
   - Optionally show the same `AuthBusyOverlay` (`social.connecting_to`, provider `DLAB`) when DLAB is clicked, so both buttons behave the same while the page is leaving.
   - Return `null` only when there are no providers **and** `dlab` is false (today it returns null on `providers.length === 0`, which would hide DLAB).
5. **Signup**: `signup-form.tsx` also uses `SocialLoginButtons`. Leave it unchanged (no `dlab` prop) unless QA asks. The request is for the login screen only.
6. **i18n**: no new keys. Reuse `auth:dlab.login` for the accessible name.

## Tests

- Extend [social-providers.spec.tsx](../../../packages/web/src/app/(auth)/_components/social-providers.spec.tsx):
  - Google + DLAB renders `grid-cols-2`, and the DLAB link targets `/sso/start` and has the localized accessible name.
  - DLAB only renders `grid-cols-1` and does not return null.
  - Google only renders `grid-cols-1` with no DLAB link.
- Check that `e2e/specs/dlab-sso.spec.ts` still finds the DLAB entry. Update its locator if it looked for the old top text link.
- In the browser, log in with ID and password, Google, and DLAB (on a local `DLAB_SSO_ENABLED=true`), in KO and EN, light and dark, at desktop width and at 390px. The row's left and right edges must line up with the 로그인 button.

## Inputs needed

- **Official D·LAB boxed logo, vector (SVG)**, plus a dark-mode variant. The image in the QA PDF is raster. Do not trace it, and do not substitute the orange wordmark.
- Confirm the column order. The QA text says "구글 왼쪽이나 오른쪽으로". This plan puts Google left and DLAB right.

## Scope

- Web only. No API, database, or statement-count changes.
