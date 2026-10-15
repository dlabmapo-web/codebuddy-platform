# Input prompt policy implementation plan

Approved direction: [design](../specs/2026-10-15-ignore-python-input-prompts-design.md).

1. Add the shared prompt policy, persisted exercise/submission fields and additive migration. Require explicit policy on authoring writes; keep existing content at INCLUDE.
2. Freeze policy in submission and public-sample snapshots. Introduce versioned IGNORE semantics and reject inconsistent snapshots.
3. Carry policy through sandbox protocol v3 into the disposable Python runner. Wrap native input only during IGNORE execution; retain all other output and resource enforcement.
4. Add the translated authoring option, preserve it through mode changes, copies and drafts, and expose it to learners. Keep interactive Run unchanged and withhold browser fallback verdicts for IGNORE.
5. Verify runtime behavior, sandbox transport, strict output checking, snapshot compatibility, revision invalidation, library copying and authoring. Run package type checks, lint and translation checks.
6. Record verification and rollout requirements, then commit the completed implementation. Deployment and production data changes are outside this task.
