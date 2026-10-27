# Local native-grading prototype implementation

Source: [approved design](../specs/2026-10-27-native-grading-prototype-design.md).
Authorization: user approved the local-only prototype on 2026-10-27. No
production configuration, grading identity, pause or deployment is authorized.

1. Record actual baseline Python/Node/image/architecture. Pin a matching native
   CPython guest image and a trusted fixture-controller image by immutable IDs.
2. Implement a single-use native guest with a trusted root supervisor and a
   non-root, empty-environment learner. Separate trusted control/result pipes
   from student stdout/stderr, bound input/output/resources, and verify isolation
   before accepting source. All descendants die before guest removal completes.
3. Implement a bounded two-active/one-unused-spare pool. Count uncertain creates,
   failed and draining guests until confirmed cleanup. Cancellation/shutdown
   remove only owned immutable container IDs and stop refill. Never reuse a guest.
4. Run synthetic correctness/isolation tests before timing: prompt/Unicode/errors,
   files/network/sockets, process/descendant/PID limits, output/memory/time limits,
   cancellation, cleanup failure and cross-guest isolation. Record unsupported
   semantics and stop if containment or correctness cannot be established.
5. Alternate local baseline/native diagnostic cohorts for one/five/ten sequential
   cases and two simultaneous submissions. Include pool depletion and cleanup,
   resource peaks/throttling and current comparator where compatible. Preserve
   failures; do not call small samples p95 acceptance or VPS measurements.
6. Record whether queue/commit fixture compatibility can be exercised without
   falsely labeling native execution as Pyodide. If not, retain that gate for
   the separate runtime-contract design rather than weakening validation.
7. Review implementation, tests and sanitized results. Keep production unchanged
   and document whether a full runtime design is justified or the prototype
   should be rejected. Original 100-submission latency/capacity gates remain
   mandatory before any production recommendation.
