# Multi-line paste in the workspace terminal

Date: 2026-11-09. Status: implemented and tested, not committed. Branch:
`fix/terminal-multiline-paste` (from `feat/cove-studio-v2`).

## Problem

A student or teacher copies an example's input and pastes it into the terminal
during **Run**, as they do on Elice. On Elice the lines arrive as lines and the
program prints the right answer. On Cove they arrive as one line and the
program fails or prints something wrong.

Observed 2026-11-09 on "[도전 기출문제] 미로 탐색" (staff practice), example 1:

| | What the terminal received | Result |
| --- | --- | --- |
| Elice ("[56] 색종이 만들기") | 9 lines, the last one waiting for Enter | correct output |
| Cove | `4 6 101111 101010 101011 111011` in one line | `N, M = map(int, input().split())` gets six values |

## Cause

The terminal's input is a single-line `<input>`
([terminal-panel.tsx](../../../packages/web/src/components/workspace/terminal-panel.tsx)).
A browser cannot put a line break into a single-line field, so a pasted block
becomes one line with its breaks replaced. Enter then sends that one line to
the program's first `input()`.

The runner ([use-python-runner.ts](../../../packages/web/src/lib/workspace/use-python-runner.ts))
is line-based. The worker asks for one line each time Python reads stdin, and
the field is shown only while it asks. A plain Run has no queue of lines
waiting to be read (`queueRef` is `null`), so there is nowhere to keep the
lines after the first. Test run already has that queue: it feeds a sample's
input one line per read through `createSampleInputQueue` and
`answerStdinRequest` (`sample-run.ts`).

Not a grading problem: Submit and Test run never use the terminal field.

## Target behaviour (Elice's)

| Action | Result |
| --- | --- |
| Paste text with line breaks | Every complete line is sent as if typed and followed by Enter; the text after the last break stays in the field |
| Paste text ending with a line break (an example's Copy button) | The same: the last line still waits in the field, and the program runs when the person presses Enter |
| Paste text without a line break | Unchanged: inserted at the caret, as today |
| Program reads more lines than were pasted | It gets the pasted lines in order without waiting, then the field appears for the next one |
| End input (Ctrl+D or the button) after a paste | The program reads the pasted lines, then end of input, so `sys.stdin.read()` and `for line in sys.stdin` finish |
| Typing, Test run, Submit | Unchanged |

Pasted lines are echoed into the terminal as soon as they are pasted, as a
terminal echoes what is typed, so the screen matches Elice's.

## Design

### 1. Splitting a paste (pure helper)

`splitPastedInput({ value, selectionStart, selectionEnd, pasted })` in
`lib/workspace/terminal-keys.ts` returns `{ lines: string[]; remainder: string }`:

- The field's text with `pasted` replacing the selection, CR LF and lone CR
  normalised to LF.
- One trailing LF is dropped first: an example's Copy button ends with one,
  and on Elice the program runs on Enter, not on paste (owner feedback,
  2026-11-09).
- Split on LF: every segment but the last is a line to send; the last is
  `remainder`, the new field value.
- No LF in `pasted`: returns `null`, and the browser's ordinary paste runs.

### 2. The terminal field

`TerminalPanel` adds `onPaste` to the interactive field. When
`splitPastedInput` returns lines, it calls `preventDefault()`, sends each line
through `onSubmitInput` in order, and sets the field to `remainder`. The field
keeps that value while the program is busy and shows it again when the
program next waits for input. The mirror mode is unchanged.

A paste larger than **256 KiB** is refused with a note under the field saying
it is too large to paste, and the field is left as it was. The note is the
panel's own, not a transcript line, so it never reaches a teacher's mirror; it
clears on the next paste or Enter. The terminal's transcript
holds 512 KiB and filling it ends the run (`appendToTranscript`, which guards
against runaway output), so a large paste would otherwise stop the program it
was meant for. Test run and Submit take inputs of any size.

The message is one new key, `workspace.paste_too_large`, in `learn.json` (en,
ko), the namespace the terminal already uses: "Too large to paste here. Use
Test run for big inputs." / "붙여넣기에는 너무 깁니다. 큰 입력은 테스트
실행을 사용하세요." It costs about 120 bytes of the Korean file's 224 bytes of
headroom under the 15 KiB namespace budget in `locales.spec.ts`, which must
still pass.

### 3. Lines typed ahead (runner)

`usePythonRunner` gains `typeAheadRef: string[]`, the lines a person sent
while the program was not waiting:

- `submitInput(value)` echoes the line as today. If the program is waiting, it
  answers immediately as today; otherwise the line is appended to
  `typeAheadRef`.
- On the worker's `stdin` request in a plain Run, the next line of
  `typeAheadRef` is provided without showing the field. When it is empty, a
  pending end of input is sent; otherwise the field is shown, as today.
- Test run is unchanged: a sample's own queue still answers its reads, and its
  end is still end of input.
- `run()` and `stop()` clear `typeAheadRef`, as they clear `eofPendingRef`.

The choice is one pure function, so it can be tested without a worker:
`nextStdinAction({ sampleQueue, typeAhead, eofPending })` in `sample-run.ts`
returns `line`, `eof` or `prompt`. It replaces `answerStdinRequest` at its one
call site, with the same answers whenever `typeAhead` is empty.

### 4. Live monitoring

A teacher's mirror receives the echoed lines through the existing `append`
events and sees no waiting prompt while pasted lines remain, which is what
happened on the student's screen. No event or schema changes.

## Where it applies

Every interactive terminal uses `TerminalPanel` with `usePythonRunner`: the
student workspace, staff practice, a teacher's own runner in the live view,
and the submission history workspace. One change covers all four.

Out of scope: the public Turtle trial, whose input is a separate form tied to
a server session; and browsers without cross-origin isolation, where the
terminal already reports that interactive input is unsupported.

## Tests

- `terminal-keys.spec.ts`: `splitPastedInput` with LF, CR LF, a trailing break
  (the last line still waits), a single copied line, no break, a paste into the
  middle of typed text, and a replaced selection.
- `sample-run.spec.ts`: `nextStdinAction` serves type-ahead in order, prompts
  when it runs out, sends end of input only after the type-ahead, and leaves
  every existing sample-queue case unchanged.
- New `terminal-panel.spec.tsx`: a pasted example submits every complete line
  and leaves the last in the field, which survives the field hiding while the
  program is busy; a paste without a break behaves normally; an oversized paste
  is refused with the note; mirror mode has no field.
- New `use-python-runner.spec.tsx`, with a fake worker: pasted lines answer
  successive `input()` calls without prompting and are echoed once; End input
  after a paste arrives after the pasted lines; unread lines are dropped by
  the next run; a Test run is still answered from its sample alone.
- The existing workspace, staff and history specs that render the terminal
  still pass.
- By hand, in a dev browser: with the official solution in the editor, click
  an example's Copy, paste during Run, see every line but the last echoed and
  the last in the field, press Enter, and see the answer.

## Delivery

Implement and test on `fix/terminal-multiline-paste`. Commit, merge into
`feat/cove-studio-v2` and release only when the owner asks. No database,
API or deployment change.
