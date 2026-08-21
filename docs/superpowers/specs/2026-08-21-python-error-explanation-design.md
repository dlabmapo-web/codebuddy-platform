# Python Error Explanation

**Status:** Implemented 2026-08-21 · revised twice the same day, see §6.5 and §6.6
**Date:** 2026-08-21
**Scope:** The student exercise workspace, `/studio/academies/[academyId]/learn/exercises/[materialId]`

## 1. Purpose

Explain a failed run to the student who caused it, in the terminal.

A student whose program raises `SyntaxError: invalid syntax` sees a traceback.
The traceback is true and, to a beginner, useless: it names the exception class
Python uses internally and points at a line with a caret. v1 answered this with
a second tab beside the terminal that said, in one sentence and in ordinary
language, what that class of error means and where to look.

What ships is the error coach from `feat/AI-assistant`, ported into v2: a panel
that names the actual mistake — "this line needs a colon at the end", not
"SyntaxError" — shows the student's own code with a caret under the accused
character, says why Python needs that syntax, shows a correct example, and ends
with one thing to try. It opens itself on a failed run.

The terminal keeps Python's own one-line error, which is the part worth
searching for, and drops the traceback frames.

Everything else in this document is about where the pieces belong once they are
inside v2's package layout and its i18n contract, because a straight file copy
would land Korean-only copy in a bilingual product and a lookup table in the
layer that should not own copy.

## 2. Reference behaviour

From `main`, `src/app/(fullscreen)/problems/[problemId]/ProblemSolveClient.tsx`
and `src/lib/pyodide/pythonError.ts`:

- The worker catches any `BaseException` from the student's code and posts a
  structured `{ type, message, line, display }` rather than a crash.
- The terminal header grows a second tab, **오류해석**, present only while an
  error is the latest thing that happened and no run is in flight.
- Until it is opened the tab bounces and carries a blue glow. Opening it sets
  `errorExplainSeen`, and both stop.
- The panel shows a heading — "{ErrorType}를 쉽게 설명하면" — one sentence
  drawn from a fifteen-entry table keyed by exception name, and a line
  reference: "에디터 N번째 줄을 확인해 보세요."
- Any new run clears the error, returns to the terminal tab, and re-arms the
  animation.
- The raw traceback still prints in the terminal. The explanation is additive.

## 3. What has already crossed over

Three of the four layers are in the v2 tree today and need no work:

| Layer | v2 location | State |
| --- | --- | --- |
| Capture | `packages/web/public/pyodide-worker.js` | Identical to v1 but for a `_cove_` → `_paircode_` prefix rename. Still seeds `linecache`, still filters frames to `solution.py`, still separates student errors from runner `fatal`s. |
| Transport | `packages/web/src/lib/pyodide/interactiveRunner.ts` | `RunnerEvent` already carries `{ type: 'pythonError'; error: PythonExecutionError }`. |
| State | `packages/web/src/lib/workspace/use-python-runner.ts` | Sets `errorRef`/`lastError` on `pythonError`, clears `lastError` at the top of `run()`, and returns it on `PythonRunnerState`. |

Nothing consumes `lastError`. A grep for it across `src/components`,
`src/app/(v2-studio)`, and `src/hooks` returns nothing: the structured error is
captured, carried, stored, and dropped.

The fourth layer — explain and present — exists only in
`packages/web/src/lib/pyodide/pythonError.ts`, byte-identical to v1's, read
solely by the legacy `(fullscreen)` route. Its `FRIENDLY_EXPLANATIONS` map is
Korean string literals inside a `src/lib` module. That is the piece that cannot
be moved as it stands, and §7 is mostly about why.

## 4. Goals

1. A student who runs failing code can read, in their own language, what the
   error class means and which line to look at.
2. The explanation is available in English and Korean, from the same catalogs
   as every other string in the product.
3. Which Python exceptions have an explanation is a typed, tested fact, so an
   exception added to the list without copy in both locales fails `typecheck`
   rather than rendering a raw key to a child.
4. The student reads it without doing anything: it is in the terminal they are
   already looking at, not behind a control they have to find.
5. No new bytes in the root RSC payload (§8).

## 5. Non-goals

**A structured error on the monitoring wire.**
`packages/shared/src/monitoring/terminal.ts` transports `TerminalLine[]` — text
and kind — and nothing else. Nothing here changes that. §6.5 made the point
moot for the teacher's benefit: because the explanation is composed into
ordinary terminal lines, the mirror carries it already.

**AI escalation.** `feat/AI-assistant` unlocks an "ask the AI teacher" button
after three unsuccessful attempts at the same error category, with a server
endpoint, a cache keyed by code hash, and a quota. None of that is ported here.
The local lessons are instant, offline, identical every time, and free; the
escalation is a separate project with a migration and a cost model, and the
reference design this port was asked for does not show it.

`syntaxCoach.ts`'s attempt tracking on that branch exists only to gate the AI
button, so it is not ported either.

**The legacy `(fullscreen)` workspace.** It keeps its own copy of
`pythonError.ts` until the v1 cutover removes the route group. §7.1 says what
happens to that file then.

**Rewriting the student's code for them.** The lessons say what is missing and
show a correct example of the same shape, on an unrelated subject. Neither the
example nor the next step is derived from the exercise's answer, and nothing
here executes or repairs a guess at what the student meant.

## 6. Deliberate deviations from v1

Listed individually so each can be vetoed on its own.

**6.1 The line reference is printed once.** v1 printed it twice:
`explainPythonError` prefixes `"N번째 줄을 먼저 살펴보세요. "` to the sentence,
and the panel then adds `"에디터 N번째 줄을 확인해 보세요."` underneath. The
duplication reads as a bug. Here the sentence is the sentence, and the line is
its own row, once.

**6.2 There is no attention cue, because the tab selects itself.** v1 bounced
its tab with a blue glow to get the student to open it. A control that opens on
its own has nothing left to advertise — see §6.6.

**6.3 The Korean register matches v2.** v1's copy is 해요체 throughout
("읽지 못했어요"). v2's `learn` namespace narrates in 합니다체
("코드를 실행하면 결과가 여기에 표시됩니다") and keeps 해요체 for direct
instruction ("하나씩 열어 보세요"). The rewritten copy follows that split:
the description of what went wrong is 합니다체, the suggestion of what to try
stays 해요체. Same warmth, same reading level, consistent with the surrounding
product voice.

**6.4 Runtime errors are grouped into families.** The fifteen runtime classes
fall into four families — `shape`, `missing`, `value`, `limit` — and the family
is the panel's title when no syntax lesson applies. A student who meets
`KeyError` after `IndexError` has met the same problem twice, and reading "Value
doesn't fit" both times is what teaches that. Syntax errors do not use families:
their lesson titles are more specific than any family could be.

**6.5 The traceback does not survive.** Still true after §6.6: the terminal
keeps Python's own one-line error and drops the frames.

What is kept is the line a student can paste into a search box and a teacher
can read at a glance; what is dropped is the part that is noise to both. The
terminal also quotes the failing line and points at the coach — and stops there,
because saying the same thing twice in one pane trains a reader to skip both.

That much reaches the teacher for free: the mirrored terminal transports the
same lines, with no change to the monitoring wire.

**6.6 The teaching is a panel, and it opens itself.** The design between §6.5
and here put the whole explanation in the terminal and had no panel at all.
That was too small a container for the content this feature turned out to want:
a code excerpt with a caret, a two-column layout, and an example block do not
fit in a line-oriented log.

The objection §6.5 raised against v1's tab was never the tab — it was that a
student had to *notice* it and decide it was for them. So the panel is back and
that objection is answered directly: a failed run selects the coach tab. The
student is looking at the explanation without having done anything, and the
terminal is one click away for whoever wants Python's own words.

This is the third arrangement of the same content, and the reason it is worth
recording: the first hid the teaching behind a control, the second had nowhere
to put a caret, and this one has both a place to teach and no step between the
error and the teaching.

## 7. Module architecture

### 7.1 `packages/shared/src/content/python-error.ts` — which errors are known

```ts
export const pythonErrorKinds = [
  "SyntaxError", "IndentationError", "TabError", "NameError", "TypeError",
  "ValueError", "IndexError", "KeyError", "ZeroDivisionError",
  "AttributeError", "ModuleNotFoundError", "ImportError", "EOFError",
  "RecursionError", "unknown",
] as const;

export type PythonErrorKind = (typeof pythonErrorKinds)[number];

/** Maps a worker-reported exception class to a kind that has copy. */
export function classifyPythonError(type: string): PythonErrorKind;
```

It carries two more pure functions, both added for §6.4:

```ts
export const pythonErrorFamilies = ["shape", "missing", "value", "limit", "unknown"] as const;
export function pythonErrorFamily(kind: PythonErrorKind): PythonErrorFamily;
/** The student's own line, for the terminal to quote. */
export function pythonErrorSourceLine(code: string, line: number | null): string | null;
```

`pythonErrorSourceLine` drops trailing whitespace and keeps leading whitespace:
indentation is the subject of half the `shape` family, and stripping it would
hide the very thing an `IndentationError` is about. It returns `null` for a
blank line, a line past the end of the file, and a non-integer, so the composer
has one condition to check rather than four.

`classifyPythonError` is total: anything outside the list — `OverflowError`,
`AssertionError`, a user-defined exception — returns `"unknown"`, which has its
own sentence. This is the whole of the feature's logic, it is pure, and it is
therefore in `shared` with a `.spec.ts` beside it, next to `learn.ts` and
`submission.ts`.

`"unknown"` is a member of the union rather than a fallback in the component so
that the exhaustiveness check in §7.2 covers the fallback sentence too.

The type `PythonExecutionError` stays in
`packages/web/src/lib/pyodide/pythonError.ts`: it describes the worker's
postMessage payload, which is web-only. `explainPythonError` and
`FRIENDLY_EXPLANATIONS` stay there untouched while the legacy route still reads
them, and are deleted with the `(fullscreen)` group. Nothing new imports them.

### 7.2 `packages/i18n/src/locales/{en,ko}/python-errors.json` — the copy

A new namespace, flat, one entry per kind plus the composer's own chrome:

```json
{
  "family": { "shape": "Shape of the code", "…": "…" },
  "explanation": { "SyntaxError": "…", "…": "…", "unknown": "…" },
  "source_caption": "In your code",
  "line_label": "Line {{line}}"
}
```

There is no `heading` key: the class name is printed by Python itself, and
nobody translates it.

The exhaustiveness guard follows the precedent already set by
`packages/i18n/src/error-messages.spec.ts`, which pins `errors.json` against
`AppErrorCode`:

```ts
const exhaustiveEnglish: Record<PythonErrorKind, string> = enPythonErrors.explanation;
const exhaustiveKorean: Record<PythonErrorKind, string> = koPythonErrors.explanation;
const englishFamilies: Record<PythonErrorFamily, string> = enPythonErrors.family;
const koreanFamilies: Record<PythonErrorFamily, string> = koPythonErrors.family;
```

A kind added to `pythonErrorKinds` without both sentences fails `pnpm typecheck`
before any test runs. This is the mechanism behind goal 3, and the reason the
union lives in `shared` rather than in the JSON. Verified by adding
`OverflowError` to the union and confirming `pnpm --filter @cove/i18n typecheck`
fails with TS2741 on both locales, then reverting.

### 7.3 `packages/web/src/i18n/` — a page namespace, not a layout one

`python-errors` is mounted by the exercise route, not added to
`layoutNamespaces`. This is forced, not preferred. Measured today:

| | layout total | budget | headroom |
| --- | --- | --- | --- |
| `en` | 51,138 B | 57,344 B | 6,206 B |
| `ko` | 57,056 B | 57,344 B | **288 B** |

Sixteen Korean sentences are roughly 5–6 KB of UTF-8. Folding them into
`learn.json` — 12,269 B of a 15,360 B per-namespace cap — would break both
budgets at once, and `locales.spec.ts` says what to do about it in a comment:

> The next feature to push this should move a namespace to a page provider
> rather than raise it again.

So:

- `namespaces.ts` gains `export const exerciseNamespaces = ["monitoring", "python-errors", "errors"] as const;`
  with a comment in the register of the existing ones, and the new member is
  added to the `PageNamespace` union.
- The exercise page swaps `monitoringNamespaces` for `exerciseNamespaces` in
  its single `initTranslations` / `PageTranslationsProvider` pair.
  `monitoringNamespaces` has exactly one consumer today — this page — but keeps
  its name and definition, because the two lists mean different things and the
  next monitoring surface should get the monitoring one.
- `i18n/types/i18next.d.ts` gains the `python-errors` import and resources
  entry, which is what makes `t('python-errors:explanation.NameError')`
  key-checked.

The composer reads it with `useTranslation('python-errors')`, not
`useLayoutTranslation` — the namespace is page-provided.

### 7.4 `python-error.ts` — the syntax lesson registry

Syntax errors are the one family where the exception class tells you nothing:
every one of them is `SyntaxError`. The *message* is what is specific, and it is
stable — `expected ':'` is a missing colon and nothing else. So a second
classifier sits beside the runtime one:

```ts
export const syntaxLessonCategories = [
  "missing-colon", "expected-indented-block", "unexpected-indent",
  "tabs-and-spaces", "unclosed-delimiter", "unterminated-string",
  "assignment-in-condition", "missing-separator", "generic-syntax",
] as const;

export function classifySyntaxError(
  type: string,
  message: string,
): SyntaxLessonCategory | null;
```

Ordered rules, first match wins, each a `{ types, message: RegExp }` pair
against Python's own text. Nothing re-parses or re-runs the student's code.

`null` means "not a syntax error" and sends the caller to the runtime path.
A syntax error that matches no rule is **not** null — it gets `generic-syntax`,
because a student staring at `invalid syntax` needs "check your colons, brackets
and quotes", not "something went wrong while your code was running".

### 7.5 `python-error-focus.ts` — the code excerpt and the caret

```ts
export function buildErrorFocus(
  code: string,
  line: number | null | undefined,
  offset: number | null | undefined,
): ErrorFocus | null;
```

Ported verbatim in behaviour from `errorFocus.ts` on `feat/AI-assistant`, whose
two hard-won details are the reason it is worth having rather than slicing an
array:

- It returns the failing line **and its non-blank neighbours**. An indentation
  mistake cannot be judged from one line; it is only visible next to the lines
  it is misaligned against.
- It expands tabs to 4-column stops and recomputes the caret in that expanded
  space. Python's `offset` counts a tab as one character while the screen shows
  four, so `^` would drift under the wrong character on any indented line
  without this.

The caret is clamped when `offset` points one past the end of the line, which is
exactly what a missing colon looks like.

### 7.6 The column, end to end

`SyntaxError` carries `offset`; nothing was reading it. Three changes:

- `pyodide-worker.js` adds `getattr(exc, 'offset', None)` to the JSON it posts.
- `PythonExecutionError` gains `offset: number | null`.
- The worker URL is cache-busted `?v=5` → `?v=6`, because it is served
  `immutable` and a returning student would otherwise keep the old one.

### 7.7 `_components/error-coach-panel.tsx`

The panel, ported from `SyntaxErrorCoach`. Its two-colour rule is the reason it
reads at a glance and is preserved exactly: **amber** means "the problem is
here" — the location chip, the gutter of the failing line, the caret, the
next-step arrow — and **green** means "this is what right looks like", on the
example block alone. Everything else is greyscale, so a student's eye goes to
those two places and nowhere else. It sits directly on the editor background
rather than in a card, so it reads as part of the editor rather than a dialog
over it.

| Region | Content |
| --- | --- |
| Header | `1:8` chip, then the lesson title |
| Left | "My code" excerpt with caret, the where line, the correct example |
| Right | "Why did this happen?" — what happened, then why Python needs it |
| Footer | one thing to try |

The gutter is `sticky left-0` and opaque, so a long line scrolls horizontally
underneath the line numbers instead of through them.

The location chip is a button: pressing it calls `onFocusLine`, which reveals
and places the editor caret at exactly the reported line and column.

Runtime errors reuse the same shell with the thinner content the runtime path
knows: the family as the title, the sentence as the "why", the failing line
highlighted, and no example or next step — because for those we know the kind
of mistake but not the fix, and inventing one would be worse than omitting it.

The file is on the `darkSurfaces` allowlist in `check-theme.mjs`, whose comment
says the list is "file by file so adding one is a decision" — the same decision
already granted to `result-hero.tsx`.

### 7.8 `editor-pane.tsx` — a third tab that opens itself

`OutputTab` gains `'coach'`, present only while `runner.lastError` is set and no
run is in flight. Two effects carry the behaviour §6.6 is about:

```ts
// A new error selects the coach. Nothing to notice, nothing to click.
React.useEffect(() => {
  const previous = coachedRef.current;
  coachedRef.current = coached;
  if (coached && coached !== previous) onTabChange('coach');
}, [coached, onTabChange]);
```

The second returns the selection to the terminal when the tab disappears, and
moves focus with it if the vanishing tab held it — otherwise focus is stranded
on a detached node and the next Tab press restarts from the top of the document.

`lastError` is back on `usePythonRunner` for this, and `clear()` resets it so
navigating to another exercise cannot leave the coach explaining code that is
gone.

### 7.9 `lib/workspace/error-line-decoration.ts` — the mark in the editor

The coach explains the mistake in the pane below; this is what connects that
explanation to the code above it. Without it a student reads "line 1" and then
counts rows.

```ts
export function markErrorLine(
  editor: MonacoCodeEditor,
  line: number | null,
  hover?: string,
): () => void;
```

A whole-line decoration plus a glyph-margin dot, in Monaco's own coordinate
space, so the mark follows the line as the student types above it rather than
being an overlay re-derived on every keystroke. It follows the shape
`remote-cursor.ts` already established in this codebase: `deltaDecorations`
with a plain range object — no second copy of Monaco's type surface — and CSS
classes in `globals.css` beside the peer-cursor ones.

Three details:

- It returns its own removal, so the mark cannot outlive the error. `run()`
  clears `lastError`, the effect's cleanup runs, and the red line goes with it.
- The line is clamped to the model's line count. Python reports against the
  source that ran, and the student may already have deleted lines off the end
  of it; a decoration past the last line silently paints nothing.
- `glyphMargin: true` is set on the editor permanently rather than toggled.
  Monaco reserves the gutter when the option is on, and turning it on with the
  decoration would shift the code sideways at the moment the student is reading
  it.

`.cove-error-line` and `.cove-error-glyph` draw from `--danger`. Red, and the
only red annotation in the editor: the peer-cursor colours next to them mean
"somebody else is here", which is not a problem.

The hover on the dot is `pythonErrorHeadline`, the same string the coach uses
as its heading, so the two cannot say different things about one error.

### 7.10 `_lib/python-error-lines.ts` — what the terminal still says

Python's own one-line error in `err`, the failing line quoted in `info`, and one
line pointing at the coach. That is all: §6.6's reason for not repeating the
lesson here.
## 8. Copy

Three bodies of copy per locale, all in `python-errors.json`:

- **Nine syntax lessons**, six fields each — title, what, why, where, example,
  next. The Korean is `feat/AI-assistant`'s, which was teacher-reviewed, with
  its register adjusted per §6.3. The English is written fresh at the same
  reading level.
- **Fifteen runtime sentences plus the unknown fallback**, and five family
  labels, for the compact panel.
- **The coach's own chrome** — "My code", "Why did this happen?", "You can write
  it like this", the location chip, and the three `where` shapes that compose a
  detail with a line and an optional column.

The examples are localized rather than shared, because they contain strings a
student reads: `print("더워요")` and `print("It's hot")` teach the same syntax.
Each is checked to be under 120 characters and more than one token.

Constraints on every sentence: no exception class names in a lesson body — the
title and the terminal both carry it — no English jargon in the Korean, and no
`TODO`/`TBD` markers, which `check-i18n.mjs` fails on.

`learn.json` gains exactly one key per locale, `workspace.tab_coach`
("Error interpretation" / "오류 해석"), because it sits in the tab strip beside
`tab_terminal` and `tab_result`. Every sentence stays page-scoped: at 8.6 KB the
Korean catalog is over half the per-namespace budget on its own, and would not
have fit in the layout payload at all.

## 9. Presentation and accessibility

- The coach is the existing `role="tabpanel"` region, labelled by its tab, with
  the roving tabindex and arrow-key movement the other two already get. A
  failed run moves the selection there; it does not move focus, so a student
  typing in the editor is not interrupted mid-keystroke.
- When the tab is removed while it held focus, focus moves to the terminal tab.
  Otherwise it is stranded on a detached node and the next Tab restarts from the
  top of the document.
- Colour is never the only channel. Amber marks the failing line, but that line
  also carries the only caret and its number is repeated in the chip and in the
  where sentence. The example is labelled "You can write it like this", not
  merely tinted green.
- The caret row and the gutter are `aria-hidden`: a screen reader gets the
  location from the chip and the where sentence as prose, which is more use
  than a run of spaces and a circumflex.
- The editor mark is decoration over code that is already reachable: the line
  number, the chip, and the where sentence all name the position in text, so
  nothing depends on seeing the red.
- The code excerpt scrolls inside its own box, so a long line cannot widen the
  pane. The gutter is sticky and opaque so the numbers stay readable while it
  does.
- Prose is the sans stack; only code — the excerpt, the example, the chip — is
  set in the code face.
- No animation.

## 10. Failure and empty states

- **No error.** No tab, no panel, nothing to design.
- **A run in flight.** The tab is hidden for the duration: explaining the
  previous failure while new output streams in would describe the wrong program.
- **A syntax error no rule matches.** `generic-syntax`, which is still a syntax
  lesson — colons, brackets, quotes, indentation — rather than the runtime
  fallback.
- **A runtime error.** The compact panel: family, sentence, failing line. No
  example and no next step, because for these we know the kind of mistake but
  not the fix, and inventing one would be worse than omitting it.
- **An unrecognised runtime class.** `"unknown"`, under an `Unexpected` family.
  The terminal still names the real class.
- **No `offset`.** Every non-syntax error, and some syntax errors. The chip
  reads `Line N` instead of `N:C`, and no caret is drawn.
- **`error.line` is null**, or past the end of the file. `buildErrorFocus`
  returns `null`, the excerpt and the chip are both omitted, and the lesson
  stands on its own.
- **An exception with an empty message.** The terminal prints the class name
  alone rather than `IndexError: `.
- **A runner `fatal`.** Not a student error — no coach, and the text is still
  appended raw to the terminal.
- **A truncated transcript.** The error is held in state, not parsed back out of
  the lines, so the coach survives the output budget cutting the run short.
## 11. Security and privacy

Nothing crosses a network boundary that did not before. The exception is
produced in the student's own worker, classified in their browser, and matched
against a static catalog.

The one-line error does reach the watching teacher through the mirrored
terminal — but that is the mirror's whole purpose, it already carried the full
traceback, and this is strictly less. The coach panel itself is not mirrored.

`error.type` and `error.message` are written as text into the transcript, and
the student's own source is rendered into the excerpt. All of it originates in
their browser and is rendered as text nodes, so none of it can carry markup.

The examples are static strings in a catalog, never anything derived from the
exercise's hidden test cases or its expected output — there is no path from
either into this feature.

## 12. Verification

### 12.1 Pure and contract tests

`packages/shared/src/content/python-error.spec.ts` — 33 assertions. The runtime
classifier, the families, `pythonErrorSourceLine`, and the syntax registry:
every rule matches the message Python actually produces (including the
`(solution.py, line 1)` suffix `str()` appends), an unmatched syntax error still
gets `generic-syntax`, and a non-syntax class is `null`.

`packages/shared/src/content/python-error-focus.spec.ts` — 10 cases:
neighbours included and blank ones skipped; the caret under the accused
character; **the caret recomputed after tab expansion**, which is the whole
reason the module exists; tabs expanded to the next stop rather than by a fixed
four; a caret clamped when it points past the end of the line; and `null` for
every shape of missing input.

`packages/i18n/src/python-errors.spec.ts` — 17 assertions. The
`Record<…, string>` exhaustiveness guards now cover kinds, families, **and all
nine lesson categories with all six fields** — proven to fail by temporarily
adding a kind and watching TS2741 land on both locales. Plus: every lesson has a
non-empty example under 120 characters, the coach's `{{line}}`, `{{column}}`,
and `{{detail}}` placeholders survive translation, and `python-errors` stays out
of `layoutNamespaces`.

### 12.2 The composer

`_lib/python-error-lines.spec.ts` — 10 cases, no DOM needed: composition is a
pure function taking `t`, so the tests pass an echoing `t` to assert structure
and key names, then a second `t` reading the real catalogs so a renamed key
fails here. It pins that `Traceback` never appears, that the lesson is **not**
repeated in the terminal, and that only the five wire-fixed kinds are emitted.

There is no component test for the coach panel or `EditorPane`. This repo's
`vitest.config.ts` runs without a DOM environment — "these are pure-function
suites" — and neither jsdom nor Testing Library is a dependency. All of the
panel's logic is in the two `shared` modules above, which are tested directly;
what is left is markup, and that is §12.3's.

### 12.3 End-to-end

Rewritten in `e2e/specs/interactive-python.spec.ts`:

1. No coach tab before anything has run.
2. `if True` / `print("hello" 2)` → the coach is visible and its tab is
   `aria-selected`, without a click.
3. It names the actual mistake (a colon), shows `1:8`, the student's own line,
   and a caret; it carries a correct example and a next step.
4. The terminal shows `SyntaxError` and no `Traceback (most recent call last)`.
5. `print("hi")` → the coach tab is gone and there are two tabs again.

**This spec has not been run.** The suite's `globalSetup` calls
`pnpm --filter @cove/api db:seed:e2e`, which fails against the development
database on a pre-existing fixture conflict — "Class fixture teacher
teacher@cove.test is not an active teacher of academy e1000000-…" — before any
test starts. Unrelated to this change, and it blocks the whole suite equally.

In its place the same behaviour was driven against the running dev server with a
throwaway Playwright script, in both locales. Twelve checks each, all passing:
the coach opens by itself with its tab selected; the title is the specific
mistake; the chip carries line and column; the excerpt shows the student's code
with a caret; the why, the example, and the next step are present; an
`IndentationError` gets the indentation lesson; a runtime `IndexError` still
gets the compact panel; and a clean run closes the coach and restores two tabs.

A second script covers the editor mark, since `markErrorLine` needs a live
Monaco: no mark before a run; the bar and the dot both drawn after a failed one;
the mark landing on the line Python named, read back by comparing its vertical
position against the rendered rows; and both cleared by a clean run.

The rendered panel and the marked editor were compared against the reference
screenshots in both locales.

### 12.4 Existing gates

`typecheck`, `test` (522 web, 78 i18n, 579 shared), `i18n:check`, and
`theme:lint` all pass. ESLint is clean on every file this change touches; the
one repository-wide error is pre-existing in `components/studio/data-table.tsx`
(`react-hooks/incompatible-library`, TanStack Table).

## 13. Implementation order

1. `shared`: the runtime classifier and families, then the syntax registry, then
   `python-error-focus.ts`. All pure, all with specs, nothing imports them yet.
2. `i18n`: both `python-errors.json` files and `python-errors.spec.ts`. The
   exhaustiveness assertions now pin step 1.
3. `web/i18n`: `exerciseNamespaces`, the `PageNamespace` union, `i18next.d.ts`,
   and the page's provider swap.
4. The column end to end: worker, type, cache-bust.
5. `web`: `_lib/python-error-lines.ts` and the `formatError` seam.
6. `web`: `error-coach-panel.tsx`, the `check-theme.mjs` allowlist entry, the
   third tab, and `onFocusLine`.
7. `web`: `error-line-decoration.ts`, the glyph margin, and the two CSS classes.
8. `e2e`.

Steps 1–2 carry all the logic and are independently reviewable. Step 6 is the
only one that changes what a student sees.

## 14. Acceptance criteria

1. A failing run opens a coach panel without the student doing anything.
2. For a syntax error it names the actual mistake, shows line and column, quotes
   the student's own code with a caret under the accused character, explains why
   Python needs that syntax, shows a correct example, and gives one next step —
   all in the reader's locale.
3. The editor marks the failing line with a red bar and a gutter dot, hovering
   to the same headline the coach shows, and clears both on the next run.
4. Pressing the location chip puts the editor caret at that line and column.
5. A runtime error gets the same panel with the family, the sentence, and the
   failing line, and no invented fix.
6. The terminal keeps Python's one-line error and no traceback frames, and does
   not repeat the lesson.
7. The coach disappears on the next run and on navigation, taking the tab
   selection and keyboard focus with it safely.
8. Both locales cover fifteen runtime kinds, five families, and nine lesson
   categories; omitting any of them fails `pnpm typecheck`.
9. The Korean layout payload grows by one tab label; every sentence is
   page-scoped.
10. `i18n:check`, `theme:lint`, `typecheck`, and `test` pass.
