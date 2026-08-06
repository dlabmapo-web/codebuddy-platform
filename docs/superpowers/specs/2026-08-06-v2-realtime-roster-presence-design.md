# V2 Realtime Roster Presence

**Date:** 2026-08-06
**Status:** Approved for implementation

## Problem

When a teacher opens a class roster before a student opens an exercise, the
student can remain offline until the teacher refreshes. During navigation or a
reconnection, an older socket can also race a newer socket and overwrite its
presence with a reconnecting state.

Refreshing is not part of the contract. The roster must converge from socket
events regardless of which participant opens their page first.

## Design

The student publishes the current presence payload only while connected and
publishes it immediately on every Socket.IO `connect`, including reconnects.
The heartbeat remains a liveness refresh and visibility changes remain
immediate signals.

Disconnect handling becomes a generation-checked atomic Redis operation. The
operation reads the current value, verifies that it still belongs to the
departing socket generation, and writes the interruption under one Lua script.
If a newer generation already owns the row, the disconnect is a no-op and no
roster delta is broadcast.

The teacher continues to consume versioned deltas and requests an authoritative
snapshot when it detects a gap. A reconnecting entry carries its server-authored
expiry deadline, which schedules one snapshot when the recovery grace ends so
the row becomes offline without a refresh. No polling fallback is added.

## Verification

- Registry tests prove stale generations cannot interrupt a newer session.
- Gateway behavior emits no false transition for a stale disconnect.
- Deadline tests prove a reconnecting row schedules one authoritative refresh.
- A teacher-first Playwright flow opens the roster before the student exercise
  and observes the row-specific `Solving` plus `Open live` without a reload.
- The realtime flow runs in Chromium and WebKit to cover Chrome and Safari.
