# Implementation plan — Teacher overview and Student analytics redesign

**Spec:** `docs/superpowers/specs/2026-08-14-teacher-overview-student-analytics-redesign.md`

**Date:** 2026-08-14

Spec §15 requires that every file be classified before edits begin. This is that
inventory. It covers the uncommitted implementation built against the superseded
`2026-08-13-teacher-academy-overview-design.md`.

## Retain unchanged — reusable data foundation

The active-learning stack in §8 is already built to this specification and is
not touched:

- `packages/api/prisma/schema.prisma` — `StudentCourseLearningDay`,
  `LearningActivityFlush`
- `packages/api/prisma/migrations/20260813120000_learning_activity_days/`
- `packages/api/src/teach/learning-activity.accumulator.ts` (+ spec)
- `packages/api/src/monitoring/monitoring.gateway.ts` (+ spec),
  `monitoring.module.ts` — heartbeat → accumulator, interval close on
  disconnect and course change
- `packages/api/src/classes/assigned-class-access.ts`
- `packages/api/src/teach/teacher-attention.ts`,
  `teacher-progress-access.service.ts`, `teacher-progress.repository.ts`,
  `teacher-progress.service.ts`
- `packages/shared/src/content/academy-time.ts`
- `packages/web/src/lib/monitoring/student-presence.tsx`,
  `use-student-monitoring.ts`

## Retain unchanged — reusable generic UI

- `packages/web/src/components/studio/chart.tsx` — the shared chart primitive
- `packages/web/src/components/studio/data-table.tsx` — already supports the
  server-driven `manual` mode §7.3 needs
- `_components/teacher-overview/overview-primitives.tsx` — `Panel`, `Duration`,
  `Percent`, `Meter`, `EmptyState`, `SectionUnavailable`, `DataGrid`, `Th`,
  `Td`, `CurriculumPath`

## Extend

- `packages/api/src/teach/teacher-overview-access.service.ts` — add the
  dependent module/lecture/problem narrowing §5.4 needs, without weakening the
  class/course authorization it already proves
- `packages/api/src/teach/teacher-overview.repository.ts` — add revision-aware
  period scores (§7.4), lecture readiness with eligible/attempted counts
  (§6.8), and difficult problems carrying total submissions (§6.9)
- `packages/api/src/teach/teach.module.ts`, `packages/api/src/orpc/router.ts`,
  `packages/api/src/orpc/context.ts` — register the student-list unit

## Replace — superseded overview presentation and contract

- `packages/shared/src/content/teacher-overview.ts` — the response becomes the
  metrics ledger, participation rows, two five-row previews, readiness lowest
  three, and difficult problems top five. The teaching brief, class momentum,
  learning-momentum series, error patterns, and the `usage` participation lens
  are removed; `high_effort_low_mastery` becomes `low_participation` to match
  the §6.3 reason list.
- `packages/api/src/teach/teacher-overview.service.ts` — reassembled against
  the new contract
- `_lib/overview-url.ts` — the `participation` parameter is dropped during
  canonicalization (§5.3)
- `_components/teacher-overview/student-participation.tsx` — the grouped bar
  chart alone
- `_components/teacher-overview/curriculum-sections.tsx` — readiness at three
  rows with eligible/attempted/ready, difficult problems with submissions
- `_components/teacher-overview/teacher-overview-workspace.tsx` — full-width
  single-column order
- `packages/i18n/src/locales/{en,ko}/teaching.json`

## Delete after equivalent coverage passes

- `_components/teacher-overview/teaching-brief.tsx`
- `_components/teacher-overview/momentum-sections.tsx`
- `_components/teacher-overview/summary-cards.tsx`

## Add

- `packages/shared/src/content/teacher-students.ts` (+ spec) — student list
  contract, sort keys, deterministic comparators, `Order` derivation
- `packages/shared/src/api/orpc/academy-teacher-students.contract.ts`
- `packages/api/src/teach/teacher-students.repository.ts`,
  `teacher-students.service.ts` (+ spec), `teacher-students.router.ts`
- `_components/teacher-overview/teaching-queue.tsx` — the signature surface
- `_components/teacher-overview/metrics-ledger.tsx`
- `_components/teacher-overview/student-previews.tsx`
- `teach/students/page.tsx`, `teach/students/_components/student-analytics.tsx`,
  `teach/students/_lib/students-url.ts` (+ spec),
  `teach/students/_hooks/use-teacher-students.ts`
- `packages/web/src/lib/session/inactivity.ts` (+ spec) — pure timer rules
- `packages/web/src/lib/session/inactivity-guard.tsx` — countdown, dialog,
  cross-tab deadline, forced sign-out
- `packages/i18n/src/locales/{en,ko}/session.json`
