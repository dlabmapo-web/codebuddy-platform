# Teacher Live Monitoring Production Repair Design

**Date:** 2026-08-05  
**Status:** Approved  
**Parent design:** `2026-08-04-teacher-live-monitoring-design.md`

## Purpose

This repair closes the realtime authorization, multi-instance consistency, and
recovery gaps found during implementation review without changing the approved
teacher or student experience.

## Architecture

### Active watch authority

Redis stores one active visit identifier per teacher membership. Opening a new
watch atomically replaces that identifier. The gateway ends the displaced visit,
notifies every socket in the teacher's private room, and removes those sockets
from the displaced draft room. A teacher command is accepted only when its visit
is still the active Redis visit and its database authorization claim is fresh.
Revocation clears the active visit before notifying clients, so a stale or
modified browser cannot continue editing after losing access.

Teacher socket state keeps a map of joined class claims instead of one class.
Leaving or revoking one class removes only that class room and preserves other
assigned classes.

### Collaboration consistency

Each API instance retains a bounded in-memory Yjs cache for low-latency editing.
Applied updates are published through a dedicated Redis channel and merged into
the same draft on every other API instance. Socket.IO continues to distribute
the update to browsers.

Persistence uses a PostgreSQL transaction-scoped advisory lock derived from the
draft identifier. Under the lock, the service reads the newest stored Yjs state,
merges it into the local document, and writes the readable draft snapshot, Yjs
state, hash, and monotonically increasing version in one transaction. This makes
concurrent flushes serialize and converge instead of overwriting one another.

Student startup awaits the ordinary draft save before requesting collaboration.
Both teacher and student perform the same bidirectional state-vector exchange,
so either client can repair updates missed during a restart or reconnect.

### Presence and revocation

The server derives each class presence entry only after verifying that the
reported course and material are reachable through that class. A student in
multiple classes may therefore be solving in one class and merely online in
another. Presence deltas include totals computed from the complete Redis class
snapshot.

Assignment replacement and enrollment removal revoke the affected class scope,
not every class belonging to that membership. Course assignment removal,
material visibility changes, class archival, membership status, user status,
and role changes all invoke the same scoped revocation service after their
database transactions commit.

Redis connection readiness lifts the degraded presence latch. Until readiness
returns, joins fail explicitly rather than falling back to process-local state.

### Delivery reliability

Acknowledged commands use bounded acknowledgement timeouts and retries. A logical
feedback send creates its idempotency key once and reuses it for every transport
retry. Awareness remains volatile and is never persisted or retried.

## Verification

Gateway integration tests cover multi-class joins, exact class leaves, watch
replacement across sockets, rejected stale document commands, and scoped
revocation. Collaboration tests use two service instances to prove Redis update
distribution and serialized PostgreSQL-style flush convergence. Existing unit,
schema, typecheck, lint, production build, and two-browser Playwright monitoring
tests remain required for completion.

## Compatibility

Public route structure and teacher/student UI remain unchanged. Existing event
payloads remain compatible except for server-owned watch identifiers carried in
acknowledged session state. The existing monitoring migration may be amended
before deployment because it has not yet been applied to the configured database.
