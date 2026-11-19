# QA-02 — Left panel: '개요' (Overview) menu

Registered 2026-10-27 · Sunny · P2 · Brooks OK

## Request

Hide the `학원 › 개요` menu item in the studio's left panel (the item crossed out in the screenshot).

## Status: already fixed, verify and close

Commit `a0201d94` *fix(studio): bypass overview and route members to class work* (2026-11-05) did the following:

- Removed the `overview` group (`group.overview` / `link.overview`, `LayoutDashboard`) from `studioNavGroups` in [studio-sidebar.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-sidebar.tsx).
- Made the academy root `/academy/{slug}` redirect to each role's work page instead of rendering the overview ([(framed)/page.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/page.tsx), [lib/academy-entry.ts](../../../packages/web/src/lib/academy-entry.ts)):
  - Manager and Team Lead go to `/classes`.
  - Teacher goes to `/teach/classes`.
  - Student goes to `/learn/classes`.
- Sent the academy switcher and the SSO callback to the same entry path.
- Added a test that the sidebar no longer exposes `link.overview` ([studio-sidebar.spec.ts:101](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-sidebar.spec.ts#L101)).

The commit is in every tag from **v2.0.51** on. The QA screenshot (10-27) predates it, and the QA-04 screenshot (11-06) already shows the sidebar without 개요.

## Remaining actions

1. **Verify in production** as a manager, team lead, teacher and student:
   - There is no 개요 row in the sidebar.
   - Opening `/academy/{slug}` lands on the role's page.
   - Switching academies does not flash the overview.
2. **Tell QA it is fixed** and mark the sheet row done.
3. **Open question: the applicant lobby.** A user whose join application is still pending sees a separate lobby rail ([lobby-nav.ts:103-109](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/lobby/lobby-nav.ts#L103-L109)). Its first section is also labelled 개요 (`lobby:section.overview.heading`). That page is the applicant's status page (pending, approved or rejected), not the academy dashboard the QA item refers to. **Recommendation: keep it**, but confirm with QA. If it should go, rename the label (for example to `신청 현황`) rather than remove the section, because the lobby has no other page that shows the application state.

## Optional cleanup (no user-visible change)

The `nav:group.overview` and `nav:link.overview` locale keys are now unused. Remove them only if the i18n key-usage test does not depend on them. Otherwise leave them.
