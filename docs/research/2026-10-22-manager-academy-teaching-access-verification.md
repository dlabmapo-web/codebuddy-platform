# Manager academy-wide teaching access verification

> Follow-up: [Team Leads now share this academy-wide teaching scope](2026-10-22-team-lead-academy-teaching-access-verification.md). The original results below record the Manager-only stage.

Date: 2026-10-22
Branch: `feat/dlab-os-staff-sso`

## Result

An active Manager can use My classes, live monitoring, tutoring, student analytics, Solution status, feedback and assessment review across every active class in their own academy. No homeroom or assistant-teacher assignment is needed, and no staffing records are created implicitly. This supersedes the previous Manager assigned-only rule.

Teachers and Team Leads holding Teacher remain limited to assigned classes. Student access, feature flags, platform administration and platform/support live-inspection restrictions remain unchanged. Actual assignments still determine which teacher is shown to students.

## Changes

- Added a distinct `academy-manager` scope to the shared class-access predicate. It joins the active academy, current Manager membership and active user on every class query, including when revalidating an existing socket claim.
- Reused that scope for monitoring lists, rosters, realtime presence, student context, progress, analytics, coding tutoring and code editing.
- Applied the Manager predicate to assessment tutoring and review, including written answers, short answers and multiple choice. Manager-only memberships can use the teaching surfaces without an extra Teacher grant.
- PDF/video tutoring controls recognize Managers and use the same authorized class-roster service.
- Updated help-request availability, notification recipients and durable claim reconciliation for unassigned Managers. Demotion or suspension removes the grant and releases a help claim.
- Updated English/Korean tutoring copy to describe available classes without claiming that every visible class is assigned to the actor.

No migration, OS role-payload change or new SSO login is needed. Reload the local application to load the new navigation and permissions. Production is not deployed by this task.

## Verification

- Shared monitoring/auth tests: 228 passed.
- Focused API class access, monitoring, analytics, manual and learning service tests passed; dedicated help-broadcast tests also passed.
- Web academy navigation/access tests: 31 passed.
- Disposable PostgreSQL tests: 17 passed, including Manager access without a Teacher grant or assignment, foreign/archived-class denial, stale claim denial after demotion or membership/user/academy suspension, and Manager help-claim retention/release.
- Isolated Chromium staff workflows: 5 passed. An unassigned Manager sees both classes, monitors student work, edits synchronized code and executes it. Written/short-answer/quiz reviews and student feedback work. Teacher and Team Lead unassignment still revokes their teaching access. Manager class cards receive actual WebSocket online/solving changes across coding, short answers and quizzes without any teacher assignment.
- Chromium and WebKit material/navigation workflows: 2 passed, including Manager PDF tutoring with both academy classes, assessment staff actions, student restrictions, unsaved-answer protection and PDF/video navigation. Combined with the five staff workflows above, seven browser tests passed.
- API build; API, web and E2E TypeScript checks passed.
- English/Korean translation checks: 136 passed. Changed web files passed ESLint; git whitespace checks passed.

The isolated browser and database tests use disposable PostgreSQL/Redis and local OS/Supabase doubles; no production data or provider configuration is changed. Test output includes existing editor/development warnings. Video checks cover framing/navigation, not actual viewing-progress tracking, transcoding or encoded playback.
