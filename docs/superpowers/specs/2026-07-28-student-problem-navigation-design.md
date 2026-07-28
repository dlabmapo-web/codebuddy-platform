# Student Problem Previous and Next Navigation Design

**Date:** 2026-07-28  
**Status:** Implemented; smooth transition revision approved
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

Place the navigation group in the right-side action area, immediately before
Run and Submit. Keep the problem title and difficulty on the left:

```text
[목록] | 442. Matrix Row Sums [쉬움]     [timer]     [← 이전 | 다음 →] [실행] [제출]
```

The existing timer and Run/Submit controls keep their current roles. Moving
curriculum navigation beside the actions keeps the title area readable and
makes the navigation available where students already look for page actions.

### 7.2 Button Content

- Previous and Next share one rounded navigation capsule.
- Previous button: left arrow and `이전`.
- Next button: `다음` and right arrow.
- A divider separates the two halves.
- The capsule uses a subtle cool-blue tinted background and border derived
  from the existing theme. The active halves use blue-gray text, with a
  slightly lighter surface on hover.
- The capsule must remain visually quieter than the primary Submit button.
- Each button has a tooltip or accessible description containing the
  destination problem number and title when a destination exists.
- The group height aligns with the existing Run and Submit controls.

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

## 10. Smooth Problem Transition

Problem navigation uses a persistent workspace instead of remounting the
entire problem screen. This follows the useful interaction principle from
42.uz: keep the learning shell stable and replace only the route-specific
content when the destination is ready.

### 10.1 Transition Start

When the student chooses Previous or Next:

1. Preserve the current draft as described in Section 9.
2. Record which destination and direction were selected.
3. Show a small spinner in the clicked navigation half.
4. Disable Previous, Next, editor input, Reset, Run, sample runs and Submit.
5. Start loading the destination snapshot inside the mounted workspace.

The current problem description, code and terminal remain visible during this
period. They are read-only and visually unchanged; no full-screen loading
screen or workspace skeleton replaces them.

### 10.2 Background Load

Previous and Next must not start an App Router route transition because the
dynamic route segment may remove and recreate the client workspace while its
server-component payload is loading. `ProblemSolveClient` owns the active
problem after its initial mount and loads neighboring problems directly.

For the destination problem, load the following transition snapshot:

- Published problem detail and structured navigation.
- Sample cases and hints.
- Submission attempt count.
- Destination problem session and saved draft.
- A requested historical submission when `sid` is explicitly present.

Choose destination editor code in this order:

1. Requested historical submission code.
2. Saved destination-session draft, including an intentionally empty draft.
3. Destination starter code.

The loading request uses an `AbortController` or equivalent request identity.
If another navigation begins before it finishes, abort or ignore every result
from the older request.

### 10.3 Atomic Swap

Do not partially apply destination data. Once the snapshot is ready, update
the problem workspace together:

- Problem, navigation, samples and hints.
- Starter code and editor code.
- Session ID and autosave refs.
- Submission attempt count and timer.
- Terminal output, Python error and awaiting-input state.
- Active sample and manual input queues.
- Result drawer, hints, teacher feedback and AI feedback.

Dispose the previous local runner before accepting input for the destination.
React may batch the state updates, but the implementation must ensure the new
title never appears with old code and old problem code never becomes the new
problem's draft.

After the swap, clear the navigation spinner and restore editor and action
availability. Then update the address bar with the Next.js-supported native
History API:

```ts
window.history.pushState(null, '', `/problems/${problemId}`)
```

The URL update occurs only after the destination snapshot is ready. It adds a
normal history entry without triggering a route-segment remount.

### 10.4 Direct and Browser Navigation

Direct URL entry and the first page load may use the existing full-screen
initial loading state because no previous workspace exists.

Browser Back/Forward listens for `popstate`, reads the destination problem ID
from the URL, and uses the same background-load and atomic-swap path without
adding another history entry. Historical `sid` parameters do not carry into
Previous or Next navigation.

### 10.5 Failure Recovery

If destination loading fails:

- Keep the current problem, code and terminal intact.
- Clear the navigation spinner and restore controls.
- Replace the browser URL with the currently displayed problem URL.
- Show a compact retryable message such as
  `다음 문제를 불러오지 못했습니다. 다시 시도해주세요.`

Do not show the full-screen not-found/error state over a valid problem that is
already open. The full-screen error state remains appropriate only when the
initial problem cannot load.

## 11. Routing

Neighbor navigation produces:

```text
/problems/{problemId}
```

Historical submission query parameters such as `sid` must not carry into
normal Previous/Next navigation. The URL is written with `history.pushState`
after a successful atomic swap rather than with `router.push`, so the mounted
coding workspace is not replaced by the dynamic route segment.

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
- Keep the current workspace visible while a destination snapshot loads.
- Show progress only in the navigation control that started the transition.
- Disable editing and execution actions during the transition.
- Apply destination problem and code together after loading.
- Ignore a stale destination response after a newer navigation starts.
- Keep the current workspace and restore its URL when loading fails.

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
11. Verify navigation never replaces the workspace with a full-screen loader.
12. Throttle the network and verify the current workspace remains visible and
    read-only until the destination is ready.
13. Simulate a failed destination request and verify the current code remains
    intact and the URL rolls back.
14. Trigger Back/Forward and verify the same smooth transition behavior.

## 17. Acceptance Criteria

- Students can navigate Previous and Next through every published problem in
  the current stage.
- Navigation follows chapter order and then problem order.
- Navigation crosses chapter boundaries but not stage boundaries.
- Solve status never locks navigation.
- First/last boundary controls are visible and disabled.
- Draft code is preserved when navigating.
- Problem-specific UI state is reset correctly.
- The workspace remains mounted and visible while a neighbor loads.
- Destination problem data and editor code appear atomically.
- Failed and stale navigation cannot overwrite the current workspace.
- The header and result drawer use one server-authoritative navigation result.
- Unpublished curriculum records and private data are never exposed.
- Manual Run, sample runs, Submit and grading behavior remain unchanged.
