# Public Turtle toolbar implementation

Approved design: [execution toolbar](../specs/2026-10-28-public-turtle-toolbar-design.md).
The writing-plans skill is not installed; this plan follows the existing repository format.

1. Extract a focused toolbar and status presentation using existing execution
   state and callbacks. Add Cove controls, explicit editor theme selection,
   semantic live status, responsive CSS and English/Korean copy.
2. Verify meaningful status mapping and theme behavior, run existing Turtle
   regressions, translations, scoped lint and TypeScript.
3. Inspect the real local native workspace at desktop and 360px, including
   execution, Stop, theme selection and errors. Save visual verification.

No runtime, feature-flag, production configuration or deployment changes.

## Completed verification

- Extracted the toolbar and typed status presentation. Added stable Run/Stop/
  Clear controls, selected Light/Dark editor theme controls, accessible status
  colors/icons, responsive layout and matching English/Korean copy.
- Focused Turtle suites: 37 tests across five files passed. Translation suite:
  140 tests passed. Web TypeScript, scoped ESLint, catalog extraction validation
  and `git diff --check` passed.
- Real local Chrome: verified idle, active Run, completed drawing, Stop retaining
  the drawing, disabled idle Stop, Light/Dark selection and keyboard focus.
  At 360px, the page scroll width was 360px and all five controls measured 44px
  high. English and Korean layouts were visually checked. Returned to English
  and restored the original viewport after checking mobile.
- Unit checks cover browser preparation/admission/rendering, completed drawing
  while a spare prepares, disabled browser access, input waits, error/expired/
  disconnected/unknown states and the existing explicit full-Python boundary.
  Browser runtime flags remain disabled; no new browser-runtime acceptance
  claim is made by this UI work.
- Reduced-motion behavior and long fallback action wrapping were reviewed in
  the stylesheet; they were not separately emulated in the live browser.

Screenshots: [desktop](../../research/assets/2026-10-28-public-turtle-toolbar/desktop-ready.png),
[mobile](../../research/assets/2026-10-28-public-turtle-toolbar/mobile-workspace.png),
[Korean](../../research/assets/2026-10-28-public-turtle-toolbar/mobile-korean.png).

No production deployment was performed.
