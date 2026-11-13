# DLAB pre-login directory synchronization implementation

Approved design: [directory synchronization](../specs/2026-11-12-dlab-prelogin-directory-sync-design.md).

1. Add projection progress/lifecycle provenance migration and explicit inbound maintenance gate.
2. Replace per-campus reconciliation queries with one joined snapshot and batched membership/profile/role writes. Preserve legacy login and restriction behavior.
3. Extract shared, locked, recoverable provider/user provisioning; make inbound user success depend on completion and reuse it in SSO.
4. Project campus names/status with independent local restriction guards; integrate platform lifecycle and managed-name presentation.
5. Add reviewed-plan, keyset-paged, resumable directory catch-up CLI and operational instructions.
6. Extend disposable PostgreSQL/Redis tests for role/lifecycle/failure/race/replay cases and constant statement counts; extend Chromium/WebKit fixtures for before-login roster/assignment and later SSO.
7. Run appropriate typechecks, builds, integration/browser/deployment checks, record evidence and commit the implementation. No production rollout or live data change is part of this task.

The current VS Code checkout is `feat/dlab-prelogin-directory-sync`. The original spec worktree is retained detached so its open file remains available. The approved base is `6d74cfd9`; no unrelated work was stashed or overwritten.

Implementation and isolated verification completed. See [verification evidence](../../research/2026-11-13-dlab-directory-sync-verification.md) and the [rollout runbook](../../operations/dlab-directory-sync.md). Production rollout and live catch-up remain separate authorized work.
