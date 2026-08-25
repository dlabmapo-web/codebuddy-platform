# Long Programming Exercise Descriptions Design

**Date:** 2026-08-25
**Branch:** `feat/cove-studio-v2`
**Status:** Implemented and verified

## Context

The migrated `알고리즘 Lv2` course contains legitimate HTML lesson content in
two programming-exercise descriptions. The descriptions are 20,439 and 10,556
characters long. The database stores them intact, but the course authoring API
rejects its own response because the shared programming-exercise output schema
allows only 10,000 characters.

## Decision

Programming-exercise descriptions may contain up to 500,000 characters. The
same limit applies when reading a course tree and when creating or updating an
exercise. This is deliberately bounded rather than unlimited so malformed or
hostile requests cannot create unbounded API payloads.

The existing 10,000-character limit remains unchanged for course, module, and
lecture descriptions. No migrated description will be truncated or rewritten,
and no database migration is required because the column already stores text.

## Implementation

- Define one shared rich-exercise-description schema with the 500,000-character
  limit.
- Use it in the programming-exercise response and exercise draft schemas.
- Add contract tests proving a description longer than 100,000 characters is
  accepted up to the new limit and content beyond the limit is rejected.
- Run shared, API, and web type checks plus focused course tests.
- Load all five migrated course trees through the authenticated API and confirm
  that output validation succeeds without changing production data.

## Acceptance criteria

- The migrated `알고리즘 Lv2` course builder loads normally.
- All five migrated course-tree responses pass output validation.
- Exercise descriptions up to 500,000 characters can be read and saved.
- Descriptions over 500,000 characters are rejected.
- Other description limits remain unchanged.
- Existing database content is not truncated or otherwise modified.

## Verification result

Focused contract tests, shared/API/web type checks, and the production API
build passed. An isolated API process authenticated as `mapo-teamlead` and
successfully loaded all five migrated course trees, including all 497
programming exercises. No database rows were modified during verification.
