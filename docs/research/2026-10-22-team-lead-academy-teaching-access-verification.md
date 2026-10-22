# Team Lead academy-wide teaching access verification

Date: 2026-10-22
Branch: `feat/dlab-os-staff-sso`

## Change

The Team Lead now has the same academy-wide teaching scope as the Manager: My classes, rosters, live monitoring/presence, student work, tutoring, student-code editing, execution, feedback, Solution status, student analytics and assessment grading across every active class in their own academy. No teacher assignment or role switch is required.

This follows the owner's new requirement and supersedes the earlier Team Lead assigned-only policy. Teachers still need real homeroom/assistant assignments. Class staffing records, student enrollment rules, feature flags and Manager-only permissions remain unchanged.

The shared role list, actor scope and ORM class predicate cover Managers and Team Leads together. Current same-academy membership, user and academy status are checked inside the class query. A stale claim fails once both academy-wide roles are lost; an assigned Teacher may retain only their actual assignments. Help-queue availability, broadcasts and claim reconciliation follow the same scope.

No database migration, OS role mapping/payload change or new login is needed. This work is local and has not been deployed.

## Verification

- Shared monitoring/auth tests: 229 passed.
- Focused API access, monitoring, help notifications, analytics, assessment and learning tests: 100 passed.
- Web navigation/access tests: 31 passed.
- Disposable PostgreSQL tests: 20 passed. Both standalone Manager and standalone Team Lead memberships reach own active classes without assignments or extra Teacher grants. Foreign/archived classes and suspended membership/user/academy states are refused. Losing academy-wide roles invalidates a stale class claim and releases a help claim. Team Lead access to academy settings and member credential management remains denied.
- Isolated browser flows: 8 passed in 2.9 minutes. Manager and Team Lead each see both classes without assignments, view student work, edit synchronized code, execute it and review written answers. Teacher, Team Lead and Manager short-answer/quiz workflows passed; Teacher access is revoked after unassignment, while Team Lead/Manager retain their academy scope. WebSocket class-card counts passed. Chromium and WebKit PDF/navigation flows passed; the WebKit flow uses a Team Lead and confirms both classes in PDF tutoring, permitted Edit actions, student restrictions and unsaved-answer protection. Video coverage is framing/navigation, not playback/transcoding.
- API build plus API, web and E2E TypeScript checks passed. Changed web access files passed ESLint; whitespace checks passed.

The isolated tests use disposable PostgreSQL/Redis and local OS/Supabase doubles, with real Cove routes and authorization. No production data or provider configuration is modified.
