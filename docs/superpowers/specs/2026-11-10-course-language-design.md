# Course language: one language per course

Date: 2026-11-10. Status: approved 2026-11-10. Branch `feat/c-cpp-execution`.

This changes how a language is chosen in
[C and C++ exercises on the native grader](2026-11-09-c-cpp-execution-design.md).
That spec put a language picker on every exercise and enabled C and C++ academy
by academy. Here:
- the **course** has the language, and every coding exercise in it uses that
  language;
- every academy can use Python, C and C++, with no per-academy switch.

Compiling, running and grading C and C++ are unchanged.

## 1. Decisions (owner, 2026-11-10)

| Question | Decision |
| --- | --- |
| Where the language is chosen | When a course is created, in the library and in an academy. |
| What follows it | Every coding exercise in the course: starter code, solutions, test cases, Run, Test and Submit. |
| Can students switch language? | No. The editor has no language selector. It shows the language as a label. |
| Which academies offer C and C++ | All of them. No per-academy switch. |
| Existing courses | Python, and they stay Python. |
| Changing a course's language later | Allowed only while the course has no problems. Once it has one, the language is locked. |

Why it's locked: a course's starter code, solutions and test cases are written
for its language. Switching a course that has content would leave hundreds of
problems in the wrong language.

## 2. Behaviour

### 2.1 Library courses (platform admins)

- **New library course** gains a **Programming language** choice: Python, C or
  C++. Default Python.
- The library's course list shows each course's language.
- **Importing an academy course into the library** keeps that course's
  language.

### 2.2 Academy courses (authors)

- **New course** gains the same **Programming language** choice, in every
  academy.
- **Course settings** show the language. It can be changed only while the
  course has no problems. After that the field is read-only, with the note
  "The language is fixed once the course has problems."
- **Copying from the library** (adoption) keeps the library course's language.
  The library browser shows each course's language.

### 2.3 Exercises

- The exercise editor loses its language picker. It shows the course's
  language as a label.
- A new coding exercise takes the course's language:
  - **C or C++:** the language's starter template, weighted grading
    (`ELICE_STDIO`, the default weighted profile) and no input-prompt setting,
    exactly as choosing C or C++ does today.
  - **Python:** as today.
- Quiz-style problems have no code. They are unaffected and stay `PYTHON`
  internally, as the quiz schema already requires.
- **Spreadsheet import** into a course creates its new problems in the
  course's language. In a C or C++ course they get the weighted profile, and a
  blank starter becomes the language's template. Problems the import updates
  keep their language.
- Turtle exercises and code-file written responses stay Python. The course
  language governs coding exercises only.

### 2.4 Students and teachers

Unchanged from the C/C++ spec. The workspace opens in the exercise's language
with Run, Test and Submit. Results, history, the teacher's review and the live
view work as already built and tested.

## 3. Rules the API enforces

1. **Create.** `language` is optional on create and defaults to `PYTHON`. Every
   academy and the library accept all three.
2. **Change.** A changed `language` on course update is refused with
   `CONTENT_VALIDATION_FAILED` when the course has a problem: a
   programming-exercise material, quiz-style included. Turtle exercises and
   other materials do not lock it. Quiz-style problems count because the
   course list and the course tree can both count them from the material type
   alone, so the number a form reads and the number the API checks are one
   number, at no extra statement.
3. **Exercises follow the course.** Create, update and import never take a
   language from the client. Create and import copy the course's language;
   update keeps the exercise's stored language. The exercise `language` field
   is removed from the authoring input.

No new error codes. The Korean `errors` catalog is at its size budget, and
the UI never offers a refused action.

## 4. No per-academy switch

- The `C_CPP_EXERCISES` rollout feature no longer gates anything:
  - authoring, Run checks, Test and Submit stop checking it;
  - it leaves the shared feature list and the console's feature board.
- Its PostgreSQL enum value stays. PostgreSQL cannot drop an enum value
  safely, and an unused value is harmless. Feature rows already stored with it
  are ignored when features are read.
- Production's native eligibility (`compose.production.yml`) lists
  `PYTHON`, `C` and `CPP` and the `run` kind for every academy. Once a release
  carrying this is deployed, C and C++ run everywhere.
- The release gates of the C/C++ spec still apply **before deploying**:
  - amd64 qualification on the production host;
  - the production migration;
  - the §8 capacity gates.

  If GCC fails its readiness self-test on the node, the node withdraws GCC
  only. C and C++ then answer "temporarily unavailable", and Python keeps
  grading.
- Emergency controls stay:
  - removing `C` and `CPP` from the eligibility turns them off everywhere;
  - `docker stop` on the native node stops all native execution, as before.

## 5. Data

- New column `courses.language`, type `ExerciseLanguage`, `NOT NULL DEFAULT
  'PYTHON'`. It is added by a **new** migration. `20261110090000_c_cpp_exercises`
  is already applied to the development database, and an applied migration is
  never edited.
- **Backfill:** a course with C or C++ coding exercises takes the compiled
  language most of them use; every other course stays Python. Production has
  none. Development has one: the "C and C++ Practice" course that
  `start-development-c-cpp.mjs` seeds, with one C and two C++ exercises. It
  becomes a C++ course whose C exercise keeps running as C, because each
  exercise's stored language still decides how it runs. That script changes to
  seed one C course and one C++ course; the old mixed course can then be
  deleted.
- `programming_exercises.language` stays. It is the per-exercise copy that
  admission, grading, Run, Test and every read path already use, and it now
  only ever comes from the course. Keeping it means no read path changes and
  no page gains a statement.
- The copy paths also copy `courses.language`:
  - adoption (`academy-library.service.ts`);
  - library import (`platform-library-import.service.ts`);
  - `course-tree-copy.ts`, which already copies each exercise's language.

## 6. Changes by package

**`packages/shared`**

- `createCourseSchema`, `updateCourseSchema` and `createLibraryCourseSchema`
  gain an optional `language`.
- The course summary, library course and exercise authoring context schemas
  gain `language`.
- The exercise authoring input loses `language`.
- `C_CPP_EXERCISES` leaves the academy feature list.

**`packages/api`**

- Course create and update: the rules in §3.
- `lockCourse` returns the course's language, so exercise create reads it in
  the statement it already runs.
- Exercise create and content import copy the course's language. Exercise
  update ignores language.
- Library course create, adoption and library import: language set and
  copied as in §5.
- `requireCompiledLanguages` and every `C_CPP_EXERCISES` check are removed.

**`packages/web`**

- A language select (`components/studio/course-language-field.tsx`) in:
  - the academy's course form, for creating and editing. It locks from
    `content.problems`, which the course list counts in its existing count
    query and a course tree counts the same way;
  - the platform admin's library course modal, for creating and editing. A
    library row counts every material, so it locks at the first material: a
    little earlier than the API, never later;
  - the admin console's cross-academy content modal, for creating only.
    Changes go through the academy's own course form.
- A language label in course lists and the library browser.
- The exercise editor shows the course's language instead of the picker.
  Templates and grading defaults come from it.
- The feature board loses the C and C++ switch.

**`packages/i18n`**

- Korean and English strings for the select, the label and the locked note,
  in the existing page namespaces.
- The feature board's C/C++ strings are removed.

**`deploy`**

- `compose.production.yml`: the eligibility of §4.
- `docs/operations/c-cpp-exercises.md`: enabling becomes deploying; the
  per-academy steps go.
- `packages/api/scripts/start-development-c-cpp.mjs` seeds one C course and
  one C++ course, sets `courses.language`, and no longer writes a
  `C_CPP_EXERCISES` row.

## 7. Database reads

- **Course create, adoption and library import:** one more column in rows
  they already write. No new statement.
- **Course update with a changed language:** the course lock and one count of
  its problems, run only when the language changes. Measured: 14
  statements, against 13 for a rename (whose title check costs one).
- **Exercise create:** the language comes from the existing `lockCourse` row,
  and the feature-flag read is gone: one statement fewer for C/C++. Measured:
  22 statements.
- **Course lists and the library list:** one more selected column; the
  academy list's count query gains one counted column, in the same
  statement.
- **Student and teacher pages:** unchanged.

## 8. Testing

- API unit:
  - create with each language, in an academy and in the library;
  - a language change refused once a problem exists, quiz-style included, and
    allowed while the course is empty;
  - an exercise created in a C course is C with the weighted profile, whatever
    the client sends;
  - adoption keeps the language;
  - a spreadsheet import into a C++ course creates C++ problems;
  - Run, Test and Submit admit C/C++ with no feature row.
- Integration on a disposable PostgreSQL: the migration and its backfill, and
  statement counts for course update and exercise create.
- Web:
  - the course forms;
  - the exercise editor label and template;
  - the feature board without C/C++.
- Deployment validation: the production eligibility parses and lists the
  three languages.
- Browser acceptance (`test-c-cpp-local.sh`): create a C course and a C++
  course, add a problem to each, then Run, Test and Submit as a student.

## 9. Out of scope

- A student language selector, and one problem offered in several languages.
- Changing the language of a course that has problems. To offer a
  course in another language, create a new course in that language.
- Per-language starter code within one exercise.
- C or C++ for Turtle exercises and code-file written responses.
