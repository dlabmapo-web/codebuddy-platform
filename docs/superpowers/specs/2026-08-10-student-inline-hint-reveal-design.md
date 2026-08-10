# Student Inline Hint Reveal Design

**Date:** 2026-08-10

**Status:** Approved revision

**Scope:** V2 student programming-exercise workspace

**Companion:** `2026-08-03-problem-workspace-verdict-and-scoring-design.md`

## 1. Decision

Move the student's hint action out of the crowded fullscreen header and into
the problem statement. Place a clear progressive-reveal control directly below
the **Problem** section heading and above the problem description.

The initial control reads **Show a hint** and includes the number of unrevealed
hints. Each activation reveals exactly one additional authored hint beneath the
control. Previously revealed hints remain visible while the student works. The
reveal-next control disappears after the final hint is revealed; the revealed
cards and their Hide action remain. No hint UI renders for an exercise with no
hints.

This replaces the v2 header's quiet Hint action. It does not restore the old
version's modal right drawer: hints stay beside the statement they explain and
do not cover the editor or block the rest of the workspace.

## 2. Current behavior and finding

The v2 learn API already returns every authored hint in canonical position
order. The student workspace already owns a `revealedHints` count and renders
that prefix of the hint list inline near the bottom of the statement.

The feature appears missing because its only entry point is a quiet control in
the dense top header. At narrower widths its text is hidden, leaving only a
lightbulb icon among unrelated workspace actions. The revealed content also
appears far below the description, formats, samples, and constraints, so the
action and its result are separated from the text where the student needs
help.

The old production workspace makes the action explicit with **View Hint** and
opens a 360px right drawer. That is discoverable, but it dims the problem,
covers part of the editor, and reveals every hint at once. V2 will retain the
old action's clarity while using contextual, progressive inline disclosure.

## 3. Goals

- Make authored hints clearly discoverable to students.
- Place help next to the problem description it explains.
- Reveal one hint at a time so students request only as much help as needed.
- Keep revealed hints visible without covering or disabling the editor.
- Let students collapse and reopen revealed hints without losing reveal
  progress.
- Communicate the number of hints still available.
- Preserve the existing exercise-navigation reset behavior.
- Keep the experience localized, keyboard accessible, and responsive.

## 4. Non-goals

- AI-generated or code-sensitive hints.
- Evaluating `triggerExpression` in the student browser.
- Automatically revealing hints after elapsed time, failed runs, or rejected
  submissions.
- Persisting revealed-hint state across reloads, devices, or later visits.
- Recording hint views for grading, scoring, or analytics.
- Forgetting reveal progress when the student collapses the hint cards.
- Changing the teacher live workspace, where all authored hints remain visible
  to the teacher.
- Changing problem-authoring, hint ordering, or the learn API payload.

## 5. Student experience

### 5.1 Placement

The **Problem** section renders in this order:

```text
PROBLEM
Need help?  Show a hint (N left)
Revealed hint cards, when any
Problem description
```

The reveal row is visually secondary to the statement but unmistakably
interactive. It uses the existing lightbulb icon, brand-soft treatment, and a
real button with a visible focus state. It does not compete with Run or Submit.

The control is part of the statement's normal document flow. It must not be
positioned as an overlay, must not reduce the editor width, and must not open a
modal, drawer, popover, or tooltip.

### 5.2 Progressive reveal

For an exercise with three hints:

1. Initial state: no hint content is visible; the control says **Show a hint
   (3 left)**.
2. First activation: Hint 1 appears and the control says **Show a hint (2
   left)**.
3. Second activation: Hint 2 appears after Hint 1 and the control says **Show a
   hint (1 left)**.
4. Third activation: Hint 3 appears after Hint 2 and the reveal control is
   removed.

Hints always reveal in the server-provided canonical order. A fast double
activation may reveal at most one hint per activation and may never exceed the
available hint count.

Each revealed card contains:

- a numbered marker;
- the localized label **Hint N**; and
- the authored text with line breaks preserved.

The newly revealed card receives a polite live announcement so a screen-reader
user knows that content appeared. Focus remains on the reveal button while
more hints remain. After the final activation removes the button, focus moves
to the newly revealed final hint card so it is not lost.

### 5.3 Collapse and reopen

After at least one hint is revealed, the hint area also offers **Hide hints**.
This collapses the revealed cards but preserves the number already revealed.
The collapsed row communicates how many hints have been revealed and offers
**Show hints**. Reopening restores the same cards in the same order.

While collapsed, the student cannot reveal another hint: **Show hints** is the
single primary action. After reopening, **Show a hint (N left)** returns when
more authored hints remain. This prevents two competing “show” actions and
keeps progressive reveal understandable.

Hiding moves focus to **Show hints** after the row changes. Reopening moves
focus to **Hide hints**, leaving the cards immediately after it in reading
order. Collapsing and reopening do not trigger a live announcement because no
new instructional content was revealed.

### 5.4 Exercises without hints

When an exercise has no authored hints, the statement renders no hint action,
empty hint heading, placeholder, or reserved gap. The student sees the problem
description immediately below the **Problem** heading.

### 5.5 Navigation lifecycle

Revealed hints are local to the currently displayed exercise.

- Run, sample run, submission, result-tab changes, editor changes, sidebar
  changes, and teacher collaboration do not reset them.
- Collapsing and reopening do not reset them.
- Successful in-place navigation to another exercise resets the count before
  the destination renders and restores the default expanded visibility state.
- Failed navigation keeps the current exercise and its revealed hints.
- Browser Back/Forward follows the same successful-transition behavior and
  starts the restored exercise with no hints revealed.
- A full reload or later workspace visit starts with no hints revealed.

## 6. Component design

### Problem statement

`ProblemStatement` becomes the owner of hint presentation. It receives:

- the exercise, including ordered public hints;
- the number already revealed; and
- a callback that requests the next reveal.

It renders the control and the revealed prefix inside the Problem section,
before the description. Hint markup moves out of the separate bottom-of-page
Hints section so there is exactly one rendering path.

The component remains presentational: it does not own navigation, persistence,
API calls, or the reveal count.

### Student workspace

The student `Workspace` continues to own `revealedHints`, clamps increments to
the current exercise's hint count, and resets the count in the existing
successful navigation lifecycle. It also owns whether revealed hints are
expanded, resets that visibility on a successful exercise transition, and
passes reveal and visibility callbacks only on the student surface.

### Teacher workspace

The teacher's use of `ProblemStatement` continues to reveal every authored hint
without an interactive student control. The shared component therefore accepts
an optional reveal callback:

- callback present: student progressive-reveal control is enabled;
- callback absent: render the requested `revealedHints` count without the
  control.

Teacher previews and live statements keep `revealedHints` equal to the complete
hint count.

### Header

Remove `hintsRemaining` and `onRevealHint` from `WorkspaceHeader` and remove the
header Hint action. Reset remains in the header. No duplicate Hint button is
left behind at any breakpoint.

### Localization

Use plural-aware strings for the remaining count and a localized numbered
label for revealed cards. Add localized **Hide hints**, **Show hints**, and
revealed-count strings. English and Korean receive equivalent accessible names
and announcements. Do not concatenate translated fragments in the component.

### Accessible structure and announcements

The ordered hint list contains only `<li>` children. Decorative thread or
connector styling uses a pseudo-element or a sibling outside the `<ol>` so list
semantics remain valid.

An empty polite live-status element is mounted before the first reveal. Each
successful reveal updates that status with only the newly revealed hint's
localized label and content. Mounting the live region together with the first
hint is not sufficient because assistive technology may not announce initial
content in a newly created region.

## 7. Data and security

No API or database change is required. The learn service already authorizes the
student's course access and projects hint position and content into the public
exercise payload.

This design does not expose `triggerExpression`, hidden test data, solutions,
teacher feedback, or other authoring metadata. Reveal state is a local display
choice, not an authorization boundary.

## 8. Error handling

Revealing a hint performs no network request, so it cannot enter loading or
retry states. The count is clamped against the current hint array on every
activation.

If a malformed payload somehow supplies duplicate positions, rendering uses a
stable position-and-index key so every visible card remains represented. Empty
hint content is prevented by authoring validation and service writes; the
student component does not invent placeholder advice.

If exercise navigation fails, the current problem, code, URL, and revealed
hints remain unchanged under the existing guarded transition behavior.

## 9. Verification

### Unit and component coverage

- No hint control or gap renders for zero hints.
- The initial control shows the correct remaining count.
- Each activation reveals exactly one next hint in canonical order.
- Revealed cards preserve authored line breaks and carry numbered labels.
- The count decrements and the reveal-next control disappears after the final
  hint.
- Hide collapses cards, Show restores them, and reveal progress is preserved.
- The header no longer renders a Hint action at desktop or compact widths.
- Teacher rendering shows all hints without a reveal control.
- Final reveal leaves keyboard focus on the final hint card.
- The first and later reveals update an already-mounted polite live status
  with only the newly revealed hint.
- The ordered list has no non-`li` direct children.

### End-to-end coverage

1. Open a seeded student exercise with multiple hints.
2. Verify the hint control is above the description and no Hint action exists
   in the top header.
3. Reveal hints one at a time and verify their order and remaining counts.
4. Hide and reopen the cards, verify the same hints return, and then reveal the
   next hint.
5. Verify the editor, Run, Submit, terminal, and curriculum navigator remain
   operable while hints are visible.
6. Navigate to another exercise and verify its hint state starts unrevealed.
7. Cause or simulate a failed transition and verify current hints remain.
8. Cover the interaction in Chromium and WebKit at desktop and narrow widths.

## 10. Acceptance criteria

- A student can immediately identify how to request help from the Problem
  section without searching the top header.
- The action appears only when the displayed exercise has authored hints.
- One activation reveals one additional authored hint inline above the problem
  description.
- Previously revealed hints remain visible and ordered.
- Students can hide and reopen revealed hints without losing progress.
- The remaining count is accurate and the reveal-next control disappears when
  exhausted.
- The old header Hint action and bottom-of-statement hint section are absent.
- Student navigation resets reveal state only after a successful exercise
  change.
- Teacher live and preview statements continue to show every authored hint.
- The interaction is localized, keyboard accessible, responsive, and covered
  in Chromium and WebKit.
