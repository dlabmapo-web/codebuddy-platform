# S-10 and S-11 — Live monitoring

Investigated on localhost on 2026-11-20 with two signed-in sessions at once: student `seojun-kim` on `localhost:3000` (API 4000) and teacher `cove-teacher` on `teacher.localhost:3001` (a second web server and API on 4001, `WEB_ORIGIN=http://teacher.localhost:3001`). Both APIs share the dev database and Redis, so presence, pointers and the live view travel between them as they do between two production clients.

How to set this up again:
- **Separate cookies:** `teacher.localhost` keeps its own cookies, so two users can be signed in at once in one Chrome. Turnstile accepts that hostname; it does not load on `127.0.0.1`.
- **One origin per API:** the API allows a single `WEB_ORIGIN`, so the second host needs its own API.
- **Second API env:** set `PORT`, `WEB_ORIGIN` and `DLAB_REDIRECT_URI=<origin>/sso/callback`.
- **Second web env:** set `NEXT_PUBLIC_API_URL=http://localhost:4001/api/rpc` (with `/api/rpc`), and `COVE_DLAB_E2E=1` so its build output goes to `.next-dlab`, not your `.next`.
- **Playwright won't work:** it can't sign in against the dev Supabase. The real Turnstile key blocks automated browsers, and the dev project rejects Cloudflare's always-pass test key.

## S-10 — the student's problem text shrinks when a teacher joins

> **Implemented on `qa-feedback` (2026-11-20), option A.**
> - **Student:** `StatementCanvas` marks the student's natural statement as the canvas, with no width, no transform and no collaborating minimum pane width.
> - **Sending the width:** the student reports its width (`onReadingWidth`) and sends it as `statementWidth` on `awareness.update` (optional field). It is re-sent when it changes, on reconnect, and on `watch.started` for a joining teacher (`announce()`).
> - **Teacher:** passes `mirrorWidth = remote.statementWidth ?? 640`, lays the statement out at that width and scales it to fit (0.3–1.4). The 640 fallback keeps older student clients aligned during rollout.
> - **Other screens:** the classroom presenting screen and history keep their natural layout.
>
> **Verified on localhost, two sessions:**
> - **Student unchanged:** the statement stayed 530×1133px with no transform when the teacher joined; only the "Teacher is helping" chip appeared.
> - **Teacher follows the student:** the student widened their pane to 712px and the teacher's copy re-laid out at 712px, scale 0.744, with identical line breaks.
> - **Pointers, both directions:** the teacher's pointer on "sort" landed at (758,194) against the word's centre (759,195) on the student's screen. The student's pointer on "sort" landed at (639,233) against (638,233) on the teacher's.
> - **Editor and rejoin:** editor pointers were unchanged, and a teacher reload received the student's width without the student moving.
>
> **Tests:** web 589 + 4 new, shared 144, API monitoring 298 passed; web/API/shared typecheck clean.

Registered 2026-11-06 · Sunny · P1

**Reproduced.** Before the teacher joined, the student's problem pane (530px wide) showed the statement at normal size. After joining, it showed the statement wrapped in `transform: scale(0.828125)`: the text got smaller and the content height dropped from 1133px to 938px. The editor and the rest of the layout did not change; the header only gained the "Teacher is helping" chip.

**Cause.** [statement-canvas.tsx](../../../packages/web/src/components/workspace/statement-canvas.tsx), added in `47cd288f`, lays out the problem statement at a fixed 640px width (`STATEMENT_CANVAS_WIDTH`) while a teacher watches, then scales it to fit each person's pane: `scale = paneWidth / 640`, clamped to 0.7–1.4 in [statement-canvas.ts](../../../packages/web/src/lib/workspace/statement-canvas.ts). It exists so that a mouse position, sent as a fraction of that 640px box, lands on the same word on both screens. Two consequences for the student:
- Text shrinks whenever their pane is narrower than 640px (0.83× here, down to 0.7× on a small laptop), and grows on a wide pane.
- While collaborating, the student's statement pane is forced to at least 448px (`minPx: STATEMENT_CANVAS_MIN_WIDTH` in the coding workspace), so on a small screen the panes also re-split.

The mouse pointers work as you described: the teacher sees "김서준" over the student's screen, and the student sees "Teacher". That shared pointer is the reason for the canvas. It does not move the student's layout by itself.

**Fix options (any fix must keep both pointers exact):**

| Option | How | Student's screen | Pointer accuracy | Size |
| --- | --- | --- | --- | --- |
| **A. Student-anchored canvas (recommended)** | The student never transforms: their natural statement box *is* the canvas, and they publish its width with their pointer/presence. The teacher lays the statement out at the student's width and scales it to fit the teacher's pane. Fractions still divide by the same logical width on both sides. | Never changes | Exact, same as today | Shared pointer schema gains the student's canvas width; teacher `StatementCanvas` uses it; student path drops the transform and `minPx`; specs for both roles |
| B. Content anchors | Drop the canvas. Each statement block (paragraph, example, code block) becomes an `anchor` (the schema already supports `anchor` for outline rows and terminal lines), and the pointer is a position inside that block. | Never changes | Same block, approximate within a reflowed paragraph | Smaller, but less exact than today inside long paragraphs |
| C. Teacher-only scaling of the 640 canvas | — | — | Misaligned: the student's natural width ≠ 640 | Not viable |

The teacher's own text size may change under A (it follows the student's width). That is acceptable: the teacher is the one who chose to watch.

### Pointer accuracy across the whole window (2026-11-20)

**Setup.** Measured on localhost with two signed-in sessions and deliberately different layouts:

| | Problem text | Editor | Terminal |
|---|---|---|---|
| Student | 712px | 436×291 | 436×260 |
| Teacher | 712px laid out, scaled 0.744 | 618×203 | 618×240 |

Each figure is the distance between where the arrow tip lands and the centre of the same character or spot on the other screen.

| Area | Teacher → student | Student → teacher |
|---|---|---|
| Problem text: first word, mid line, end of line, "Example 1", "1000" (bottom) | 0.4–0.7px | ≤0.5px |
| Problem text corners (top-left, top-right), with the panes scrolled to different positions | 0.0px | — |
| Problem text after "click to follow" scrolls the student there | 0.0px | — |
| Hints button (student "Need help?" / "1 hint revealed", teacher "2 hints revealed") | Same spot on the button | — |
| Code editor: line 1 start, middle, last character; line 2 | ≤0.5px; 3.5px on a wide Korean character (still on that character) | ≤0.5px |
| Terminal (student's run, both sides on the mirror) | ≤0.5px | ≤0.5px |
| Course outline rows (rows of different height) | 0px, same relative spot in the row | 0px |

**Hints.** Hints open in a dialog. The statement keeps a fixed-height hints button, and revealing a hint changes only its label. The whole statement measured 1.55578 canvas widths tall on both screens before and after a reveal, so hints never shift anything.

**Found and fixed while measuring** (both predate S-10):
1. *Text scrolled out of view.* Visibility was judged against the statement's full content box, not the visible pane. A point the reader had scrolled past was drawn as an arrow over the lesson bar, or below the window, and the "↑/↓ … pointing above/below — click to follow" button never appeared. `visibleSurfaceBox` now clips by scrolling ancestors and the window. "Click to follow" also scrolled the non-scrolling surface element, so it did nothing; it now scrolls the real pane and centres on the visible part. Test: `visible-surface-box.spec.ts`.
2. *The teacher's private terminal.* On the teacher's "Your run" tab, terminal lines carried the same line markers as the student's run. The student's pointer landed on the teacher's own line N, and the teacher pointing at their private output put an arrow on the student's line N. The private terminal now has no shared markers and is excluded from pointer sharing (`TerminalPanel shared={false}` and `data-history-private`). The student's pointer there reads "김서준 is looking at the terminal".
3. *Sub-pixel width.* The student's width is now sent to 0.01px (it was rounded to whole pixels), so a line that only just fits breaks in the same place on both screens.

**Intended behaviour, not errors.**
- *No shared character, so no arrow.* The editor's empty area below the code, past the end of a line beyond the student's narrower editor, and the line-number gutter show the banner "… is looking at the code" or nothing.
- *Header.* The two roles' headers hold different things, so a header pointer only says "the top bar".
- *Expiry.* The teacher's arrow on the student's screen disappears 3 s after the teacher stops moving.

**Editor caret (text cursor).** The other person's caret, selection and typing line are *not* drawn, by design since `6e9b6186` (2026-11-03, "share mouse pointers both ways"); `attachRemoteCursor` is unused. Each side keeps its own normal caret, and what one sees of the other in the editor is the mouse arrow (measured above) plus the code itself. Typed text was checked live: a line the student typed appeared on the teacher's line 3 at once, and was removed again.

**PDF lessons** (`woojin-jang` and `cove-teacher2`, test course temporarily assigned to 파이썬 기초 주말반 and removed afterwards).

**Setup:** different zooms on purpose: the student on "Fit page" (page 810×456), the teacher on "Fit width" (page 1120×630).

| Check | Result |
|---|---|
| Teacher → student, four page corners and centre | 0.0–0.1px |
| Student → teacher, top-left, centre, lower right | 0.0px |
| Student turns to page 2, teacher still on page 1 | The teacher's view does not turn the page; it shows "Student PDF page: 2". The student's pointer on page 2 shows as "장우진 is looking at the PDF", not as an arrow on page 1. |
| Teacher turns to page 2 as well | The arrow is exact again (0.0px) |

**Open.** Once, the first reading for a point just below the student's visible pane showed the "looking at the problem" banner instead of "↓ below". Repeating it gave "↓ below" every time; the cause is not identified.

## S-11 — a student back from a break shows as not connected

Registered 2026-11-06 · Sunny · P1 (no screenshot)

**Not reproduced on the current code.** Every break scenario recovered without F5 on either side:

| Scenario (teacher's live view open throughout) | What the teacher saw | Recovered |
| --- | --- | --- |
| Student clicks Leave, waits ~1 min on the course page, reopens the problem | "Student is not currently solving an exercise" → "Live on 버블 정렬 구현" | Within seconds of reopening |
| Student's tab hidden for 8 min (Chrome background throttling) | "Solving" throughout | Never dropped |
| Student navigates the same tab to another page for ~50 s, then presses Back | "Reconnecting" → after 30 s offline → "Live on …" | 3 s after Back (page restored from the back/forward cache) |
| Student-side API stopped for ~2.5 min, then restarted | — | Student reconnected on its own; presence re-sent |

**Likely already fixed** after the report. Both of these are in v2.0.64, released after 2026-11-06:
- `0f74f813` (2026-11-13), "serialize watch cleanup with pending starts": a stale cleanup could end the teacher's new watch after a student reconnected.
- `e05775a2` (2026-11-13): unified the teaching and live workspaces, with reconnect recovery.

The student side re-sends presence on every socket `connect` ([student-presence.tsx](../../../packages/web/src/lib/monitoring/student-presence.tsx)), and the presence key lives 60 s on the server (two 15 s heartbeats plus the 30 s grace).

**Remaining actions.**
1. Ask QA to retest on production (v2.0.64 or later). If it still happens, note the exact screen and wording the teacher saw, and whether the student's laptop was closed.
2. Separate finding, not S-11: when the API process a student is connected through stops, other API instances keep showing that student as **Solving** until a later update. Presence expiry in Redis is never pushed to teachers, and a connected entry has no `stateExpiresAt`. This matters only with several API instances, or briefly during a deploy.
