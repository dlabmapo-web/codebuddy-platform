# Student Navigation History Design

**Date:** 2026-08-25
**Branch:** `feat/cove-studio-v2`
**Status:** Awaiting written-spec review

## 1. Problem

The student exercise workspace combines normal Next.js navigation with native
`pushState` transitions between exercises. Its header Back control is currently
a normal link to the course. That appends the course after the exercise, so the
next browser Back returns to the exercise and creates an apparent loop.

The workspace also treats every `popstate` destination as an exercise ID. When
Back is leaving the workspace for a course, class, or another page, the handler
can incorrectly attempt to load the final path segment as an exercise and
rewrite the address back to the workspace.

## 2. Goals

- Make Back and Forward follow the student's actual navigation history.
- Let browser Back/Forward move between exercises visited inside one workspace.
- Make the workspace header Back control exit the complete exercise sequence to
  the exact trusted Cove page that opened it.
- Use a validated course or Answer records destination when an exercise was
  opened directly, from a bookmark, or in a new tab.
- Never navigate to an untrusted external return address.
- Preserve the in-memory editor and Python runtime while moving between
  exercises.

## 3. Non-goals

- Redesigning the student curriculum interface.
- Changing canonical public routes.
- Retaining navigation history across tabs or browser sessions.
- Replacing native history for ordinary course, class, or catalog navigation.

## 4. Navigation contract

For the ordinary journey:

```text
Classes -> Class -> Course -> Exercise 1 -> Exercise 2
```

Browser Back from Exercise 2 opens Exercise 1 without remounting the workspace.
Browser Back again leaves the workspace for Course. Browser Forward reverses
those steps.

The header Back control exits the whole exercise sequence. From Exercise 2 it
returns directly to Course, consuming both exercise entries. Browser Back from
Course then returns to Class rather than reopening an exercise.

If a trusted same-tab origin is unavailable, header Back replaces the current
entry with the server-validated fallback: Answer records when `returnTo` is
valid, otherwise the exercise's course and lecture.

## 5. Trusted same-tab origin

Internal links that open an exercise record a short-lived, namespaced
navigation intent in `sessionStorage`. The record contains only:

- the exact exercise destination;
- the exact same-origin source path and query; and
- a creation timestamp.

The exercise workspace claims and removes the intent only when its destination
exactly matches the current address and it is recent. Stale, malformed, or
mismatched records are discarded. Because the marker is ephemeral and
tab-scoped, a copied URL or new tab cannot inherit permission to traverse an
unknown history entry.

All student entry surfaces use one tracked exercise-link abstraction so course
rows, resume cards, recent attempts, draft continuation, and record-review links
follow the same rule. The abstraction still renders a normal Next.js link and
does not change the public URL.

## 6. Workspace history state

The claimed entry is tagged in `window.history.state` with a namespaced
workspace object containing a random session ID and exercise index zero. Each
in-memory exercise transition pushes the same session ID with the next index.
The hook preserves Next.js's existing history state rather than replacing it.

On `popstate`, the workspace handles the destination only when all of these are
true:

1. the pathname matches this academy's canonical exercise route;
2. the history state belongs to the active workspace session; and
3. the required class context is still valid.

Otherwise it performs no fetch and no URL rewrite, allowing Next.js to render
the course, class, catalog, or other destination normally.

The header Back control uses the active exercise index to traverse the exact
number of entries required to reach the recorded Cove origin. If the state is
missing or inconsistent, it uses the validated replacement fallback instead.

## 7. Failure behavior

An exercise transition still fetches before committing workspace state. If an
internal Back/Forward exercise fails to load, the rendered exercise and address
are reconciled to the last valid workspace entry, as today.

Leaving the exercise route is never treated as a failed exercise transition.
The handler does not fetch, block, or restore the exercise URL.

If draft saving, execution, or submission temporarily blocks navigation, the
existing transition guard remains authoritative. Header exit follows the same
guard before changing history so work is not abandoned inconsistently.

## 8. Test strategy

Unit and component tests cover:

- trusted navigation-intent creation, matching, expiry, and one-time use;
- rejection of cross-origin, malformed, stale, and mismatched intents;
- internal exercise Back/Forward transitions without a remount;
- `popstate` to a course or class being ignored by the exercise loader;
- header Back consuming one or several exercise entries;
- direct-entry fallback using replacement rather than unsafe history Back;
- Answer records preserving its validated `returnTo`; and
- public exercise URLs remaining unchanged.

The existing canonical-route guard, web tests, type-check, lint, and production
build must continue to pass.
