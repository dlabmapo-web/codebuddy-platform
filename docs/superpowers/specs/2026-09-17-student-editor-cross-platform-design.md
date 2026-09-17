# Student editor and Python runtime across platforms and browsers

Date: 2026-09-17
Status: implemented on `fix/student-editor-cross-platform` except as noted in §10; manual matrix (§6) pending
Source baseline: `186c1da` on `feat/cove-studio-v2`, branch `fix/student-editor-cross-platform`
Scope: the student exercise editor, the in-browser Python runner, the server judge's stdin, and their behavior on Windows/macOS in Chrome, Edge, Safari, and Firefox

## 1. Report and evidence

A teacher reported from a live class (KakaoTalk, with screen recordings):

1. "위 count 쪽 n 지울때 … print("윷")으로 이동" — deleting a character in `count` on an earlier line moves the caret to the last line, `print("윷")`.
2. "print() 안에 "" 하고 커서가 사이에 있는데 밖으로 빠짐" — after typing `print(` the caret ends up outside the parentheses; after typing `"` the caret leaves the quotes, so the text lands outside them.

The recording shows a Windows laptop. The issue has not been seen on macOS.

Evidence gathered for this document:

- Source reading of the student workspace, the Yjs binding, the Pyodide worker, and the judge harness.
- `@monaco-editor/react` 4.7.0 as installed (`dist/index.mjs`).
- Monaco 0.55.1 as actually served to users (`@monaco-editor/loader` points at `cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs`), read from the CDN bundle.
- Node probes against Pyodide 0.27.5 (the same version as `packages/web/public/pyodide` and `packages/api`), with stdin wired exactly as the browser worker wires it and, separately, through the judge's own `HARNESS` string.
- `curl -I` of the jsDelivr assets.

Not done: a reproduction in real Windows Chrome, macOS Safari, or with a Korean IME. Findings are labelled **verified** (reproduced or read directly from the running code) or **suspected** (a known platform behavior that must be confirmed by the manual matrix in §6).

Student workspace paths below are relative to
`packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/`.

## 2. Summary

| ID | Problem | Platforms | Status | Priority |
|---|---|---|---|---|
| P1 | Caret jumps to end of document on every edit | Windows, all browsers | verified | P0 |
| P2 | `sys.stdin.read()` / `readlines()` / `for line in sys.stdin` hang in sample runs; no way to send EOF | all | verified | P0 |
| P3 | After a run that uses `open(0)`, every later `input()` fails with `OSError` until Stop or reload | all | verified | P0 |
| P4 | Judge gives `open(0)` an empty stdin, so browser-passing code fails on submit | server | verified | P1 |
| P5 | Without cross-origin isolation the Run button stays "Preparing…" forever, and the warning claims code still runs | old Safari, insecure origins, some in-app browsers | verified (code path) | P1 |
| P6 | Enter in the terminal input can submit mid-composition with a Korean IME | Chrome and Safari, differently | suspected | P1 |
| P7 | Chrome/Edge type through `EditContext`; Safari/Firefox through a textarea — Korean IME behavior may differ | Chromium vs others | verified (mechanism), suspected (symptom) | P2, gated by §6 |
| P8 | `'Fira Code', Consolas, monospace` is never loaded; macOS gets neither | macOS | verified | P2 |
| P9 | Monaco loads only from jsDelivr; if blocked, the editor never appears and never says why | networks blocking CDNs | verified | P2 |
| P10 | Draft beacon only on `visibilitychange`, which Safari (esp. iOS) does not reliably fire on tab close | Safari/iOS | suspected | P3 |
| P11 | Tailwind v4 needs Safari 16.4+/Chrome 111+/Firefox 128+; older devices render broken with no notice | old iPads, old browsers | verified (requirement) | P3 |

Out of scope, recorded only: `input("prompt")` writes the prompt to stdout in both the browser and the judge, so it never matches expected output (consistent, a teaching concern); Stop terminates the worker and reloads Pyodide (~13 MB), leaving "Preparing…" for a few seconds.

## 3. Findings

### P1. Windows CRLF model versus LF React state

Three facts combine:

1. Monaco chooses a model's EOL from its text; a text with no line break uses the platform default. In the 0.55.1 bundle: `const lOe = Hs || ze ? 1 : 2` (Linux or macOS → LF, otherwise CRLF). On Windows, an empty or single-line starter creates a CRLF model, and every Enter inserts `\r\n`.
2. `useDraftAutosave.applyLocalEdit` (`_hooks/use-draft-autosave.ts`) canonicalizes with `toSharedDocumentText`, turning `\r\n` into `\n` before `setCodeState`. Introduced in `d9719f2` (2026-09-14).
3. `CodeEditor` (`_components/code-editor.tsx`) is controlled by `value={code}`. After each render `@monaco-editor/react` runs:
   ```js
   value !== editor.getValue() &&
     editor.executeEdits('', [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }])
   ```

`getValue()` returns CRLF text and `value` is LF, so they never compare equal once the buffer has a line break. Every keystroke replaces the whole model, and `forceMoveMarkers` puts the caret at the end of the document. Auto-closing explains the second report: `(` inserts `()` with the caret inside, then the replacement moves it past `)`. The replacement does not change the model's EOL, so the state persists for the session.

`lib/monitoring/yjs-monaco.ts` pins LF, but only while a teacher's binding is attached, which is why the fault is intermittent.

Authoring editors (`starter-code-editor.tsx`, `solution-code-editor.tsx`) do not canonicalize their `onChange` value, so they do not loop; read-only previews take the `setValue` branch. Only the student editor is affected.

### P2. Sample stdin never reaches EOF

The judge runs code with `sys.stdin = io.StringIO(case_input)`, so reads end at EOF. The browser worker (`public/pyodide-worker.js`) uses `setStdin({ stdin: readStdin, autoEOF: true })` and blocks on `Atomics.wait` for each line. In `lib/workspace/use-python-runner.ts`, the `stdin` event takes the next queued sample line and, when the queue is empty, calls `setWaiting(true)` to prompt the student. `InteractiveRunner.sendEOF()` exists but nothing calls it.

Probe (browser wiring, input `3\n4\n`), once the queue ends with EOF:

| Program | Result |
|---|---|
| `input()` ×2 | `'3' '4'` |
| `sys.stdin.readline()` ×2, `input = sys.stdin.readline` | works |
| `sys.stdin.read().split()`, `readlines()`, `for l in sys.stdin`, `open(0).read()` | work **only if** EOF is delivered |

In the product EOF is never delivered, so a sample run using any read-to-EOF idiom waits for the student forever, while submitting the same code passes. A plain Run has the same problem, with no Ctrl+D.

### P3. `open(0)` closes fd 0 inside the long-lived worker

`open(0)` creates a file object with `closefd=True`; when it is collected, fd 0 is closed. The worker keeps one Pyodide instance across runs, so the next run's `input()` fails:

```
1. a,b=input().split()           -> 윷 모
2. open(0).read().split()        -> ['3', '4']
3. input()  (next run)           -> OSError
```

Verified repair, run after each execution:

```python
try:
    os.fstat(0)
except OSError:
    os.open('/dev/stdin', os.O_RDONLY)   # lowest free fd -> 0
```

Afterwards `input()`, `sys.stdin.readline()`, and a second `open(0)` run all work.

### P4. Judge `open(0)` reads the process's real stdin

`packages/api/src/judge/pyodide-thread.ts` swaps `sys.stdin` only. `open(0)` bypasses it and reads the judge thread's own fd 0:

| Program on the judge harness, input `3\n4\n` | stdout |
|---|---|
| `input()` ×2 / `sys.stdin.readline` / `sys.stdin.read()` | `7` |
| `open(0).read()` | **`0`** |
| extra `input()` | `EOFError` (correct) |

Verified replacement: write the case input to a MEMFS file, `dup2` it onto fd 0 for the run, point `sys.stdin` at `open(0, 'r', encoding='utf-8', closefd=False)`, and restore the saved fd afterwards. All rows above, including `open(0)`, Korean input, EOF, and a plain `input()` run after an `open(0)` run, produce the expected output.

This changes verdicts for existing `open(0)` submissions (see §7).

### P5. Unsupported interactive runtime is a dead end

`usePythonRunner` computes `supported = isInteractiveSupported()` (`SharedArrayBuffer`, `Atomics`, `crossOriginIsolated`). When false, the preload effect returns before creating a runner, `ready` never becomes true, and `RunControls` keeps Run disabled with "Preparing…". Even if enabled, `new InteractiveRunner()` constructs a `SharedArrayBuffer` and would throw. The `interactive_unsupported` copy ("코드는 실행되지만 input()이 입력을 요청하지 않습니다" / "Your code still runs…") is therefore false.

It occurs when the page is not cross-origin isolated: Safari before 15.2, non-secure origins (plain `http://` on a LAN IP), and embedded/in-app browsers that ignore COOP/COEP. `crypto.randomUUID()` in the same hook also requires a secure context.

### P6. Terminal input Enter during IME composition

`components/workspace/terminal-panel.tsx` submits on `event.key === 'Enter'` with no composition check. Known platform behavior:

- Chromium: the committing Enter arrives with `isComposing === true` (on macOS a second, non-composing keydown can follow).
- Safari: `compositionend` fires before `keydown`, so `isComposing` is already false; the only signal is `keyCode === 229`.

Likely symptoms are a double submission or a stray syllable carried into the next prompt. Must be confirmed with a Korean IME.

### P7. Two different input stacks in Monaco

Monaco 0.55.1 declares `editContext` with default `true` and computes the effective option as `editContextSupported && options.editContext`, where `editContextSupported = typeof globalThis.EditContext == "function"`. Chrome and Edge have `EditContext`; Safari and Firefox do not. So Korean composition in the editor runs through different code in Chromium than in Safari/Firefox. No symptom is attributed to this yet; it is a hypothesis to test once P1 is fixed, because P1's full-model replacement currently masks any IME-specific fault.

### P8. Code font on macOS

The editor font stack `'Fira Code', Consolas, monospace` appears in eight places (student editor, authoring editors, live/preview editors, answer modal, submission review, `components/collab/ConsoleTerminal.tsx`). No `@font-face`, `next/font`, or stylesheet loads Fira Code. Windows falls to Consolas; macOS has neither and falls to the browser's generic monospace, with Hangul falling back to a proportional system font.

### P9. Monaco is loaded from jsDelivr at runtime

`@monaco-editor/loader` defaults to `https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs`. The CDN currently sends `cross-origin-resource-policy: cross-origin` and `access-control-allow-origin: *`, so COEP `require-corp` does not block it. But availability depends on a third-party host that school networks sometimes filter, and `EditorFallback` shows "loading" indefinitely with no error. Pyodide, by contrast, is already self-hosted under `public/pyodide` with CORP headers.

### P10. Draft beacon on page hide

`useDraftAutosave` sends its final beacon from `visibilitychange` only. Safari, particularly on iOS, does not reliably fire it on tab close or app switch-away; `pagehide` is the dependable signal there. IndexedDB still holds the edit, so the loss is cross-device freshness, not data.

### P11. Browser baseline

Tailwind v4 targets Safari 16.4+, Chrome 111+, Firefox 128+. Older devices (iPads on iOS ≤ 16.3) receive unstyled or broken layout with no explanation.

### Verified as not a problem

- COOP `same-origin` + COEP `require-corp` (`packages/web/next.config.ts`) works in Safari, Chromium, and Firefox; Pyodide assets are same-origin with CORP.
- Shortcuts accept `metaKey || ctrlKey`.
- `localStorage` and IndexedDB access is wrapped, so Safari private mode does not crash.
- `input()`, `sys.stdin.readline`, and Korean input with `.split()` agree between browser and judge.
- Browser and judge use the same output comparison (`normalizeSampleOutput` / `normalizeOutput`, trailing whitespace only).

## 4. Invariants

1. The student editor's model is LF on every platform for its whole lifetime, so `value === editor.getValue()` after any local edit.
2. For a given program and a given sample, the browser sample run and the judge see the same stdin, including EOF, and produce the same stdout.
3. One run cannot change the stdin behavior of a later run.
4. A student is never left with a permanently disabled Run button; if the environment cannot run code, the page says so plainly.
5. An Enter that commits an IME composition never submits terminal input.
6. The editor renders in a monospace font on macOS and Windows without a network font.

## 5. Proposed changes

### 5.1 P1 — Pin the student model to LF

In `_components/code-editor.tsx`, wrap `onMount`:

```tsx
onMount={(editor, monaco) => {
  editor.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
  onMount?.(editor, monaco);
}}
```

- Pin before delegating, so `registerEditor` and the Yjs binding see an LF model.
- Previous/Next keeps the same model (no `path` prop), and `executeEdits` does not change EOL, so one pin suffices. `setValue` paths in `yjs-monaco.ts` already re-pin.
- Keep `toSharedDocumentText` in `applyLocalEdit`; the collaboration invariants depend on it.
- Paste of CRLF text is normalized by the LF model.

### 5.2 P2 — Deliver EOF

`lib/workspace/use-python-runner.ts`:

- Record per run whether stdin was supplied (`options.stdin !== undefined`), including the empty string.
- In the `stdin` event: queued line → provide it; queue empty and stdin supplied → `runner.sendEOF()` (no prompt); queue empty and no stdin supplied → prompt as today. This matches the judge, where extra `input()` raises `EOFError`.
- Add `endInput()` for an interactive run: call `sendEOF()`, append `^D` as an `in` line, set waiting false, and publish the `waiting` event so a mirrored teacher terminal stays in step.

`components/workspace/terminal-panel.tsx`:

- While awaiting input, show a small "End input" control (`^D`) beside the field, and handle `Ctrl+D` in the field (on macOS as well; Cmd+D is not used). Mirror mode renders neither.
- New i18n keys in `ko` and `en` `learn.json`.

### 5.3 P3 — Restore fd 0 after every browser run

`public/pyodide-worker.js`: in the harness `finally`, after flushing streams, run the §3 P3 repair. If `os.open('/dev/stdin')` itself fails, post `{ type: 'fatal' }` after `done` handling so `ensureRunner` replaces the worker on the next run. Bump the worker URL query (`/pyodide-worker.js?v=8` in `lib/pyodide/interactiveRunner.ts`); the asset is cached immutably.

### 5.4 P4 — Judge stdin on fd 0

`packages/api/src/judge/pyodide-thread.ts`, in `HARNESS._cove_run`:

1. Write `stdin_text` to a fixed MEMFS path (e.g. `/tmp/_cove_stdin`), UTF-8.
2. `saved_fd = os.dup(0)`; open the file and `os.dup2` it onto 0.
3. `sys.stdin = open(0, 'r', encoding='utf-8', closefd=False)`.
4. In `finally`, restore `sys.stdin`, `os.dup2(saved_fd, 0)`, close `saved_fd`, and delete the file. If fd 0 was closed by user code, the `dup2` restores it.

Keep output capture, error shaping, the interrupt buffer, and `globals().clear()` as they are. Cover with `pyodide-engine.spec.ts` cases for `open(0)`, `sys.stdin.read()`, extra `input()` → `RUNTIME_ERROR`/`EOFError`, Korean input, and a normal run after an `open(0)` run.

### 5.5 P5 — A non-interactive fallback runtime

- `InteractiveRunner` gains a mode chosen at construction: `interactive` (today) or `buffered`, used when `isInteractiveSupported()` is false. Buffered mode allocates no `SharedArrayBuffer`.
- The worker accepts `{ type: 'run', code, stdin?: string }`. With no `control` buffer, `readStdin` serves lines from that string and returns EOF when it is exhausted; it never posts `stdin`.
- `usePythonRunner` always preloads, so `ready` becomes true in both modes. Sample runs behave identically to interactive mode (their stdin is known up front). A plain Run in buffered mode has empty stdin, so `input()` raises `EOFError`, which the error coach already explains.
- Replace the `interactive_unsupported` copy with an accurate one: sample runs and submissions work; typing answers into `input()` needs a current Chrome, Edge, Safari, or Firefox over HTTPS.
- Replace `crypto.randomUUID()` in the runner with a helper that falls back when the context is not secure.

### 5.6 P6 — IME-safe Enter

In `TerminalPanel`'s `onKeyDown`:

```tsx
if (event.nativeEvent.isComposing || event.keyCode === 229) return;
```

Apply the same guard to other Enter-to-submit fields a student or teacher types Korean into (`live-feedback.tsx` already requires a modifier; audit the rest during implementation).

### 5.7 P7 — Decide on `EditContext` from the matrix

No code change up front. After P1 ships, run §6 rows K1–K4. If a Korean IME fault appears only in Chrome/Edge, set `editContext: false` in the student `CodeEditor` options (and the live editors, for parity) so every browser uses the textarea path. Record the outcome in this document.

### 5.8 P8 — One shared editor font stack

Add `EDITOR_FONT_FAMILY` next to the theme in `lib/monaco/theme.ts`:

```ts
"'Fira Code', 'SF Mono', Menlo, Monaco, Consolas, 'D2Coding', 'Nanum Gothic Coding', monospace"
```

Use it in all eight places. No web font: a late-loading font makes Monaco's glyph measurements stale and misplaces the caret, which is the class of fault this work removes.

### 5.9 P9 — Self-host Monaco

- Copy `monaco-editor@0.55.1/min/vs` into `packages/web/public/monaco/vs` through a pinned script (version taken from `@monaco-editor/loader`'s default so it cannot drift), mirroring how Pyodide is vendored.
- Call `loader.config({ paths: { vs: '/monaco/vs' } })` once, before the first editor mounts (a small module imported by every dynamic Monaco import).
- Add `/monaco/:path*` to `next.config.ts` with the same CORP and immutable caching as `/pyodide`.
- `EditorFallback`: after ~15 s without a mount, show an error with a reload action rather than "loading".

If vendoring is judged too large for this branch, ship only the timeout message and track self-hosting separately.

### 5.10 P10 — `pagehide` as well as `visibilitychange`

Register the same handler on `pagehide`. Keep a ref of the last beaconed code per session so the two events cannot send the same payload twice; a duplicate would otherwise be refused as stale by `baseUpdatedAt`, which is harmless but noisy.

### 5.11 P11 — Unsupported-browser notice

A small client check in the student layout (`CSS.supports('color', 'color-mix(in srgb, red, red)')`) that shows a dismissible banner naming the minimum versions. No behavior is gated on it.

## 6. Test plan

### Automated

| Area | Test |
|---|---|
| P1 | `CodeEditor` mount pins LF: a model double created with CRLF reports LF after mount, and `onMount` receives the pinned editor |
| P2 | `usePythonRunner`: sample stdin exhausted → `sendEOF` called and no waiting state; plain run with no stdin → waiting; `endInput` publishes `waiting: false` and appends `^D` |
| P2 | `createSampleInputQueue('')` → `[]` still yields immediate EOF |
| P3 | Worker harness string contains the fd-0 repair; a Node Pyodide probe (as in §1) runs `open(0)` then `input()` successfully |
| P4 | `pyodide-engine.spec.ts` rows listed in §5.4 |
| P5 | Runner in buffered mode becomes `ready`; sample run passes; plain `input()` → `EOFError` |
| P6 | `TerminalPanel`: keydown Enter with `isComposing` or `keyCode 229` does not call `onSubmitInput`; plain Enter does |
| P10 | Hide handler sends once when both events fire |

Run `pnpm` typecheck and the web and api test suites. Do not run `next build` for `@cove/web` while its dev server is running.

### Manual matrix (release gate)

Environments: Windows 11 Chrome, Windows 11 Edge, macOS Chrome, macOS Safari; Firefox on either as a spot check. Korean IME rows use the OS Korean keyboard (두벌식).

| ID | Scenario | Expected |
|---|---|---|
| E1 | Empty starter; type `print(`, Enter, `print("a")` over several lines | caret stays where typed; no jump to end |
| E2 | Delete a character in line 1 of a 5-line program | caret stays on line 1 |
| K1 | Inside auto-closed `""`, type `윷` | `print("윷")`, caret inside the quotes |
| K2 | Type Korean at line end, then Enter | no duplicated or lost syllable |
| K3 | Type Korean, then Backspace mid-composition | composition edits, not the preceding character |
| K4 | Paste multi-line Korean code | pasted as-is, LF |
| T1 | `input()` prompt: type `안녕` and press Enter once | one submission, `안녕`, no stray character in the next prompt |
| T2 | Sample run of `print(sum(map(int, sys.stdin.read().split())))` | finishes, matches expected |
| T3 | Plain Run of the same; type lines; press End input / Ctrl+D | finishes with the sum |
| T4 | Run `open(0)` program, then run an `input()` program | second run works |
| T5 | Submit the `open(0)` program | judge passes the cases the sample passed |
| R1 | Open via `http://<LAN-IP>` (not isolated) | Run becomes enabled; sample run works; accurate notice |
| F1 | Block `cdn.jsdelivr.net` (before P9) / confirm editor loads with it blocked (after P9) | editor loads, or a clear error after the timeout |
| S1 | macOS Safari: edit, then close the tab immediately; reopen on another device | latest edit present |

## 7. Rollout

- Ship in the order P1 → P2/P3 → P4 → P5/P6 → P8 → P9/P10/P11. P1 alone is the teacher's report and can go out first.
- Deploy with the usual procedure in `docs/operations/deployment-guide.local.md`. The worker version bump (P3/P5) and any vendored Monaco (P9) are static assets and ship with the web image.
- P4 changes judge verdicts. Submissions that used `open(0)` were judged against empty input and likely failed. **Decision needed:** leave history as is, or regrade affected exercises through the existing regrade service after deploying the judge. Identifying candidates is a search for `open(0` in stored submission code.
- No data migration. Existing drafts are LF already (canonicalized since `d9719f2`).

## 8. Open decisions

1. Regrade `open(0)` submissions after P4 (§7).
2. Self-host Monaco in this branch, or ship only the load-timeout message (§5.9).
3. Whether to disable `EditContext` pre-emptively or only if K1–K4 fail in Chromium (§5.7; this document proposes the latter).

## 9. Completion criteria

- Invariants in §4 hold, backed by the automated tests in §6.
- Every manual matrix row passes on the four primary environments, with results recorded in this document.
- Typecheck and web/api test suites pass.
- The teacher who reported the issue confirms that the E1, K1, and T1 scenarios work on the classroom Windows machine.

## 10. Implementation record

Implemented as designed: P1, P2, P3, P4, P5, P6, P8, P10, P11. Where the code differs from §5:

- **P4.** The `dup2`-onto-fd-0 approach from §3 crashed the judge thread whenever the process's stdin was a pipe or TTY: closing Pyodide's Node-backed stdin stream calls `fsync` with no descriptor. The earlier probe ran with `</dev/null` and did not hit this. The judge now installs a `setStdin({ read })` device once and loads each case's bytes into it before the run (`serveCaseInput`). Each run reads through a fresh `open(0, closefd=False)` wrapper, so read-ahead cannot cross cases, and fd 0 is reopened before and after every run.
- **P2.** Ctrl+D pressed with a partial line sends the line and marks EOF as pending; EOF is delivered on the worker's next stdin request. Writing it straight away would be overwritten by that request, and the program would hang.
- **P3.** `gc.collect()` runs before the fd 0 check, so an `open(0)` file object caught in a reference cycle is closed and repaired now, not in the middle of the next run.
- **P5.** `crypto.randomUUID` is replaced on the run path only (`createRunId` in the runner and the workspace run handlers). Live monitoring still calls it; production is served over HTTPS.
- **P6.** Implemented as `isSubmitLineKey` / `isEndOfInputKey` (`lib/workspace/terminal-keys.ts`). The audit found no other Enter-to-submit field without a modifier.
- **P9.** Only the load deadline is shipped: after 15 s the student editor shows an error with a reload action. Self-hosting Monaco is deferred (§8.2).
- **P11.** The notice is mounted at the top of the exercise workspace; there is no student layout to put it in.
- **P7.** No change, per §5.7. Decide after the matrix.

Verification run on this branch:

- `packages/web`: `tsc --noEmit` passes, `vitest run` passes (119 files, 1057 tests), `i18n:check` and `theme:lint` pass, and ESLint on the changed files reports only warnings that were already there.
- `packages/api`: `tsc --noEmit` passes, `src/judge/pyodide-engine.spec.ts` passes (10 tests, 7 of them new).
- The worker's actual harness, loaded from `public/pyodide-worker.js` into Node Pyodide 0.27.5, gives the expected output for `sys.stdin.read()` + EOF, `open(0)` then `input()`, `open(0)` held in a reference cycle then `input()`, an extra `input()` → `EOFError`, and Korean input.

Not yet done: the manual matrix in §6, which needs real Windows and macOS machines and a Korean IME, and the open decisions in §8.
