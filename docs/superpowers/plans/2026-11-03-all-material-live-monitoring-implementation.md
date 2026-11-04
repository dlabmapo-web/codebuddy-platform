# All-material monitoring implementation

Approved specification: `../specs/2026-11-03-all-material-live-monitoring-design.md`.

1. Add bounded observation contracts and material-neutral access/read projections.
   Keep programming write predicates unchanged. Extend watch leases to support
   a student observation without a programming draft.
2. Add an authorized student observation subscription with Redis snapshots,
   generation fencing, audit visits, renewal, revocation and reconnect snapshots.
   Keep the existing code collaboration attachment and pending-edit recovery.
3. Register PDF/video activity and publish manual answers, PDF position, video
   state and the actual Turtle drawing. Reuse the student's academy socket.
4. Compose a persistent monitoring shell with same-tab material viewers and a
   separate current-student location marker. Use read-only saved/live projections;
   retain the existing coding workspace for code collaboration.
5. Cover contracts, source/registration races, authorization, watch lifecycle and
   roster behavior with focused tests. Run shared/API/web checks.
6. Start disposable local PostgreSQL/Redis and the existing provider-double test
   harness. Exercise real student/staff sockets and UI in Chromium and WebKit,
   including direct non-code entry, answers, PDF, video, Turtle and coding recovery.
   Record actual results and remaining runtime limitations without claiming
   unexercised scenarios passed.

Implementation note: the persistent observation subscription and optional coding
attachment have independent lifetimes. A coding attachment may retain its own
existing transport to preserve its tested recovery behavior; changing a material
viewer must never replace the persistent student subscription.

Implementation is complete. Actual browser/unit results, reproduction commands
and remaining runtime coverage limits are recorded in
[local verification](../../research/2026-11-03-all-material-live-monitoring-verification.md).
No merge or deployment is included.
