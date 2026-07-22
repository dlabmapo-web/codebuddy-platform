# Cove v2 System Design

**Product working name:** Cove Studio  
**Status:** Proposed architecture  
**Date:** 2026-07-22  
**Reference systems:** Cove v1, Elice LXP, Kichkintoy, Docquery

## 1. Purpose

Cove v2 is a multi-academy learning and coding platform for DLab academies. It must preserve the useful capabilities of the current Cove MVP while introducing the course-management, content-management, enrollment, progress, assessment, and analytics foundations required for an Elice-like platform.

Cove v2 will be developed separately from the production v1 application. Cove v1 will remain available to its existing users until v2 reaches feature parity, its data migration has been tested, and a controlled production cutover is approved.

The architecture is designed for one primary developer initially. It must be modular and production-capable without introducing premature microservices or infrastructure that cannot be maintained by a small team.

## 2. Product goals

### 2.1 Primary goals

- Support multiple independent DLab academies on one platform.
- Preserve all important Cove v1 student, teacher, administrator, coding, collaboration, AI-feedback, and analytics capabilities.
- Add courses, course sections, lectures, reusable learning materials, enrollment, assignments, tests, progress tracking, and reporting.
- Provide secure server-side grading with hidden test cases.
- Isolate each academy's members and data.
- Keep the frontend and backend independently deployable.
- Share validated API contracts and domain types across the TypeScript codebase.
- Support a tested migration from the v1 database without forcing existing users to change passwords.

### 2.2 Non-goals for the initial architecture

- Reproducing every Elice feature in the first release.
- Starting with microservices.
- Building native mobile applications.
- Building a content marketplace.
- Building webcam-based exam monitoring or plagiarism detection immediately.
- Running untrusted submitted code inside the NestJS API process.
- Replacing the production v1 application before v2 feature parity and migration validation.

## 3. Architectural principles

1. **Modular monolith first.** NestJS modules own clear business domains while running as one API deployment.
2. **Backend-owned authorization.** NestJS is the authoritative boundary for tenant access and privileged operations.
3. **Shared contracts, not shared internals.** The shared package contains public contracts and pure domain definitions, not database or UI implementation details.
4. **Reusable content is separate from course delivery.** A curriculum can be reused by multiple academies and course sections without duplicating all content.
5. **Server-authoritative grading.** Browser execution is for fast feedback; official submissions are graded by a trusted worker.
6. **Explicit tenancy.** Academy scope is carried and checked in every academy-owned operation.
7. **Versioned database changes.** Prisma migrations stored in Git are the canonical application-schema history.
8. **Safe replacement of v1.** V2 uses a separate database and deployment until final migration and cutover.
9. **Add infrastructure only when required.** Redis and a judge worker are introduced when server-side grading or background work is implemented.

## 4. High-level architecture

```text
Users
  |
  v
Next.js web application
  |
  | Typed oRPC requests
  v
NestJS modular API
  |
  +---- Prisma --------------------> Supabase PostgreSQL
  |
  +---- Supabase SDK -------------> Auth / Storage / Realtime, when used
  |
  +---- OpenAI-compatible client --> AI feedback and assistance
  |
  +---- BullMQ --------------------> Redis queue, when introduced
                                          |
                                          v
                                   Isolated judge worker
                                          |
                                          v
                                   Sandboxed execution
```

The Next.js application never connects to PostgreSQL directly. Public Supabase clients may be used only for explicitly approved browser capabilities such as Auth, Storage upload flows, or authenticated Realtime channels.

## 5. Repository structure

Cove v2 uses a pnpm workspace. The initial repository contains three packages.

```text
cove-v2/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── eslint.config.mjs
├── prettier.config.mjs
├── .env.example
├── docker-compose.yml
│
├── packages/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── organizations/
│   │   │   ├── academies/
│   │   │   ├── memberships/
│   │   │   ├── courses/
│   │   │   ├── sections/
│   │   │   ├── lectures/
│   │   │   ├── materials/
│   │   │   ├── exercises/
│   │   │   ├── submissions/
│   │   │   ├── collaboration/
│   │   │   ├── feedback/
│   │   │   ├── analytics/
│   │   │   ├── notifications/
│   │   │   ├── audit/
│   │   │   ├── database/
│   │   │   └── main.ts
│   │   ├── test/
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   │   └── ui/
│   │   │   ├── features/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   │   ├── api/
│   │   │   │   ├── query/
│   │   │   │   └── supabase/
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── tests/
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── shared/
│       ├── src/
│       │   ├── api/
│       │   │   └── orpc/
│       │   ├── auth/
│       │   ├── organizations/
│       │   ├── memberships/
│       │   ├── courses/
│       │   ├── sections/
│       │   ├── materials/
│       │   ├── exercises/
│       │   ├── submissions/
│       │   ├── collaboration/
│       │   ├── errors/
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
│
├── docs/
│   ├── design/
│   ├── product/
│   └── adr/
│
└── scripts/
    └── migration-v1-to-v2/
```

### 5.1 Dependency direction

```text
packages/web  ----> packages/shared <---- packages/api
```

- `web` must not import from `api`.
- `api` must not import from `web`.
- `shared` must not depend on Next.js, React, NestJS, Prisma, or server secrets.

### 5.2 Shared package responsibilities

The shared package may contain:

- Zod input and output schemas.
- oRPC contracts.
- Public domain models.
- Roles, statuses, enums, and constants.
- Stable error codes.
- Pagination types.
- Pure validation and formatting rules required by both applications.

The shared package must not contain:

- Prisma models or database queries.
- NestJS services, repositories, guards, or decorators.
- React components, hooks, or TanStack Query configuration.
- Environment secrets.
- Backend-only business logic.

No separate UI package is needed while Cove has only one web application. A worker package is added only when server-side grading is implemented.

## 6. Technology stack

| Area | Technology | Responsibility |
|---|---|---|
| Workspace | pnpm workspaces | Package management and shared local dependencies |
| Frontend | Next.js App Router, React, TypeScript | User interface and frontend orchestration |
| Backend | NestJS, TypeScript | Business rules, authorization, APIs, jobs |
| API contracts | oRPC and Zod | End-to-end typed and validated API contracts |
| Database | Supabase-managed PostgreSQL | Primary transactional data store |
| ORM | Prisma | Schema, migrations, queries, and transactions |
| Server state | TanStack Query | Fetching, caching, invalidation, and mutations |
| Local UI state | React state | Component and page interaction state |
| Styling | Tailwind CSS and shadcn/ui | Design system and UI implementation |
| Forms | React Hook Form and Zod | Form state and validation |
| Data tables | TanStack Table | Administrative and analytical tables |
| Rich content | Tiptap | Text and structured learning-material authoring |
| Code editing | Monaco Editor | Programming exercise editor |
| Browser execution | Pyodide | Fast Python run feedback, not official grading |
| Realtime | Supabase Realtime initially | Authenticated presence and collaboration events |
| File storage | Supabase Storage | Course files, images, documents, and media metadata |
| Background jobs | BullMQ and Redis, later | Grading, reports, AI jobs, notifications |
| Server grading | Dedicated judge worker, later | Trusted execution against hidden tests |
| Tests | Vitest and Playwright | Unit, integration, contract, and browser tests |
| Logging | Pino-compatible structured logging | Searchable application logs |
| Error monitoring | Sentry | Frontend and backend error reporting |

## 7. Multi-academy tenancy

### 7.1 Tenant hierarchy

```text
Platform
└── Organization
    └── Academy
        ├── Members
        ├── Course sections
        ├── Teachers
        └── Students
```

An organization represents the legal or operating group. An academy represents a DLab location or branch. The model supports one organization with many academies and leaves room for other organizations later.

### 7.2 Membership, not global role only

A user account is global. Access is assigned through scoped memberships.

```text
User
├── platform role, optional
├── organization membership
├── academy membership
└── course-section membership
```

Examples:

- A user may teach at Academy A and manage Academy B.
- A student may move between academies while retaining submission history.
- A platform administrator may operate across tenants through audited workflows.

### 7.3 Tenant isolation rules

- Academy-owned tables carry an `academy_id` directly or have an unambiguous relation to one.
- Every protected API procedure resolves the authenticated user and requested academy context.
- Authorization verifies active membership and required permission before database mutation.
- Repository/service queries receive explicit tenant scope rather than relying on frontend filters.
- Administrative cross-tenant access is restricted and audited.
- Database RLS may be added as defense in depth, but it does not replace NestJS authorization.

## 8. Core domain model

### 8.1 Identity and access

```text
users
auth_credentials
auth_sessions
organizations
academies
organization_memberships
academy_memberships
roles
permissions
membership_roles
invitations
audit_logs
```

Existing v1 bcrypt password hashes remain compatible during migration. Authentication-provider replacement is a separate future decision and is not combined with the initial v2 migration.

### 8.2 Reusable content

```text
courses
course_versions
lectures
materials
material_versions
lecture_materials
exercises
exercise_test_cases
exercise_hints
```

Key rules:

- A course is the stable reusable identity.
- A course version is an editable or published snapshot.
- Lectures belong to a course version and have explicit order.
- Materials are reusable learning objects.
- `lecture_materials` controls inclusion and order.
- Material-specific configuration is validated according to material type.
- Published versions are immutable; changes create a draft or new version.

Initial material types may include:

- Rich text.
- Programming exercise.
- Quiz.
- Video link.
- Uploaded video.
- Document.
- Assignment.
- External URL.

Survey, video assessment, and advanced test material types can be added later.

### 8.3 Course delivery

```text
course_sections
section_teachers
section_enrollments
section_content_releases
assignments
assignment_targets
material_completions
progress_events
```

A course section connects one academy, one published course version, teachers, students, dates, release rules, and learner progress.

Separating reusable content from delivery allows the same Python curriculum to be used by many DLab academies and cohorts.

### 8.4 Coding and assessment

```text
submissions
submission_results
submission_test_results
judge_jobs
exercise_attempts
ai_feedbacks
teacher_feedbacks
```

The browser may run code for immediate practice feedback. Official submission results are created only by trusted backend grading.

### 8.5 Collaboration

```text
collaboration_sessions
collaboration_members
collaboration_events
collaboration_snapshots
```

Collaboration is authorized through academy, section, and session membership. Realtime channel names alone are never considered authorization.

### 8.6 Communication and operations

```text
notifications
notification_deliveries
announcements
activity_events
audit_logs
```

Notifications and audit logs are separate concepts. Notifications are user-facing; audit logs are immutable operational records of sensitive actions.

## 9. API architecture

### 9.1 Contract-first API

The shared package defines input, output, and error contracts. The NestJS implementation satisfies those contracts, and the Next.js client consumes the same definitions.

```text
shared contract
      |
      +----> NestJS implementation
      |
      +----> Next.js typed client
```

This prevents frontend and backend request types from drifting.

### 9.2 NestJS module structure

Each business module contains focused components:

```text
courses/
├── courses.module.ts
├── courses.router.ts
├── courses.service.ts
├── courses.repository.ts, only when valuable
├── courses.policy.ts
└── courses.service.spec.ts
```

Responsibilities:

- Router/controller: transport mapping and contract implementation.
- Service: use-case orchestration and business rules.
- Policy/authorization: permission decisions.
- Repository or Prisma access: scoped persistence queries.
- Contract: located in `packages/shared`, not the API package.

### 9.3 Error model

Errors use stable codes rather than frontend parsing of Korean or English messages.

Examples:

```text
UNAUTHENTICATED
FORBIDDEN
ACADEMY_NOT_FOUND
MEMBERSHIP_INACTIVE
COURSE_VERSION_PUBLISHED
ENROLLMENT_NOT_FOUND
SUBMISSION_REJECTED
JUDGE_UNAVAILABLE
RATE_LIMITED
```

The API maps internal errors to safe client responses and logs the original server error with a request identifier.

## 10. Frontend architecture

### 10.1 Route areas

```text
app/
├── (public)/
├── (auth)/
├── (student)/
├── (teacher)/
├── (academy-admin)/
├── (platform-admin)/
└── (fullscreen)/
```

Route groups control layout, not authorization. The API always verifies authorization independently.

### 10.2 Feature organization

```text
features/courses/
├── api/
├── components/
├── hooks/
├── schemas/
└── utils/
```

Shared generic UI primitives remain in `components/ui`. Business-specific components remain inside their feature.

### 10.3 State-management rules

- TanStack Query owns remote server state.
- React state owns local interaction state.
- URL search parameters own shareable filters, pagination, and selected views.
- Form state uses React Hook Form.
- A separate global store is introduced only when a concrete cross-route client-state requirement exists.
- Server data is not duplicated into a global client store.

### 10.4 Design system

- shadcn/ui provides editable primitives.
- Tailwind theme tokens define color, spacing, radius, typography, and state styles.
- Cove-specific components compose primitives rather than modifying every primitive per page.
- Accessibility states, keyboard interaction, loading, empty, error, and permission-denied states are part of component acceptance criteria.

## 11. Database strategy

### 11.1 Environment separation

```text
V1 Supabase project
└── Current production only

V2 development Supabase project
└── Cove Studio development and migration testing

V2 production Supabase project
└── Created before production cutover
```

The newly created Cove Studio project is treated as v2 development, even if the Supabase dashboard labels its main branch as production.

### 11.2 Prisma ownership

- `packages/api/prisma/schema.prisma` is the canonical application schema.
- Prisma migrations are reviewed and committed.
- PostgreSQL-specific SQL may be included in migrations where Prisma schema syntax is insufficient.
- Tables are not created ad hoc in the Supabase Table Editor.
- Production migrations are applied through a controlled deployment step.
- Backups are taken before destructive or high-risk migrations.

### 11.3 Connections and secrets

The API uses database connection strings for Prisma:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

Supabase service integration uses:

```env
SUPABASE_URL="https://project-ref.supabase.co"
SUPABASE_SECRET_KEY="sb_secret_..."
```

The browser may use only public values:

```env
NEXT_PUBLIC_SUPABASE_URL="https://project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
```

Rules:

- Secret keys never use a `NEXT_PUBLIC_` prefix.
- Environment files are ignored by Git.
- `.env.example` contains names and descriptions, never real values.
- Production secrets live in deployment secret stores.
- Separate secret keys should be created per backend component when multiple components exist.

### 11.4 Data API

The Supabase Data API is disabled initially because NestJS and Prisma own database access. It may be enabled later only for a defined requirement with explicit schema exposure, grants, and RLS policies.

## 12. Authentication and authorization direction

Authentication identifies the user. Membership and policy checks determine what the user may do.

The initial v2 migration preserves the existing username and bcrypt password-hash behavior so existing users can log in without password resets. The final authentication implementation will be specified separately before coding.

Regardless of authentication provider:

- Passwords are never stored or logged in plaintext.
- Teacher and administrator status cannot be self-selected during public signup.
- Sessions can be revoked.
- Inactive accounts cannot authenticate.
- Sensitive operations require explicit scoped authorization.
- Login, role changes, invitation acceptance, and administrative access are rate-limited and audited.

## 13. Secure code execution and grading

### 13.1 Run versus submit

```text
Run
└── Pyodide in browser
    └── Fast practice feedback

Submit
└── NestJS validates access and creates judge job
    └── Queue dispatches work
        └── Judge worker executes hidden tests
            └── Result is persisted
```

### 13.2 Security requirements

- Hidden test inputs and expected outputs are never sent to student clients.
- The API never trusts client-reported score, status, runtime, or passed-case count.
- Submitted code never runs inside the NestJS API process.
- Execution has CPU, memory, process, file, output, and time limits.
- Network access is denied by default.
- Judge images and language versions are explicit and versioned.
- Judge results identify the grader version used.
- Jobs are idempotent and safe to retry.

### 13.3 Initial delivery

The first secure judge may support Python only. Additional languages are added behind a common runner interface after the Python path is stable.

## 14. Realtime collaboration

Supabase Realtime can support initial presence, cursors, code-update events, and teacher/student session signals.

Requirements:

- NestJS authorizes session creation and membership.
- Channel access uses authenticated tokens and tenant-aware rules.
- Users cannot join a session by guessing an identifier.
- Code snapshots are periodically persisted.
- Reconnection restores the latest authorized snapshot.
- Events have size and rate limits.
- Sensitive code is not broadcast to global presence channels.

If true concurrent editing and conflict-free merges become necessary, Yjs can replace simple code-update broadcasts without changing the course and authorization domains.

## 15. AI capabilities

V2 preserves and improves Cove's AI feedback functionality.

Initial AI capabilities:

- Explain runtime and syntax errors without revealing full answers.
- Apply academy-managed feedback patterns.
- Generate contextual hints from the problem and recent attempt.
- Record model, prompt version, latency, token usage, and outcome.
- Allow teachers to review AI feedback associated with a submission.

AI calls run through NestJS or a background worker. Provider keys are never exposed to the browser. Inputs are minimized, access-controlled, and handled according to the platform's student-data policy.

## 16. Analytics and progress

The source of truth is immutable or append-oriented activity data where practical.

Tracked events may include:

- Material opened and completed.
- Code run.
- Code submitted.
- Judge result.
- Hint requested.
- AI feedback generated.
- Teacher joined a session.
- Assignment completed.
- Course completion changed.

Operational dashboards may initially query PostgreSQL directly through optimized indexes and aggregate queries. Precomputed summaries or background aggregation are introduced only when measured query cost requires them.

Initial reporting dimensions:

- Organization and academy.
- Course and course version.
- Section.
- Lecture and material.
- Student.
- Exercise.
- Date range.

## 17. Storage and media

Supabase Storage is used for documents, images, and media when those features are implemented.

Rules:

- Objects use tenant-aware paths.
- Buckets are private by default.
- Downloads use short-lived signed URLs when appropriate.
- Upload permission is issued by a trusted backend flow.
- File type, size, and ownership are validated.
- Database rows store metadata and business ownership; object storage holds file bytes.
- Deleting a domain record and deleting its object are coordinated and recoverable.

## 18. Security baseline

Before v2 production launch:

- No public administrative bootstrap endpoint exists.
- No default credentials exist.
- Signup cannot grant teacher or administrator privileges.
- Hidden judge cases remain server-only.
- Submission results are server-generated.
- Realtime channels require authorization.
- All sensitive API operations check tenant membership.
- Rate limiting is enabled globally and tightened on authentication, AI, upload, and submission endpoints.
- Security headers and strict CORS rules are configured.
- Request bodies are validated using shared schemas.
- Audit logs cover role, membership, course-publication, and user-status changes.
- Secrets are excluded from source control and logs.
- Dependencies and containers are scanned in CI.
- Backup and restoration procedures are tested.

## 19. Testing strategy

### 19.1 Shared package

- Schema validation tests.
- Contract compatibility tests.
- Enum and error-code stability tests.

### 19.2 API

- Service unit tests.
- Authorization-policy tests.
- Tenant-isolation integration tests.
- Prisma integration tests against a disposable PostgreSQL database.
- Authentication and session tests.
- Migration tests.
- Judge job and result-validation tests.

### 19.3 Web

- Feature component tests for critical interactions.
- TanStack Query hook tests where behavior is nontrivial.
- Accessibility checks for key workflows.
- Playwright tests for role-based journeys.

### 19.4 Required end-to-end journeys

- Academy administrator invites a teacher.
- Teacher creates or receives a course section.
- Student enrolls and opens a lecture.
- Student runs and submits Python code.
- Hidden grading returns a trusted result.
- Teacher views progress and joins a collaboration session.
- Existing migrated user signs in with the old password.

## 20. Observability and operations

- Logs are structured JSON outside local development.
- Every request receives a correlation identifier.
- Logs include academy and user identifiers only when appropriate and never include passwords, hashes, tokens, submitted secrets, or full sensitive payloads.
- Sentry records unexpected frontend and backend errors.
- Health endpoints distinguish process health from dependency readiness.
- Metrics include request latency, error rate, database latency, judge queue depth, judge duration, AI latency, and migration failures.
- Audit logs are queryable separately from application logs.

## 21. Deployment model

```text
coveedu.com
└── Next.js web deployment

api.coveedu.com
└── NestJS API deployment

Supabase Seoul
├── PostgreSQL
├── Storage
└── Realtime

Redis
└── BullMQ queues, when introduced

Judge host
└── Isolated runner containers, when introduced
```

The web and API deploy independently from the same repository. The NestJS API and future judge worker run on infrastructure that supports long-running processes. The judge worker requires container isolation and must not be deployed as a normal serverless function.

Initial environments:

```text
Local
Development / preview
Staging
Production
```

The current Cove Studio Supabase project is used for v2 development. A separate v2 production project is created before cutover.

## 22. V1 feature-parity baseline

V2 must account for these v1 capabilities before production replacement:

- Student, teacher, and administrator roles.
- User signup, login, profile, activation, and management.
- Subject, stage, chapter, and problem hierarchy.
- Excel curriculum import.
- Problem authoring and test cases.
- Monaco-based code editing.
- Pyodide Python execution and interactive input.
- Submissions and progress.
- Teacher/student relationships.
- Teacher dashboard and progress analytics.
- Collaboration sessions, presence, cursors, and code synchronization.
- Teacher feedback.
- AI hints, AI feedback patterns, AI feedback history, and analytics.
- File uploads used by active workflows.

Feature parity does not require retaining insecure implementation behavior. Hidden client-side grading, client-reported scores, public collaboration channels, self-selected teacher signup, and the unauthenticated setup endpoint must not be carried into v2.

## 23. V1-to-v2 migration

### 23.1 Migration strategy

Use a short, controlled maintenance-window migration. Do not dual-write both systems during the long v2 development period.

```text
V1 remains live
→ Periodic snapshots test migration scripts
→ V2 reaches feature parity
→ V1 enters maintenance/read-only mode
→ Final backup and export
→ Transform and load into V2 production
→ Validate
→ Smoke-test logins and workflows
→ Switch production domain
```

### 23.2 Migration tooling

```text
scripts/migration-v1-to-v2/
├── extract.ts
├── transform.ts
├── load.ts
├── validate.ts
└── mappings/
```

The tooling must support dry runs, structured logs, repeatable staging tests, invalid-row reports, and validation summaries.

### 23.3 Identity migration

- Preserve stable user IDs where practical.
- Copy usernames and bcrypt password hashes without decrypting or logging them.
- Record the password algorithm for compatibility.
- Require users to establish new v2 sessions after cutover.
- Optionally strengthen a bcrypt hash after a successful future login.
- Preserve active/inactive status and original creation time.

### 23.4 Domain mapping

```text
V1 users
→ V2 users, credentials, and academy memberships

V1 teacher_student
→ V2 academy relationships and section assignments

V1 subjects, stages, chapters, problems
→ V2 reusable course, lecture, material, and exercise structure

V1 test_cases
→ V2 server-only exercise test cases

V1 submissions
→ V2 submissions and imported results

V1 collaboration_sessions
→ V2 collaboration history where valuable

V1 feedback and AI records
→ V2 teacher and AI feedback history
```

Where IDs cannot be retained, a legacy-to-v2 ID mapping is stored for migration reconciliation.

### 23.5 Validation

Before cutover, compare:

- User totals and role/status totals.
- Teacher/student relationships.
- Curriculum and exercise totals.
- Test-case totals without exposing test contents.
- Submission and feedback totals.
- Orphaned references.
- Selected historical records.
- Login behavior for representative administrator, teacher, student, active, and inactive users.

### 23.6 Rollback

V1 and its database remain intact and read-only during the initial v2 launch period. If a critical failure occurs, stop v2 writes and route users back to v1. Data created in v2 after cutover requires an explicit reconciliation plan before rollback; therefore, production smoke tests and a limited launch window should minimize the chance of rollback after significant new activity.

## 24. Delivery sequence

### Phase 0: Repository and platform foundation

- Create the pnpm workspace.
- Move the current Next.js application into `packages/web` without intentional feature changes.
- Create `packages/shared`.
- Create the NestJS API in `packages/api`.
- Configure Prisma against the separate v2 development Supabase database.
- Establish CI for build, type checking, tests, and migrations.

### Phase 1: Security and identity

- Define organizations, academies, memberships, invitations, users, credentials, and sessions.
- Remove insecure v1 authentication patterns from the v2 design.
- Implement tenant-aware policies and audit logging.
- Build and test v1 identity migration.

### Phase 2: Course and content foundation

- Implement reusable courses, versions, lectures, materials, and publication states.
- Implement academies, course sections, teachers, and enrollments.
- Migrate the v1 curriculum into the new model.

### Phase 3: Learning and feature parity

- Implement student course and lecture experiences.
- Migrate the Monaco and Pyodide experience.
- Implement progress and completion.
- Restore teacher feedback, AI feedback, and collaboration with secure authorization.

### Phase 4: Secure grading

- Add Redis and BullMQ.
- Add the judge-worker package and isolated Python runner.
- Move official submission grading to the server.
- Add judge observability, retries, and limits.

### Phase 5: Analytics and operations

- Implement course, section, lecture, exercise, and student reports.
- Add notifications and announcements.
- Add report exports and operational dashboards.

### Phase 6: Production migration

- Create the v2 production Supabase project.
- Run final migration rehearsals.
- Complete security and performance reviews.
- Execute controlled cutover and monitor.

### Phase 7: Elice-inspired expansion

- Assignments and due dates.
- Tests and broader assessment types.
- Reusable content library and course duplication.
- Advanced progress scoring and intervention recommendations.
- Surveys, video materials, and richer notification workflows.
- Plagiarism detection and exam monitoring only after core product maturity.

## 25. Key decisions

| Decision | Choice | Reason |
|---|---|---|
| Development strategy | Separate v2 branch/worktree and deployment | Keeps v1 production stable |
| Repository | pnpm workspace | Matches known projects and enables shared contracts |
| Initial packages | `api`, `web`, `shared` | Smallest useful separation for one developer |
| Backend | NestJS modular monolith | Clear domains without microservice overhead |
| Frontend | Next.js App Router | Preserves v1 frontend investment |
| Database | New Supabase PostgreSQL project | Safe redesign and migration testing |
| Schema management | Prisma migrations | Versioned, reproducible database evolution |
| API | oRPC and Zod contracts | End-to-end TypeScript validation and type safety |
| Server state | TanStack Query | Clear remote-state caching and mutation model |
| Styling | Tailwind CSS and shadcn/ui | Flexible owned component system |
| Database browser access | Disabled by default | NestJS owns sensitive data access |
| Grading | Browser run, worker submit | Fast UX with trusted official results |
| Realtime | Supabase Realtime initially | Reuses managed infrastructure with authorization |
| Migration | Tested bulk migration with maintenance window | Lowest complexity and risk for one developer |
| Existing passwords | Preserve compatible bcrypt hashes | No forced password reset |

## 26. Open follow-up designs

The following require focused design documents before implementation:

- Authentication and session architecture.
- Multi-tenant authorization and permission matrix.
- Course, version, lecture, and material schema.
- Secure judge-worker protocol and sandbox.
- Realtime collaboration protocol.
- V1-to-v2 field-level migration mapping.
- Production deployment and release process.
- Student-data retention, privacy, and audit policy.

These documents should refine one bounded subsystem at a time and must remain consistent with the dependency boundaries and safety principles in this system design.
