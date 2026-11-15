# Shared pointer flicker implementation

Based on [the approved scope](../specs/2026-11-15-shared-pointer-flicker-design.md).

Completed 2026-11-15. See the [verification results and screenshot gallery](../../research/2026-11-15-shared-pointer-flicker-verification.md).

1. Add deterministic portal regressions for ordinary position updates, custom/editor projection, pending geometry callbacks, immediate suppression and observer cleanup. Demonstrate the continuity test failing against the existing renderer.
2. Separate placement context from changing coordinates. Measure new inputs before paint, preserve the same eligible arrow element, and coalesce layout notifications using the latest committed inputs. Keep subscriptions stable across movement and ignore overlay-owned mutations.
   Browser investigation also found that coding students never report completed document synchronization to their presence connection. Report readiness only after the authorized document binds on a connected socket, retaining the existing pointer eligibility guard; cover initial synchronization and disconnected/foreign-document cases.
3. Run the focused monitoring, geometry and awareness regressions, web/E2E type checks and focused lint. No server read or protocol changes are planned.
4. Extend the disposable localhost browser harness with simultaneous student/staff sessions for Manager, Team Lead and assigned Teacher. Sample continuous movement at animation frames, audit arrow removal/replacement, verify actual socket traffic/code updates, test observation pointers and existing suppression/lifetimes, and capture screenshots.
5. Record results and screenshot paths in the verification note, inspect the screenshots, and stop task services. Leave Cove API port 4000 free.

Implementation is authorized by the user's request to implement the spec and test it on localhost. Preserve the separate Tutoring revert and chapter-selector behavior.
