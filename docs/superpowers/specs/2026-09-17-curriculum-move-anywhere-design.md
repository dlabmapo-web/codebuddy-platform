# Moving lectures and problems anywhere in a course

Date: 2026-09-17
Status: implemented on `feat/curriculum-move-anywhere`; see §13 for differences from this design
Source baseline: `186c1da` on `feat/cove-studio-v2`, branch `feat/curriculum-move-anywhere`
Scope: the course builder at `/academy/[academySlug]/content/courses/[courseId]`, and the content API behind it
Follows: `2026-08-27-curriculum-reordering-design.md`, which shipped reordering within one parent and recorded moving between parents as separate work (§2 of that document)

## 1. Purpose

Managers, team leads, and admins author courses as Course → Chapter (챕터; `CourseModule` in code) → Lecture (강의) → Problem (문제). Once content exists, it can only be reordered among its siblings:

- a problem cannot move from lecture 1 to lecture 2;
- a problem cannot move from a lecture in chapter 2 to lecture 3 of chapter 4;
- a lecture cannot move to another chapter.

Today the only workaround is to recreate the item in the new place and delete the old one. That throws away the problem's content and every student's submissions, drafts, progress, and teacher feedback against it.

This design lets an author move a lecture to any chapter, and a problem to any lecture, within the same course, choosing its position there. The interaction must be obvious to a non-technical author and must never move anything by accident.

## 2. Current state

Web builder paths are relative to
`packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/`.

### 2.1 Interaction

- Every module, lecture, and problem row has a `위치 옮기기…` / `Move to…` item in its row menu (`_components/row-menu.tsx`).
- It opens `_components/move-modal.tsx`, which lists the item's **siblings only**, as "First" / "After ‹title›", with hidden siblings marked and the current place disabled.
- `_hooks/use-course-builder.ts` exposes `moveModule`, `moveLecture(moduleId, lectureId, toIndex)`, and `moveExercise(lectureId, materialId, toIndex)`. Each rebuilds the complete sibling ordering with `reordered()` and calls a reorder mutation. The response is the whole course tree, written into the query cache.
- Chapters can be collapsed (`isCollapsed`, `toggleCollapsed`, `toggleAll`).

### 2.2 API

`packages/api/src/content/course.service.ts`:

| Method | Permission | Contract |
|---|---|---|
| `reorderModules` | `curriculum.manage` | `courseId`, complete `orderedModuleIds` |
| `reorderLectures` | `curriculum.manage` | `moduleId`, complete `orderedLectureIds` |
| `reorderExercises` | `exercises.manage` | `lectureId`, complete `orderedMaterialIds` |

Each one checks that the submitted ids are exactly the parent's children (`assertExactIds`), then in one transaction rewrites positions (`rewritePositions` in `content-positions.ts`), writes an audit entry (`content.*.reordered`), and bumps `Course.contentRevision`. None of them can express a change of parent.

`Lecture.position` is unique per `courseModuleId`, and `Material.position` is unique per `lectureId`, both with positive CHECK constraints. `rewritePositions` already handles the illegal intermediate states by parking rows above the current range first.

## 3. Scope

### In scope (v1)

1. **Move a lecture** to any chapter of the same course, at a chosen position.
2. **Move a problem** to any lecture of the same course, at a chosen position.
3. Moving within the current parent stays possible from the same dialog, so the new dialog fully replaces the lecture and problem modals.
4. **Undo** for 10 seconds after a move.
5. After a move, the moved row is **revealed and highlighted** in its new place.
6. Warnings in the dialog when the destination is hidden from students.

Chapters keep the current sibling modal: a chapter can only move within its course, and that already works.

### Out of scope

- **Moving to another course.** A different course means different class enrollments, progress aggregation, import key namespace, and library lineage. If needed, it will be a separate "copy to another course" feature.
- **Selecting several items and moving them together.** A later extension (§11); the API shape is chosen so it can grow into it.
- **Drag and drop.** A later accelerator (§11). The dialog in this design is also its keyboard- and touch-accessible fallback, so it has to exist first.
- Moving materials that are not programming exercises. The builder only lists programming exercises today.

## 4. What a move affects

A move within one course changes a single foreign key (`Lecture.courseModuleId` or `Material.lectureId`) plus positions. Everything below was checked against the schema and services.

### 4.1 Preserved by construction

| Data | Keyed by | Effect of a move |
|---|---|---|
| Submissions, drafts, progress, teacher feedback, solve sessions, monitoring visits | `materialId` | unchanged; they follow the problem |
| Student exercise URL `/learn/exercises/[materialId]` | `materialId` | unchanged |
| Import keys | course-unique (`CourseModule @@unique([courseId, externalKey])`; lecture and problem keys course-unique by service invariant) | no collision is possible inside one course |
| `Submission.problemTitle`, `PointLedger.subjectLabel` | frozen text | unchanged |

### 4.2 Behaviors to define and communicate

1. **Visibility.** A visible item moved under a hidden lecture or chapter becomes invisible to students (the existing "hidden by parent" rule). Its own `isVisible` flag is not changed. The dialog warns before the move (§5.4).
2. **Monitoring.** If the move makes a problem unavailable to students, any live monitoring on it must end, as hiding does today. The service calls the existing `revokeCourseMonitoring(courseId)` after any move whose destination is not effectively visible.
3. **Completion points.** `LECTURE_COMPLETED`, `MODULE_COMPLETED`, and `COURSE_COMPLETED` are awarded once per student per subject (`dedupeKey` `membership:lecture:LECTURE`, and so on) and never revoked. A move pays and removes nothing. A student who completed the destination lecture before a new problem arrived keeps that award; completion for a lecture is only evaluated on a later solve. This matches how adding a new problem to a lecture already behaves, and is stated in the dialog help text, not as a warning.
4. **Student navigation.** Previous/Next, the course outline, and numbering (`2-1-3`) follow the new order on next load. A student on the problem at that moment keeps their draft; nothing is keyed by position.
5. **Import previews.** `contentRevision` is bumped, so a workbook preview taken before the move is refused at commit, as with a reorder.
6. **Library courses.** For a head-office library course, a move bumps the revision like any edit, and branch copies see that the source has moved on. Branch copies can move their own content freely.
7. **Authoring URLs.** Exercise authoring pages include the lecture id (`lectures/[lectureId]/exercises/[materialId]`). A tab opened on the old path returns `CONTENT_PARENT_MISMATCH` after the problem moves. The builder links are regenerated from the new tree, and the authoring page's not-found state offers a link back to the builder.
8. **Concurrent edits.** Two authors moving items in the same course at once must not corrupt positions. Moves lock the course row (§7.3), as the importer already does.

## 5. Selected interaction

### 5.1 Entry point

The same row menu item, unchanged in wording: `위치 옮기기…` / `Move to…`. There is no second "move to another lecture" action. Authors should not have to decide in advance whether a move is "within" or "across".

### 5.2 Problem move dialog

```
┌ 문제 옮기기 ──────────────────────────────────────────────┐
│ [실습] 문자열 함수 - split()                                │
│                                                            │
│ ① 어느 강의로 옮길까요?                  🔍 강의 검색       │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ▸ 1장 파이썬 시작하기                           3개 강의 │ │
│ │ ▾ 2장 문자열                                            │ │
│ │     ○ 1강 문자열 기초                          4문제    │ │
│ │     ● 3강 문자열 함수   현재 위치               6문제    │ │
│ │ ▾ 4장 입력과 출력                                       │ │
│ │     ○ 3강 입력함수 input()   👁 숨김            2문제    │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ② 강의 안에서 어디에 둘까요?                               │
│   ○ 맨 앞                                                   │
│   ○ “count()” 다음                                          │
│   ● 맨 뒤                                                   │
│                                                            │
│ ▶ “split()”을 4장 › 3강 입력함수의 맨 뒤로 옮깁니다.        │
│ ⚠ 이 강의는 학생에게 숨겨져 있어, 옮긴 뒤 이 문제도         │
│   학생에게 보이지 않습니다.                                 │
│                                                            │
│ 학생의 제출 기록과 진행 상황은 그대로 유지됩니다.           │
│                                          [취소] [옮기기]    │
└────────────────────────────────────────────────────────────┘
```

Rules:

1. **Step ① lists every lecture in the course**, grouped under its chapter, in outline order. Chapter headers are collapsible, but only the current chapter starts expanded. Each lecture shows its problem count and a hidden marker when it is not effectively visible.
2. **The current lecture is preselected** and labelled `현재 위치`. With it selected, step ② offers the same sibling positions as today, so reordering within a lecture is unchanged in effect and costs one more glance at most.
3. **Search** filters lectures by title, keeping their chapter heading, and appears only when the course has more than 8 lectures. Matching is case-insensitive and matches Hangul by substring.
4. **Step ② lists positions in the selected lecture**: `맨 앞`, then `“‹title›” 다음` for each existing problem. `맨 뒤` is the last option and the default when a different lecture is selected. When the current lecture is selected, the default is the item's current position, which is disabled, so nothing is pre-committed.
5. **The summary sentence** always states the full result in words: item, chapter › lecture, position. It is the author's confirmation of what will happen.
6. **The warning line** appears only when the destination is hidden from students and the problem is currently visible to them.
7. **The primary button** is disabled until the selection differs from the current place. Nothing moves until it is pressed. Enter activates it; Escape cancels.
8. A lecture with no problems shows a single position, `이 강의의 첫 문제로`.

### 5.3 Lecture move dialog

The same layout, one level up:

- Step ① lists **chapters** (with lecture counts and hidden markers), current chapter preselected.
- Step ② lists positions within the chosen chapter: `맨 앞`, `“‹lecture›” 다음` …, `맨 뒤`.
- Summary: `“3강 문자열 함수”를 4장 입력과 출력의 맨 뒤로 옮깁니다. 안에 있는 문제 6개도 함께 옮겨집니다.` The sentence names the problem count so an author never wonders whether the contents come along.
- Search appears when the course has more than 8 chapters.

### 5.4 Visibility warning

"Effectively visible" is the existing rule: an item is visible to students only when it and every ancestor, including the course, are visible. The warning compares the item's effective visibility now with what it will be after the move:

| Now | After | Shown |
|---|---|---|
| visible | hidden | ⚠ `옮긴 뒤 학생에게 보이지 않습니다` with the reason (which ancestor is hidden) |
| hidden only because of its old parent, own flag visible | visible | ℹ `옮긴 뒤 학생에게 보이게 됩니다` |
| otherwise | — | nothing |

The second row matters as much as the first. Moving a problem out of a hidden draft lecture can publish it.

### 5.5 After the move

1. The dialog closes when the server confirms. The tree in the query cache is replaced with the response, as today.
2. If the destination chapter is collapsed, it is expanded.
3. The moved row is scrolled into view (`block: 'center'`, instant under `prefers-reduced-motion`) and flashes a brand-tinted background for about 1.5 s.
4. A toast appears for 10 s: `“split()”을 4장 › 3강으로 옮겼습니다 · 되돌리기`.
5. `되돌리기` performs the reverse move to the recorded origin, then shows `되돌렸습니다`. It is disabled while any move is pending, and it is dropped if the tree has changed since the move in a way that removes the origin (for example, the origin lecture was deleted). In that case the toast reads `되돌릴 수 없습니다. 원래 강의가 더 이상 없습니다.`

### 5.6 Pending and failure

- While the request is in flight, the primary button shows a spinner and both buttons are disabled; the dialog cannot be dismissed.
- On failure, the dialog stays open with an inline error and the selection intact. A stale tree (`CONTENT_PARENT_MISMATCH`, `CONTENT_MOVE_STALE`) refetches the tree and says `다른 사람이 과정을 바꿨습니다. 최신 내용으로 다시 선택해 주세요.`
- Other builder actions keep their existing `movePending` gating.

### 5.7 Accessibility

- Step ① is a `radiogroup` of lectures (or chapters) with chapter group labels; step ② is a second `radiogroup`. Arrow keys move within a group, Tab moves between groups, search, and buttons.
- The summary sentence is an `aria-live="polite"` region.
- The toast's undo is a real button reachable by keyboard, and the toast does not steal focus. Focus returns to the moved row's menu button after the dialog closes.
- Hidden markers have text labels, not only an icon.

## 6. Rejected alternatives

1. **Drag and drop first.** Long moves (chapter 2 → chapter 4) mean dragging across the whole outline with auto-scroll, three nested sortable levels are error-prone, touch support is poor, and an accessible alternative is required anyway. The previous reordering design rejected it for the same reasons. It remains a later accelerator on top of this dialog.
2. **Cut and paste.** Invisible state that spans page interactions; an author who cuts and navigates away has "lost" a problem in their head even though nothing moved.
3. **A separate "change lecture" action beside "Move to…".** Forces the author to classify the move before making it, and duplicates the position step.
4. **Nested submenus (chapter → lecture → position).** Unreadable for 20+ lectures, hover-dependent, and no room for the summary or warning.
5. **Changing the parent only, then reordering separately.** Two round trips, a visible intermediate state, and two undo steps for one intention.

## 7. API design

### 7.1 Contracts

In `packages/shared/src/content/course.ts`:

```ts
export const moveLectureSchema = courseIdInputSchema.extend({
  lectureId: z.uuid(),
  /** Where it is now, as the author's tree saw it. */
  fromModuleId: z.uuid(),
  toModuleId: z.uuid(),
  /** 0-based index among the destination's lectures after the move. */
  toIndex: z.number().int().min(0),
});

export const moveExerciseSchema = courseIdInputSchema.extend({
  materialId: z.uuid(),
  fromLectureId: z.uuid(),
  toLectureId: z.uuid(),
  toIndex: z.number().int().min(0),
});
```

Added to `academyCourses` in `packages/shared/src/api/orpc/courses.contract.ts` as `moveLecture` and `moveExercise`, returning the course tree like the reorder endpoints. The reorder endpoints stay: the chapter modal uses `reorderModules`, and the Excel importer and existing tests use the rest.

`from*` is required so a move built from a stale tree is refused rather than silently moving something from wherever it is now.

### 7.2 Service

`CourseService.moveLecture` (`curriculum.manage`) and `CourseService.moveExercise` (`exercises.manage`, matching `reorderExercises`). Both follow the same steps:

1. Authorize.
2. In one transaction:
   1. Lock the course row: `SELECT id FROM courses WHERE id = $1 FOR UPDATE`, as `content-import.service.ts` does.
   2. Load the item with its parent chain. Refuse with `CONTENT_PARENT_MISMATCH` (404) if the item is not in `courseId`, or its current parent is not `from*`.
   3. Load the destination parent and require it to be in the same `courseId` (`CONTENT_PARENT_MISMATCH`). A problem move also requires `type: PROGRAMMING_EXERCISE`.
   4. Build the destination ordering: the destination's current children in position order, minus the item if it is already there, with the item inserted at `min(toIndex, length)`.
   5. If the parent is unchanged and the ordering equals the current one, do nothing further and return the tree (no audit, no revision bump).
   6. If the parent changes:
      - park the item at a position above both parents' current ranges (so neither unique constraint is hit), and set its new parent id;
      - `rewritePositions` for the source parent's remaining children (closing the gap);
      - `rewritePositions` for the destination ordering.
   7. If the parent is unchanged, `rewritePositions` for the destination ordering only.
   8. Write one audit entry (§7.4).
   9. `bumpContentRevision(tx, courseId)`.
3. After commit, if the item was effectively visible before and is not after, call `revokeCourseMonitoring(courseId)`.
4. Return `currentTree`.

`rewritePositions` takes ids for a single parent and derives its temporary range from those ids' current maximum. Before the parent changes, the parked position must be computed as the greater of both parents' maximum positions plus the destination length plus 1, so the parked row cannot collide in either parent. This is a new helper in `content-positions.ts`, `parkForReparent(tx, kind, id, sourceParentId, destinationParentId)`, next to the existing position code so manual and imported content keep one set of invariants.

### 7.3 Concurrency

The course-row lock serializes moves, reorders issued during a move, and imports for one course. Reorder endpoints do not take the lock today. They are not changed in v1: their `assertExactIds` check happens before their transaction, so a reorder racing a move can fail with a unique violation, which surfaces as the existing generic reorder error. If this proves noisy, the reorder transactions take the same lock (a small follow-up, recorded in §11).

### 7.4 Audit

New actions, added to `curriculumAuditActions` in `packages/shared/src/content/team-lead-overview.ts` with names in the overview panel's copy:

- `content.lecture.moved`: target `Lecture`, `before: { moduleId, index }`, `after: { moduleId, index }`.
- `content.programming_exercise.moved`: target `Material`, `before: { lectureId, index }`, `after: { lectureId, index }`.

A move within the same parent writes the `moved` action too, since it came from the move dialog. The panel copy reads "moved ‹title› to ‹chapter› › ‹lecture›" for a change of parent, and "reordered ‹title›" otherwise.

### 7.5 Errors

| Code | Status | When |
|---|---|---|
| `CONTENT_PARENT_MISMATCH` | 404 | the item or the destination is not in the course |
| `CONTENT_MOVE_STALE` (new; added to `packages/shared/src/errors/codes.ts` with a message) | 409 | the item was deleted, or is no longer under `from*`, between loading the dialog and confirming |
| existing permission errors | 403 | missing `curriculum.manage` / `exercises.manage` |

## 8. Web design

### 8.1 Hook

In `_hooks/use-course-builder.ts`:

- Replace `moveLecture(moduleId, lectureId, toIndex)` with `moveLecture({ lectureId, fromModuleId, toModuleId, toIndex })`, and `moveExercise` likewise, backed by `moveLectureMutation` / `moveExerciseMutation`. `moveModule` is unchanged.
- `movePending` includes the new mutations.
- `lastMove: { kind, itemId, title, from: { parentId, index }, to: { parentId, index, parentLabel } } | null` for the toast and undo. `undoLastMove()` issues the reverse move with `from` and `to` swapped, and clears `lastMove`.
- `revealItem(id)`: expands the containing chapter and marks the id to scroll and flash once. It is exposed as `revealId` plus `clearReveal()`, so rows can react without effects in the hook.

### 8.2 Pure helpers

In `_lib/course-tree.ts`, all unit-tested:

- `moveDestinations(tree, kind, itemId)`: the groups and options for step ①, with counts, hidden markers, and the current parent flagged.
- `positionOptions(tree, kind, itemId, parentId)`: step ② options and the default index (§5.2 rule 4).
- `effectiveVisibilityAfterMove(tree, kind, itemId, parentId)`: `{ now, after, hiddenBy }` for §5.4.
- `movedTree(tree, move)`: an optimistic tree, used only to compute the undo origin and the reveal target, not rendered before the server answers.
- `filterDestinations(groups, query)`: search.

### 8.3 Components

- `_components/move-anywhere-modal.tsx`: the dialog in §5.2–5.4, used for lectures and problems. It takes the tree, `kind`, and `itemId`, and calls `onMove({ toParentId, toIndex })`.
- `_components/move-modal.tsx` stays, for chapters only.
- `_components/move-toast.tsx`: the toast and undo in §5.5, built on the studio primitives. There is no toast primitive in `components/studio` today; this one is local to the builder unless a shared one exists by implementation time.
- `lecture-row.tsx` and `module-card.tsx`: the `onMove` menu item opens the new modal whenever the course has more than one possible destination (so a lone problem in a course with two lectures can still move), and rows handle `revealId` with a scroll and a CSS flash class.

### 8.4 Copy

New keys under `move` in `packages/i18n/src/locales/{ko,en}/content.json`:

| Key | ko | en |
|---|---|---|
| `step_lecture` | 어느 강의로 옮길까요? | Which lecture should it go to? |
| `step_module` | 어느 챕터로 옮길까요? | Which chapter should it go to? |
| `step_position_lecture` | 강의 안에서 어디에 둘까요? | Where in the lecture? |
| `step_position_module` | 챕터 안에서 어디에 둘까요? | Where in the chapter? |
| `search_lecture` | 강의 검색 | Search lectures |
| `search_module` | 챕터 검색 | Search chapters |
| `last` | 맨 뒤 | Last |
| `only_position` | 이 강의의 첫 문제로 | As the first problem here |
| `count_lectures` | {{count}}개 강의 | {{count}} lectures |
| `count_problems` | {{count}}문제 | {{count}} problems |
| `summary_exercise` | “{{title}}”을 {{module}} › {{lecture}}의 {{position}}(으)로 옮깁니다. | Moves “{{title}}” to {{module}} › {{lecture}}, {{position}}. |
| `summary_lecture` | “{{title}}”을 {{module}}의 {{position}}(으)로 옮깁니다. 안에 있는 문제 {{count}}개도 함께 옮겨집니다. | Moves “{{title}}” to {{module}}, {{position}}. Its {{count}} problems move with it. |
| `will_hide` | 옮긴 뒤 학생에게 보이지 않습니다. “{{hiddenBy}}”이(가) 숨겨져 있습니다. | Students will no longer see it: “{{hiddenBy}}” is hidden. |
| `will_show` | 옮긴 뒤 학생에게 보이게 됩니다. | Students will be able to see it after the move. |
| `history_kept` | 학생의 제출 기록과 진행 상황은 그대로 유지됩니다. | Students' submissions and progress are kept. |
| `confirm` | 옮기기 | Move |
| `moved_toast` | “{{title}}”을 {{destination}}(으)로 옮겼습니다 | Moved “{{title}}” to {{destination}} |
| `undo` | 되돌리기 | Undo |
| `undone` | 되돌렸습니다 | Move undone |
| `undo_unavailable` | 되돌릴 수 없습니다. 원래 위치가 더 이상 없습니다. | Can't undo: the original place no longer exists. |
| `stale` | 다른 사람이 과정을 바꿨습니다. 최신 내용으로 다시 선택해 주세요. | Someone else changed this course. Choose again from the latest version. |

The existing `module_title`, `lecture_title`, `exercise_title`, `first`, `after`, `current` (`현재 위치`), and `hidden` keys are reused. `body` is replaced by the step headings in the new dialog and kept for the chapter modal.

## 9. Verification

### 9.1 Unit (web)

`_lib/course-tree.spec.ts`:

- destinations group lectures under chapters in outline order, flag the current parent, and include hidden ones with markers;
- position options for the current parent disable the current index; for another parent they default to last;
- an empty destination yields one option;
- visibility after a move for: visible → hidden parent; hidden-by-parent → visible parent; own flag hidden (no change either way); hidden course;
- search keeps chapter headings for matching lectures and matches Hangul substrings;
- `movedTree` produces the expected ordering in both parents, and its inverse restores the original tree.

### 9.2 Service (api)

`course.service.spec.ts`, against the disposable integration database (not the shared Supabase dev database):

- a problem moves from lecture A to lecture B at first, middle, and last; both lectures end with contiguous positions from 1;
- a lecture moves between chapters and keeps its problems;
- moving within the same parent reorders exactly like `reorderExercises` / `reorderLectures`;
- a no-op move writes no audit and does not bump the revision;
- a destination in another course, a wrong `from*`, and a deleted item are refused with the codes in §7.5, and nothing changes;
- submissions, drafts, and progress rows for a moved problem are untouched and still resolve;
- `contentRevision` is bumped once per move;
- monitoring is revoked when the move makes a problem hidden, and not otherwise;
- two concurrent moves in one course both succeed or one fails cleanly, and positions stay unique and contiguous;
- permission: a role without `exercises.manage` cannot move a problem, and one without `curriculum.manage` cannot move a lecture.

### 9.3 End to end

`e2e/specs/curriculum-move.spec.ts`, Chromium and WebKit:

1. Move a problem from lecture 1 of chapter 2 to lecture 3 of chapter 4 at the last position; the builder shows it there, numbered correctly, highlighted, with its chapter expanded.
2. Undo from the toast restores the original place.
3. Move a lecture to another chapter; its problems move with it.
4. The student learn outline shows the new order, and the moved problem's previous submission is still listed.
5. Moving a visible problem into a hidden lecture shows the warning, and after confirming, the student can no longer open it.
6. Keyboard only: open the menu, choose a destination and position with arrow keys, confirm with Enter.

### 9.4 Manual

With a real course of 30+ problems, confirm search, scrolling in step ①, and that the summary sentence reads naturally in Korean for every position option.

## 10. Rollout

- No schema migration: only existing columns change.
- API and web ship together; the web calls the new endpoints only.
- Deploy with the usual procedure in `docs/operations/deployment-guide.local.md`.
- Tell content authors in the release note that `위치 옮기기…` now reaches every lecture and chapter.

## 11. Later

1. **Drag and drop** as a desktop accelerator, reusing the move endpoints, with the dialog as its accessible path.
2. **Selecting several items**: extend the contracts to `materialIds: string[]` / `lectureIds: string[]` inserted in their current relative order, with one audit entry and one undo.
3. **Copy to another course**, as its own feature with its own treatment of keys, progress, and library lineage.
4. Take the course lock in the reorder transactions if races with moves appear in practice (§7.3).

## 12. Completion criteria

- [ ] A problem can be moved to any lecture in the same course, at any position, from its row menu.
- [ ] A lecture can be moved to any chapter in the same course, at any position, with its problems.
- [ ] The dialog states the result in one sentence and warns when student visibility will change.
- [ ] Nothing moves until the author confirms; undo is available for 10 seconds.
- [ ] The moved item is revealed and highlighted in its new place.
- [ ] Students' submissions, drafts, progress, and feedback for moved problems are unchanged.
- [ ] Moves are audited, bump `contentRevision`, lock the course, and refuse stale or cross-course requests.
- [ ] Tests in §9 pass; typecheck, i18n check, and theme lint pass.

## 13. Implementation record

Implemented as designed, with these differences:

- **Errors (§7.5).** An item whose parent is no longer `from*` is reported as `CONTENT_MOVE_STALE` (409), not `CONTENT_PARENT_MISMATCH`. It is the same situation as a deleted item: the author chose from an outdated tree. The web client refetches the tree on either code.
- **Old authoring URLs (§4.2.7).** Instead of a not-found page linking back to the builder, the three exercise editor pages (academy studio, platform console, library) redirect to the problem's current lecture when the problem still exists in the course (`_lib/moved-exercise.ts`). They show not-found only when it does not.
- **Reparenting (§7.2).** The helper is `reparentAbovePositions` in `content-positions.ts`, with the pure `orderingWithItemAt` beside it. It parks the row one past the destination's highest position and changes its parent in the same update. `rewritePositions` then rewrites the source and destination densely.
- **Hook (§8.1).** `moveLecture` / `moveExercise` became a single `move(kind, itemId, { parentId, index })`, which resolves or rejects so the dialog can stay open on failure. The toast is driven by `notice` / `undoMove(move)`. Move mutations are left out of the page-level `structuralError`, because the dialog and the toast report their own errors. The unused reorder-lectures and reorder-exercises mutations were removed from the hook; the endpoints remain.
- **Reduced motion (§5.5).** The highlight is held and removed in one step (`cove-move-hold`), not faded, so it still clears itself.
- **Terminology.** Korean copy uses `챕터`, matching the existing `move.module_title`. Other builder strings still say `모듈`; that pre-existing inconsistency is not changed here.

Verification on this branch:

- `packages/api`: `tsc --noEmit`; `vitest run` (1107 passed, integration suites skipped without a database); `content-positions.spec.ts` covers `orderingWithItemAt`.
- `src/content/course-move.integration.spec.ts` against a disposable Docker PostgreSQL 16 with every migration applied: 13 tests. They cover moves at first, middle, and last across chapters, into an empty lecture, within one lecture, and a lecture with its problems. They also cover student drafts staying attached, one audit and one revision bump per move, no-op moves, a stale `from`, a cross-course destination, another academy, a deleted item, monitoring revoked only when a move hides a problem, and three concurrent moves in one course.
- `packages/web`: `tsc --noEmit`; `vitest run` (1056 passed), including `course-tree.spec.ts` (move helpers), `move-anywhere-modal.spec.tsx`, and `moved-exercise.spec.ts`; `i18n:check`, `theme:lint`, `routes:lint`; ESLint on changed files reports no errors.
- `e2e/specs/curriculum-move.spec.ts` is written and typechecks. It has **not been run**: in this environment the dev server answers stored test sessions with "This page does not exist" on every academy route, and UI sign-in is blocked by Turnstile. Run it against a correctly configured e2e server, per `e2e/playwright.config.ts`.

## 14. Drag and drop (added after §11)

Drag and drop was brought forward from §11 as an accelerator beside the dialog, which stays unchanged.

- **Library:** `@dnd-kit/core`. It handles pointer and touch sensors and auto-scrolls long outlines. No keyboard sensor is registered; the dialog is the keyboard and screen-reader path, so grips are hidden from assistive technology and left out of the tab order.
- **Handles:** a grip on each chapter header, lecture header, and problem row, shown only to someone who may move that kind of item. A press becomes a drag after 6 px of travel, or after a 220 ms long-press on touch, so clicks and scrolling are unaffected.
- **Targets:** rows accept only their own kind (`_lib/drag-drop.ts`). Dropping on a row places the item before or after it by the pointer's position. Dropping a problem on a lecture header appends it to that lecture, and a lecture on a chapter header appends it to that chapter, which is how collapsed or empty parents are reached. Collision detection considers only targets that accept the dragged kind, and falls back to the nearest one in the gaps between rows.
- **Feedback:** rows do not reflow during a drag. One brand line (before or after) or an outline (into) marks the landing place, and a small card with the item's kind and title follows the pointer.
- **On drop:** the same `move` the dialog uses (`moveModule` for chapters), so undo, the reveal highlight, and stale-tree refetching are shared. A failure is reported in the toast.
- **Optimistic moves:** the item is shown in its new place immediately, with positions renumbered so outline numbers stay correct, and restored if the server refuses. This now applies to dialog moves and chapter reorders too.
- **Reveal:** the moved row is scrolled to only if it is off screen.

Tests: `_lib/drag-drop.spec.ts` covers placement before and after, moves within a parent that count indices without the item, no-op drops, cross-chapter moves, appends into empty and collapsed lectures, lecture and chapter moves, and wrong-kind targets. Drag gestures themselves need a manual check in a browser; there is no e2e coverage for them yet.
