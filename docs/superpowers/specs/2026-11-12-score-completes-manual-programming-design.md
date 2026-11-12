# Publishing a programming score finishes the problem

The user replaces the separate learning-completion decision with one rule: any published teacher score completes the problem, including zero. Remove the learning outcome choices and Learning complete / Needs more work labels from manual programming grading, student results and review history. Keep score, optional feedback/reason, permissions, exact decimal handling, version conflicts, immutable submitted code, audit records and live refresh.

The request contract accepts omitted completion and tolerates legacy boolean values, normalizing every publication to completed=true. Current assessment parsing normalizes existing GRADED snapshots to completed=true, so existing reviewed submissions finish in all readers without a data rewrite or new database query. Pending submissions remain incomplete; a newer ungraded submission and old grading revisions retain their existing eligibility rules. Historical review rows retain their original values; their retired completion field is no longer displayed. Idempotent replay ignores the retired request field and returns the reviewed score with current completion semantics.

Keep the colorful result design: graded icon/badge, score, teacher feedback and a next-step message to review feedback and continue. Pending work retains the manual-review notice and teacher guidance. No score threshold determines completion.

Validate new/legacy/zero-score grading, pending and revision behavior, preserved historical rows, idempotency and completion totals in disposable PostgreSQL. Keep existing read statement counts. Verify the form has no completion controls and exercise student/history/live updates in Chromium and WebKit. No migration or user-grade rewrite is required.
