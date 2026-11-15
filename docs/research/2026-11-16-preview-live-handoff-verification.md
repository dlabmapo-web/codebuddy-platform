# Previewed lesson to live document handoff

Scope: [design](../superpowers/specs/2026-11-15-preview-live-handoff-design.md).

The production reproduction kept its observation channel live while the collaborative watch still named the previous coding draft. The existing availability recovery only restarted a refused watch; it did not handle a healthy watch whose material differed from the selected lesson the student had just entered.

The availability effect now also reauthorizes that mismatched watch. It uses the existing visit-fenced watch/document-sync flow, preserves the shared transport and independent lesson selection, and waits for the new draft's authoritative snapshot before enabling editing and pointers. Availability identities bound repeated attempts. Existing access, protocol, navigation and pending-edit guards remain in place.

## Regression evidence

- The new hook test failed before the production change: only one watch start occurred instead of the required handoff. After the change, the monitoring suite passed **269 tests in 32 files**.
- The new real-browser reproduction also failed before the fix: the student changed lesson B's code but the instructor kept displaying B's saved preview. The final browser run passed **all three scenarios** for Manager (English), Team Lead (Korean) and assigned Teacher (English), using independent authenticated student contexts, actual Next/Nest/Socket.IO and disposable PostgreSQL/Redis.
- Each role completed two handoffs: first when the student loaded the already previewed lesson B, then back to previewed A through the student's in-app outline. The latter preserves the student's mounted providers and sockets, matching production navigation.
- Each handoff required exactly one additional watch start, with no additional socket opening/closing or watch-stop event. Assertions verify live status/display, the correct document, student-to-staff pointers and resumed two-way edits; the first handoff also verifies the staff pointer on the student screen.
- Unit coverage verifies that the retired draft is destroyed, a stale acknowledgement cannot unlock the new draft, the new document is not mixed with the old one, repeated hints do not restart the watch, and editing waits for exact synchronization.
- Existing preview privacy, independent reading, written-response observation and Manager network-recovery checks also passed. The repeated pointer-movement helper now ends at distinct eligible pixels so coalescing cannot turn the check into a no-op. The fixture retains its lesson marker after deliberate teacher edits so later preview assertions test the saved new text.
- **Eight integration checks passed** against disposable PostgreSQL, including existing authorization and statement-budget assertions. API readers and schemas are unchanged. Added page-entry database statements: **zero**; handoffs reuse the existing authorized watch-start path.

## Screenshots

Six retained copies are in the ignored local `test-results/preview-live-handoff-gallery/` directory. Representative results after the student's in-app navigation:

- [Manager](../../test-results/preview-live-handoff-gallery/manager-05c-student-client-navigation-handoff-live.png)
- [Team Lead](../../test-results/preview-live-handoff-gallery/team-lead-05c-student-client-navigation-handoff-live.png)
- [Teacher](../../test-results/preview-live-handoff-gallery/teacher-05c-student-client-navigation-handoff-live.png)

These screenshots supplement the document and transport assertions; they do not establish frame-by-frame pointer continuity. No shared Supabase database was used for automated testing. The production Teacher test account has no assigned classes, so assigned-Teacher coverage here uses an isolated fixture without changing production assignments.

## Release validation

Full repository release checks passed: shared/i18n/grading builds, Prisma generation and validation, workspace and E2E type checks, lint (no errors), canonical routes, translations, workspace tests, production builds, deployment configuration and browser-runtime packaging checks.

The full web suite passed 1,661 tests; API passed 1,752 with 314 existing infrastructure-gated skips; shared passed 940 and i18n 148. The separate disposable-database browser runner executed all eight integration cases and three role journeys successfully. No test gates or permissions were weakened.

Protected deployment and the final production reproduction are recorded separately in the private operations record. No production student code edits or submissions are required for that reproduction.
