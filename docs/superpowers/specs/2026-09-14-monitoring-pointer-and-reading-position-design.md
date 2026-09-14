# Monitoring pointers and preserving reading position

Status: proposed implementation design based on the user's approved four requirements.
Scope: student and teacher workspaces, in both directions. No source implementation
is included in this document.

## 1. Goal and invariants

1. Starting or ending a watch must preserve the student's reading position.
2. Editor mouse arrows identify code positions, not percentages of a pane.
3. Stationary remote markers remain correctly placed when local geometry changes.
4. Each reader owns their scrolling. Incoming awareness never scrolls either reader.

The problem statement and editor use different coordinate systems. Precision means
pointing to the same document location, not reproducing the sender's screen pixels.
A marker that cannot be located safely must be hidden or shown as an existing
"elsewhere" indicator, never placed over unrelated content.

## 2. Evidence from current code

- `components/workspace/problem-statement.tsx` passes collaboration state into
  `StatementCanvas`. `components/workspace/statement-canvas.tsx` conditionally
  replaces direct children with nested canvas wrappers when engaged.
- That structural switch remounts the statement subtree, including `RichTextFrame`.
  The frame resets its measured height and initially uses a fallback height.
  This provides a plausible mechanism for scroll clamping toward the top before
  the long document is measured again. The reported browser jump is not yet
  independently reproduced; implementation must first capture a regression.
- `lib/workspace/statement-canvas.ts` measures/scales a fixed-width canvas only
  during collaboration and above its minimum width. Changing engagement can also
  occur across the minimum-width boundary.
- `lib/monitoring/awareness/surfaces.ts` maps ordinary surface pointers using box
  width/height fractions. This cannot identify the same code character across
  editor sizes, font sizes, wrapping, or independent scrolling.
- `components/monitoring/remote-pointer.tsx` repositions on window resize and
  captured scroll events, but does not observe element size changes.
- Existing off-screen statement indicators scroll only when explicitly clicked.
  Preserve this distinction between a requested jump and automatic following.
- Socket.IO, Yjs, caret awareness, and watch authorization already exist. Replacing
  the realtime transport is outside scope and would not fix these geometry bugs.

## 3. Preserve the statement and reading position

### Stable mounted content

Keep one stable wrapper hierarchy and one statement/iframe instance for a given
material. Change wrapper styles and canvas metadata when collaboration changes;
do not move children between conditional parent trees. Do not key the frame by
watch, scale, pane width, or collaboration state. Actual material navigation may
replace content and retain its existing navigation behavior.

Retain the last valid content measurement through transitions so the scrollable
footprint does not temporarily collapse. Support image/font loading and subsequent
iframe measurements without replacing the frame or resetting its content.

### Preserve a document anchor, not just scrollTop

Before changing layout mode, capture the first visible statement content anchor
and its offset from the pane's visible top. After layout/iframe measurement,
restore that same content location with bounded scroll adjustment. A raw scrollTop
copy is insufficient when responsive text reflows into the fixed-width canvas.

Use local DOM content anchors: a stable text position or block/image plus its
within-block offset. For authored HTML, derive the anchor from the existing
accessible iframe document; keep the sandbox unchanged. Inline text should use a
text position rather than a fraction of a reflowing paragraph. Anchors are local
UI state and are not transmitted to the peer.

If an anchor becomes unavailable, use the nearest surviving block and clamp within
the scroll range. Scope restoration to the same material and layout generation.
Cancel pending restoration on navigation/unmount and yield to new user scrolling;
a late image measurement must not pull the reader back after they intentionally
move. Apply initial correction before paint where possible; guard later frame
measurements against stale generations and avoid observer/scroll feedback loops.

Cover watch start, watch end, rewatch, pane divider changes, and crossing the
canvas minimum width. Neither reader's scroll position is copied to the other.

## 4. Problem-description pointer

Retain fixed logical canvas coordinates for compatible statement layouts. Both
readers must use the same logical width and matching material/content layout;
viewport scroll and scale affect only the local projection.

Validate material and coordinate-space identity before drawing. If the local
statement is in responsive fallback mode, absent, or incompatible, show elsewhere
or hide the arrow. Do not reinterpret a canvas point as a pane percentage.
Do not claim exact placement while content layout is unstable or incompatible
(e.g. an image has not yet established its dimensions); suppress the marker until
geometry is usable. Geometry tests alone do not prove matching document layout.

A point outside the receiver's visible statement remains off-screen. Existing
above/below indicators and their explicit click-to-jump behavior may remain.
Receipt of a pointer, a watch event, or a measurement never invokes that jump.

## 5. Editor mouse pointer

### Capture and identity

Capture code-area mouse targets through Monaco's mouse hit testing. Represent the
mouse anchor separately from the typing caret/selection. Moving the mouse must
not change either person's selection or editor focus.

Extend the shared awareness schema with a validated, discriminated code-position
variant. Carry material and draft identity plus positive, bounded line/column
coordinates. Use Monaco's UTF-16 column convention, including surrogate pairs.
Only actual code text positions qualify; minimap, scrollbars, gutters, widgets,
and blank pane space must not fabricate a code anchor.

Use the existing bound Y.Text to encode a Yjs relative position for the code
anchor so intervening edits do not turn a delayed line/column into another token.
Resolve it against the receiver's matching bound document, then project that
position through Monaco. Line/column can describe the sampled position but must
not be used as a silent fallback when the relative anchor is unresolved. Bound
payload sizes and validate relative-position decoding; malformed/unresolved,
wrong-draft, retired-session, and not-yet-bound anchors are suppressed.

### Projection and lifetime

Render at the corresponding Monaco code boundary using its local position/layout
APIs. Different wrapping, fonts, pane dimensions and scroll positions determine
screen pixels locally. Exact arbitrary sub-glyph mouse pixels are not promised.

Never project editor pointers with the generic percentage path. On non-code
editor targets, clear the code arrow and optionally use the existing elsewhere
indicator. Do not add a second approximate arrow over code.

Recompute after Monaco scrolling, layout, font/configuration changes, model edits,
and binding/model changes. Folded or off-screen positions are hidden or indicated
without unfolding, revealing, scrolling, or focusing the editor automatically.
Preserve existing rate limits, pointer expiry policy, explicit clear messages,
and session teardown. Repositioning locally must not renew remote activity.

## 6. Geometry invalidation and cleanup

Observe relevant pane and canvas elements with ResizeObserver. Combine this with
captured ancestor scrolling, window resize, iframe content measurements and Monaco
layout/scroll notifications. Also invalidate when a pane moves without changing
size, such as curriculum collapse or a sibling layout change.

Coalesce invalidations to one measurement per animation frame. Resolve the active
surface again after material/layout changes; do not hold detached elements.
Disconnect observers/listeners, dispose Monaco subscriptions and cancel scheduled
frames on pointer clear, model replacement and unmount. No polling loop or
unbounded observer allocation is needed.

## 7. Compatibility and scope boundaries

Extend shared validation, server relay handling and both clients together. Keep
current authorization and draft/session filtering. A new code-position variant
must not be emitted to an incompatible peer: negotiate an awareness version or
capability at watch start and suppress editor arrows for unsupported peers.
Legacy surface editor arrows must not be presented as precise by new clients.
Statement canvas and caret behavior remain supported during this transition.

No database migration, persistent pointer history, automatic follow mode, or
changes to quiet-student status/learning-time accounting are part of this work.
Other surfaces such as terminal/curriculum are not promoted to exact document
coordinates by this spec.

## 8. Regression and acceptance matrix

| Scenario | Required result |
| --- | --- |
| Student reads middle/bottom of long HTML, teacher joins/leaves/rejoins | Same content remains visible; frame identity unchanged |
| Delayed image/font/iframe measurement during transition | No collapse to top or late jump after intentional scrolling |
| Divider resize and minimum-width crossing | Reading anchor preserved; correct canvas/fallback marker behavior |
| Different editor widths/heights, fonts, wrapping and independent scroll | Arrow identifies same code boundary in both directions |
| Emoji, Korean text, tabs, empty lines and end-of-line | Correct Monaco coordinate conversion |
| Edit inserted before a stationary/delayed pointer | Relative anchor resolves consistently; no wrong-token fallback |
| Gutter, minimap, folded/off-screen position | No misleading code arrow, no automatic reveal/focus |
| Stationary pointer with divider/curriculum/terminal layout changes | Correct repositioning without new remote mouse movement |
| A→B→A, late awareness, reconnect, watch replacement | No marker/scroll restoration leaks across documents |
| Unsupported peer or malformed anchor | Safely suppressed; collaboration/caret continue |
| Repeated mount/unmount and pointer clear | No stale callbacks, duplicate listeners or observer leaks |

Unit tests cover schema validation, coordinate conversions, relative anchors,
compatibility, geometry invalidation and lifecycle cleanup. Component tests assert
stable frame identity and anchor restoration using meaningful geometry fixtures.
Real browser tests must cover the long-statement scrolled watch handoff and
bidirectional code pointers at unequal viewports in Chromium and WebKit.

Acceptance: with no concurrent user scroll, an identifiable text/image anchor
remains within 2 CSS pixels of its prior pane-top offset after settling (unless
clamped by document bounds). Code arrow tip is within 2 CSS pixels of Monaco's
resolved code boundary after settling. Neither remote awareness nor watch events
invoke a scroll/reveal operation; local layout correction is limited to preserving
the pre-transition reading anchor. Explicit user jump actions are tested separately.

Browser authentication/seed setup must succeed before calling the matrix passed.
Blocked login or unrun cases are reported as incomplete, not passing tests.

## 9. Implementation sequence and rollout

1. Reproduce the scrolled watch handoff and record frame/anchor behavior.
2. Stabilize statement mounting and implement generation-scoped anchor retention.
3. Introduce negotiated code-anchor awareness and symmetric Monaco capture/render.
4. Add element/layout invalidation with cleanup and compatibility tests.
5. Run the unit/component suites and real-browser matrix; document actual results.

Deploy matching API/web protocol support, refresh clients, and verify a quiet,
scrolled student can be joined without moving their reading position. Do not mark
this spec implemented until the changes and required validation are completed.

## 10. Implementation checkpoint (2026-09-14)

Source changes now include a stable statement wrapper/iframe tree, local text/image
reading anchors, element geometry observation, and bound-Yjs editor mouse anchors
projected through Monaco. Each reader's caret and scrolling remain separate.

Compatibility uses an additive `editorPointer` awareness envelope rather than a
watch-start version exchange: code anchors are never sent in the legacy `pointer`
field, which is null for code movement. Old servers strip the extension and old
clients ignore it, so unsupported peers see no code arrow. New clients suppress
legacy percentage editor arrows. This achieves the spec's safe unsupported-peer
behavior without introducing a second watch negotiation lifecycle.

Regression tests cover relative anchors after insertion (including emoji), receiver
geometry changes, bad anchors, non-code/off-screen targets, cleanup, legacy wire
compatibility, and local reading-offset restoration. Browser cases now include a
long persisted statement handoff with iframe identity checks and bidirectional code
arrows at unequal viewports. The E2E seed must be refreshed for that long fixture.

Validation: 357 focused unit/component tests passed, together with shared build,
web/API/E2E typechecks and targeted web lint. Browser acceptance remains incomplete:
Chromium and WebKit both stopped at the disabled sign-in button in authentication
setup; respectively 28 and 23 following tests did not run. No browser claim of
2-pixel reading retention or arrow accuracy is made. The complete browser matrix
and rollout remain outstanding.
