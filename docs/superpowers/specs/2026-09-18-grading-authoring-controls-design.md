# Grading authoring controls

Status: approved by the user on 2026-09-18; implemented and locally verified.

## Scope and approach

Replace native selectors and numeric spinners in the Answers grading editor with two reusable controls. Keep the existing layout, theme, Standard/Weighted choice, API payloads, and scoring semantics.

Recommended: a compact dropdown and number stepper. This improves precision without adding authoring steps. An alternative is a guided form with presets; it requires more navigation and introduces configuration choices beyond this request.

## Choice field

Use the existing accessible Radix overlay primitives for score policy and answer comparator choices. The trigger shows a short selected name; the menu shows the full explanation and selected checkmark. Support keyboard navigation, Escape, focus return, disabled state, and narrow screens. Associate the control with its visible label; do not wrap multiple interactive elements in a label.

## Number stepper

A reusable input with explicit minus and plus buttons, direct typing, unit text, visible focus, and translated accessible button names. Keep partially typed decimals while editing; commit valid numbers without floating-point drift. Empty optional fields remain unset. Invalid input gets an inline message and must not silently become zero or a different score. Stepping respects server bounds; direct out-of-range input remains visible for correction and cannot be saved.

Apply it to problem score, whole-run seconds, answer points, answer seconds, slow-answer threshold, and penalty. Preserve hundredths for problem scores and milliseconds for time values. Buttons change score by 1 point, whole-run time by 1 second, answer/soft time by 0.1 second, and integer points/penalties by 1. Direct typing supports the full server precision.

Bounds: problem score 0.01–1000; whole-run time 1–300 seconds; answer time 0.1–60 seconds; soft threshold 0.001–60 seconds; answer points and penalty 0–10000. Existing validation continues to enforce paired soft threshold/penalty and soft threshold below the hard limit.

## Validation

Check keyboard operation, focus, disabled controls, minimum/maximum stepping, clearing optional values, decimal editing, and persisted values after save/reload. Verify English and Korean labels and desktop/mobile layout. Run relevant authoring tests, typecheck, lint, and translation checks. Do not deploy or build over the running Next development server.

## Separate memory investigation

The memory-limit test is independent of the UI. Record observed memory measurements and repeat the execution/grading suite under concurrent load. Do not describe passing reruns as proof of the original failure's exact cause or full production readiness.

## Implementation results

- Reusable ChoiceField and NumberField integrated across problem and answer grading settings. Numeric parsing rejects unsupported precision rather than rounding it silently; schema validation blocks invalid drafts before serialization.
- 22 focused tests passed; web typecheck, route checks, and translation-key checks passed. Web lint has zero errors (existing warnings remain).
- Browser verification: dropdown keyboard selection and focus return; invalid score disables Save; decimal keyboard increment; score 101.25 persisted after save/reopen; optional timing clear; paired soft-limit validation; English/Korean controls. Restored the test exercise to score 100 and ABSOLUTE_CAP afterward.
- Responsive breakpoints were adjusted to stack grading fields below large screens; a mobile-device browser session was not exercised.
- Full i18n check remains blocked by the existing Korean learn.json namespace budget (15678 bytes versus a limit below 15360). That file was not changed.
- No deployment or production build performed. Memory investigation limitations remain as documented separately.
