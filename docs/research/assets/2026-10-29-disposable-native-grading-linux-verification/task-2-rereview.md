# Task 2 fix rereview

Reviewed `04f8a70fd51d742ce1107cd56722f44881cd61f4..57323695898f766e4868518fae625d4cf0a773eb` against the Task 2 brief, original findings, and appended implementation evidence. The supplied fix diff was read once. Adjacent production cgroup preparation and supervisor drainage code were inspected only to verify the two integration fixes. No implementation files were changed, suites rerun, or native execution attempted.

## Per-finding disposition

- **I1 — ADDRESSED.** `live_guest` derives the immutable container scope from the observed READY init's `control` leaf, requires that exact leaf name, and preserves both the full container-ID scope name and execution-family ancestry checks. It verifies init membership in control and the traced interpreter's actual membership in the sibling learner leaf. This matches production `prepareLeaf`, which moves both processes before READY. The added integrated layout contract covers the valid READY tree and six refusals, including the formerly accepted unprepared scope, wrong ownership/ancestry, and changed process membership.
- **I2 — ADDRESSED.** The generated detached-child branch closes FDs 1 and 2 immediately after `setsid`, before sleeping. The parent keeps its own output descriptors, while the detached descendants remain available for PID/census and removal proof. This removes the inherited output-pipe references responsible for the production supervisor's drain failure without changing its fail-closed policy. The regression extracts the actual generated branch, uses exactly one child, checks parent-output EOF within two seconds while the child still exists, and bounds/cleans up the local test process.

## New breakage in the fix diff

None identified. The fixes remain confined to the harness, fixture, and focused regression contracts; production limits and lifecycle policies are unchanged.

## Out-of-scope observations

No new out-of-scope issues were raised. Actual disposable Ubuntu tracing, containment, OOM, cancellation, and recovery remain pending as stated in the report. Reported local passing checks were treated as supplied evidence, not rerun or promoted to native proof.

## Round verdict

**APPROVE the scoped fixes.** Both prior Important findings are addressed, with no new blocking issue identified in this fix diff. This verdict closes the fix-review round; it does not certify the still-pending real Linux execution.
