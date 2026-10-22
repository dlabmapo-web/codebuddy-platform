# Manager academy-wide teaching access

> Latest policy: [Team Leads now have the same academy-wide teaching access](2026-10-22-team-lead-academy-teaching-access-design.md). The Teacher assignment requirement remains.

Date: 2026-10-22

This replaces the earlier assigned-class-only Manager policy in the inherited SSO staff roles design. The user now requires Managers to see and operate every active class in their own academy, without assigning themselves as a teacher.

## Behavior

- My classes lists every active class in the Manager's academy, including classes with no assigned teacher.
- Managers can open rosters, live presence, student work, Solution status, student analytics, tutoring, code editing, feedback and assessment grading for those classes. PDF/video tutoring uses the same class scope.
- Class teacher assignments remain actual staffing records. The Manager is not silently inserted into homeroom or assistant assignments.
- Teachers and Team Leads holding Teacher remain limited to real assignments. Student enrollment and platform administration boundaries remain unchanged.
- Manager scope requires a currently active Manager membership and user in that same active academy. Class queries recheck it, so stale socket claims cannot survive demotion, suspension or academy changes. Archived and foreign-academy classes remain unavailable.
- Platform/support academy inspection remains read-only for live watching.

## Implementation

Use an explicit academy-manager actor scope alongside existing assigned and platform-inspection scopes. Shared class predicates cover monitoring, WebSockets, progress and analytics. Assessment review/tutoring composes the same Manager predicate. The shared role predicate drives navigation and staff-action visibility even for a Manager without a separate Teacher grant.

Help queue notifications and claim reconciliation also recheck Manager scope, so an unassigned Manager can help without losing the claim on refresh; demotion or suspension releases it.

## Validation

Check positive Manager class lists, rosters, code editing and assessment grading without any assignment; retain lower-role assignment/revocation tests. Verify foreign/archived classes, suspended members/users and removed Manager roles are rejected. Run real database help-queue integration tests and the isolated browser SSO workflow with PostgreSQL/Redis provider doubles. No schema migration or OS payload change is needed.
