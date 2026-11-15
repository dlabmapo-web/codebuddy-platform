# Student learning entry through My Classes

Date: 2026-11-15
Status: Implemented and locally verified on 2026-11-15. See [verification](../../research/2026-11-15-student-my-classes-navigation-verification.md).
Branch reviewed: `fix/v2-feedback`

## 1. Request and decision

Students currently see both **Courses** and **My Classes**. Make **My Classes / 내 반** the single main learning entry. Students open a class, see its assigned courses, open a course detail, and start a lesson from there.

Use the same class-to-course navigation pattern introduced for staff, with the existing student course cards and student learning permissions. Managers, Team Leads and Teachers retain their current navigation and classroom tools.

```text
Student signs in / enters an academy
  → My Classes
    → Class detail
      → Assigned course detail (classId retained)
        → Student lesson workspace (classId retained)
          → Course detail → the selected class → My Classes
```

Keep the student label **My Classes / 내 반**. The staff label **Enter My Classes / 내 반 들어가기** remains specific to staff.

## 2. What already exists

The class/course relationship is already implemented; it does not need a second student classroom API or a copied curriculum UI.

| Area | Existing behavior | Required work |
| --- | --- | --- |
| Sidebar | `studioNavGroups()` always adds Courses when learning is allowed, then adds My Classes for students | Offer My Classes as the student learning entry; retain the staff Courses item |
| Academy entry | `academyEntryPath()` sends `STUDENT` to `/learn/courses`; academy root and auth entry paths reuse it | Send students to `/learn/classes` |
| Class list | `learn.listClasses` server-renders active enrolled classes, teacher information and available-course counts | Reuse the list and its empty/error states |
| Class detail | `learn.getClass` server-renders course cards through `ClassDetail` and shared `CourseCard` | Preserve this course section as the way to enter courses |
| Class course link | `CourseCard` already accepts `classId` and adds it to the existing course URL | Keep this behavior and test it explicitly |
| Course detail | Resolves the student's delivery class, but its Back link always targets the course catalog | Return to the resolved class, with My Classes as the unresolved fallback |
| Lessons | Many links retain class context; some programming/quiz footer paths still construct a course URL without it | Audit and consistently retain the resolved class on student return/next/previous links |
| Continue learning | Saved coding drafts appear on the Courses catalog | Preserve this existing shortcut on My Classes |

Relevant source:

- `packages/web/src/lib/academy-entry.ts` and `academy-access-state.ts`.
- `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-sidebar.tsx`.
- `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/classes/` and its `[classId]/_components/class-detail.tsx`.
- `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/_components/course-card.tsx`.
- `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/learn/courses/page.tsx`, `[courseId]/page.tsx`, and their client components/hooks.
- `packages/web/src/lib/back-to.ts`, `components/workspace/use-material-navigation.ts`, and the programming/quiz workspace return links.
- `packages/api/src/learn/learn-class.service.ts`, `learning-class-context.service.ts`, and `curriculum-read.ts`.

This amends the navigation decision in [Student Class Pages Design](2026-08-11-student-class-pages-design.md), which made My Courses primary and My Classes secondary. Existing enrollment, visibility and student-data contracts continue to apply.

## 3. Approaches considered

| Approach | Tradeoff | Decision |
| --- | --- | --- |
| Make the existing class list/detail the primary entry and repair return paths | Reuses the working student pages and preserves class context with little API change | Selected |
| Show every class and all of its courses together on the list page | More crowded for students with several classes; expands the list response and duplicates the detail page | Keep course cards on class detail |
| Only hide the Courses sidebar link | Leaves login landing, Back links and Continue learning centered on a hidden destination | Insufficient for this request |

## 4. Student navigation and destinations

### Sidebar and entry

- Students see **My Classes**, **Answer records**, and **My points** when points are enabled. Courses is removed from their sidebar.
- Keep My Classes active on its list/detail pages and on the student course-detail routes beneath it. A course URL remaining under `/learn/courses/` must not leave the sidebar without a selected learning entry.
- Student academy entry, normal sign-in, SSO entry, academy switching and account return defaults use `/learn/classes` through the shared entry policy.
- Preserve an already-authorized explicit deep-link return after login. A student signing in to open a particular lesson should still reach that lesson.
- Audit currently visible student profile, records and learning fallback actions that target the catalog; use My Classes where the action means returning to the main learning entry. Keep course-specific links pointing to their courses.
- Even a student with one class lands on the class list. Keep the entry predictable rather than automatically selecting a class.

### Existing URLs

| URL | Student behavior |
| --- | --- |
| `/academy/:slug` | Redirect to My Classes using the shared role entry helper |
| `/academy/:slug/learn/classes` | Existing enrolled-class list plus Continue learning |
| `/academy/:slug/learn/classes/:classId` | Existing class details and assigned course cards |
| `/academy/:slug/learn/courses` | Role-aware server redirect to My Classes before loading the student catalog or drafts |
| `/academy/:slug/learn/courses/:courseId?classId=:classId` | Existing course detail in the selected, authorized class |
| Existing individual course/lesson bookmarks without `classId` | Existing delivery-class resolution: resolve the only eligible class or show the class chooser |

Redirect only the catalog index for students. Individual course and lesson routes remain valid. Use a role-aware redirect rather than a permanent redirect that could affect a later staff session. Staff visiting the Courses index retain the current staff course screen.

## 5. Class detail and course access

- Reuse `ClassList`, `ClassCard`, `ClassDetail` and `CourseCard` rather than copying the staff live-roster page.
- A class detail shows the class name, existing description/schedule/teacher information, course count, and its assigned visible course cards. Existing course progress and material counts remain available.
- A course card opens the existing course detail with that class's `classId` and offers a normal link usable by keyboard or in another tab.
- Shared courses may appear once in each class that assigns them. Their course/material identifiers and existing draft ownership remain the same. Class-scoped progress, submissions, grades, presence and points continue to follow the selected delivery class.
- A class with no available courses remains openable and shows the existing empty-course message. A visible course with no currently available lessons retains the existing not-ready/empty outline state.
- Keep student screens within their current capabilities. The staff edit, grading, tutoring, roster and demonstration controls are governed by staff permissions; they are not part of the student class-to-course flow.

## 6. Return paths and class context

Use the API-resolved `outline.classContext`, not an untrusted query string, to determine the course's parent:

1. With a resolved eligible class, the course Back link opens that class detail. Use its existing class-context name for the label, or localized Back to class copy.
2. Without a resolved class, Back opens My Classes. If multiple eligible classes deliver the course, retain the existing class chooser before learning starts.
3. After changing class in the course selector, both the course contents and its Back link follow the newly resolved class, including browser Back/Forward navigation.
4. A supplied malformed or ineligible class must not silently select a different class. Use the existing unavailable/not-found presentation without revealing inaccessible names.

The class name/id needed for the parent link is already in the authorized class-context response. Do not call `learn.getClass` again merely to label that link.

Retain `classId` on course-to-lesson links, previous/next lesson links, curriculum selection, resource links and return-to-course controls for programming, legacy quizzes, written response, multiple choice, Turtle, explanation, PDF and video lessons. In particular, audit the raw course URLs in the programming navigator footer and quiz workspace. Use canonical route helpers and retain existing save, running-session, unsent-answer and safe-return guards.

When a remembered enrollment or course assignment has been removed, fail through existing access checks and offer My Classes as the safe main-entry destination. Do not fall back to another class and attribute the student's work there.

## 7. Preserve Continue learning

Removing the catalog entry must preserve its existing saved-draft shortcut:

- Move the existing Continue learning panel to My Classes, above the class cards, retaining its bounded list, expand/collapse behavior and draft discard action.
- Server-read `learn.listClasses` and the existing `learn.listDrafts` together using `Promise.allSettled`. Keep the outcomes independent: a draft-list failure cannot replace successful class cards with an error, and a class-list failure must remain distinguishable from no enrollments.
- Render a localized non-blocking draft-unavailable state when only drafts fail. Reuse existing student-session handling for an expired/unavailable learning session; avoid showing an expired session as an empty class list.
- Extract a drafts-only query/mutation owner from the catalog hook as needed. Do not mount `useCourseCatalog` on My Classes: it would fetch the cross-class course catalog that this page no longer displays.
- Seed the drafts query from the server read using the existing server-read freshness/token pattern. Initial hydration must not immediately fetch the same data again.
- Keep the existing discard behavior and rollback on failure. Refresh the draft cache within the same actor/academy scope; do not invalidate or fetch an unused catalog on My Classes.
- The current draft projection does not establish a delivery class. Resume with an authorized class when one is known; otherwise use existing class resolution/choice. Do not infer the first class in a list or add one database read per draft.
- Preserve draft access through the existing API when its index page redirects. No draft migration, reset or scoring change is part of this work.

## 8. Authorization and read budget

Keep `LearnClassService`, its strict student DTOs, `enrolledClassWhere`, existing visibility readers and `LearningClassContextService` as the authorities. UI navigation never grants enrollment or course access. Active membership, active class enrollment, current course assignment and content visibility are rechecked by existing APIs. Continue to deny missing, archived, foreign and unenrolled classes consistently. Students receive the existing aggregate class facts and allowed teacher identity, with no new classmate identities or management data.

No schema migration or new class/course endpoint is planned. Reuse the one-statement curriculum/access readers and batched teacher-avatar resolution. Do not copy the staff classroom reader into student learning or introduce per-class/per-course/per-draft query loops.

During implementation, measure the current SQL baseline for `learn.listClasses`, `learn.getClass`, `learn.listDrafts` and `learn.getCourseOutline` using Prisma query events against disposable Docker PostgreSQL via `COVE_INTEGRATION_DATABASE_URL`. This spec does not claim unmeasured counts. Keep unchanged service reads at their measured baselines, and pin flat statement counts as fixtures grow from one class/course to many, including one course assigned to several classes. The new My Classes page's main reads are exactly the class list and the existing drafts read; its combined budget must stay within their independently measured fixed budgets. Profile-media signing remains batched separately.

Record the measured counts and any justified change in verification notes and the implementation commit message. No shared Supabase test writes, new polling or extra monitoring socket are required. Preserve the existing academy-level student presence provider and class/material attribution when learning opens.

## 9. Implementation boundaries

Expected changes:

- Student sidebar generation and active-route aliases, plus `academy-entry.ts` and its auth/SSO/account consumers' tests.
- The student branch of the catalog index, leaving staff catalog behavior intact.
- My Classes server composition and a shared drafts-only continuation component/hook.
- Course parent-link policy in the course page and `back-to.ts`; currently visible student catalog fallback links.
- Course/lesson route helper usage where class context is currently omitted.
- Localized labels, focused tests and disposable-database verification.

Preserve existing course-detail and lesson rendering, staff tools, permission inheritance, grading rules, schedules, enrollment administration, drafts and result records. Pointer flicker, pointer chapter placement and the reported 70-point exercise are separate feedback items.

## 10. Acceptance and verification

1. A student sees one My Classes navigation entry, no Courses entry, and My Classes remains active on class/course pages. Manager, Team Lead and Teacher menus retain their current entries.
2. Student entry through academy root, login, SSO, academy switching and account return defaults reaches My Classes; an explicit valid lesson return still works. Opening the old catalog index redirects without first reading the course catalog.
3. My Classes shows only active enrolled classes. Opening one displays its assigned visible courses; selecting a course opens its existing detail with the correct class context.
4. Course Back returns to that class; class Back returns to My Classes. This works after refresh, opening in a new tab, class switching and browser Back/Forward.
5. When Class A and Class B assign the same course, entering through either retains that class through lessons and return links. An unscoped bookmark with both eligible classes still asks the student to choose. There is no arbitrary attribution or duplicate draft creation.
6. Continue learning remains available, keeps working after reload, expands/collapses, resumes safely and supports discard rollback. A draft-service failure does not remove class cards; empty, failed and expired-session states remain distinct.
7. Empty enrollment, empty class, unavailable course/lesson, removed enrollment, removed assignment, hidden content and cross-academy URLs show the existing safe states without exposing inaccessible names.
8. Programming, legacy quiz, written, choice, Turtle, explanation, PDF and video entry/exit/neighbor paths preserve class context and their current save/runtime guards. Student work still appears in the correct class's staff monitoring flow.
9. Browser checks cover English and Korean, desktop and narrow layouts, keyboard course-card activation, teacher/manager regression checks and student presence continuity. Inspect the actual class and course screens.
10. Integration checks pin the SQL budgets described above at small and expanded fixture sizes. Network checks show no duplicate hydration requests, unused catalog reads or per-card detail prefetch fan-out; disable automatic course-card prefetch if it causes that fan-out.

Update stale expectations in `studio-sidebar.spec.ts`, `academy-entry.spec.ts`, academy-root/auth/SSO/account destination tests and `e2e/specs/student-classes.spec.ts`. That browser spec currently assumes Courses is the student landing page and expects a class-course link without `classId`, although the current card already includes it; both expectations need to reflect the selected flow. New integration/browser coverage must use isolated local fixtures rather than running the legacy seed-dependent suite against a shared development database.

After implementation verification, follow the root `AGENTS.md` cleanup rule for task servers and Cove API port 4000.
