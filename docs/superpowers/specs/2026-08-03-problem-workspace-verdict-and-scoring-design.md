# Problem Workspace: Verdict, Scoring, and Controls

**Date:** 2026-08-03

**Branch:** `feat/cove-studio-v2`

**Status:** Proposed

**Extends:** `docs/superpowers/specs/2026-07-31-student-learning-experience-design.md`

## 1. Purpose

The grading loop works, but the workspace presents it badly. This spec covers
the interface changes that follow from actually using it, plus the scoring model
they depend on and the data shape a future ranking needs.

## 2. What is wrong today

Observed while testing the built workspace:

| Problem | Consequence |
|---|---|
| Terminal and result are stacked panes | An empty terminal leaves a dead white gap above the verdict |
| The verdict is a footer strip | The most important moment on the page is its smallest element |
| Submit sits inside the terminal toolbar | The primary action is buried beside a secondary one |
| Sample run buttons read `Ex 1`, `Ex 2` | An abbreviation invented here, and easy to miss beside Run |
| No way to copy an example | Trying an input by hand means retyping it |
| No way back to the starter code | A student who breaks their code has nothing to return to |
| Editor type size is fixed | Unusable for a student who needs it larger; wasteful for one who does not |
| Hints live at the bottom of a long statement | Reachable only by scrolling past the thing you are stuck on |
| Previous/Next are bare chevrons | Two unlabelled arrows next to each other, meaning inferred from position |
| Passing tells you nothing beyond pass/fail | No score, so nothing to improve against or rank by |

## 3. Design direction

### 3.1 The verdict is the hero

The page has one job — write code, find out whether it is right — and the
finding out is currently a strip below an empty box. The result becomes a full
pane.

### 3.2 Signature: the judge tape

A horizontal run of numbered cells, filling left to right as the judge reports
each case, is the one element this screen is remembered by.

```
┌─────────────────────────────────────────────────────────┐
│  ✓ 1   ✓ 2   ✕ 3   · 4   · 5                            │
│                    └── stopped here                      │
└─────────────────────────────────────────────────────────┘
```

It is chosen over a large score numeral deliberately. A big number with a small
label and supporting stats is the reflexive answer, and it is the wrong one
here: the story of a failed submission is not *how much* but *which case, and
where it stopped*. The tape encodes execution order and early exit — both true
and both currently confusing, because a student sees greyed cells with no
explanation of why they never ran.

Cells are the judge's own vernacular. They stay monospaced and numbered;
everything around them stays quiet.

### 3.3 Type and colour

No new typefaces or colour values. This screen lives inside an established
design system and inventing a palette for one page would fracture it.

The one deliberate distinction: **anything the judge produced is monospaced** —
case numbers, outcome labels, runtimes, expected and actual output. Anything
Cove says about it stays in the sans. A student can tell machine output from
interface text without reading either.

Existing tokens carry all state: `success` passed, `danger` wrong output or
runtime error, `warning` limits exceeded, `sub` not run.

## 4. Layout

### 4.1 Header

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ←  Course · Module · Lecture        ⏱ 02:41   ⌄ Hint   ↺ Reset          │
│    FizzBuzz for one number   Easy       ‹ Previous  Next ›      ⏎ Submit│
└──────────────────────────────────────────────────────────────────────────┘
```

- **Submit moves here**, right-aligned, with its existing paper-plane icon and
  a light success-green treatment. Run remains in the terminal toolbar so there
  is exactly one Run action and it stays beside its output.
- **Previous and Next carry text labels**, not bare chevrons. Two unlabelled
  arrows side by side make the reader infer meaning from position. Below `sm`
  they collapse to icons with `aria-label`, where space genuinely forces it.
- **Reset** restores the starter code. Destructive, so it confirms — and the
  confirm names what is lost: *"Replace your code with the starting code? Your
  current code is not saved anywhere else."*
- **Hint** moves here from the statement foot. Reveals one hint at a time, as
  now; only the entry point moves.

### 4.2 Editor pane

```
┌──────────────────────────────────────────────────────────────┐
│ Python 3                                          − 13 +     │
├──────────────────────────────────────────────────────────────┤
│  1  n = int(input())                                         │
├──────────────────────────────────────────────────────────────┤
│  Terminal │ Result ●        ▷Test 1 ▷Test 2 ▷Test 3  ▷Run   │  ← tabs
├──────────────────────────────────────────────────────────────┤
│  ✓ 1   ✓ 2   ✕ 3   · 4   · 5                                │
│  Not accepted · 40 / 100 · 2 of 5 cases · 5 ms               │
└──────────────────────────────────────────────────────────────┘
```

**Terminal and Result become tabs in one pane.** This removes the dead gap by
construction rather than by tuning heights: one region, one height, whichever
tab is showing. Submitting switches to Result; running switches to Terminal.

A dot marks the Result tab while grading is in flight or a fresh verdict has not
been read.

**Font size control** in the editor's own header, `−` / value / `+`, clamped
11–20px, persisted per user in `localStorage`. It belongs to the editor, not the
page, so it sits on the editor.

### 4.3 Result tab

```
Not accepted                                        40 / 100

✓ 1   ✓ 2   ✕ 3   · 4   · 5
                  Stopped after the first failure. 2 cases were not run.

Case 3 · Wrong output                                        4 ms
  Expected            Actual
  FIZZBUZZ            FIZZ

2 hidden cases show a result only.
```

- Score and outcome on one line; the tape below it; the failing case expanded
  underneath.
- **Only a failing sample expands.** A hidden case shows position and outcome
  and nothing else — §7.3 of the parent spec, unchanged and non-negotiable.
- `ERRORED` reads *"The judge could not grade this — this does not count as an
  attempt"* and shows no score, because none was earned or lost.

### 4.4 Running a sample

Per-sample run buttons stay in the terminal toolbar, one per visible case,
right-aligned beside Run:

```
┌──────────────────────────────────────────────────────────────┐
│ Terminal │ Result      ▷ Test 1  ▷ Test 2  ▷ Test 3   ▷ Run  │
├──────────────────────────────────────────────────────────────┤
│ $ python solution.py · Test 1                                │
│ FIZZ                                                          │
│ ✓ Test 1 matches the expected output.                        │
└──────────────────────────────────────────────────────────────┘
```

They belong with the terminal because that is where their output appears —
pressing a control and reading the result in the same region is the shorter
loop. Two changes from today:

- **`Ex 1` becomes `Test 1`.** `Ex` is an abbreviation invented here, easy to
  miss beside Run and not a word the statement uses.
- **Prominent enough to find.** They are the control a student uses most before
  submitting, and are currently the quietest thing in the toolbar.

The running one shows a spinner in place; the rest disable while it runs.

### 4.5 Copying an example

```
┌─────────────────────────────────────────────────────────┐
│ Example 1                                               │
│ INPUT              EXPECTED OUTPUT                       │
│ 9              ⧉   FIZZ                                  │
└─────────────────────────────────────────────────────────┘
```

**Copy only** — copying the input, for a student who wants to drive the terminal
by hand.

No Run here. It would duplicate §4.4's buttons in a second place, and the two
would need explaining to each other; the toolbar version is the one to keep,
because its output appears next to it. Copy earns its place instead: it is the
one thing the example can do that the toolbar cannot.

The icon lives inside the input value, the only value it copies. It confirms in
place — `⧉` → `✓`, reverting after ~2s, with the state exposed through its
accessible name. A toast for a clipboard write is more interruption than the
action deserves.

## 5. Scoring

### 5.1 Every problem is out of 100

A problem is worth 100 points regardless of how many test cases it has. Case
count is an authoring detail — a student should not score differently on the
same work because an author split one case into two.

```
score = round(passedCount / totalCount * 100)
```

That is the whole model. No per-case points column, and no per-exercise total:
both would encode the same constant in two more places.

Rounding is `round`, not `floor`, so 2 of 3 reads 67 rather than 66. The two
ends are exact by construction — all cases passed is exactly 100, none passed is
exactly 0 — which is what matters, because those are the values a student
notices.

An uneven split is not a problem to solve. Three cases are worth 33, 67, 100 as
they pass; nobody needs the thirds to be equal, only the total to be right.

```prisma
model Submission {
  // ...
  /// 0–100. Derived from cases passed, not stored per case.
  score Int
}

model StudentExerciseProgress {
  // ...
  bestScore Int @default(0) @map("best_score")
}
```

> **Revised from the first draft.** That version gave each case a `points`
> column defaulting to 10, making a five-case problem worth 50 and a four-case
> problem worth 40 — the same work scored differently for a reason invisible to
> the student. It also carried a `maxScore` snapshot per submission, which is
> dead weight once the maximum is a constant.

Computed in the judge beside `summarizeRun`, and pure:

```ts
scoreRun({ passedCount, totalCount }) -> number   // 0–100
```

`SKIPPED` cases count toward `totalCount`. Failing case 1 of 5 scores 0, not 0
of 1 — grading stopped early, but the problem still had five cases.

### 5.2 What the student sees

`33 / 100` on the result line. The statement needs no "worth 100 points" label:
if every problem is out of 100, saying so on each one is noise.

### 5.3 Best score, not last score

`bestScore` keeps the maximum ever earned. A later worse attempt never reduces
it, for the same reason `SOLVED` is permanent — a student experimenting after
succeeding must not be punished for it.

## 6. Ranking — not built, but designed for

Ranking is out of scope. Three decisions are taken now because they are
expensive to retrofit:

**1. Score is stored, not derived.** `bestScore` on progress is a summable
column. A leaderboard is `SUM(best_score) GROUP BY user_id`, not a walk over
every submission — the mistake v1's teacher dashboard makes.

**2. Every problem is out of 100.** Totals are comparable across problems
without weighting, and a course maximum is `100 × problemCount` — no join, no
snapshot column.

**3. The tie-break needs no new columns.** Equal totals rank by earliest
`firstSolvedAt` — solving sooner ranks higher. Already recorded.

When ranking is built it adds a rollup table refreshed by a repeatable job,
never a live aggregate:

```prisma
model StudentCourseScore {
  userId, courseId, totalScore, solvedCount, lastSolvedAt
  @@unique([userId, courseId])
  @@index([courseId, totalScore(sort: Desc)])
}
```

That index answers both "top N" and "my place" (`COUNT(*) WHERE totalScore >
mine`) without scanning.

**Deliberately deferred:** whether ranking is scoped to a class, a course, or an
academy. That depends on the enrollment model, which does not exist yet, and
guessing it now would bake in the wrong scope.

## 7. Contract changes

```ts
SubmissionResult     += { score: number }        // 0–100
LearnExerciseSummary += { bestScore: number }    // outline rows
```

Additive. No existing field changes meaning.

## 8. Component changes

```text
_components/
  workspace-header.tsx     Submit, Reset, Hint, labelled Previous/Next
  result-panel.tsx         new — replaces submit-panel.tsx
  judge-tape.tsx           new — the signature element, own unit
  editor-pane.tsx          new — tabs, font size, wraps editor + terminal
  example-card.tsx         new — extracted from problem-statement, input Copy
  run-controls.tsx         `Ex n` relabelled `Test n`, given visual weight
_hooks/
  use-editor-preferences.ts  new — font size, persisted
_lib/
  scoring.ts               new — pure display helpers + spec
```

`workspace.tsx` is at its ~250-line ceiling. `editor-pane.tsx` takes the tab and
split-pane wiring so this work does not push it over.

## 9. Accessibility and quality floor

- Tabs use `role="tablist"`, arrow-key navigable.
- The tape is a `<ol>`; each cell names its outcome for a screen reader, so it
  is not colour alone.
- Reset confirms; Copy announces via `aria-live`.
- Font size control is keyboard reachable and reflects the current value.
- Prev/Next keep `aria-label` when collapsed to icons.
- Reduced motion: cells appear without transition when requested.

## 10. Testing

**Unit** — `scoreRun`: all passed is exactly 100, none passed is exactly 0,
2 of 3 rounds to 67, and skipped cases count toward the denominator;
`bestScore` never decreasing; tape cell derivation for partial and complete
runs; font-size clamping.

**E2E** — score shown and correct after a partial pass; Reset restores starter
code after confirming; Copy writes the example input to the clipboard; `Test 1`
runs that case and reports the comparison in the terminal; Submit switches to
Result; no dead gap (result pane occupies the region with no empty terminal
above it); a hidden failing case still shows no diff.

The §12.3 invariant test extends to the new fields: `points` on a hidden case is
public, its input and expectation are not.

## 11. Phases

**A — Layout.** Tabs, header controls, labelled navigation, font size, Reset.
No schema change; fixes every reported layout complaint on its own.

**B — Scoring.** `score` and `bestScore`, migration, judge computation, result
and outline display. Two columns and one pure function.

**C — Examples.** `example-card.tsx` with Copy.

A is worth shipping alone: the gap, the buried Submit, and the unlabelled arrows
are all fixed without touching the database.

## 12. Open questions

1. Should an author ever be able to weight one case above another? Proposal:
   no. It reintroduces the problem §5.1 removes, and no one has asked for it.
   If it arrives, it becomes a per-case weight normalised to 100 — not a points
   column.
2. Does Reset also clear the saved draft, or only the editor? Proposal: editor
   only. Reset undoes an edit; it should not destroy the server copy.
3. Should a partial score appear in the outline beside a solved problem, or
   only the solved state? Proposal: show the score once grading exists for it —
   a student stuck at 60 should be able to find that problem again.
