# QA-001 — Existing problem opens with a blank editor

> **QA-001b implemented on `qa-feedback` (2026-11-20):** `workspace.tsx` seeds `initialLatest`/`initialResult` from `navigation.workspace`.

> **Status: fixed.** QA's sheet records the fix on 2026-10-28. Checked again on localhost on 2026-11-20. While checking it, QA-001b below was found.

Registered 2026-10-27 · Brooks · P0

## Request

A problem the student had already worked on opened with an empty editor. The student's saved code should show.

## Check on localhost (2026-11-20)

Signed in as the development student, class `수동 채점 체험반`, course `파이썬 미션 · 수동 채점 체험` (20 saved drafts on My classes).

| How the problem was opened | Saved code shown |
| --- | --- |
| Mission 1 from "Continue solving" on My classes | yes, 22 lines |
| Mission 2 with **Next** inside the workspace | yes, its own code |
| Mission 3 from the course drawer | yes, its own code |
| Mission 3 after a full reload | yes |

## Remaining actions

1. Check once on production as a student with a saved draft, then tell QA it is fixed.

---

## QA-001b — Wrong "Last submit" score after moving between problems

Found 2026-11-20 on localhost · P1 (students and teachers can read a score that belongs to another problem)

### Symptom

Moving inside the workspace with Next, Previous or the course drawer keeps the bar above the console on the **first** problem's result.

| Mission 3 | Last submit score | Last submit time |
| --- | --- | --- |
| Reached with Next or the drawer from Mission 1 | 79 / 100 (Mission 1's) | Nov 12, 3:22:01 PM (Mission 1's) |
| After a reload | 50 / 50 | Nov 12, 2:57:08 PM |

### Root cause

In-workspace navigation keeps the page mounted and swaps the shown problem through `useExerciseNavigation` (`navigation.workspace`). `bootstrap` stays the problem the page was first loaded on.

[workspace.tsx:174-181](../../../packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/workspace.tsx#L174-L181) seeds the submission hook from `bootstrap`:

```ts
initialResult: selected?.result ?? bootstrap.workspace.latestResult ?? null,
initialLatest: bootstrap.workspace.latestSubmission,
```

`useLatestSubmission` keys its query by `materialId`, but uses the seed as `initialData` for the **new** key, and `useSubmissionStatus` treats a settled seed as fresh (`staleTime: SERVER_READ_FRESH_MS`) ([use-submission-status.ts](../../../packages/web/src/components/workspace/use-submission-status.ts)). So Mission 1's result is stored as Mission 3's and is not read again.

`selected` a few lines above already guards against this case by comparing material ids. `initialLatest` and `initialResult` were missed.

### Fix

1. Seed from the problem that is shown, not the one first loaded:
   - `initialLatest: workspace.latestSubmission ?? null`
   - `initialResult: selected?.result ?? workspace.latestResult ?? null`

   `navigation.workspace` is the full `LearnExerciseBootstrap['workspace']` fetched for the destination, and the schema carries both fields ([learn.ts:304-305](../../../packages/shared/src/content/learn.ts#L304-L305)). If the transition payload leaves them out, pass `null` when `workspace.exercise.materialId !== bootstrap.workspace.exercise.materialId`, so the hook reads the server instead of trusting a seed.
2. Check `staff-workspace.tsx`, `quiz-workspace.tsx` and `manual-workspace.tsx` for the same pattern and fix them the same way.

### Tests

- Extend `use-exercise-navigation.spec.tsx` or add a workspace spec: after a transition from material A (latest 79/100) to material B (latest 50/50), the summary shows 50/50.
- Browser: as a student, open Mission 1, then Next to Mission 2 and the drawer to Mission 3; each shows its own score and time, matching a reload.

### Scope

Web only. No API or statement-count change.
