# Monitoring Pointer: Fixed-Canvas Coordinates

**Date:** 2026-08-20
**Branch:** `feat/cove-studio-v2`
**Status:** Approved for implementation — revised 2026-08-20: canvas mode is session-scoped (§3.8), open questions resolved (§11)
**Supersedes for this subsystem:** the surface-box coordinate transform in
`packages/web/src/lib/monitoring/awareness/surfaces.ts`
**Related:** `2026-08-06-v2-monitoring-pointer-caret-parity-design.md`,
`2026-08-05-main-style-monitoring-caret-and-iframe-pointer-design.md`,
`2026-08-10-student-inline-hint-reveal-design.md`

## 1. Problem

In the statement (이론) pane the teacher's arrow and the student's arrow land on
different content. The pointer is worse than useless: it asserts a position
that is wrong.

The transport is not at fault and the coordinates are not raw pixels. The wire
format is already normalized (`monitoring.ts:188`). The defect is the choice of
reference box at both ends:

- send — `use-awareness.ts:265` measures against
  `resolved.element.getBoundingClientRect()`
- receive — `surfaces.ts:69` reverses against the reader's own rect

The statement surface is a scroll container on both sides (`workspace.tsx:448`,
`live-workspace.tsx:366`), and `getBoundingClientRect()` returns its **visible
viewport box**, never its scrolled content. `scrollTop` appears nowhere in the
transform.

`(0.5, 0.5)` therefore means *"the middle of my visible pane right now"*, not
*"this paragraph"*. Fastest reproduction: scroll your own statement pane while
the peer holds still, and their arrow **rides along with your pane**.

### 1.1 Divergence axes

| # | Axis | Cause | Fate |
|---|---|---|---|
| 1 | Independent scroll offset | reference box excludes `scrollTop` | **Eliminated** — §3.3 |
| 2 | Reflow from pane width | `statementWidth` is per-user, never shared (`use-split-pane.ts`) | **Eliminated** — §3.1 |
| 3 | Different content | teacher gets `revealedHints={…hints.length}` (`live-workspace.tsx:378`) | **Eliminated** — §5 |
| 4 | Async iframe height | `RichTextFrame` height from inner `body.scrollHeight` (`rich-text-frame.tsx:121`) | **Eliminated** — deterministic under §3.1 |
| 5 | Viewport size, browser zoom, DPR | — | **Eliminated** — §3.2 |
| 6 | Teacher previewing another exercise | `shown = previewed ?? liveExercise` (`live-workspace.tsx:161`) renders a different document while awareness stays on the student's `draftId` | **Must be guarded** — §3.6 |

### 1.2 Out of scope

The v1 fullscreen pages (`ProblemSolveClient.tsx:357`, `FeedbackClient.tsx:323`)
broadcast pane-relative fractions over Supabase channels and track only the
editor pane. Different transport, different defect, retiring with v1.

## 2. Reference behavior

1. The peer's arrow appears at the **same place in the same layout** on both
   screens, regardless of window size, pane width, or zoom.
2. When the peer points at content the reader has scrolled past, the reader is
   told the direction — never given a misplaced arrow.
3. The system never draws an arrow it cannot justify. This extends the rule
   already established in `remote-pointer.tsx`.
4. Nothing about the sender's screen becomes observable. The privacy property
   asserted at `monitoring.ts:182-186` must survive.

## 3. Architecture

### 3.1 A fixed logical canvas

The statement stops reflowing to the pane. It renders into a canvas of fixed
logical width, scaled uniformly to fit whatever pane it lands in:

```
STATEMENT_CANVAS_WIDTH = 640      // logical px
scale = clamp(paneWidth / 640, 0.7, 1.4)
```

```
<div data-collab-canvas="statement" style={{
  width: 640,
  transform: `scale(${scale})`,
  transformOrigin: 'top left',
}}>
```

The scroll container reserves `contentHeight * scale` so scrolling stays
correct, and centers the canvas horizontally when `scale` is capped at 1.4.

Inside the canvas, layout is a **deterministic function of `content` alone** —
same line breaks, same paragraph heights, same total height, on every machine.
This is what makes axes 2 and 4 disappear rather than being corrected for.

### 3.2 The scale factor cancels

The two sides may compute **different** `scale` values. That is fine, and it is
the property that satisfies "no matter the window size".

A position is measured in **canvas widths, on both axes**:

- send: `(clientX - left) / width`, `(clientY - top) / width`
- receive: `left + x * width`, `top + y * width`

`y` is divided by the width, not the height, and is therefore not a fraction —
a statement three times taller than it is wide has a `y` of 3. The width is
fixed by the canvas and identical on both screens; the height is not, because
the two people can render statements of different lengths (§5). Dividing `y` by
a number that differs between them makes the arrow drift further down the page
the longer the statement is, which is the same class of error as the original
bug and was shipped once before being caught.

`getBoundingClientRect()` reports the *transformed* box, so `canvasRect.width`
is `640 * scale` on each side and the scale divides out. Neither side needs to
know the other's window size, pane width, zoom, or scale — and none of that
information is on the wire, which is how §2.4 is preserved.

**Consequence: `toSurfaceFraction` and `toViewportPoint` in `surfaces.ts` are
already correct and do not change.** The entire coordinate fix is *which
element they are handed* — the fixed canvas instead of the scroll container.

### 3.3 Scroll comes free

The canvas element lives inside the scroll container, so its
`getBoundingClientRect().top` already moves with scroll. One rect read handles
axis 1 with no scroll offset on the wire and no new listener — the existing
capture-phase scroll handler in `remote-pointer.tsx:88` already triggers
re-placement.

### 3.4 The iframe needs one correction

`RichTextFrame` sits inside the canvas. Its inner document lays out at logical
width and reflows deterministically, so it inherits §3.1 for free and the
pointer bridge is otherwise unchanged.

But `iframePointToViewport` (`iframe-pointer-capture.ts:18-23`) adds the inner
document's **unscaled** `clientX` to the frame's **scaled** viewport origin.
Under a transform that is wrong by exactly the scale factor. It must divide it
out, read from the element rather than passed down from React:

```
const k = frameBox.width / frame.offsetWidth;   // scaled ÷ logical
clientX: frameBox.left + point.clientX * k
clientY: frameBox.top  + point.clientY * k
```

This bug does not exist today because nothing is scaled. It is introduced by
§3.1 and must land in the same change.

### 3.5 The wire says which space it is in

A canvas fraction and a surface fraction are both numbers in `0..1` and mean
different things. Mixing them silently reintroduces the original bug, so the
space is explicit:

```
{
  surface,                            // unchanged, required
  x, y,                               // unchanged, required
  space?: 'canvas' | 'surface',       // new; absent means 'surface'
  material?: string,                  // new; see §3.6
}
```

| Wire | Receiver in canvas mode | Receiver not in canvas mode |
|---|---|---|
| `space: 'canvas'` | draw | chip — cannot map |
| `space: 'surface'` or absent | chip — cannot map | draw (today's path) |

Absent means `'surface'`, so old clients keep working and mixed-version
deployments degrade to a truthful chip rather than a confident lie. This is the
single rule that prevents regression, and it needs a test of its own (§7).

Only `statement` becomes a canvas surface. `editor` has its own line/column
caret transport, which is already content-based and correct. `curriculum`,
`terminal`, `header` and `feedback` keep `space: 'surface'` and behave exactly
as today — the discriminator is what makes that safe.

### 3.6 Positions carry content identity

`live-workspace.tsx:161` resolves the statement as `shown = previewed ??
liveExercise`, while `use-live-workspace.ts:409` scopes awareness to
`session?.draftId` — which **preview does not change**. Neither
`use-live-workspace.ts` nor `use-awareness.ts` mentions preview at all.

So a teacher previewing exercise B while the student solves exercise A
publishes canvas fractions measured against B's document. Those map perfectly
onto A's canvas and produce a **confident arrow on unrelated text**.

Today that case is already wrong, but diffusely. A canvas would make it wrong
with conviction — strictly worse than the bug being fixed, and a direct
violation of §2.3. **This guard ships with the canvas, not after it.**

The position carries the `materialId` it was measured against. The receiver
drops any position whose material does not match what it is rendering, and
shows a chip. One string comparison, and it generalizes: it also covers the
student navigating to another exercise mid-session.

Suppressing publication while previewing was considered and rejected as the
*primary* mechanism — it fixes one path, whereas identity makes the whole class
unrepresentable. It may still be desirable on product grounds; that is a
separate decision and the guard must not depend on it.

### 3.7 Canvas mode is session-scoped

`use-student-monitoring.ts:220` states a rule this subsystem already holds:

> *an unwatched student's editor is exactly the editor it always was*

A permanent canvas violates it. The 이론 pane is read on every exercise, almost
always with nobody watching, so a permanent canvas would make every student pay
the costs in §9 so that two people can occasionally share a pointer.

The canvas therefore engages **only while a collaboration document exists** —
the same condition that already gates pointer publishing (`draftId !== null` in
`use-awareness.ts`). Solo reading is untouched: it reflows exactly as today,
browser zoom behaves exactly as today, and no minimum pane width applies.

The transition is already safe. §3.5's `space` discriminator exists precisely so
a side that has not yet entered canvas mode shows a chip instead of a wrong
arrow, so the two sides may enter and leave canvas mode independently.

The cost this trades for is a re-layout of the statement when a session begins.
That is acceptable because it is visible, explainable, and coincides with the
indicator that already appears (`monitoring-indicator.tsx`) — it reads as
entering a shared mode rather than as a glitch.

### 3.8 Visibility, which is not position

A canvas coordinate is exact even when the reader has not scrolled to it.
Position and visibility are different problems:

| Rung | Condition | Presentation |
|---|---|---|
| 1 | space and material match, canvas rect inside the surface's visible box | the arrow, exact |
| 2 | matches, but scrolled out of the surface's box | directional edge chip — *"Teacher is pointing ↑"* — click scrolls it into view |
| 3 | space or material mismatch | region chip naming the surface |
| 4 | surface not on this screen | today's `peer.looking_at` chip, unchanged |

`isBoxVisible` (`surfaces.ts:87`) already implements rung 4's test and is
reused for rung 2 against the canvas rect.

**Follow mode** — the reader's scroll tracking the peer's — is an opt-in
toggle, default off, and is the only part of this design that takes control
away from the person whose screen it is. It is built as a mode rather than a
default so that 이론 (teacher-led, following is correct) and exercise-solving
(student-led, following is hostile) can differ without a second mechanism.

## 4. Components and data flow

| Component | Change |
|---|---|
| `packages/shared/src/monitoring/monitoring.ts` | `space` and `material` on `collaborationPointerSchema`; note the preserved privacy property |
| `packages/api` | none — the gateway passes the pointer through |
| `problem-statement.tsx` | render inside the fixed canvas; `data-collab-canvas` |
| new `lib/workspace/statement-canvas.ts` | width constant, clamp, scale from a `ResizeObserver` on the pane |
| `use-split-pane.ts` | horizontal `min` becomes a px floor (`640 * 0.7 = 448`) instead of `28`% |
| `iframe-pointer-capture.ts` | scale correction in `iframePointToViewport` (§3.4) |
| `surfaces.ts` | resolve the canvas element; **the two transforms are unchanged** |
| `use-awareness.ts:265` | measure the canvas; stamp `space` and `material` |
| `remote-pointer.tsx` | ladder §3.7; measure the canvas inside the existing `requestAnimationFrame` batch |
| `packages/i18n` | strings for rungs 2 and 3, `en` and `ko` |

No new timers, no new observers on the awareness path, no new socket events, no
new server state.

## 5. Hints: closing axis 3

Content that is not rendered cannot be pointed at, and no coordinate system
changes that. The canvas does not fix this on its own.

Two designs were considered. **Mirroring** — the teacher renders the student's
reveal state, with the hint text moved to a teacher-only panel — needs the
reveal count on the wire and leaves the divergent content inside the shared
box. **Removal** takes the hints out of the statement altogether: a control of
fixed height opens a dialog. Removal wins, and by some distance:

- the statement becomes role-identical, so axis 3 closes at its source rather
  than being synchronized;
- no new wire signal, no new disclosure question, nothing to keep in step;
- the dialog is portaled clear of every collaboration surface, so a mouse over
  it has no shared coordinate to report — which is already how the awareness
  layer treats a modal (`use-awareness.ts`, "no shared coordinate for browser
  chrome, a modal, or a gap between panes");
- the student's hint visibility is unchanged, and the teacher reads hints the
  same way the student does.

The control is fixed-height on purpose. Its *label* differs by role and by how
many hints are open; its *box* must not, or the statement is a different height
on the two screens and §3.2's guarantee is lost at the last step.

This also removes the `hintsExpanded` state: the dialog is the show and hide.

**The invariant this establishes:** everything inside the statement canvas is
identical for both roles. There is no enforcement beyond review, so any content
added there that depends on role, progress, or permission reopens this bug.
Put it in a dialog, or outside the canvas.

## 6. Error and recovery behavior

- **Canvas not yet measured.** No `space: 'canvas'` is published until the
  scale is known; positions degrade to a chip, never to a surface fraction.
- **Late-loading images.** Canvas height changes identically on both sides
  because layout is deterministic. The existing `ResizeObserver` in
  `RichTextFrame` re-measures. Transient and self-healing.
- **Content change.** Awareness is already scoped to `draftId`, and §3.6 adds
  `materialId`, so a position measured against one document can never be drawn
  against another.
- **Cross-origin frame.** Anchors and scale cannot be read; the existing
  `try/catch` in `observeSurfaceIframes` applies and the position degrades.
- **Performance.** `getBoundingClientRect()` forces layout and runs inside the
  batch already established at `remote-pointer.tsx:72-77`. Scale is computed
  from one `ResizeObserver` on the pane, not per pointer event.

## 7. Verification

**Unit** — beside `surfaces.spec.ts`:

- scale cancellation: the same canvas fraction produces the same *relative*
  placement for two rects differing only by scale (§3.2);
- `iframePointToViewport` under a scaled frame (§3.4) — the regression this
  design introduces;
- space discriminator: `canvas`, `surface`, and absent each route to the
  correct rung, asserting explicitly that a canvas fraction is **never** drawn
  by a surface-mode receiver and vice versa (§3.5);
- a position bearing a foreign `materialId` is dropped, not drawn (§3.6);
- scale clamp boundaries and the derived split-pane px floor.

**End-to-end** — Playwright, in `e2e/`:

Two contexts at **different viewport widths** (1280 / 1680), the divider dragged
to **different `statementWidth` values**, scrolled to **different offsets**.
Move the teacher's pointer to a known word and assert the student's arrow lands
on the same word — as a fraction of the canvas, within a pixel tolerance.

The current suite cannot catch this: `e2e/specs/teacher-live-monitoring.spec.ts`
asserts pointer presence, absence, and label content, but never calls
`setViewportSize` and never scrolls either pane. Both roles run at the same size
and offset throughout. Adding that divergence to the harness is as valuable as
the fix.

Second case: put the teacher in **preview** on a different exercise, move their
pointer over the statement, and assert the student shows a chip and **not**
`peer-pointer` (§3.6).

## 8. Delivery phases

| Phase | Content | Status |
|---|---|---|
| 1 | `space` + `material` on the schema; `pointerIsPlaceable`; unit tests | **done** |
| 2 | fixed canvas in `problem-statement.tsx`, scale hook, split-pane px floor | **done** |
| 3 | scale correction in `iframePointToViewport` | **done** |
| 4 | sender and receiver measure the canvas; rungs 1, 3, 4 | **done — closes the reported bug** |
| 5 | rung 2 direction chip with click-to-follow | **done** |
| 6 | hints into a dialog; statement becomes role-identical (§5) | **done** — supersedes the mirroring design |
| 7 | opt-in follow mode | **not started** — phase 5's click-to-follow covers the need for now |

### 8.1 What replaced phase 6

`revealedHints` is local React state on the student (`workspace.tsx:317`):
never persisted, never transmitted. Phase 6 therefore needs a new monitoring
signal end to end — a shared schema field, a gateway event, server relay, and
the teacher-side panel. That is a standalone feature with its own disclosure
question (the teacher learns how much help the student has taken), not a detail
of the coordinate fix, and §5 already says it ships independently.

Phase 6 was **superseded** rather than deferred. §5 moves the hints into a
dialog, which closes axis 3 without any of the wire work phase 6 needed. Two
defences now stand where one wrong claim used to:

1. **Geometry.** `y` is measured in canvas widths (§3.2), so no height
   difference — from hints or anything else — can skew a position. This is the
   general fix, and it is what makes the canvas robust rather than merely
   correct today.
2. **Content.** Nothing role-dependent remains in the canvas at all (§5).

The original text of this section claimed `pointerIsPlaceable` would refuse a
mismatched-height position. It does not: same material, same space, so the
arrow was drawn confidently in the wrong place. That shipped, and was found by
the user opening a problem that had hints.

### 8.2 Deferred: within-block precision

Canvas coordinates are exact for any content both people render. Nothing about
this design needs anchors, ids, or text offsets, and none were built.

## 9. What this achieves, and what it costs

**Achieved.** Axes 1, 2, 4, 5 close by construction rather than correction —
window size only sets a scale factor, and §3.2 divides it out. Axis 6 closes
through §3.6. Axis 3 is *contained* rather than closed until phase 6 (§8.1):
the position is refused rather than misplaced. After phase 4, "the arrow is in the
wrong place" is closeable as a defect every time.

**Costs, stated plainly.** All three apply *only while a session is live*
(§3.8); solo reading pays none of them:

1. **Text size tracks pane width.** Dragging the divider narrower makes the
   이론 text smaller instead of reflowing. The clamp bounds how far.
2. **Browser zoom and user font-size settings behave differently** inside a
   transform-scaled canvas. Session-scoping reduces this from a permanent
   accessibility regression to a bounded one, but it does not remove it: a
   screen-reader user in a live session must still get the statement in order,
   and that is verified in §7 rather than assumed.
3. **A minimum statement width** of 448px while collaborating, which costs
   editor space on 1280-wide laptops.
4. **A re-layout when a session begins and ends** (§3.8).

**Still not closed, by nature:**

- ~80 ms of throttle and network latency — causes staleness, never
  mispositioning, and is unrelated to this report;
- an anchor the reader has not scrolled to — an absent position, not a wrong
  one, answered by rung 2 or follow mode.

Recording this distinction is part of the deliverable. It is what stops
"I couldn't see where the teacher was pointing" being re-filed forever as the
same bug: that report is the ladder working, and its remedy is UI affordance,
not coordinates.

## 10. Decisions

| Decision | Rationale |
|---|---|
| Fixed logical canvas, uniformly scaled | The only way to make *visual* position identical; layout becomes a function of content alone |
| Canvas fractions, not anchors | The scale cancels (§3.2), so the existing transforms are already correct — a fraction of the right box beats a new id scheme, with far less machinery |
| Different scale on each side is fine | Scale is applied identically to content and pointer; nothing about either screen reaches the wire |
| `space` discriminator on the wire | Canvas and surface fractions are both `0..1` and mean different things; mixing them is exactly the original bug |
| Positions carry `materialId` | Preview renders a different document under an unchanged `draftId`; without identity, a canvas is worse than today |
| Fix `iframePointToViewport` in the same change | The scale bug is introduced by this design, not inherited |
| Teacher mirrors the student's reveal state | Makes the documents structurally identical without hiding anything from the teacher |
| Fixed-height hint placeholders | A height-matched placeholder leaks the hidden text's length |
| Follow mode opt-in, default off | 이론 and exercise-solving want opposite defaults; a mode serves both without a second mechanism |
| Never force-sync pane width or hint collapse | Each belongs to the person whose screen it is |
| Canvas mode is session-scoped | `use-student-monitoring.ts:220` already holds that monitoring must not change the unwatched experience; a permanent canvas taxes every reader for an occasional feature |
| Canvas for `statement` only | `editor` already has content-based caret transport; other surfaces are safe under the discriminator |
| v1 fullscreen pointer left alone | Retiring with v1; not worth two repairs |

## 11. Resolved

1. **Canvas width and clamp — 640 / 0.7 / 1.4.** v1 shipped the statement at
   42–46% of the window (`FeedbackClient.tsx:66`, `ProblemSolveClient.tsx:254`)
   and v2 kept 46%, which is ~620px on a 1440 screen. 640 is therefore the
   width students already read at, so canvas mode lands at scale ≈ 1 in the
   default layout and the transition in §3.8 is nearly invisible. Still
   confirmed against real authored content in phase 2.
2. **Follow mode — built, default off.** Session-scoping (§3.8) already makes
   the pointer exact whenever it matters, so following buys visibility only.
   Defaulting it on would take scroll control from a student who is reading,
   which is the same mistake §3.8 rejects co-scrolling for. Ships as phase 7
   behind an explicit toggle.
3. **Rung 3 wording — name the region, not the content.** *"Teacher is pointing
   at the hints"* rather than *"…at a hint you haven't opened"*. Both are
   truthful, but the second reveals that a specific hidden hint is relevant,
   which quietly does the student's thinking for them. Naming the region keeps
   the nudge without the inference. Authored per language, not assembled.
