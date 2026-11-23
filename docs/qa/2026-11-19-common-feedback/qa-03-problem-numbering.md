# QA-03 — Problem numbers differ inside and outside the class

> **Status: fixed on `qa-feedback`.** Beyond the plan, the live-class roster's exercise column (`roster-table.tsx`) also printed the flat course count, so `monitoringRosterExerciseSchema` gained `outlineNumber`. The live classroom outline (optional step 5) was left without numbers.

Registered 2026-11-04 · Jay · P2 · Brooks OK

## Request

Inside a class the curriculum shows `1-1-1`, `1-1-2`, …. The course tree beside the exercise workspace shows `320`, `321`, … for the same problems. Use the **`1-1-1` notation on every screen**.

## Root cause

The workspace course drawer is `OrdinaryCurriculumNavigator` in [curriculum-navigator.tsx](../../../packages/web/src/components/workspace/curriculum-navigator.tsx). It numbers rows with **one running counter across the whole course**:

```ts
// curriculum-navigator.tsx:103-123
for (const courseModule of context?.course.modules ?? [])
  for (const lecture of courseModule.lectures) {
    const materials = [...].sort((a, b) => a.position - b.position);
    for (const material of materials)
      numbers.set(material.materialId, numbers.size + 1);   // ← 1…N over the course
  }
```

In a 600-problem course, a problem in module 2 comes out as `320`. The same map feeds every row in the drawer: exercises at line 353 and line 473, and explanation, video, PDF and manual rows at lines 364 and 372. The counter also changes with `allowPdfNavigation`, so the same problem can get a different number depending on the viewer.

## How the other screens number

| Screen | Code | Number |
| --- | --- | --- |
| Course editor (content › courses) | [lecture-row.tsx:416](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/lecture-row.tsx#L416), [:521](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/lecture-row.tsx#L521) | `module.position-lecture.position-material.position` ✅ |
| Teacher progress, manager, team lead and teacher overviews, submission review | `teacherOutlineNumber()` in [shared/src/content/teacher-progress.ts:683](../../../packages/shared/src/content/teacher-progress.ts#L683), filled on the API from stored positions | same ✅ |
| Student overview resume | `api/src/learn/student-overview.service.ts:614` | same ✅ |
| Student course outline (learn › courses) | [module-section.tsx:202-206](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/courses/[courseId]/_components/module-section.tsx#L202-L206) → `formatProblemOutlineNumber(module.position, lecture.position, index + 1)` | ⚠️ uses the **row index** among visible rows, not `material.position` |
| Workspace course drawer | `curriculum-navigator.tsx` | ❌ flat course counter (`320`) |
| Live classroom outline | [classroom-outline.tsx](../../../packages/web/src/components/classroom/classroom-outline.tsx) | no number shown |

`Material.position` is unique per lecture **across all material types** (`@@unique([lectureId, position])`). [content-positions.ts](../../../packages/api/src/content/content-positions.ts) re-compacts it after every delete or move, so it is gap-free at the authoring level and is the right shared key.

## Decision

The canonical problem number is `{module.position}-{lecture.position}-{material.position}`, taken from stored positions. It is the number the editor and every teacher or manager report already print.

As a result, a student who cannot see a hidden item, or a lecture whose supplementary PDF sits between two problems, can see a gap (`1-1-1`, `1-1-3`). That is intended: the same problem keeps the same number for teachers and students, which is what QA is asking for. Renumbering per viewer is what produced the mismatch in the first place.

## Implementation plan

1. **One formatter.** Reuse `teacherOutlineNumber` from `@cove/shared`, renamed or aliased to `outlineNumber` because it is no longer teacher-only, or keep `formatProblemOutlineNumber` and have it delegate. Every screen should call one function.
2. **Workspace drawer** ([curriculum-navigator.tsx:103-123](../../../packages/web/src/components/workspace/curriculum-navigator.tsx#L103-L123)): change the map's value type to `string` and set
   `numbers.set(material.materialId, outlineNumber({ modulePosition: courseModule.position, lecturePosition: lecture.position, problemPosition: material.position }))`.
   Drop the `numbers.size + 1` counter. The navigator payload already carries all three positions (`navigatorModuleSchema`, `navigatorLectureSchema`, `navigatorExerciseSchema` in [shared/src/content/learn.ts](../../../packages/shared/src/content/learn.ts), plus the explanation, video, PDF and manual summaries), so the API does not change.
   - The fallback at line 353 (`?? row.exercise.position`) should become the full outline number, not a bare position.
   - The `ExerciseRow` prop `number: number` at line 452 becomes `string`.
3. **Student course outline** ([module-section.tsx:202-206](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/courses/[courseId]/_components/module-section.tsx#L202-L206)): pass `row.exercise.position` instead of `index + 1`. This makes the student list match the editor exactly.
4. **Number width** ([material-identity.tsx:35](../../../packages/web/src/components/workspace/material-identity.tsx#L35)): the number span is `w-5` (20px), which fits `320` but clips `1-10-12`. Change it to `min-w-9 w-auto whitespace-nowrap`, with `font-mono text-xs tabular-nums` as today, so the drawer and the outline align the same way the editor's `OutlineNumber` does.
5. **Optional: live classroom outline.** It shows no number today. Adding one needs `position` on `classroomMaterialSchema` and the module and lecture objects in [shared/src/classes/classroom.ts](../../../packages/shared/src/classes/classroom.ts), and in the classroom read's `select`. These are columns on rows already read, so the statement count does not change. Do this only if QA counts the live class view as one of "all screens". It is not in the screenshots.

## Tests

- Add a unit test for the navigator numbering, extracting the map builder into a pure function: two modules × two lectures with mixed material types produce `2-1-3` for the third material of module 2 lecture 1, and the result does not depend on `allowPdfNavigation`.
- Update the `module-section` and `course-outline` specs that assert `index + 1` labels, if any exist.
- Browser check on the QA course (`파이썬 트랙` / `COSPRO 3급 26`): the numbers in the editor, the learn outline and the workspace drawer are identical for the same problem, as student and as teacher.

## Scope

- Web and shared formatting only. **No API read path changes and no statement-count change.**
