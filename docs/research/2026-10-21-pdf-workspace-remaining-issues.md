# PDF workspace: remaining issues

Recorded: 2026-10-21 (KST).
Status: Deferred for a future batch of tasks; no fixes or deployment requested here.
Observed in production release `v2.0.37` on 2026-10-20.
Evidence: [Production verification report](2026-10-20-v2.0.37-production-verification.md).

## 1. Admin exercise page crashes

- [ ] Fix and verify Admin exercise navigation.

**Reproduce**

1. Sign in as a platform Admin.
2. Open Academy courses → a course containing a PDF/code exercise.
3. Open the exercise title.

**Actual:** The page shows “This page stopped before it finished.” Try again
does not recover it. The browser reports
`useAcademySlug must be used inside an academy route`.

**Expected:** The exercise opens through the Admin route with the correct
platform permissions and valid preview/return links.

**Investigation starting point:** The shared `ExerciseHeader` calls
`useAcademySlug`, although Admin pages render outside the academy route provider.
Review the existing content surface context and the academy-only
return-to-problem link together.

Relevant files:

- `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/exercise-header.tsx`
- `packages/web/src/components/studio/content-base-path-provider.tsx`
- `packages/web/src/components/studio/content-paths.ts`

**Acceptance:** Admin can open and refresh an exercise without crashing; preview
and return navigation stay valid. Academy authoring and Library routes continue
working, without granting Admin student participation or creating staff attempts
merely by inspecting content.

## 2. Hidden reference PDF is unavailable in author preview

- [ ] Allow authorized author preview to render its linked hidden PDF.

**Reproduce**

1. As Manager or Team Lead, create PDF + coding practice.
2. Upload a PDF and save the exercise while both materials remain hidden.
3. Open the exercise in author preview.

**Actual:** The editor opens, but the PDF pane says “The reference PDF is
unavailable.” The standalone staff PDF reader works. Publishing the linked
materials makes the PDF render beside the editor.

**Expected:** Authorized authors can inspect unpublished PDF instructions beside
their code without publishing the material to students.

**Investigation starting point:** `LearnService.buildWorkspace` calls
`referencePdfMetadata`, which omits hidden PDF metadata even for an authorized
preview. Check metadata projection and PDF delivery authorization together.

Relevant files:

- `packages/api/src/learn/learn.service.ts`
- `packages/api/src/documents/pdf-reference.ts`
- `packages/api/src/documents/pdf-document.service.ts`
- `packages/web/src/components/pdf/exercise-reference-pane.tsx`

**Acceptance:** A hidden linked PDF renders in authorized preview. Students and
out-of-scope users still cannot obtain hidden PDF metadata or signed delivery
URLs. Published PDF delivery and editor draft preservation continue working.

## 3. Staff dashboards count ungraded practice in completion totals

- [ ] Make staff completion and grading-audit calculations respect Practice only.

**Reproduce**

1. Create a course with one visible Practice only exercise and one visible
   Automatic exercise.
2. Assign it to a test class and solve the Automatic exercise as its student.
3. Compare Student course/lecture progress with Manager overview → Learning health.

**Actual:** Student progress correctly shows **1 of 1 solved**, while Manager
exercise completion shows **50%**. Team Lead course reach also counts ungraded
practice in its denominator. The platform course list flags the ungraded
exercise under “No tests.”

**Expected:** Practice only remains available as learning content but does not
reduce graded completion or appear as a broken automatic grader.

**Investigation starting point:** Manager completion uses
`entry.materialIds.length` as its assigned-exercise denominator. Trace the shared
analytics projection, Team Lead course reach, and platform grading audit rather
than changing only the displayed percentage.

Relevant files:

- `packages/api/src/manage/manager-overview.service.ts`
- `packages/api/src/manage/manager-overview.repository.ts`
- `packages/api/src/lead/team-lead-overview.service.ts`
- `packages/api/src/lead/team-lead-overview.repository.ts`
- `packages/api/src/learn/curriculum-outline.service.ts` (existing learning behavior)

**Acceptance:** The mixed course reports 100% graded completion after its one
Automatic exercise is solved. Ungraded-only courses have no invented graded
denominator. Practice only does not trigger missing-test warnings; an Automatic
exercise with invalid/missing grading still does. Historical submissions, scores,
and points are preserved.

## Existing reproduction fixtures

These synthetic production fixtures were retained after testing:

| Fixture | ID |
| --- | --- |
| Course `[QA v2.0.37] PDF workspace and grading` | `d0a100fd-cad2-47b6-b104-0ad4b0802a8b` |
| Class `[QA v2.0.37] PDF code workspace` | `4a72b9c6-5fd4-4aae-b296-840533325c50` |
| Practice only exercise | `23fe3c22-7c4a-42ae-8b6b-ff02dfef5dfd` |
| Automatic exercise | `4f8bbfed-8c0d-42ca-8988-a3fe30936f90` |

The course/materials are hidden and the class is archived. Prefer development
fixtures for implementing fixes; production reproduction would require explicitly
restoring visibility/access. Concurrent live editing and mobile verification were
not covered by the production pass and are not confirmed defects.
