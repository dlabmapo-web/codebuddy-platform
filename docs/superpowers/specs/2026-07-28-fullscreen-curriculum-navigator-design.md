# Fullscreen Curriculum Navigator Design

## Summary

Add a shared, collapsible curriculum navigator to the fullscreen student problem-solving
page and teacher live-monitoring page. The navigator makes the current
Subject → Stage → Chapter → Problem context visible without covering the problem,
editor, terminal, or feedback workspace.

The feature follows the familiar course-content navigation pattern used by learning platforms such as Elice, while retaining Cove Studio's existing UI and problem/session behavior.

## Goals

- Make the student's exact curriculum location clear to both students and teachers.
- Let students move directly to another published problem in the current subject.
- Let teachers inspect other published problems in the current subject without leaving
  or corrupting the monitored live session.
- Detect when a monitored student moves to another problem and let the teacher deliberately follow the new live session.
- Reuse the existing smooth problem transition, code preservation, session lifecycle, and return-navigation behavior.
- Let the problem and editor adapt smoothly to the remaining desktop width while
  preserving their existing relative split and usability.

## Non-goals

- Replacing the main problem catalog.
- Showing every subject in the academy inside the fullscreen drawer.
- Letting a teacher edit, run, submit, or persist code while previewing a problem the
  student is not currently solving.
- Automatically moving the teacher away from code or unsent feedback.
- Adding drag-to-resize behavior.
- Migrating monitoring updates to private Supabase Realtime channels in this feature.

## Shared Layout

### Header context

Both fullscreen pages show a compact curriculum button and breadcrumb near the existing top-left problem title:

`Subject › Stage › Chapter › Problem`

Long labels truncate with a tooltip containing the complete path. The breadcrumb opens the same navigator as the menu button.

### Adaptive curriculum panel

- Opens from the left beneath the fullscreen header.
- Uses one shared 320px desktop width and one shared 48px header offset on both
  fullscreen pages.
- On desktop viewports, occupies a dedicated column and reduces the remaining workspace
  width. The problem description and editor keep their relative split within the
  remaining space, so the panel never covers either surface.
- The visible panel and reserved workspace column consume the same shared geometry
  values rather than repeating page-specific responsive classes. This prevents the
  teacher panel from becoming narrower or vertically offset from the student panel.
- Applies a short width transition. Monaco uses its existing automatic layout support
  to fit the resized editor.
- On viewports too narrow to support three useful columns, falls back to a temporary
  overlay with a small right margin.
- Does not dim, blur, disable, or otherwise visually close the problem workspace.
- Leaves the problem description, editor, terminal, and teacher feedback workspace
  visible and interactive while open.
- Uses the existing theme tokens and supports light and dark modes.
- Closes through the close button, Escape, or by pressing the header trigger again.
- Returns keyboard focus to the trigger after closing.
- Starts closed on a fresh fullscreen entry.
- Remains open while the student moves between problems through smooth in-page transitions.
- Uses identical dimensions, docking, scrolling, header, and footer behavior on
  student and teacher fullscreen pages. Teacher mode differs only in selection
  permissions and live-state presentation.

The drawer is a non-modal navigation surface. It is rendered through a document-level
portal so the student and teacher fullscreen layouts cannot clip it or place it behind
their workspace. It has an accessible label and keyboard-operable accordion controls,
but it does not trap focus because the underlying workspace remains usable.

The subject header and `All subjects` footer remain fixed inside the panel. Only the
curriculum tree scrolls. Its flex child has an explicit zero minimum height,
overscroll containment, and stable scrollbar space so long subjects remain navigable
without moving the panel controls.

## Curriculum Tree

The drawer represents the current subject only:

1. Subject title
2. Published stages
3. Published chapters within each stage
4. Published problems within each chapter

Stages and chapters use accordions. The current stage and chapter expand automatically. Other sections remain collapsed until opened by the user.

An `All subjects` link returns to the role-appropriate catalog or monitoring page rather than loading the entire academy hierarchy into the drawer.

Problem rows show:

- problem number and title;
- current/live status;
- passed status;
- attempted but not passed status;
- untouched status.

Ordering follows the existing subject, stage, chapter, and problem `order_no` rules. Unpublished curriculum items are never returned to students or teachers.

## Student Behavior

Every published problem row is actionable.

Selecting a different problem reuses the existing smooth transition lifecycle:

1. Stop any running local program.
2. Preserve the current editor code.
3. End the current collaboration session.
4. Load the destination problem, samples, hints, neighbors, and curriculum context.
5. Reuse or create the destination collaboration session according to existing session rules.
6. Update browser history and the visible breadcrumb without a full-page flash.
7. Keep the drawer open and highlight the destination problem.

Selecting the current problem does nothing. Navigation is disabled while a submission, sample execution, or problem transition is active. A failed destination load leaves the current problem and code intact and shows a recoverable error in the drawer.

## Teacher Behavior

The teacher sees the same current-subject tree and the monitored student's progress
states.

- The student's active problem is highlighted with a `Live` indicator.
- Every published problem row in the current subject is actionable.
- The header breadcrumb represents the problem currently displayed in the teacher workspace.
- The drawer's live indicator always represents the student's latest active problem,
  which may differ from the problem the teacher is previewing.

### Teacher live and preview modes

The teacher workspace has two explicit modes:

**Live mode**

- The displayed problem is the student's active problem.
- The editor and terminal show the student's synchronized live session.
- The teacher may collaborate, run code, and send feedback using the existing behavior.

**Preview mode**

- Selecting a non-live problem fetches that published problem's public detail snapshot.
- The left pane shows the same public statement content as the student page: execution
  limit, language, description, input/output formats, public sample inputs and outputs,
  and constraints.
- The right editor shows that problem's initial code read-only.
- Hidden test cases, expected hidden outputs, judge configuration, and private scoring
  data are never returned or rendered.
- Preview code cannot be edited, executed, submitted, persisted, broadcast, or mistaken
  for the student's live code.
- Live session updates continue in the background without overwriting the preview.
- Terminal collaboration controls and feedback submission are unavailable in Preview
  mode.
- A persistent banner states:

  `Previewing {preview problem} · Student is LIVE on {live problem}`

  and provides `Return to live problem`.
- Selecting the live problem row or the banner action exits Preview mode and restores
  the latest synchronized student code, terminal, and feedback workspace.
- Preview state is local to the teacher page and does not create or end a collaboration
  session.

Student movement continues to update the `Live` marker while the teacher previews
another problem. If the student changes sessions, returning to live follows the latest
authorized live session rather than a stale one.

### Student movement

The teacher page checks the monitored student's authenticated active-session context at the existing monitoring refresh cadence.

When the active session changes:

1. Keep the teacher on the current code and preserve unsent feedback.
2. Update the drawer's live problem and curriculum path.
3. Show a persistent, non-blocking banner:

   `The student moved to {problem number}. {problem title}` — `Follow student`

4. The `Follow student` action opens the new live feedback session while retaining the teacher's monitoring return location.
5. Dismissing the banner does not end monitoring; it returns if the active session changes again.

If the student has no active session, show `Student is not currently solving a problem` and keep the last displayed session available for review.

The page must never switch sessions automatically.

## Data and API Design

### Shared curriculum service

Create a server-only curriculum-context service responsible for:

- resolving the current subject, stage, chapter, and problem path;
- returning the current subject's published tree in canonical order;
- resolving per-problem progress for the relevant student;
- returning a stable response shape used by both student and teacher endpoints.

The service takes an explicit student ID. Student endpoints derive it from the authenticated user. Teacher endpoints derive it from an authorized collaboration session or monitored student record. Clients cannot choose an arbitrary student ID without server authorization.

### Response shape

The shared context contains:

```ts
type LearningContext = {
  path: {
    subject: { id: string; title: string };
    stage: { id: string; title: string };
    chapter: { id: string; title: string };
    problem: { id: string; problemNo: number; title: string };
  };
  subject: {
    id: string;
    title: string;
    stages: Array<{
      id: string;
      title: string;
      orderNo: number;
      chapters: Array<{
        id: string;
        title: string;
        orderNo: number;
        problems: Array<{
          id: string;
          problemNo: number;
          title: string;
          orderNo: number;
          status: 'passed' | 'attempted' | 'untouched';
        }>;
      }>;
    }>;
  };
};
```

### Student problem response

Extend the existing problem-detail response with `learning_context`. This avoids a second initial request and keeps the problem snapshot used by smooth transitions authoritative.

The existing `navigation.previous` and `navigation.next` fields remain for header controls.

The authenticated problem-detail endpoint is also the source for teacher previews. For
a teacher request it returns only the same published problem fields, public sample
cases, and hints already available to students; it never returns hidden judge cases.
Teacher preview does not request a second student's progress context.

### Teacher session response

Extend the session-detail response with `learning_context` resolved for that session's student and problem.

Add `GET /api/students/[studentId]/active-context` as an authenticated
teacher-only endpoint. It returns only:

- active session ID;
- active problem ID;
- active curriculum path;
- whether the student currently has an active session.

Add `GET /api/sessions/[sessionId]/learning-context` for an authorized teacher
to retrieve the normalized curriculum context for a newly detected live session
without changing the displayed editor session.

When the active problem changes, the teacher client fetches the new session's
learning context once from that endpoint. It may render that new context in the
drawer while the displayed editor remains on the previous session. Regular
monitoring checks do not repeatedly download the full tree.

The endpoint follows the platform's current teacher visibility rule: assigned students are scoped to their teacher; when no explicit mappings exist, active academy students remain visible as in the current MVP.

## Component Boundaries

### `CurriculumNavigator`

A shared presentational component that owns:

- drawer visibility and focus behavior;
- stage/chapter expansion;
- hierarchy rendering;
- status labels;
- student and teacher row affordances.

It receives normalized context, mode, displayed problem ID, live problem ID, loading state, and action callbacks. It does not fetch data or manage collaboration sessions.

### Student controller

`ProblemSolveClient` owns student navigation and passes its existing transition function to the navigator. Arbitrary drawer destinations use the same transition pipeline as Previous and Next.

### Teacher controller

`FeedbackClient` owns active-context polling, movement detection, live-session state,
teacher preview state, preview loading, and returning to the latest live session. The
navigator reports clicks for every published problem in the current subject.

The controller keeps live code and preview initial code in separate state. Realtime
student updates write only to live state while Preview mode is active.

### Shared public problem statement

Extract the student problem statement presentation into a shared component used by
both `ProblemSolveClient` and teacher Preview mode. This prevents the teacher page from
silently omitting execution limits, public samples, or constraints as it currently
does.

### Server curriculum service

Database hierarchy and progress aggregation live outside route handlers so both fullscreen APIs use identical ordering, publication, and status rules.

## Failure and Loading States

- Initial curriculum failure does not block solving or monitoring; show a compact retry state inside the drawer.
- Student destination failure preserves the current problem, code, URL, and session.
- Teacher active-context failure keeps the existing workspace and retries on the next monitoring interval.
- Teacher preview loading keeps the live session connected and shows a compact loading
  state only in the preview surfaces.
- Teacher preview failure leaves Live mode or the previous valid preview intact and
  shows a recoverable error without affecting the student session.
- A deleted or unpublished destination is removed after context refresh and cannot be opened.
- Stale `Follow student` actions validate that the target session is still active before navigating.
- Aborted requests during problem transitions or page exit are ignored rather than logged as unhandled rejections.

## Performance

- Fetch one current-subject tree on initial page/session load.
- Fetch progress for all problems in that subject in one query or bounded batch.
- Do not request the full academy catalog.
- Reuse the context included in smooth problem snapshots.
- Poll only the teacher's lightweight active-context response.
- Fetch a new full subject tree only when the active problem moves to a different subject or the context becomes stale.

## Accessibility

- Drawer trigger has `aria-expanded` and `aria-controls`.
- Accordion buttons expose expanded state.
- Current problem uses `aria-current`.
- Teacher rows expose whether they open Live mode or Preview mode.
- Status is communicated with text and icons, not color alone.
- Escape closes the drawer.
- Focus is not contained while open, allowing the student or teacher to continue using
  the underlying workspace.
- Closing with Escape or the close button restores focus to the trigger.
- Movement banners use a polite live region and do not steal focus.

## Testing and Acceptance Criteria

### Unit tests

- Curriculum hierarchy ordering and unpublished-item filtering.
- Progress-status resolution.
- Student versus teacher problem-row permissions.
- Current/live problem distinction.
- Teacher live-versus-preview mode selection.
- Preview code isolation from incoming live-code updates.
- Active-session change detection.
- Stale and missing active-session handling.

### API tests

- Student receives only their own progress.
- Teacher receives context for an authorized monitored student and session.
- Admin and unrelated users cannot access teacher active context.
- No-assignment teacher fallback remains consistent with the current MVP.
- Active-context response excludes code, hidden tests, and private judging data.
- Teacher preview responses contain only published problem fields, public sample cases,
  and permitted hints.

### Browser E2E

1. Student opens the drawer and sees the correct path and expanded current chapter.
2. On desktop, opening the panel creates a dedicated column and does not cover, dim,
   blur, or disable the problem, editor, or terminal.
3. Student selects another problem; code is preserved, session changes safely, URL/history update, and the drawer remains open.
4. Student statuses render correctly after attempted and passed submissions.
5. Teacher opens the same portal-rendered drawer and sees the monitored student's
   curriculum path.
6. Teacher selects a non-live row and sees the complete public statement plus read-only
   initial code while the live marker remains on the student's problem.
7. Incoming student code does not overwrite the teacher's preview editor.
8. Preview mode cannot run, submit, broadcast, or send feedback.
9. Teacher returns to live and sees the latest synchronized student code.
10. Student moves to another problem while Preview mode remains safe and the live marker
    updates.
11. Teacher follows the student and reaches the latest live session.
12. Closing through the close button, repeated trigger click, and Escape behaves
   correctly; keyboard-initiated closing restores focus to the trigger.
13. Long student and teacher curriculum trees scroll independently while the panel
    header and footer remain visible.
14. Student and teacher panels have the same 320px desktop width, 48px top offset,
    header, scroll region, and footer geometry.
15. Light and dark themes, desktop docking, and narrow viewport fallback behavior are
    visually verified.

## Rollout

Implement behind the existing fullscreen pages without changing database tables. Release student and teacher behavior together so both sides share the same curriculum vocabulary and response model. Keep the current Previous/Next controls as quick navigation; the drawer supplements rather than replaces them.
