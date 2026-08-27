# Curriculum Reordering Design

**Date:** 2026-08-27
**Branch:** `feat/curriculum-reordering`
**Status:** Approved for implementation

## 1. Purpose

A curriculum owner cannot change the order of what they have authored. A
course that grew chapter by chapter keeps the order it was typed in, and the
only way to move `[CH08] 제어문 - 반복문(for)` ahead of six siblings is to
delete and retype it — losing its problems, and every student's progress
against them.

The move itself is already built and unreachable. `reorderModules`,
`reorderLectures` and `reorderExercises` exist, are authorized, rewrite
positions in one transaction and write an audit entry.
`use-course-builder.ts` already creates a mutation for each of the three and
already routes their failures into `structuralError`. What is missing is any
way to call them: the hook returns no action, and no component offers a
control.

This design closes that gap and changes nothing else.

## 2. Scope

Reordering **within one parent**, at all three levels:

| Level | Moves among |
|---|---|
| Module | The course's modules |
| Lecture | Its own module's lectures |
| Problem | Its own lecture's problems |

Deliberately excluded:

- **Moving between parents.** A lecture cannot move to another module, nor a
  problem to another lecture. The API takes a parent id plus the complete
  ordering under it and cannot express a reparent; supporting one means a new
  endpoint, its own authorization, and a migration path for progress rows
  bound to the old parent. It is a separate piece of work.
- **Drag and drop.** See §4.
- **Any API change.** The endpoints are complete.

## 3. Selected interaction

The row menu gains **Move to…**, listing the places the item can go. Choosing
one moves it there.

```
  [CH04] 조건문(if)      1-4   ⋮
  [CH08] 반복문(for)     1-8   ⋮ ◀ open
                              ┌──────────────┐
                              │ Rename       │
                              │ Move to…   ▸ │──┐
                              │ Hide         │  │
                              │ Delete       │  │
                              └──────────────┘  │
                 ┌────────────────────────────┐─┘
                 │ 1st  (before [CH01])       │
                 │ 2nd  (after  [CH01])       │
                 │ 3rd  (after  [CH02])       │
                 │ …                          │
                 │ 8th  (current)          ✓  │  disabled
                 └────────────────────────────┘
```

Each destination names an ordinal **and** the sibling it lands after, because
an ordinal alone is ambiguous while the list is still in its old order — "2nd"
is read before the move, and the reader is looking at the order after it. The
item's own position is shown and disabled so the list always matches the
outline above it.

## 4. Rejected alternatives

**Move up / Move down.** Two menu items, trivial to build. Rejected on the
motivating case: eight-to-second is six clicks and six independent saves, any
of which can fail and leave the curriculum half-moved. The work a person wants
to do is one move, and it should cost one save.

**Drag and drop.** The most natural gesture and the most expensive answer here.
It needs a dependency the project does not carry, a keyboard path to stay
usable without a mouse, and pointer handling across three nested sortable
levels. Worth revisiting if reordering becomes frequent; not worth it to make
the first reorder possible.

## 5. Implementation

### 5.1 Hook actions

`use-course-builder.ts` returns three actions beside the existing
`renameModule`, `deleteModule` and `setModuleVisible`:

```ts
moveModule(moduleId: string, toIndex: number): void
moveLecture(moduleId: string, lectureId: string, toIndex: number): void
moveExercise(lectureId: string, materialId: string, toIndex: number): void
```

Each reads its siblings from `tree`, removes the item, inserts it at
`toIndex`, and hands the complete array to the mutation that already exists.
The server's `assertExactIds` requires the whole set; deriving it from the tree
already in hand satisfies that by construction.

The reordering itself is a pure function, exported and tested on its own:

```ts
function reordered<T>(items: readonly T[], from: number, to: number): T[]
```

### 5.2 Components

- `row-menu.tsx` — a `Move to…` entry between Rename and Hide, taking the
  sibling list and a callback. Absent when there is only one sibling: a list
  of one destination is noise.
- `module-card.tsx`, `lecture-row.tsx` — pass siblings and the action down.

No component computes an ordering. They report an index; the hook owns the
arithmetic.

### 5.3 Hidden siblings

A hidden lecture still holds its position. Hidden siblings therefore appear in
the destination list, marked as hidden. Omitting them would offer a numbering
that disagrees with the outline above, and a move would land somewhere the
reader did not choose.

### 5.4 State and errors

Nothing new. Every reorder mutation already ends in `onSuccess: applyTree` —
the endpoint returns the whole tree and the builder replaces what it holds. No
optimistic update, so a rejected move never leaves a moved row on screen.
Failures already reach `structuralError`, which the builder already renders.

## 6. Verification

Unit tests on `reordered`, where the entire risk is off-by-one:

- down: `[a,b,c,d]` 0 → 2 is `[b,c,a,d]`
- up: `[a,b,c,d]` 3 → 1 is `[a,d,b,c]`
- to first, and to last
- to its own index returns an equal ordering
- an out-of-range index is clamped rather than dropping the item

Component tests:

- the menu lists one destination per sibling, in current order
- the item's own position is present and disabled
- a hidden sibling is listed and marked
- a single-sibling row offers no `Move to…`

Hook test: choosing the third destination calls `reorderLectures` once, with
every sibling id, the moved id third.

Manual check on the motivating case: `[CH08]` to second, one click, outline
renumbered, reload confirms it held.

## 7. Completion criteria

- [ ] A module, a lecture and a problem can each be moved to any position
      among their siblings in one action.
- [ ] The destination list matches the outline, hidden siblings included.
- [ ] A failed move surfaces in the existing banner and moves nothing.
- [ ] No API, contract or schema change.
- [ ] Reordering remains within one parent.
