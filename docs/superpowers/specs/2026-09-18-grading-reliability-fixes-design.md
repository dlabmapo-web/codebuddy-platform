# Grading reliability fixes

Approved scope: the user requested this spec followed by implementation of the fixes discussed on 2026-09-18. The target is correct grading, not complete Elice equivalence.

## Decisions

Keep the existing process-isolated Pyodide judge and weighted scoring. Replacing the runtime with native Python would expand deployment/security scope; merely raising all timeouts would hide the boundary problems. No database migration, source exercise changes, deployment, or unrelated UI changes.

### Python script execution

Compile submissions as ordinary `main.py` scripts with top-level await disabled. Catch only genuine SystemExit around script execution, using captured builtin references, and accept None or integer zero. Other exit codes and exceptions fail. Continue to use process exit and OS output pipes as the verdict/output boundary; never parse a student-controlled exception message to determine success. Preserve output printed before a successful exit, and verify rebound builtins and lookalike exceptions cannot suppress a crash. Resource fixtures must use ordinary synchronous Python rather than top-level await.

### Execution budget and infrastructure deadline

The authored whole-run time is the cumulative student execution budget. Each case receives the smaller of its own limit and the remaining student budget. Exhaustion produces TIME_LIMIT, consumes an attempt through normal finalization, and leaves subsequent unrun cases worth zero. Grading and termination overhead have a separate bounded five-second allowance beyond the authored budget. Waiting for unavailable engines/comparators or reporting beyond that absolute deadline remains an aborted infrastructure run, with no student penalty. Public sample checks use the same case evaluator and overhead policy. Engine reported runtime is charged up to the case's allocated budget, so cleanup cannot consume extra student time.

### Comparator reliability

Literal contains/not-contains rules are bounded string operations and do not need a Python worker or regex deadline; compare them directly, respecting the absolute deadline. Preserve Python exact-output normalization and regex behavior in the worker. Warm the callable before readiness, invoke it synchronously without the async Python event-loop wrapper, and start the comparison budget when the worker acknowledges starting rather than while the message waits to be dispatched. A separate bounded dispatch watchdog treats unavailable workers as infrastructure errors. Keep hard termination for pathological regex and do not retry a costly regex silently.

### Memory contract

Document the existing exercise memory metric accurately: sampled resident-set growth above a fresh idle interpreter, in MiB, every 100 ms; it is not Python allocated bytes or an exact transient-peak ceiling. The sandbox container's cgroup cap is an additional whole-container limit. Fail closed if the initial baseline cannot be measured; reject malformed/zero RSS samples rather than treating them as zero usage. Test actual resident allocations on Linux with production sandbox isolation settings, alongside small successful programs and recovery after a memory kill. Do not claim byte-for-byte Elice memory equivalence or production-host certification from local Docker tests.

## Verification

Regression tests: SystemExit None/0/nonzero/string, forged exception names/rebound builtins, normal exceptions, output preservation, top-level await rejection; equal case/total timeout as a graded failure and attempt consumption; cumulative budget exhaustion/remaining skipped cases; infrastructure deadlines still abort; repeated literal comparisons and regex worker timeout/recovery; baseline measurement failures. Run affected judge, submission and sample-check suites, API/shared/worker typechecks, and a Linux sandbox smoke test. Replay the confirmed sys.exit(0), await and timeout probes locally. Record every unverified deployment check separately.

## Implementation and verification — 2026-09-18

Implemented in the judge runner, shared case evaluator, official grading, sample checks, comparator pool/thread, and RSS measurement. No database migration is required for these fixes.

- Judge suites: 218 passed, 31 integration tests skipped (their external-service prerequisites were not enabled). The added equal-budget sample timeout regression also passed; final unique total including submission suites is 246 passed, 31 skipped.
- Submission service/controller: 27 passed. Final sample runner suite: 16 passed.
- API, shared, and judge-worker TypeScript checks passed. Production judge Docker image built successfully.
- Isolated Linux Docker sandbox, with network disabled, read-only filesystem, distinct runner UIDs, 1.5 CPUs and 1280 MiB container cap: eight probes passed. Ordinary output and successful exit worked; top-level await failed; a one-second execution budget produced TIME_LIMIT; three separate resident allocation probes produced MEMORY_LIMIT at a 128 MiB exercise limit; a subsequent ordinary program passed. Sandbox health reported isolation verified.
- Real local SubmissionService/Redis/judge replay: successful exit scored 100; top-level await scored 0; five stderr-plus-correct-stdout repetitions scored 100; a 61-second sleep against a 60-second case/whole-run budget finished FAILED, score 0, TIME_LIMIT. These match the previously observed Elice outcomes. Evidence: `/tmp/elice-parity-extended/reliability-results.json`.

### Release handoff

The requested correctness fixes passed scoped local verification. This is not a full release certification: run the complete CI sequence in `docs/operations/deployment-guide.local.md` section 6, step 3, before merging/tagging. Stop the web development server before a production web build, as that guide requires. Rebuild/release both judge-worker and sandbox from this source, then verify an ordinary pass, wrong output, timeout, memory limit and recovery on the deployment host. No deployment was performed.

The memory contract remains sampled resident growth, not allocated bytes or an exact peak ceiling. Linux smoke results do not prove identical memory accounting to Elice. Python package/version differences remain intentional runtime differences. The earlier intermittent memory fixture failure cannot retrospectively be assigned a proven root cause; the fixture now holds nonuniform allocations for sampling, invalid baselines fail closed, and both the complete local suite and repeated Linux probes pass.
