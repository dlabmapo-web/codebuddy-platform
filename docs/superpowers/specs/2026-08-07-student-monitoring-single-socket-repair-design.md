# Student Monitoring Single-Socket Repair

## Problem

The academy-level presence refactor introduced a persistent student Socket.IO
connection in `StudentPresenceProvider`. The exercise collaboration hook still
creates a second connection. The API joins only the connection that publishes
presence to the student's private room, while watch, document, pointer, cursor,
terminal, and feedback listeners are attached to the exercise connection.
Consequently, `watch.started` reaches the layout connection and is ignored; the
exercise never initializes collaboration.

## Decision

`StudentPresenceProvider` will own the single authenticated monitoring socket
for a student while they remain inside an academy. Its context will expose the
socket, connection state, and state reporter alongside the existing presence
operations. `useStudentMonitoring` will consume those values instead of calling
`useMonitoringSocket` itself. Student feedback will continue to receive the
socket from `useStudentMonitoring`, so all student-side realtime behavior shares
the same authenticated connection and room membership.

The context's safe fallback remains non-throwing for non-student rendering, but
it will expose a null socket and a connecting state. This preserves the current
failure mode for pages rendered before role resolution without creating an
unauthorized or duplicate connection.

## Lifecycle and Data Flow

1. The academy layout mounts `StudentPresenceProvider` for an active student.
2. The provider opens one monitoring socket and publishes presence after it
   connects. The API resolves the membership and joins that socket to the
   student's private room.
3. The exercise mounts without replacing the provider. It records the open
   material through the context and attaches collaboration listeners to the
   provider-owned socket.
4. A teacher starts a watch. The API emits `watch.started` to the student's
   private room, and the same socket now has the exercise listener attached.
5. The student synchronizes the document, after which code, pointer, cursor,
   terminal, indicator, and feedback events use that connection.
6. Navigating away unmounts only exercise listeners and clears the open
   material. The provider and presence connection remain alive until the
   student leaves the academy.

Awareness updates carry a connection-local monotonic sequence. Authorization
checks are asynchronous and may complete in a different order from arrival, so
the gateway records the latest sequence per socket and discards an older
completion. This guarantees that a delayed pointer or caret packet cannot
overwrite the peer's newer position. A reliable lifecycle clear participates
in the same ordering. If a transport reconnects after the gateway has cleared
its awareness, the client reliably re-announces its last meaningful pointer
and caret so the peer converges without waiting for another movement.

## Alternatives Rejected

- Adding a separate student-room join command to the exercise socket would
  preserve two connections and require another authorization and lifecycle
  path.
- Broadcasting watch events to every socket belonging to an identity would
  widen server state and delivery scope while retaining duplicate client
  connections.

## Error Handling

Connection state continues to be derived by `useMonitoringSocket`. Consumers
receive the provider's state and reporter, so reconnect, degraded service, and
revocation transitions remain consistent across presence and collaboration.
The null-socket fallback leaves monitoring inactive without breaking coursework.

## Verification

- Type-check the shared, API, and web packages.
- Run focused API and web monitoring unit tests.
- Verify that the gateway rejects an awareness update whose sequence is older
  than the last accepted update on that connection.
- Run the Chromium two-browser monitoring suite, including the watch indicator,
  bidirectional code edits, pointer movement, and caret synchronization.
- Run the WebKit monitoring project to retain the browser-specific pointer and
  caret coverage.
