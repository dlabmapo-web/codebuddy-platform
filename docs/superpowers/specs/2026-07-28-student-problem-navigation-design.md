# Student Problem Previous and Next Navigation Design

**Date:** 2026-07-28  
**Status:** Approved design, pending implementation  
**Scope:** Student problem detail page and its public problem-detail API

## 1. Summary

The student problem detail page will provide **Previous** and **Next**
navigation controls. Navigation follows the published curriculum sequence
within the current stage:

```text
chapter.order_no → problem.order_no
```

The controls may cross chapter boundaries. For example, Next on the final
published problem of Chapter 1 opens the first published problem of Chapter 2.
Navigation never crosses into another stage.

The controls are always available regardless of solve status. They are only
temporarily disabled while local execution or server submission is active.

## 2. Existing System

The current implementation already provides part of this workflow:

- `GET /api/problems/[id]` returns `next_problem_id`.
- The current next-problem query only considers later problems in the same
  chapter.
- No previous-problem value is returned.
- `ProblemSolveClient` stores `nextProblemId` and passes it to
  `SubmissionResultDrawer`.
- The submission result drawer links to the next problem after a passing
  submission.
- The curriculum catalog orders chapters by `chapters.order_no` and problems
  by `problems.order_no`.
- Student code is periodically saved to the current session and is also sent
  during page cleanup with `keepalive`.

The new implementation will replace the same-chapter next lookup with one
shared stage-scoped navigation result.

## 3. Goals

- Let students move to the previous or next published problem from the detail
  page.
- Continue naturally across chapter boundaries inside the current stage.
- Keep ordering logic authoritative on the server.
- Preserve the student's current draft before navigating.
- Reset all problem-specific client state when the problem changes.
- Reuse the same Next destination in the submission-result drawer.
- Keep navigation accessible and usable at narrow viewport widths.

## 4. Non-Goals

- Locking Next until the current problem is passed.
- Navigating across stages or subjects.
- Automatically submitting code when navigating.
- Automatically marking a problem complete.
- Changing curriculum order from the student page.
- Adding keyboard shortcuts in the first version.
- Prefetching or loading the full next problem into the editor before
  navigation.
- Adding a database migration.

## 5. Navigation Sequence

Only published curriculum records participate:

1. The current problem must be published.
2. Its chapter must be published.
3. Its stage must be published.
4. Candidate chapters must belong to the same stage and be published.
5. Candidate problems must belong to those chapters and be published.

Candidates are sorted deterministically by:

1. `chapter.order_no` ascending.
2. `problem.order_no` ascending.
3. `problem.problem_no` ascending as a stable tie-breaker.
4. `problem.id` ascending as a final stable tie-breaker.

The current problem's index in that sequence determines its neighbors:

- `previous` is the item at `index - 1`, or `null`.
- `next` is the item at `index + 1`, or `null`.

Duplicate order values should not normally occur because the admin workflow
manages sibling ordering. Tie-breakers ensure navigation is still
deterministic if inconsistent data exists.

## 6. API Contract

### 6.1 Endpoint

Extend:

```text
GET /api/problems/[id]
```

### 6.2 Response

Replace the standalone same-chapter `next_problem_id` calculation with:

```ts
type ProblemNavigationItem = {
  id: string;
  problem_no: number;
  title: string;
  chapter_id: string;
  chapter_order_no: number;
  problem_order_no: number;
};

type ProblemNavigation = {
  stage_id: string;
  previous: ProblemNavigationItem | null;
  next: ProblemNavigationItem | null;
};
```

The successful response includes:

```json
{
  "problem": {},
  "test_cases": [],
  "hints": [],
  "navigation": {
    "stage_id": "stage-id",
    "previous": null,
    "next": {
      "id": "next-problem-id",
      "problem_no": 443,
      "title": "Next Problem",
      "chapter_id": "chapter-id",
      "chapter_order_no": 2,
      "problem_order_no": 1
    }
  }
}
```

For compatibility, the first implementation continues returning the legacy
`next_problem_id` and `stage_id` fields, derived from `navigation`. The student
detail page and result drawer migrate to the structured navigation object so
there is only one calculation and one source of truth. A later cleanup may
remove the legacy fields after confirming there are no remaining consumers.

### 6.3 Query Strategy

The server should:

1. Load the current published problem.
2. Resolve its published chapter and stage.
3. Load published chapters in that stage.
4. Load the minimal navigation fields for published problems in those
   chapters.
5. Sort and select the two neighboring records in server code.

Sorting and neighbor selection should live in a small pure
`resolveProblemNeighbors` helper. The route owns database access; the helper
owns deterministic ordering and boundary selection.

The response must not include problem descriptions, starter code, test cases,
hints, submissions, or student data for neighboring problems.

This is intentionally server-computed. The browser must not download the full
stage curriculum merely to calculate two IDs.

## 7. Student Header Experience

### 7.1 Placement

Place a compact navigation group in the problem header near the current title
and difficulty:

```text
[목록] | [← 이전]  442. Matrix Row Sums  [쉬움]  [다음 →]
```

The existing timer and Run/Submit controls keep their current roles.

### 7.2 Button Content

- Previous button: left arrow and `이전`.
- Next button: `다음` and right arrow.
- Each button has a tooltip or accessible description containing the
  destination problem number and title when a destination exists.
- The controls use the existing neutral header-button style. Next must not
  visually compete with the primary Submit action.

### 7.3 Boundary States

- On the first problem in a stage, Previous is rendered disabled.
- On the final problem in a stage, Next is rendered disabled.
- Disabled controls remain visible so the layout does not shift between
  problems.
- Disabled controls include an accessible disabled state and do not navigate.

### 7.4 Responsive Behavior

- Desktop: show arrow icons and the `이전`/`다음` text.
- Narrow widths: text may be visually hidden, but arrow buttons remain.
- Accessible names always remain `이전 문제` and `다음 문제`.
- The current problem title remains truncatable and must not push Run or
  Submit off-screen.

## 8. Availability Rules

Navigation does not depend on submission or progress status:

- Unsolved students may move Previous or Next.
- A failed or partial result does not lock navigation.
- A passing result does not automatically navigate.

Both navigation controls are temporarily disabled when `isRunning` is true,
including:

- Local manual execution.
- Local sample execution.
- Active server submission or result polling.

This prevents leaving a running worker or an incomplete grading request in an
ambiguous state. Controls become available again when execution or grading
finishes or is stopped.

## 9. Draft Preservation

Before routing to a neighbor:

1. Cancel the pending draft debounce timer.
2. If a current session exists and editor code differs from the last saved
   value, send the current code to `PATCH /api/sessions/[sessionId]`.
3. Use `keepalive: true` so navigation does not cancel the request.
4. Navigate immediately after initiating the safe draft write; do not block
   the interface on network latency.

The existing page cleanup save remains as a fallback. The navigation handler
provides an explicit save path so the feature does not depend solely on React
effect cleanup timing.

If draft saving fails, navigation still proceeds. The existing earlier
autosave remains available, and navigation must not trap the student on the
page without a recovery action.

## 10. Problem-to-Problem State Reset

Navigating between two values of the same dynamic route may reuse the client
component. The implementation must explicitly reset problem-scoped state when
`problemId` changes.

Reset before loading the new problem:

- Problem data and load error.
- Navigation data.
- Starter code and editor code until the new starter/draft is resolved.
- `codeRestoredRef`.
- `lastSavedCodeRef`.
- Session ID and session refs.
- Submission attempt count.
- Timer.
- Terminal lines, open result drawer, Python error and awaiting-input state.
- Active sample and manual input queues.
- Hint and AI feedback state associated with the previous problem.

Dispose or stop any previous local runner activity before accepting input for
the new problem.

The new problem then follows the existing priority:

1. A requested historical submission code, when a submission ID is present.
2. A saved draft from the new problem's session.
3. The new problem's starter code.

Old problem code must never flash in or become the draft for the new problem.

## 11. Routing

Neighbor links use:

```text
/problems/{problemId}
```

Historical submission query parameters such as `sid` must not carry into
normal Previous/Next navigation.

The header's List action should return to:

```text
/problems?stage={stageId}&chapter={currentChapterId}
```

when navigation metadata is available. This preserves curriculum context and
expands the relevant chapter. If metadata is unavailable, fall back to
`/problems`.

## 12. Submission Result Drawer

The result drawer receives the same structured `navigation.next` item used by
the header.

- After a pass, its Next Problem action navigates to `navigation.next.id`.
- If `navigation.next` is `null`, it returns to the current stage catalog.
- It must not perform a separate next-problem query.
- It may keep a direct link because the successful submission workflow has
  already persisted the submitted code before the drawer is shown.

## 13. Error Handling

### Navigation metadata cannot be calculated

The detail problem still loads. Previous and Next render disabled, and List
falls back to `/problems`.

### Neighbor is unpublished between load and click

The destination returns the existing not-found experience. The student can
return to the problem catalog.

### Current problem has no chapter or stage

Return `navigation: null`. The detail page remains usable without
Previous/Next navigation.

### Duplicate or inconsistent ordering

Use the deterministic tie-breakers from Section 5. Do not fail the problem
detail request solely because two sibling records share an order number.

## 14. Accessibility

- Navigation is contained in a semantic `nav` with an accessible label such
  as `문제 이동`.
- Buttons or links have accessible names `이전 문제` and `다음 문제`.
- Disabled boundary states use the native disabled mechanism or
  `aria-disabled`.
- Destination titles are available as supplementary accessible descriptions
  or tooltips.
- Keyboard focus is clearly visible.
- Navigation does not move focus unexpectedly before routing.
- Icons are decorative when adjacent text or accessible names already
  describe the action.

## 15. Security and Privacy

- Use the authenticated public problem-detail endpoint.
- Only published curriculum entities participate.
- Neighbor metadata contains no hidden testcase, hint, solution, draft, or
  submission data.
- The server derives navigation from database ordering; the client cannot
  choose hidden or unpublished neighbors.

## 16. Testing

### Unit tests

- Sort stage problems by chapter order and problem order.
- Resolve previous and next inside one chapter.
- Resolve Next from the final problem of one chapter to the first problem of
  the next chapter.
- Resolve Previous across the same chapter boundary.
- Return `previous: null` for the first stage problem.
- Return `next: null` for the final stage problem.
- Exclude unpublished chapters and problems.
- Apply stable tie-breakers for duplicate order values.

### API tests

- Return structured navigation for a middle problem.
- Return boundary `null` values correctly.
- Return `navigation: null` for a published problem outside a valid published
  curriculum path.
- Do not expose neighboring problem content or testcase data.

### Component tests

- Render both enabled controls for a middle problem.
- Render Previous disabled at the beginning.
- Render Next disabled at the end.
- Disable both controls while `isRunning`.
- Use destination problem titles in accessible descriptions.
- Preserve responsive accessible names when text is visually hidden.

### End-to-end tests

1. Open a middle problem and navigate Previous.
2. Navigate Next within the same chapter.
3. Navigate Next across a chapter boundary.
4. Verify navigation never crosses the current stage.
5. Edit code, navigate away, return, and verify the draft is restored.
6. Verify old problem code does not appear in a new problem without a draft.
7. Verify controls are disabled while local code is running.
8. Verify the final stage problem has a disabled Next control.
9. Pass a problem and verify the result drawer uses the same Next destination.
10. Use List and verify the current stage and chapter context is restored.

## 17. Acceptance Criteria

- Students can navigate Previous and Next through every published problem in
  the current stage.
- Navigation follows chapter order and then problem order.
- Navigation crosses chapter boundaries but not stage boundaries.
- Solve status never locks navigation.
- First/last boundary controls are visible and disabled.
- Draft code is preserved when navigating.
- Problem-specific UI state is reset correctly.
- The header and result drawer use one server-authoritative navigation result.
- Unpublished curriculum records and private data are never exposed.
- Manual Run, sample runs, Submit and grading behavior remain unchanged.
