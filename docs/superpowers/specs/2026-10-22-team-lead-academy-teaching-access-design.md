# Team Lead and Manager academy-wide teaching access

Date: 2026-10-22

The user's latest request extends the Manager academy-wide teaching policy to Team Leads. This supersedes the Team Lead assignment restriction in the earlier inherited staff and Manager designs.

## Access policy

- Manager and Team Lead each see every active class in their own active academy under My classes, without a homeroom or assistant-teacher assignment and without switching roles.
- Both can use class rosters, live online/solving presence, student monitoring, tutoring, student-code editing, execution, feedback, Solution status, student analytics and assessment grading within that academy. PDF/video tutoring uses the same authorized class list.
- A Teacher still needs an actual homeroom or assistant assignment. Student enrollment, feature flags and platform administration boundaries remain unchanged.
- Team Lead retains Team Lead permissions. Academy settings, credential management and other Manager-only permissions are not added.
- The shared class query requires the signed-in user's current active same-academy Manager or Team Lead membership. Archived/foreign classes and suspended memberships, users or academies remain unavailable. Losing both academy-wide roles returns the actor to ordinary assigned Teacher scope if they still hold Teacher.
- Actual staffing records are preserved. Class teacher names continue to reflect assigned teachers, not every staff member who can monitor.
- Platform/support inspection does not gain live access.

## Implementation

Use the shared academyTeachingRoles list and roleCanTeachAcademy predicate for Manager/Team Lead academy-wide teaching. Rename the newly introduced server-only scope to academy-staff and recheck the same membership roles in its ORM predicate. Monitoring, realtime commands, analytics, assessment review, media tutoring, help notifications and help-claim reconciliation compose this policy.

No schema migration, role-mapping change, new OS field or extra Teacher grant is needed.

## Validation

Exercise both roles without assignments in real database and isolated browser flows. Check live code editing, roster/class visibility, feedback and quiz grading. Preserve Teacher assignment/revocation tests, cross-academy and archived-class denials, stale claims after loss of academy-wide roles, suspension checks, and Team Lead denial for Manager-only settings/credentials.
