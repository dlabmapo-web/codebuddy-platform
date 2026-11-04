# DLAB multi-campus SSO implementation plan

Approved design: [multi-campus SSO](../specs/2026-11-04-dlab-multicampus-sso-design.md).

1. Add the default-off API provisioning flag and private environment examples. Keep the Bearer contract and campus rollout admission unchanged.
2. Add a transaction-scoped campus provisioner: stable external-ID slug, current/retired conflict checks, platform organization, non-rollout feature defaults, atomic mapping/initial access, integration event and source reconciliation.
3. Integrate it into authenticated campus source writes, including duplicate payload replay after rollout. Preserve stale source ordering and explicit local restrictions.
4. Add the dry-run-first operator catch-up command with active platform-admin checks, explicit target environment, per-campus transactions, Redis notifications and audit records. Document Mapo mapping before catch-up.
5. Add isolated database integration tests for first sync, concurrent/repeated sync, lifecycle/restrictions, mapping preservation, conflict rollback, role login and tenant isolation, and operator dry-run/apply/repeat.
6. Extend existing browser fixtures with an authenticated sync path and test new-campus login/repeat/isolation using provider doubles. Run the focused DLAB suite and Chromium/WebKit acceptance on disposable PostgreSQL/Redis.
7. Record verified commands/results and remaining production acceptance. Commit only this worktree's changes; do not deploy or change production configuration/data.
