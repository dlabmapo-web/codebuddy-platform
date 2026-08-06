# V2 Live Student Terminal Mirroring

**Date:** 2026-08-06
**Status:** Implemented
**Reference:** Student-to-teacher terminal behavior on `main` branch

## Objective

When a monitored student runs Python, the teacher's **Student's run** tab must
be a live, read-only mirror of the terminal visible to that student. It must
show the same command banner, public sample input, manually entered input,
stdout, stderr, Python errors, waiting-for-input state, stop messages, and
sample verdict narration in the same order and visual categories.

The teacher's **Your run** tab remains a separate interactive Python runner.
Teacher runs are private to the teacher and are never sent to the student.

This work reproduces `main` branch's observable behavior without copying its public
Supabase broadcast channel or unvalidated client identity. V2 continues to use
the authenticated monitoring Socket.IO namespace and server-derived room
membership.

## Reference Behavior on `main` branch

`main` branch uses five student-to-teacher messages:

- `run:start` resets the mirrored terminal, opens it, and selects the student
  tab;
- `run:stdout` sends typed output chunks in batches;
- `run:stdin` appends input already shown in the student's terminal;
- `run:waiting` shows that the program is waiting for student input;
- `run:end` clears the waiting state and closes the run lifecycle.

V2 will preserve those visible semantics. The transport and recovery model will
be stronger: events will be typed, authenticated, ordered, bounded, and able to
resynchronize after a missed event or teacher reconnection.

## Product Rules

1. Starting a student run resets the previous student transcript and
   automatically selects **Student's run** on the teacher screen.
2. The teacher sees terminal changes within one batching interval under normal
   network conditions.
3. A public sample run mirrors:
   - the `$ python solution.py · Test N` banner;
   - the sample input lines consumed by `input()`;
   - stdout, stderr, and Python errors;
   - the match, mismatch, skipped, and expected-output narration that is
     already visible to the student.
4. A plain interactive run mirrors:
   - the `$ python solution.py` banner;
   - streaming stdout and stderr;
   - the waiting-for-input indicator;
   - each input only after the student submits it;
   - stop, completion, fatal, and Python-error messages visible locally.
5. Input currently being typed is not mirrored before submission. This matches
`main` branch and avoids transmitting drafts the student has not entered.
6. The teacher mirror is read-only. It never renders an input control and
   cannot provide stdin to the student's process.
7. A new run replaces the old transcript. Ending or disconnecting does not
   invent output or erase the last completed transcript.
8. Hidden grading inputs, hidden expected outputs, worker diagnostics, access
   tokens, identities, and source code have no field in this protocol.

## Architecture

### 1. One terminal event source

The Python runner will expose a small subscription interface for terminal
events. The same events that update the student's `TerminalPanel` feed the
monitoring publisher:

- `reset` with the new run and banner lines;
- `append` with one or more structured lines;
- `waiting` with the current input-wait state;
- `finish` with the final lifecycle.

This avoids reconstructing a transcript later from `stdout`. The current bug
exists because monitoring publishes only `outcome.stdout`, after the runner has
already rendered input, banners, errors, and verdicts through separate paths.
Publishing from the shared event source makes UI and mirror divergence
structurally difficult.

The runner remains unaware of sockets, teachers, academies, and monitoring.
It only emits terminal-domain events. A dedicated
`useTerminalMirrorPublisher` adapter subscribes when a monitored draft exists.

### 2. Shared transcript model

A pure `terminal-transcript` module owns:

- `TerminalLine` and `TerminalKind`;
- reset, append, waiting, finish, and snapshot reduction;
- byte accounting and deterministic truncation;
- run and sequence validation helpers.

The student runner and teacher mirror use this common vocabulary. The teacher
renders the reduced lines through the existing `TerminalPanel` in a new
read-only mirror mode. The teacher's own terminal keeps its existing
interactive mode.

### 3. Fast delta path

Normal execution sends incremental changes, not the complete transcript:

```text
Student runner
  -> terminal event subscription
  -> 40–80 ms bounded batch
  -> authenticated monitoring gateway
  -> watched draft room
  -> teacher transcript reducer
  -> read-only TerminalPanel
```

The publisher coalesces adjacent lines of the same kind and flushes at most
once per animation/render interval, with a maximum delay of 80 ms. A full
batch flushes immediately. This matches or improves `main`'s 100 ms output
batch while avoiding one WebSocket message per Python write.

Terminal messages use Socket.IO's reliable channel. Pointer frames may be
volatile because the next position supersedes them; terminal input and errors
cannot be dropped without corrupting the transcript.

### 4. Recovery snapshot path

The hot path performs no Redis or PostgreSQL write. The existing Redis Streams
Socket.IO adapter carries messages across API replicas.

When a teacher begins watching, reconnects without connection-state recovery,
or detects a sequence gap, the gateway sends a terminal snapshot request to
the authenticated student socket in the draft room. The student responds with
its current bounded transcript, run state, sequence, and waiting state. The
gateway validates and forwards the snapshot to the authorized teacher.

This request/response model is faster and cheaper than storing every terminal
delta in Redis, while still supporting late joins, cross-instance delivery,
and recovery. If the student is offline, the teacher keeps the last correctly
received transcript and the existing connection UI reports interruption.

## Wire Contract

The shared monitoring package will define discriminated schemas rather than
untyped event strings.

Every client-to-server terminal message contains:

- `draftId`: the shared draft being watched;
- `clientRunId`: a UUID generated once per execution;
- `sequence`: a non-negative, monotonically increasing integer within the run;
- `at`: the student's ISO timestamp;
- a discriminant and its bounded data.

Messages:

- `terminal.start`: sequence zero, lifecycle `STARTED`, banner lines, public
  sample count, and initial waiting state;
- `terminal.append`: the next sequence and a non-empty batch of typed lines;
- `terminal.state`: the next sequence and `awaitingInput` change;
- `terminal.finish`: the next sequence, final lifecycle, public pass/sample
  counts, and final waiting state;
- `terminal.snapshot`: current run metadata, sequence, bounded complete lines,
  lifecycle, public counts, and waiting state;
- `terminal.clear`: removes an in-progress mirror when the draft is replaced;
- `terminal.snapshot.request`: server-to-student only and carries no teacher
  identity.

The gateway stamps the authenticated student origin. Client payloads never
contain a membership ID, academy ID, role, name, room name, or target teacher.

## Ordering and Idempotency

- A `terminal.start` with a new `clientRunId` replaces the previous run.
- For the active run, `sequence <= currentSequence` is a duplicate or stale
  event and is ignored.
- `sequence === currentSequence + 1` is applied.
- A larger sequence indicates a gap. The teacher preserves the last correct
  state, marks the mirror as synchronizing, and requests a snapshot.
- A valid snapshot atomically replaces the local mirror and clears the gap.
- Events for an older `clientRunId` cannot overwrite a newer run.
- Socket.IO acknowledgements are unnecessary on each delta because sequence
  recovery provides convergence without a round trip per batch.

## Limits and Backpressure

The limits will be named in `monitoringLimits` and enforced by both the student
publisher and gateway schemas:

- mirror transcript budget: 512 KiB, matching the current student runner's
  output ceiling;
- individual delta payload: at most 16 KiB;
- individual terminal line: at most 8 KiB before deterministic splitting;
- batch delay: at most 80 ms;
- active mirrored runs per student socket: one;
- new run starts: separately rate-limited;
- terminal delta event rate: sized for the batching ceiling, with a server-side
  per-run byte budget preventing a high-rate modified client from streaming
  without bound.

When the transcript budget is reached, the shared transcript model appends one
visible truncation line and stops accepting further output for that run. The
student and teacher therefore show the same truncation boundary. Lifecycle and
waiting-state changes may still be delivered after truncation.

The gateway accepts exactly one output delta that crosses the transcript
budget. It then marks the run truncated, clamps its accounting to the content
budget, and rejects later output deltas while continuing to accept lifecycle
and waiting-state changes. Both clients reduce that crossing delta through the
same transcript function, so clipping remains a single shared rule. A truncated
snapshot may exceed the content budget only by the exact shared truncation
marker and may exceed the line-count budget only by that marker line.

The gateway keeps only small per-socket validation state: active run ID, next
sequence, and accepted byte count. It does not retain transcript content or
perform a Redis round trip for deltas.

## Authorization and Privacy

The gateway accepts terminal messages only when:

- the socket is authenticated as a student;
- the student's server-side state currently names the same draft;
- the draft room was joined through the normal monitoring authorization flow;
- the payload passes schema, sequence, rate, and byte-budget validation.

A teacher-originated terminal mirror message is dropped. A teacher may only
run code in the existing private **Your run** browser sandbox.

Only locally visible sample data may enter terminal lines. Submission grading
continues to publish only the server-derived public `result.changed` summary;
hidden test inputs and expected outputs never pass through the browser mirror.

Malformed payloads use the existing invalid-payload allowance. Rate-limit or
budget refusals increment monitoring metrics without disconnecting an otherwise
valid student. Repeated malformed payloads retain the existing disconnect
policy.

## UI Behavior

`LiveOutput` retains its two tabs:

- **Your run** uses the teacher's runner, controls, stdin, and result area;
- **Student's run** uses mirrored lines and waiting state and contains no run,
  stop, test, submit, or input controls.

On `terminal.start`, `LiveOutput` opens/selects **Student's run**, matching
`main`. Later updates do not repeatedly steal the tab if the teacher explicitly
returns to **Your run** during the same student execution. A subsequent new
student run selects **Student's run** again.

The mirror reuses the terminal colors already defined for `meta`, `in`, `out`,
`err`, and `info`. While the student is waiting, mirror mode shows a passive
"waiting for input" indicator rather than an editable field. It auto-scrolls
using the same behavior as the student terminal.

The existing run lifecycle header may remain as compact metadata, but it must
not replace or duplicate the transcript. The transcript is the primary
content.

## Failure and Recovery Behavior

- If a terminal batch is delayed, reliable ordered delivery preserves it.
- If a sequence gap is detected, no later delta is applied over uncertain
  state; a snapshot repairs the mirror.
- If the student's socket reconnects, it rejoins through the established
  authorization flow and immediately sends its current snapshot. Because an
  unrecovered Socket.IO connection has fresh server state, the gateway proves
  draft ownership and active student membership on this cold snapshot before
  restoring the socket's draft and terminal state. Later deltas return to the
  normal in-memory hot path.
- If the teacher reconnects, the watch/document recovery requests the current
  terminal snapshot after room authorization succeeds.
- If monitoring realtime is degraded, terminal mirroring reports the same
  unavailable/reconnecting state as other monitoring features; it does not
  fall back to an unauthenticated channel.
- If no teacher is watching, the publisher has no draft room and does not
  stream terminal deltas.
- If the student leaves the problem workspace, in-progress waiting/running
  state ends. The teacher may retain the last received transcript as historical
  context until a new run or watch end, matching `main`'s useful behavior.

## Implementation Boundaries

The change should remain divided into focused units:

1. Shared schemas, types, limits, and event names in the monitoring package.
2. Pure transcript reducer and byte-limit tests in the web workspace library.
3. Runner terminal-event subscription, with no monitoring imports.
4. Student mirror publisher with batching and snapshot response.
5. Gateway validation, authorization, sequence/byte accounting, and forwarding.
6. Teacher mirror subscriber/reducer in the live-workspace hook.
7. Read-only mirror mode in the reusable terminal renderer.
8. `LiveOutput` tab-selection policy triggered only by a new run.

No component should simultaneously own Python execution, socket transport,
authorization, transcript reduction, and presentation.

## Verification

### Shared and unit tests

- schemas accept every valid message and reject unknown kinds, negative or
  oversized sequences, empty deltas, invalid UUIDs, oversized lines, and
  oversized snapshots;
- transcript reduction preserves exact order and kind;
- adjacent compatible chunks coalesce without changing rendered text;
- truncation occurs at the same deterministic boundary for student and
  teacher;
- stale, duplicate, future, and previous-run messages behave as specified;
- snapshot replacement repairs a gap atomically;
- publisher batching respects the byte and 80 ms limits;
- no publication occurs without an active monitored draft.

### API tests

- only the authenticated student for the draft may publish;
- teacher-authored mirror events are dropped;
- origin, academy, room, and student identity come from socket state;
- starts, deltas, state changes, finishes, clears, and snapshots forward only
  to the authorized draft room;
- per-run sequence, byte budget, run-start rate, and invalid-payload policies
  are enforced;
- snapshot requests target the student without exposing teacher identity;
- cross-instance room delivery continues through the Redis Streams adapter;
- Redis degradation never enables a weaker public fallback.

### Two-browser end-to-end tests

In Chromium and WebKit/Safari:

- a sample run mirrors banner, every public input line, stdout, and verdict in
  the same order and colors;
- mismatch, runtime error, fatal error, empty output, and stopped runs mirror
  their student-visible narration;
- a plain interactive run mirrors streaming output before completion;
- the teacher sees passive waiting state;
- submitted stdin appears on both screens and output continues afterward;
- a new student run resets and selects **Student's run**;
- the teacher can switch to **Your run** and run privately without affecting
  the student or student transcript;
- a simulated sequence gap and teacher reconnect recover from a snapshot;
- hidden submission data never appears in terminal mirror events or UI.

The affected shared, API, and web unit suites, type checks, lint checks,
production build, and targeted Chromium/WebKit monitoring projects must pass.

## Out of Scope

- persisting terminal transcripts to PostgreSQL;
- replaying historical runs after the monitoring visit ends;
- letting the teacher type into or stop the student's process;
- mirroring teacher terminal activity to the student;
- exposing hidden grading cases or worker diagnostics;
- changing Python execution, submission grading, feedback, Yjs document
  synchronization, pointer/caret awareness, or monitoring authorization.
