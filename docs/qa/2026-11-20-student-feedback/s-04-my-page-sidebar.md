# S-04 — "My Page" in the student's left sidebar

> **Already fixed.** `37b9491a` *fix(studio): reach My Page from the header only (QA-04)* (2026-11-19, in v2.0.70) removed the My Page row from the academy sidebar and the platform console sidebar for every role. My Page is reached from the avatar menu in the header.

Registered 2026-10-27 · Sunny · P2

## Request

Student accounts had a "마이 페이지" row at the bottom of the left sidebar. Remove it.

## What is there now

- [studio-sidebar.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-sidebar.tsx) has no My Page row and no `SidebarFooter`. A student's groups are 내 반, 제출 기록 and, when the academy runs points, 내 포인트.
- The header avatar menu keeps My Page ([header-controls.tsx](../../../packages/web/src/components/studio/header-controls.tsx)).
- The QA screenshot (2026-10-27) predates the fix.

## Remaining actions

1. localhost as a student: no My Page row in the sidebar, expanded or collapsed to icons, desktop and 390px (mobile sheet). The avatar menu opens My Page.
2. After v2.0.70 is on production: the same check there, then close the item.

## Scope

None unless the check fails.
