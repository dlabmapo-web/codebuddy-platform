# Live watch handoff when a student enters a previewed lesson

The v2.0.64 production check reproduced a stuck Resynchronizing state: staff watch coding lesson A, independently preview B, and the student opens B. Observation announces B, but the collaborative watch still names A. Reopening the student creates the missing authorized watch.

Keep the existing independent lesson selection. When the selected lesson is the student's current available coding lesson and differs from the collaborative watch, reauthorize through the existing watch-start/document-sync flow. Apply the new draft's authoritative snapshot before enabling editing or pointers. Do not remount the workspace, replace its transport, poll, or treat observation readiness as document readiness.

Bound recovery by the current availability identity. Repeated snapshots must not restart a healthy or pending watch. Preserve unavailable-student recovery and guard disconnected/revoked access, protocol refresh, navigation and pending edits. Late acknowledgements must not revive an older watch or mix documents. Previewing a lesson other than the student's current lesson must retain the existing watch and suppress unrelated pointers.

Validation: first reproduce the failed transition in a regression test, then verify it for Manager, Team Lead and assigned Teacher with disposable PostgreSQL/Redis and independent student sessions. Check document isolation, synchronization gates, two-way edits/pointers, repeated transitions and stable transport counts. Run repository release checks, deploy through the protected GitHub workflow, and repeat the production reproduction without editing student work. No schema or API read-path changes are intended.
