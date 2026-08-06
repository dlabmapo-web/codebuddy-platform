# Presence Coverage and Activity Signals

**Date:** 2026-08-06
**Status:** Proposed
**Scope:** Where a student publishes presence, and what counts as activity once
they do. The state definitions and the visibility rule are unchanged — see
"What stays as it is".

## The states, as the teacher should read them

| State | Means |
|---|---|
| Offline | No open tab on the platform |
| Online | Signed in and on the platform, not in an exercise |
| Solving | In an exercise, and doing something within the last 60 seconds |
| Idle | In an exercise, but nothing for 60 seconds |
| Reconnecting | Connection dropped, inside the 30-second grace |

`resolveLiveState` already computes exactly this
([monitoring.ts:339](packages/shared/src/monitoring/monitoring.ts#L339)). Nothing
in this design changes it. Every problem below is a client that fails to report
what the server is ready to interpret.

One thing the table means literally: Online is an *open tab*, not a valid
session. A student who signed in this morning and closed their laptop is
Offline, and should be.

## Problem

### 1. A student is invisible unless they are inside an exercise

`useStudentMonitoring` is mounted in exactly one place — the exercise workspace
([workspace.tsx:64](packages/web/src/app/(v2-studio)/studio/academies/[academyId]/learn/exercises/[materialId]/_components/workspace.tsx#L64)) —
and it owns the only presence publisher. A student reading their course list,
picking a problem, or looking at feedback publishes nothing at all, so the
roster calls them Offline. Online is currently unreachable for its actual
meaning; the only way to reach it today is to be in an exercise with the tab
backgrounded.

This is the largest of the four and the one that makes the roster read wrong at
a glance: a class of students browsing the platform looks like an empty class.

**The server already handles this.** `presencePublish` fans a publish out to
every class the student is enrolled in, and only attaches the material to
classes whose assigned courses actually contain it
([monitoring.gateway.ts:513-527](packages/api/src/monitoring/monitoring.gateway.ts#L513-L527)).
A publish carrying `materialId: null` therefore writes an entry in every one of
the student's classes, which `resolveLiveState` reads as Online. No API,
contract, or gateway change is needed — only a client that publishes.

### 2. Moving the mouse is not activity anywhere

`PresenceSignals.lastActivityAt` documents itself as "Last editor, run,
pointer, or navigation signal"
([monitoring.ts:330](packages/shared/src/monitoring/monitoring.ts#L330)), but no
pointer signal is wired to it. A student reading the problem statement and
moving their cursor over the samples falls to Idle after 60 seconds and reads
as stalled.

### 3. Caret movement only counts while a teacher is already watching

The listeners calling `markActive` on cursor and selection changes sit behind
`if (!editor || !draftId) return`
([use-student-monitoring.ts:262-284](packages/web/src/lib/monitoring/use-student-monitoring.ts#L262-L284)),
and `draftId` is set only when a teacher opens the live workspace. An unwatched
student arrowing through their code registers nothing. Typing is unaffected
because that path runs through `onCodeChange` in the workspace and was never
gated — which is why this has stayed invisible: the one signal anybody would
test by hand is the one that happens to work.

### 4. Solving arrives up to fifteen seconds late

`markActive` sets a flag and nothing sends it until the next heartbeat
([use-student-monitoring.ts:88-110](packages/web/src/lib/monitoring/use-student-monitoring.ts#L88-L110)),
which runs every 15 seconds. On a page labelled "Live", a teacher watching a
student begin work waits up to a quarter of a minute.

## Design

### One publisher, hoisted

The hard constraint is that a student must have **exactly one** presence
publisher. Two would race: an ambient one reporting `materialId: null` and the
workspace one reporting an open exercise would alternate over the same Redis
row, flipping the student between Online and Solving on the teacher's screen.
`useMonitoringSocket` is deliberately not a singleton
([use-monitoring-socket.ts:13-20](packages/web/src/lib/monitoring/use-monitoring-socket.ts#L13-L20)),
so "just mount it twice" produces exactly that.

So presence moves up and out of `useStudentMonitoring`:

```
academies/[academyId]/layout.tsx        ← new layout, persists across navigation
  └── StudentPresenceProvider           ← the only publisher; role === STUDENT
        ├── every studio page           → publishes materialId: null  → Online
        └── exercise workspace          → registers its material      → Solving
              └── useStudentMonitoring  → watch, awareness, terminal, runs
```

The provider owns the socket, the heartbeat, the visibility listener, and the
activity flag. The workspace contributes two things through context: the
material it has open, for as long as it is mounted, and activity as it happens.
`useStudentMonitoring` keeps everything else and stops publishing presence.

It must be a real `layout.tsx` at the academy segment rather than something
inside `StudioShell`. `StudioShell` is composed per page, so it would unmount
on every navigation and take the socket with it — a student clicking between
pages would flicker through Reconnecting. A layout at `[academyId]` persists for
as long as the student stays in that academy, which is the lifetime presence
actually has.

Gated on the viewer holding an active `STUDENT` membership in this academy —
`StudioShell` already resolves that role. A teacher's publish would be dropped
by `resolveStudent` anyway, but emitting a heartbeat every fifteen seconds per
teacher to be discarded is noise nobody needs.

The workspace keeps its own socket for collaboration. Its disconnect is
harmless: the registry's generation guard makes a disconnect a no-op unless
that generation still owns the row, and a socket that never published presence
never owned it.

### What counts as activity

A student is working if they are touching the page, not only if they are
typing. Idle should mean "nobody is there", not "nobody has typed recently",
because the second one libels every student reading the question.

| Signal | Today | After |
|---|---|---|
| Editor content change | Counts | Counts |
| Run started or finished | Counts | Counts |
| Caret or selection move | Only while watched | Always |
| Pointer movement | Never | Counts |

Pointer movement uses `pointermove`, not `mousemove`, so a trackpad, a stylus,
and a touch drag all land on the same path — this runs on classroom hardware
that is not guaranteed to be a mouse. Registered `passive`, and it does nothing
but set a boolean four other callers already set.

Activity is only ever a *promotion within* an exercise. A student moving their
mouse on the course list is Online and stays Online, because Solving requires a
material and they have none open. Nothing about the new signal can promote
somebody who is not in an exercise.

Watching stops changing what counts: `markActive` moves out of the
`draftId`-gated effect, leaving cursor *publication* — a collaboration concern —
where it is. A student's state must not depend on whether somebody happens to
be looking, or the roster reports different things about identical behaviour.

### Sixty seconds, unchanged

Sixty seconds with none of those four signals and the student is no longer
Solving. `idleAfterMs` does not move. What changes is that the sixty seconds now
measures something honest: a student who has genuinely stopped, rather than one
who stopped typing to read.

The demotion rides the heartbeat — no activity means no activity-triggered
publish — so the fall to Idle lands on the first beat past the sixty-second
mark, within 15 seconds of it. The asymmetry is deliberate: arriving at Solving
is urgent because a teacher may act on it, and leaving it is not.

### Publishing without waiting for the heartbeat

`markActive` publishes immediately when the last publish is old enough,
governed by a new `monitoringTiming.activityPublishFloorMs` of **3 seconds**:

```
markActive()
  → set the flag, as today
  → if now - lastPublishAt >= activityPublishFloorMs, publish now
  → otherwise leave it for the heartbeat or a later signal
```

Solving then appears about three seconds after the first keystroke or mouse
movement instead of up to fifteen, and continuous work emits at most one extra
frame every three seconds rather than one per event. The floor is what makes a
`pointermove` listener safe to add at all: without it, a mouse dragged across
the editor publishes at screen refresh rate.

Three seconds rather than one: at one second, a class of thirty students all
working produces thirty frames a second class-wide for a number a teacher reads
at a glance, and the roster is no more useful for it.

The 15-second heartbeat is unchanged. It carries visibility, liveness, and the
idle demotion, none of which want a faster clock.

### Opening a student

Today the button appears for any row holding an exercise — Solving, Idle, and
an Online row whose tab is merely backgrounded
([monitoring.ts:363](packages/shared/src/monitoring/monitoring.ts#L363)).
Requested: **Solving only.** `canOpenLiveWorkspace` becomes
`materialId !== null && state === 'SOLVING'`.

That is one predicate, and the server re-authorizes the watch either way, so
the change is safe. Two consequences worth stating before it ships.

**The button disappears as the teacher reaches for it.** A student who pauses
sixty seconds to read the question drops to Idle, and the button goes with it —
including under the cursor of a teacher who saw it a moment ago and is
mid-click. Nothing is broken, but the row a teacher was about to open stops
being openable while they watch.

**Idle is arguably the row that most needs opening.** In an exercise and doing
nothing for a minute is what being stuck looks like. Under this rule the
teacher can watch the students who are already fine and not the one who is
stalled.

An alternative that keeps the intent and neither consequence: show the button
whenever the student has an exercise open — Solving *or* Idle — and drop it
only for Online, which after the coverage change usually means no exercise at
all. The stated goal, "no button on a row where nothing is happening", still
holds, because a row with no material has no button either way.

Recorded as the recommendation. Implement Solving-only if that is still the
call after reading this.

### Already correct, verified rather than changed

Two of the requested behaviours need no work, and are written down here so
nobody re-opens them:

**A solving student already appears under the Online filter.** `matchesFilter`
treats `online` as any state that is not Offline
([roster.ts:76-89](packages/web/src/lib/monitoring/roster.ts#L76-L89)), so with
three students signed in and two of them solving, Online lists all three and
Solving lists two. The summary cards count the same way, so a card can never
disagree with the list under it.

**Open live already opens the problem the student actually has open.** The live
page deliberately takes no material from the URL — the socket's watch
acknowledgement supplies it, so which exercise a teacher lands on is a live
fact rather than a guessable path. The comment on that page says why: a
material named in the URL would let a teacher open something the student is not
on.

### What stays as it is

`resolveLiveState`, the contracts, the gateway, and the registry. This is a
change to what the client reports about itself, never to what it may claim to
be — the server remains the only place a state is decided.

### Reversed: activity now outranks visibility

An earlier draft of this spec kept the visibility rule — `HIDDEN` reads as
Online regardless of activity — on the argument that a window you cannot see is
a window you are not typing into. Testing disproved it, so it changed.

WebKit reports a page as hidden when another window merely *covers* it, where
Chromium reports it only on a tab switch. So a Safari student was demoted the
instant anything overlapped their window — including the teacher's own roster
coming to the front. The observed symptom is exact: switch to the student, type,
switch back, and the row shows Solving for about a second before the
`visibilitychange` publish lands and overwrites it with Online.

That is not a same-machine artifact. Any window over a Safari student's editor
does it, and the same student on Chromium behaves differently, so the roster
reported two different things about identical work.

The check order in `resolveLiveState` inverts:

```
materialId === null                 → ONLINE
activity within idleAfterMs         → SOLVING     ← now ahead of visibility
visibility === HIDDEN               → ONLINE
otherwise                           → IDLE
```

Someone who typed four seconds ago is working, whatever is stacked on top of
them. Someone who genuinely walked away stops producing signals and leaves
Solving within the minute anyway, so the demotion is not lost — only delayed to
the point where it is actually true.

It also settles a contradiction. The rule this design was asked for is "writing
code or moving the mouse within sixty seconds"; visibility appears nowhere in
it. The override was the implementation disagreeing with its own spec.

What it costs: the immediate "they alt-tabbed" tell. A student who switches away
now reads Solving for up to a minute rather than dropping to Online at once.
Worth it — a teacher acts on who is working, and somebody who was typing ten
seconds ago still is.

Hidden *and* quiet resolves to Online rather than Idle, which keeps Idle meaning
what it should: sitting in front of a problem doing nothing, rather than having
left the page open somewhere behind a browser.

## Verification

- `resolveLiveState` keeps every existing case except the visibility one, which
  inverts by design: a covered window with recent activity is Solving, and only
  a covered window that has also gone quiet is Online.
- A test that the publish floor suppresses a second frame inside the window and
  allows one after it, on a fake clock rather than by waiting.
- A test that a burst of activity publishes once, not once per event.
- A test that caret movement marks activity with no `draftId` present — the
  regression that let an unwatched student read as idle while navigating.
- A test that activity without a material cannot produce Solving.
- `canOpenLiveWorkspace` tests updated to the chosen rule, including that an
  Online row carrying a backgrounded exercise is no longer openable.
- A test that the Online filter still returns a solving student, so the
  narrowed button rule cannot leak into the filter by accident.
- Playwright: a student signs in and stays on the course list, and the teacher's
  roster shows them Online rather than Offline, with "Not in an exercise".
- Playwright: the same student opens an exercise and the row becomes Solving
  without a reload, then returns to the course list and drops back to Online.
- Playwright, WebKit as well as Chromium: an unwatched student moves the pointer
  over the workspace without typing and the row reaches Solving well inside the
  old fifteen-second window. WebKit specifically, because that is where this was
  found and where `pointermove` coalescing differs.
- The existing teacher-live-monitoring flow still passes, including the
  teacher-first ordering, and no student ever holds two presence publishers.
