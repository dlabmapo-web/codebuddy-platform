# Common QA feedback (공통 시트) — 2026-11-19

Source: `QA_Feedback_공통.pdf`, the shared (공통) sheet. It holds four items, registered 2026-10-27 to 11-06, and all four were approved by Brooks.

Branch: `qa-feedback`, created from `feat/cove-studio-v2` at `05bf4436`. The local branch and `origin/feat/cove-studio-v2` were identical after `git fetch`, so there was nothing to pull. There is no branch named `v2`. `feat/cove-studio-v2` is the v2 integration branch and is checked out in the `codebuddy-platform-release-v2.0.63` worktree, so `qa-feedback` was branched from the remote ref instead.

| ID | Sev | Item | Status | Plan |
| --- | --- | --- | --- | --- |
| QA-01 | P2 | Login: Google / DLAB buttons in two equal columns, with the DLAB logo | **Fixed on this branch** | [qa-01-login-buttons.md](qa-01-login-buttons.md) |
| QA-02 | P2 | Left panel: hide '개요' (Overview) | **Already fixed** in `a0201d94`, first shipped in v2.0.51; verify in production | [qa-02-overview-menu.md](qa-02-overview-menu.md) |
| QA-03 | P2 | Problem numbers differ inside and outside the class (`1-1-1` vs `320`) | **Fixed on this branch** | [qa-03-problem-numbering.md](qa-03-problem-numbering.md) |
| QA-04 | P1 | My Page appears twice (header avatar and the left panel footer) | **Fixed on this branch** | [qa-04-my-page-duplicate.md](qa-04-my-page-duplicate.md) |

## What was implemented (2026-11-19)

- **QA-01**: DLAB supplied the boxed D·LAB mark as a raster image. It was traced by hand into an inline SVG, `DlabLogo` in `provider-icons.tsx`. Against the supplied image, 2.8% of ink pixels differ, all sub-pixel edge fringe. It uses `currentColor`, so it turns white in dark mode without a second asset. The DLAB text link above the form was removed. `SocialLoginButtons` takes a `dlab` flag passed from the server and renders Google and DLAB as two equal `h-12` columns below the 또는 divider, spanning the 로그인 button. Signup is unchanged.
- **QA-02**: no change.
- **QA-03**: the workspace drawer numbers every material `module-lecture-material` from stored positions with the shared `teacherOutlineNumber`, in place of a running course count. The student course outline uses the stored position instead of the row index. The live-class roster's exercise column shows the new `outlineNumber` field, while the flat `number` stays as its sort key. The number column widens to fit `2-10-12`. The roster read selects three more position columns on rows it already reads, so its **statement count is unchanged**.
- **QA-04**: the My Page row was removed from the studio rail and from the platform console rail, and the now-unused `MyPageRow` component was deleted. The console's header avatar now links to `/account?from=admin`, so the back link still returns to the console.

## Decisions taken

- **QA-02**: the applicant lobby's own 개요 section was kept. It is the applicant's status page, not the academy overview.
- **QA-03**: gaps from hidden items are accepted (`1-1-1`, `1-1-3`), so every screen shows the same number for the same item.
- **QA-04**: the platform console rail also dropped its My Page row, for one consistent rule.

## Verification for every item

```sh
pnpm --filter @cove/web typecheck
pnpm --filter @cove/web test <touched spec paths>
pnpm --filter @cove/i18n test        # if locale keys change
pnpm typecheck:e2e                   # if e2e specs change
```

Check in the browser in Korean and English, in light and dark themes, at desktop width and at 390px. Do not run `next build` for `@cove/web` while the dev server is running. Stop any API process on port 4000 afterwards.
