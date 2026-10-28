# Public Turtle execution toolbar

Date: 2026-10-28. Status: approved by the user on 2026-10-28.

## Goal

Make the public Turtle controls and execution feedback clearer for beginner
learners, using Cove's existing visual language. The user reports that Run
startup is now good and requests improved Run, Stop, Light/Dark and running
status presentation.

## Approaches considered

1. **Compact Cove toolbar (recommended):** keep the current workspace structure,
   give execution buttons a clear hierarchy, group editor appearance separately,
   and show a meaningful status chip. This directly addresses the screenshot
   while preserving drawing space and familiar locations.
2. **Larger workspace redesign:** add editor and drawing panel headers, move
   controls into those panels, and restyle the console. This offers more
   structure but changes more of the familiar page and reduces working space.

Use approach 1. Existing header, editor/drawing split, mobile tabs and console
remain in place. Scope is the public Turtle toolbar in both existing server
mode and the disabled browser candidate.

## Visual design

- Keep Pretendard and existing Cove icon conventions. Use 14px semibold button
  labels and 12–13px status labels with comfortable line height.
- Use Cove light-palette values for this light workspace chrome: brand blue
  `#1B64DA`, hover blue `#1450B5`, navy ink `#18344E`, white surfaces, pale blue
  `#EAF1FE`, and soft borders `#DCE5EE`. Semantic success `#15803D`, warning
  `#B45309`, and danger `#DC2626` follow the existing platform palette.
- Replace adjoining rectangular cells with separated, rounded controls, 8px
  corners and 44px button/pointer targets. Keep the
  toolbar approximately 60px high on desktop, with 12–16px horizontal padding.
- Keep decoration restrained. The status chip is the distinctive element:
  icon, readable label and a subtle semantic tint. No fake progress bar or
  estimated completion time.

Desktop arrangement:

    [▶ Run] [■ Stop] [Clear]             [status icon + label] [☀ Light | ☾ Dark]

## Controls

- **Run:** filled Cove blue, play icon, white label. Show a small spinner with
  the existing waiting label during admission/start requests; preserve current
  execution eligibility and rerun behavior.
- **Stop:** stable position next to Run; red icon/text on a pale red background
  when the existing stop action is available, visibly disabled while idle or
  while the existing operation blocks it. Keep current stop/cancellation logic.
- **Clear:** quiet outlined control with an eraser icon. Preserve its existing
  meaning: stop the current run and clear the drawing/output, keeping source.
- **Editor theme:** a grouped Light/Dark choice with sun/moon icons, an explicit
  selected state and accessible group label. It changes the editor theme, as
  the existing toggle does; it does not change the drawing background or the
  platform-wide theme. Selecting the current theme is harmless.
- Keep explicit full-Python/browser-mode choices visible when currently
  applicable; allow these longer actions to wrap without hiding Run or Stop.

## Execution feedback

Derive presentation from existing browser/native session state, not timers or
new requests. Preserve existing diagnostic data attributes on the status.

| State | Presentation |
| --- | --- |
| Idle, interpreter prepared | Neutral icon and short instruction to press Run |
| Waiting/admitting/preparing | Blue spinner and the existing specific label |
| Computing/rendering/native running | Blue activity icon and “Running your code” |
| Displaying | Green check and “Your drawing is ready” |
| Waiting for input | Amber input icon and “Waiting for your input” |
| Stopped | Neutral stop icon and “Stopped” |
| Error/unsupported/unavailable | Error or warning icon and the existing actionable label |
| Expired/time limit/queue expired/disconnected | Warning icon and the existing recovery label |

Green means a drawing finished, not a correct answer or grade. A native guest
in DISPLAYING can still need Stop to close its display. Browser preparation
may continue after a result; that does not replace the result with a running
label. Keep existing detailed error alerts and explicit fallback behavior.

## Responsive and accessible behavior

- At narrow widths, use two rows: primary controls first, status and theme
  controls second. Long fallback actions can take their own row. No horizontal
  page overflow at 360px or clipping of Stop or recovery text.
- Pair every semantic color with text and an icon. Use a polite atomic live
  status region, decorative icons hidden from assistive technology, meaningful
  theme selection semantics, and visible keyboard focus.
- Honor reduced-motion preferences. Spinners become a static activity icon
  under reduced motion; no pulsing or continuously animated background.
- All new user-facing copy must have matching English/Korean translations.

## Implementation boundaries and verification

Use the existing CSS module and Cove button conventions. Keep status derivation
focused so the toolbar markup remains understandable. No new dependencies,
network calls, runtime changes, feature-flag changes or deployment are required.
Do not refactor the editor, alter PIN/grant handling, change code persistence,
or modify the separate Turtle runtime implementations.

Verify keyboard/theme selection and representative real native states locally;
inspect desktop and 360px layouts, long labels, error/fallback wrapping, and
reduced motion. Run focused existing Turtle regressions, translation checks,
TypeScript and scoped lint. Add behavior tests only where state mapping or
theme-selection behavior changes; avoid tests that merely mirror CSS classes.

The user approved this design with “okay do like that please”.
