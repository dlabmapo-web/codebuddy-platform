# Manual programming assessment implementation

Approved scope: [design](../specs/2026-11-12-manual-review-submissions-design.md).

1. Extend shared policy, assessment, receipt, review and history contracts; preserve
   automatic grading semantics and distinguish null from a published zero.
2. Add ordered migrations for receipts, frozen settings, append-only reviews and
   idempotency; generate Prisma and resolve affected numeric-score consumers.
3. Add bounded manual admission and scoped review services with retry identity,
   current Teacher/Team Lead/Manager grants, optimistic concurrency and auditing.
4. Round-trip settings through authoring, copies, versions and workbooks; update
   bootstrap/latest/history/progress projections and private staff practice.
5. Add shared author controls, student receipt/assessment presentation and staff
   grading/correction panel; connect scoped refresh without waiting polling.
6. Verify shared/API/web checks, disposable PostgreSQL migrations, role/concurrency
   and SQL counts, plus browser workflow; document actual evidence and limitations.

No production database access, deployment, or real student test submissions.

Completed locally. See [verification evidence](../../research/2026-11-12-manual-review-submissions-verification.md) for executed checks, screenshots, SQL counts and deployment boundaries.
