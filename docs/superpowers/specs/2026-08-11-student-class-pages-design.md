# Student Class Pages Design

**Date:** 2026-08-11

**Status:** Confirmed design

**Scope:** V2 student navigation, class list, and class detail surfaces

**Companion designs:**

- `2026-08-03-direct-editable-curriculum-visibility-design.md`
- `2026-08-04-class-teacher-assignment-design.md`
- `2026-08-04-teacher-live-monitoring-design.md`

## 1. Decision

Add a student-facing **My Classes** list and one detail page per class. These
pages explain the delivery relationship that already grants a student access
to learning content: the student is enrolled in an active class, and that
class is assigned one or more courses.

**My Courses** remains the primary learning destination and the default route
for a student entering an academy. It continues to present one deduplicated
catalog of everything the student may study. **My Classes** is a secondary
navigation path that provides class context: class name, description,
currently effective assigned teacher, and the visible courses available
through that particular class.

The initial feature contains no class roster, classmate identities, ranking,
competition, schedule, attendance, announcements, or messaging. The class
detail route creates an appropriate future home for class-scoped features,
but this design does not render placeholders or reserve empty UI for them.

## 2. Current behavior and problem

The data and authorization model already treats a class as the delivery
boundary between reusable curriculum and students:

1. a student holds an active `STUDENT` membership in an academy;
2. that membership is enrolled in an active class;
3. the class is assigned a course; and
4. the course and its relevant descendants are visible.

The student learning surface currently projects that graph directly into
courses. `/studio/academies/:academyId/learn/courses` shows every reachable
course once, even when two classes grant the same course. That is the correct
behavior for starting and continuing work, but it hides which classes the
student belongs to, which teacher is responsible for each class, and which
courses are associated with a particular class.

Management and teacher class routes cannot fill this gap. `/classes` exposes
class-management controls and roster data, while `/teach/classes` exposes live
monitoring information for an assigned teacher. Neither response contract nor
surface is safe or appropriate for students.

## 3. Goals

- Let a student see every active class in which their active academy
  membership is currently enrolled.
- Let a student open a class and understand its name, description, assigned
  teacher, and currently available courses.
- Link class courses to the existing student course pages without adding a
  second curriculum or exercise flow.
- Keep **My Courses** as the fastest route into learning and preserve its
  existing cross-class deduplication.
- Apply the same curriculum visibility and nonempty-course rules on both
  student surfaces.
- Keep student class contracts structurally incapable of carrying roster or
  management-only data.
- Handle archived classes, removed enrollments, stale teacher assignments,
  hidden courses, and empty classes without leaking inaccessible records.
- Add a stable class-detail location that later class-scoped designs may
  extend deliberately.

## 4. Non-goals

- Showing a student roster, roster count, classmates, emails, usernames, or
  other student identities.
- Adding rankings, leaderboards, points, lesson challenges, competition
  sessions, badges, or rewards.
- Adding class schedules, attendance, announcements, chat, files, or teacher
  messaging.
- Letting students join, leave, create, edit, archive, or otherwise manage a
  class.
- Letting students assign teachers or courses.
- Changing course assignment, enrollment, teacher assignment, curriculum
  visibility, grading, progress, or submission semantics.
- Grouping or duplicating the **My Courses** catalog by class.
- Adding a database table, column, migration, or stored denormalized class
  summary.
- Showing archived classes or historical enrollments to students.

Ranking and in-class competition require their own later design because they
introduce new questions about challenge scope, start and end times, scoring,
ties, identity visibility, and teacher controls. They must not be inferred
from or partially implemented by this feature.

## 5. Student experience

### 5.1 Navigation

The Learning sidebar group contains two entries in this order:

1. **My Courses**
2. **My Classes**

**My Courses** remains the academy landing destination for students. Adding
the new link does not change the existing redirect from
`/studio/academies/:academyId` to `/learn/courses`.

**My Classes** is visible only to an actor whose effective academy role is
`STUDENT`. A staff member who may preview curriculum does not gain a student
class entry merely because they can open the learning surface.

The new routes are:

```text
/studio/academies/:academyId/learn/classes
/studio/academies/:academyId/learn/classes/:classId
```

The classes entry remains active on a class detail route. It must not cause
the courses entry to appear active at the same time.

### 5.2 My Classes list

The list page uses the established student learning page shell and renders one
card per accessible class. Classes are ordered by class name and then class ID
so the result is stable even though class names are intentionally not unique.

Each card displays only:

- class name;
- class description, clamped when necessary;
- the effective assigned teacher's display name, or **Teacher not assigned**;
- the number of courses currently available to the student through this
  class; and
- a clear affordance to open the class.

The card does not show enrollment count, classmate avatars, class status,
internal IDs, management timestamps, or edit actions. An active class with no
currently available courses remains in the list with a zero-course label.

When the student has no accessible classes, the page explains that they are
not currently enrolled in an active class. It does not imply that the academy
has no classes.

### 5.3 Class detail

The detail page begins with a **Back to My Classes** link and shows:

- class name;
- full class description when present;
- the effective assigned teacher's display name, or **Teacher not assigned**;
  and
- an **Available courses** section.

Available courses use the existing student course-card presentation,
including title, description, curriculum counts, progress, and the normal
link to:

```text
/studio/academies/:academyId/learn/courses/:courseId
```

The course route is intentionally not nested beneath the class. Course access
continues to mean access through any eligible active class, so a remembered
course URL remains valid when one class path is removed but another still
grants the course.

If the class has no available courses, the detail page remains useful and
states that learning content has not been made available for this class yet.
It does not expose hidden course titles or distinguish an unassigned course
from an assigned-but-hidden or assigned-but-empty course.

## 6. Student-safe contracts

Add student-specific schemas to the learning contract rather than reusing
`ClassSummary`, `ClassDetail`, or monitoring schemas. The management types
contain fields such as roster information, membership states, user IDs,
emails, timestamps, and archived status that do not belong on a student
surface.

The student-facing shapes are conceptually:

```ts
type LearnClassTeacher = {
  displayName: string;
};

type LearnClassSummary = {
  classId: string;
  name: string;
  description: string;
  teacher: LearnClassTeacher | null;
  availableCourseCount: number;
};

type LearnClassDetail = LearnClassSummary & {
  courses: LearnCourseSummary[];
};
```

The teacher payload contains no user ID, membership ID, email, role, or status.
`displayName` is the assigned user's trimmed, nonempty display name. It must
not fall back to an email address, username, user ID, or membership ID. If the
stored display name is null, empty, or whitespace-only, the response reports
`teacher: null` and the UI uses **Teacher not assigned**.

Extend the learning contract with:

```ts
listClasses({ academyId })
  -> { classes: LearnClassSummary[] }

getClass({ academyId, classId })
  -> LearnClassDetail
```

These endpoints are read-only. Existing management mutations remain in the
classes contract and are not imported into the learning namespace.

## 7. Authorization and projection rules

### 7.1 Accessible class

A student may list or open a class only when all of these are true:

```text
class.academyId == requested academy
class.status == ACTIVE
active academy membership belongs to requester
membership.role == STUDENT
class has enrollment for that exact membership
```

The query pins both the class and membership to the requested academy. A class
ID or membership from another academy must never satisfy the relationship.

The detail read composes the complete predicate into the database query. It
must not fetch a class by ID and then rely on a later client-side or
application-only enrollment check.

A nonexistent class, archived class, class in another academy, and class in
which the student is not actively enrolled all produce the same
student-facing not-found result. This prevents direct-URL probing from
revealing class existence or status.

The list endpoint requires the same active student membership even when the
result would otherwise be empty. Staff curriculum-preview behavior in the
existing learning course endpoints does not broaden class-list access.

### 7.2 Effective teacher

The class stores one teacher membership and may retain a stale assignment for
manager visibility. The student projection treats a teacher as effective only
when:

- the assignment exists;
- the membership belongs to the same academy;
- the membership is active;
- the membership role is `TEACHER`;
- the associated user is active; and
- a safe nonempty display name is available.

If any condition fails, the projection returns `teacher: null`. The student
surface does not distinguish unassigned, suspended, deleted, renamed-role, or
otherwise unavailable teachers.

### 7.3 Available course

A course appears inside a class only when:

1. that exact class has a `ClassCourse` assignment for the course;
2. the course belongs to the requested academy;
3. the course is visible; and
4. the visible hierarchy contains at least one visible learning exercise.

The fourth rule matches the existing **My Courses** behavior: visible but
empty curriculum parents do not create an unusable student course card.
Hidden modules, lectures, materials, and exercises do not contribute to the
displayed counts or progress total.

The list's `availableCourseCount` and the detail's `courses.length` apply the
same projection. They must not drift because one counts raw assignments while
the other filters student-visible content.

### 7.4 Progress and duplicate paths

The detail endpoint returns the existing `LearnCourseSummary` for each
available course. Progress is calculated from the student's existing
`StudentExerciseProgress` records over the currently visible exercises. No
class-specific progress record is introduced because progress belongs to the
student and exercise, not to one access path.

Within one class, the composite `ClassCourse` key already prevents duplicate
course assignments. Across classes, the same course may appear on more than
one class detail page. **My Courses** continues to show it once because two
classes granting one course are duplicate authorization paths, not two copies
of the curriculum.

## 8. Server data flow and internal boundaries

The class list flow is:

1. resolve the requester as an active student in the requested academy;
2. query only active classes enrolled through that exact membership;
3. project the effective teacher using a minimal select;
4. determine available assigned courses with the shared student curriculum
   availability rules;
5. return student-safe summaries ordered by name and ID.

The class detail flow is:

1. resolve the requester as an active student;
2. query the requested class with the full accessible-class predicate;
3. select the minimal effective-teacher fields and assigned visible
   curriculum graph;
4. remove courses without visible learning exercises;
5. fetch progress for the remaining visible material IDs;
6. project each course through the same summary builder used by **My Courses**;
7. return the student-safe detail.

The Learn module owns a single internal course-summary projection for course
catalog and class detail reads. It accepts a visible curriculum record and a
student progress map, then produces `LearnCourseSummary`. Centralizing this
projection prevents class pages from acquiring subtly different counts,
ordering, or progress semantics.

The student class projection is separate from `ClassesService`. That service
owns management reads and mutations; making it conditionally omit sensitive
fields for students would weaken the contract boundary and make future field
additions easy to leak.

No endpoint needs to scan submission history. Existing aggregated
`StudentExerciseProgress` rows remain the progress source.

## 9. Web component boundaries

### Student class list

Owns list loading, unavailable, and empty states and renders focused class
cards. A class card receives only `LearnClassSummary` and constructs the
student detail URL. It contains no knowledge of management routes or class
mutations.

### Student class detail

Owns the class header, teacher summary, course section, and class-specific
empty state. It receives `LearnClassDetail` and delegates course rendering to
the shared student course card.

### Shared student course card

The current course card is nested beneath the course-catalog route even though
class detail now has the same legitimate consumer. Move or expose it from a
shared component boundary under the learning feature. Its markup, progress
calculation, translation behavior, and destination remain unchanged.

### Studio sidebar

Adds one student-only link after **My Courses**. Existing permission-derived
management and teaching groups remain unchanged. The sidebar must derive
student visibility from the effective academy role rather than from a broad
`curriculum.read` capability shared with staff preview.

## 10. Loading, empty, and failure behavior

The server-rendered list and detail pages follow the existing learning
surface's authenticated server-client pattern. No optimistic state is needed
because students cannot mutate class membership or assignments.

The list distinguishes:

- successful result with classes;
- successful result with no accessible classes; and
- an unavailable request caused by an authentication, authorization, or
  service failure.

The empty result must not be presented as a failure. A service failure must
not be presented as proof that the student has no classes.

The detail distinguishes:

- accessible class with courses;
- accessible class without available courses; and
- inaccessible or nonexistent class.

An inaccessible detail uses the established not-found/unavailable experience
and does not retain stale class metadata. If enrollment, class status, course
assignment, or visibility changes while a page is open, the next refresh or
navigation reads the authoritative result. Realtime updates are not part of
this feature.

## 11. Privacy, accessibility, and localization

Student class schemas are allowlists. Tests inspect the serialized response so
future additions to management schemas cannot silently introduce roster or
teacher-account fields.

The UI never exposes:

- enrolled student identities or count;
- teacher email, user ID, or membership ID;
- stale teacher assignment status;
- hidden course identity or title; or
- archived class identity or status.

All new interface copy is added to the existing localization system, including
navigation, teacher fallback, course counts, empty states, unavailable states,
and back navigation. English and Korean resources remain complete together.

Class cards and course cards are keyboard-operable links with visible focus.
The list uses semantic headings and preserves a logical heading hierarchy.
Course counts are localized for singular and plural forms. The teacher summary
has a textual label and does not depend on an avatar or icon alone. Empty and
failure states use readable text rather than color as their only signal.

## 12. Verification

### Shared contract tests

- Accept valid student class summaries and details.
- Reject teacher IDs, membership IDs, emails, status fields, timestamps, and
  roster data from student-safe shapes.
- Validate nonnegative available-course counts.
- Validate detail courses through `LearnCourseSummary`.

### API service tests

- List multiple active classes enrolled through the requester's active student
  membership.
- Exclude archived classes.
- Exclude classes from another academy, including deliberately mismatched
  relation fixtures.
- Reject suspended memberships and memberships whose role is no longer
  `STUDENT`.
- Exclude an active class when the requester has no enrollment in it.
- Return the same not-found result for nonexistent, archived, cross-academy,
  and unenrolled class IDs.
- Show an active assigned teacher with a safe display name.
- Project null for an unassigned, suspended, non-teacher, cross-academy,
  inactive-user, or nameless teacher assignment.
- Keep an accessible active class in the list when it has no available
  courses.
- Exclude hidden and visible-but-empty assigned courses from both count and
  detail.
- Exclude courses whose visible ancestor chain contains no visible exercise.
- Return visible curriculum counts and student progress matching **My
  Courses**.
- Preserve the **My Courses** one-course result when two classes grant the
  same course.
- Avoid reading submission history when existing progress rows provide the
  aggregate.

### Web component and route tests

- Show **My Classes** only for students and place it after **My Courses**.
- Keep **My Courses** as the academy landing destination.
- Keep the classes sidebar entry active on list and detail routes without also
  activating courses.
- Render class name, description, effective teacher, and available-course
  count on the list.
- Render the teacher fallback without exposing why an assignment is
  unavailable.
- Render the no-classes state separately from request failure.
- Render the no-available-courses detail state.
- Link class cards to the correct class detail route.
- Link course cards to the existing course route.
- Render course progress identically from My Classes and My Courses.
- Preserve keyboard focus visibility, heading order, and localized accessible
  names.

### End-to-end verification

Using a seeded student enrolled in two active classes:

1. open the academy and verify the default redirect still lands on **My
   Courses**;
2. open **My Classes** and verify both active classes appear;
3. open one class and verify its effective teacher and available courses;
4. open a course and verify the existing outline route and progress;
5. assign the same course to both classes and verify **My Courses** still shows
   one course while both class details may link to it;
6. hide a course and verify its title disappears from class detail and its
   available-course count decreases;
7. remove the student's enrollment and verify the class disappears and its
   remembered detail URL returns the student-safe not-found state; and
8. sign in as staff and verify the student-only sidebar link and direct class
   pages are unavailable.

## 13. Rollout and compatibility

This feature requires no database migration or data backfill. Existing class,
enrollment, teacher assignment, course assignment, visibility, and progress
records are the source of truth.

The change is additive at the learning-contract and route levels. It does not
change management class responses, teacher monitoring responses, course URLs,
exercise URLs, or student progress records. The shared student course-card
move must preserve its public behavior so the current catalog remains
unchanged.

## 14. Acceptance criteria

1. An active student can open **My Classes** from the Learning sidebar.
2. The academy's default student route remains **My Courses**.
3. The list contains exactly the active classes in which the student's active
   `STUDENT` membership is enrolled.
4. Each list card shows class name, description, effective teacher fallback,
   and the count of currently available courses.
5. A student can open an accessible class detail and see its available courses
   with existing progress.
6. Course links use the existing student course route and do not introduce
   class-scoped curriculum URLs.
7. Hidden or empty assigned courses expose neither a card nor a title and do
   not contribute to the available-course count.
8. An accessible class remains visible when it has zero available courses.
9. Archived, cross-academy, unenrolled, and nonexistent class IDs are
   indistinguishable through the student detail endpoint.
10. Student responses contain no roster, student count, student identity,
    teacher account identifier, email, management timestamp, or archived
    status.
11. An unavailable teacher assignment is presented only as **Teacher not
    assigned**.
12. **My Courses** remains deduplicated when multiple classes grant the same
    course.
13. Staff curriculum preview does not grant access to **My Classes**.
14. All new English and Korean interface copy, empty states, failure states,
    focus behavior, and accessible names pass the existing quality checks.
15. No ranking, competition, roster, schedule, attendance, announcement, or
    messaging behavior is introduced.
