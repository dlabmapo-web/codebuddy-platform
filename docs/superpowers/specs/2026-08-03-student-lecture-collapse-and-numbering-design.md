# Student Lecture Collapse and Numbering Design

**Date:** 2026-08-03
**Status:** Approved design, awaiting implementation

## Goal

Make lecture navigation in the student course outline consistent with the Team
Lead curriculum builder. Students must be able to collapse the problems inside
each lecture, and problem outline numbers must use the same hierarchy format on
both surfaces.

## Student experience

- Every lecture header is an accessible toggle with an up/down chevron.
- Lectures are expanded by default.
- Toggling one lecture affects only that lecture. Other lectures and the parent
  module keep their current state.
- Collapsing a lecture hides every problem row inside it without changing
  progress, scores, or visibility data.
- Searching forces lectures containing matching problems open so results are
  never hidden behind a collapsed header.
- A `lecture` deep link forces the requested module and lecture open before the
  page scrolls to it.
- Lectures with no visible problems still have a header, but their empty-state
  message does not need a collapse toggle.

## Numbering

Student problem labels use the same three-part outline number as Team Lead:

- Module 1, lecture 1, problem 1: `1-1-1`
- Module 1, lecture 1, problem 2: `1-1-2`
- Module 2, lecture 3, problem 4: `2-3-4`

The current mixed format such as `1-1.1` is removed.

## Component design

`useCourseOutline` owns collapsed lecture IDs alongside collapsed module IDs.
It exposes `isLectureExpanded(lectureId)` and `toggleLecture(lectureId)` to the
outline components. Search and deep-link state override collapsed state for the
relevant lectures.

`ModuleSection` renders each non-empty lecture header as a full-width button.
The header retains the existing lecture label and title, adds the visible
problem count, and uses the same chevron direction and transition language as
the Team Lead builder. Problem rows render only while that lecture is expanded.

No API, database, grading, or visibility contract changes are required.

## Accessibility

- Lecture toggle buttons expose `aria-expanded`.
- Each button has a localized accessible name that includes the lecture title.
- Keyboard users can toggle lectures with the native button behavior.
- The chevron is decorative; state is communicated by `aria-expanded`.

## Testing

- A lecture can collapse and expand independently.
- Collapsing one lecture does not collapse sibling lectures or its module.
- Search results remain expanded even when their lecture was collapsed.
- A deep-linked lecture renders expanded.
- Student problem numbering uses `module-lecture-problem` hyphen formatting.
- Existing module collapse behavior and problem navigation continue to work.
- Browser verification covers expanded and collapsed lecture states at desktop
  and narrow widths.

## Out of scope

- Persisting lecture collapse state between visits.
- Accordion behavior that permits only one open lecture.
- Changes to Team Lead collapse behavior.
- Changes to problem ordering or student progress.
