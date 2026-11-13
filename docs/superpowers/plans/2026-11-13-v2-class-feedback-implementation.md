# V2 class feedback implementation

Approved scope: [design](../specs/2026-11-13-v2-class-feedback-design.md).

1. Update Korean/English import and staff navigation copy; retain student keys.
2. Add the authorized edit link to the live class heading and a fixed teaching return context to the existing editor.
3. Refresh affected teaching caches and route payloads after class edits; retain server initial data.
4. Share schedule permission between Managers and Team Leads. Preserve Teacher denial and schedule validation, including overnight values and the expanded slot limit.
5. Run focused permission, class-service and navigation checks; exercise actual time pickers and the staff round trip with isolated browser fixtures.
6. Measure unchanged teaching-list, roster and management-detail SQL counts on disposable PostgreSQL, and record validation evidence.

No migrations or polling changes are required.

Completed locally. See [verification evidence](../../research/2026-11-13-v2-class-feedback-verification.md) for executed checks and SQL budgets.

## Live class UX follow-up

- Group Edit Class Information (blue primary), Student History and connection status in one class header; keep one back link.
- Render assigned courses as clear links to the existing staff course detail, reusing roster data and disabling automatic detail prefetch.
- Show hidden-course and empty states using Korean/English translations.
- Extend the existing isolated browser cases to check primary styling, one page back link, phone layout and actual course navigation for Manager, Team Lead and Teacher roles.

Follow-up completed and verified: all 3 staff browser cases passed; SQL budgets are unchanged. See the follow-up section of the verification evidence.
