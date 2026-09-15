# Monitoring save and recovery reliability

Scope: the five reliability fixes approved in the September 15 review. Keep the
single document-authority topology and current Socket.IO/Yjs transport. No
classroom overview, deployment, or data migration is included.

## Save scheduling

All flush callers for one draft share one in-flight promise. Changes arriving
during a write remain dirty and schedule a subsequent flush. HTTP persistence
must not return an older snapshot as a conflict while newer live work is dirty.

Failed attempts retain the resident document and retry without another edit.
Use exponential backoff from one second, with 80–100% jitter and a 30-second
maximum delay. The retry rate is bounded; retries continue while the process
is running, because exhausting an attempt budget must not strand quiet work.
Success resets backoff. Ordinary edits do not reset it. Shutdown cancels timers
and uses the existing bounded release attempts; unsaved documents are reported.
This does not make in-memory edits survive an abrupt process loss.

## Truthful save status

A successful persistence event describes the exact committed text, identified
by its SHA-256 hash. A sync response includes the last committed text hash too,
so opening a clean document does not need an extra database write.

The teacher marks incoming and outgoing edits unsaved. It confirms Saved only
when its current text matches the committed hash. Hash computation is
asynchronous: any later edit, failure, document replacement, or newer
confirmation invalidates pending results. This covers deletion-only updates;
a Yjs state vector alone does not identify them. Missing hashes fail closed.
Legacy plain CRLF drafts normalized during load also schedule persistence.

Monitoring protocol version becomes 3: older teacher clients must refresh
rather than interpret an older revision's boolean as proof of current text.

## Watch and sync recovery

Unknown infrastructure failures map to MONITORING_REALTIME_UNAVAILABLE, without
exposing internal messages. Known authorization errors retain their public code.

Watch-start and document-sync each receive an eight-second acknowledgement
deadline and at most four attempts, with one-, two-, and four-second retry delays.
Only missing acknowledgements and realtime-unavailable errors retry. Every
attempt uses a fresh event ID. A late response from a timed-out attempt cannot
complete a newer one. No global Socket.IO acknowledgement retries are enabled.

Starting or retrying a watch immediately removes edit readiness. Only a valid,
current watch's sync acknowledgement restores it. Navigation, a replaced watch,
revocation, refresh-required, and unmount cancel outstanding recovery. An expired
connection's watch can establish a fresh authorized watch; access revocation
remains terminal. After retries exhaust, show an explicit Retry connection action.
Both English and Korean explain the temporary failure and paused editing.

## Verification

Unit coverage must exercise retry without typing, increasing backoff, retention,
coalesced flush callers, later edits, and committed hashes including deletions.
Client tests cover late hashes, missing hashes, lost acknowledgements, retry
exhaustion, terminal errors, and cancellation.

Browser coverage uses seeded development student and teacher contexts. It drops
the initial sync request while preserving the connection, injects temporary
watch failures through retry exhaustion, and delivers an old save event after a
newer deletion. Each case must recover or remain safely unsaved as appropriate.
Run typecheck, lint, shared/API/web unit suites, i18n, routes, and theme checks.
Record actual browser results below; do not infer them from unit tests.

## Verified September 15

- Chromium: all three recovery scenarios passed (29.9 seconds).
- WebKit: all three recovery scenarios passed (46.3 seconds).
- Shared: 816 tests passed. Web: 1,006 tests passed.
- API: the full suite passed 1,067 tests with eight opt-in integration tests
  skipped; three additional flush regressions subsequently passed in the final
  40-test document-service run.
- Typecheck, lint (zero errors, 78 existing warnings), i18n (113 tests), route
  checks, and theme checks passed.

The browser tests used the dedicated development student2 and teacher accounts
and restored the student's original code. Initial setup failures were resolved:
prepared authentication needed a fresh application session, and WebKit needed
an editor-visible wait before reading Monaco. Chromium's same-socket assertion
tracks the socket carrying each sync attempt, allowing development's initial
Strict Mode socket lifecycle without allowing a reconnect to satisfy the test.

Database-outage/backoff tests use the real document service with simulated
storage and a fake clock. Browser tests use real development persistence and
controlled Socket.IO packet faults. This is not a long-duration production
outage or multi-instance certification. No deployment or migration was run.
Refresh monitoring clients when deploying protocol version 3.
