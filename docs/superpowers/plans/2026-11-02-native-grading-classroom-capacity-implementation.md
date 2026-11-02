# Native Grading Classroom Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved isolated native grading path, runtime-specific queues, and reproducible local/Linux verification without resuming the cancelled rootless Docker implementation.

**Architecture:** A pinned NsJail launcher starts a fresh isolated CPython process for every case. A bounded Unix-socket execution service implements the existing execution interface; runtime snapshots and distinct queues keep historical Pyodide work on its original engine. Existing evaluators, comparators and atomic grade/progress/points commits remain authoritative.

**Tech Stack:** Node 22/TypeScript, Python 3.12, NsJail, Linux cgroup v2, Prisma/PostgreSQL, BullMQ/Redis, Nest/oRPC, Next.js, Node/Python/Vitest/Playwright tests.

**Spec:** `docs/superpowers/specs/2026-11-01-native-grading-classroom-capacity-design.md`.

## Global Constraints

- Implementation is authorized by the user's 2026-11-02 request. Production mutation, workload pauses, deployment, purchases and 200-client production tests are excluded.
- Work in the requested existing branch `feat/native-grading-classroom-capacity`; preserve unrelated worktrees. Do not revive cancelled images, deployment helpers, rootless attestors or signed-refresh machinery.
- The old implementation is available through `git show 204a3569:<path>`. Reuse reviewed descriptor semantics, appropriate application code and tests selectively; do not import the old single-host epoch coordinator or Docker lifecycle.
- Native learner execution uses fresh NsJail processes, never bare Python or a reused interpreter. Failure to prove required isolation prevents readiness. No credentials, expected answers or daemon sockets enter a learner jail.
- Preserve source/stdin/stdout/stderr limits, comparator semantics, error distinctions, historical snapshot decoding, tenant authorization and atomic grade/progress/points.
- The native classroom profile supports authored memory through 512 MiB and ten sequential STDIO cases. Existing higher-limit work stays on its recorded compatible runtime; no silent limit reduction.
- Read installed Next documentation before web changes. Use only private synthetic fixtures and explicit isolated DB/Redis in integration tests.
- The all-200-within-five-seconds target remains a measured release gate. Local ARM64 Docker Desktop (8 vCPU, approximately 4 GiB) is not production AMD64 fleet acceptance. Report unsupported controls and incomplete gates honestly.
- Each implementer works alone, does not spawn agents, writes a report, commits only its task files, and preserves failed verification evidence.

### Task 1: Native runtime contract, bounded launcher and Unix execution service

**Files:** Create `packages/grading-runtime/{package.json,tsconfig.json,src/*,test/*,guest/*,README.md}` and `packages/shared/src/native-grading.ts`; modify `packages/shared/src/index.ts` and lockfile only if needed. Keep modules focused: contract/configuration, resource bank, NsJail process lifecycle, protocol/socket server and client.

**Interfaces:** Produce exported native descriptor/manifest schemas with stable full identity; a manifest identifies exact Python version, architecture, rootfs/image digest, sandbox policy and comparator identity, node resource envelope and academy/material/revision/context eligibility. Produce `NativeExecutionClient` with `readonly version`, `run(request)`, `dispose()` and `health()`. `run` consumes the existing shape `{code,stdin,inputPromptPolicy?,timeLimitMs,memoryLimitMb,outputLimitBytes?,signal?}` and returns `{stdout,stderr,outcome,runtimeMs,outputTruncated?}`. Produce a launcher service that binds a private Unix socket with bounded request frames and per-request immutable identity. The API's Task 2 depends only on these public contracts.

- [x] **Step 1: Contract and resource behavior tests.** Write real schema/resource scheduling tests: mismatched descriptor rejected; memory above certified allowance refused; all active/draining allocations count; official/background capacity reserved; output capped in UTF-8 bytes; no release before cleanup. Reuse useful old descriptor identity semantics, not its fixed two-slot/256-MiB assumptions.

```ts
assert.throws(() => nativeRuntimeDescriptorSchema.parse({ engine: 'pyodide' }));
// Test the public resource-bank API with a held allocation: a second request
// cannot acquire memory still owned by a draining first case.
```

- [x] **Step 2: Implement the descriptor, private socket protocol, client and scheduler.** Use strict Zod validation, bounded framing before JSON parsing, Unix socket permissions, descriptor identity checks and server deadlines. Every response is correlated to its request. A disconnect or cancellation cancels owned execution and waits for cleanup. Reject invalid/mismatched ready responses; no health success from a boolean supplied by student output. Native profile readiness and startup configuration are immutable for the service generation. Reserve both CPU and memory before starting a case, count cleanup uncertainty, and quarantine unhealthy service capacity.

```ts
export interface NativeExecutionClient {
  readonly version: string;
  health(): Promise<NativeHealth>;
  run(request: NativeExecutionRequest): Promise<NativeExecutionResult>;
  dispose(): Promise<void>;
}
```

- [x] **Step 3: Implement fresh NsJail/CPython execution.** Pin the NsJail source revision and rootfs inputs in build files/manifest. Construct argv without a shell from trusted policy only. Private namespace/read-only root/bounded scratch, non-root UID, minimal environment, no-new-privileges, seccomp and kernel cgroup memory/PID/CPU controls are mandatory. Keep stdin/source separate from trusted control, preserve prompt policy, bound both pipes, classify successful/nonzero exits and resource limits accurately. Parent/jail setup failures are infrastructure faults. Source cannot choose a mount, environment variable, executable, cgroup or socket. Kill/reap descendants and verify empty cgroup before returning capacity. Readiness must check actual native kernel controls and exact runtime identity, not merely binary existence. Pure process parsing tests do not certify containment.

- [x] **Step 4: Verify and report.** Run `pnpm --filter @cove/shared build`, runtime typecheck and meaningful Node/Python contracts. Exercise real Unix sockets, fragmented/oversized frames, deadline/disconnect/cleanup and malicious control output. Attempt the bounded actual Linux launcher smoke in an isolated local fixture; retain an explicit unsupported result if Docker lacks required delegated controls. Add executable smoke coverage for Unicode/prompts, filesystem/env/network access, child/PID cleanup, memory/wall/output limits and concurrent isolation. Record immutable build inputs, actual commands, counts and failures in the task report. Commit the task.

### Task 2: Native admission, snapshot routing, queues and full grading integration

**Files:** Modify `packages/api/src/{config/env.schema.ts,judge/*,learn/*,platform/regrade.service.ts}`, `packages/api/prisma/{schema.prisma,migrations/*}`, `packages/shared/src/content/*`, `packages/judge-worker/package.json` and affected web submission paths only as required. Add targeted API/integration tests. Consume Task 1's actual exported contracts rather than duplicating them.

**Interfaces:** Admission freezes an optional explicit native runtime descriptor on new eligible work; null/old snapshots retain Pyodide decoding. `JudgeQueue` exposes distinct native official/practice/sample/regrade queue handles while preserving default constructor behavior and old queue names. Native queue names include the frozen descriptor fingerprint, so retained workers for an earlier release cannot consume a newer incompatible release. Execution worker family is explicit. Result events and recovery dispatch resolve the persisted family, never the current default flag.

- [x] **Step 1: Reuse application behavior selectively.** Inspect the old registry, admission, snapshot, submission-stream and isolated fixture code with `git show`. Adapt useful code instead of recreating it. Do not restore rootless Docker deployment or global admission epochs. Document each reused source in the report. Read installed Next route/history documentation before any web edit.
- [x] **Step 2: Freeze and route runtime selection.** Add nullable descriptor storage with additive migrations for official and appropriate practice/sample snapshots; preserve historical provenance. Native selection requires explicit disabled-by-default configuration, academy/material/revision/context eligibility, frozen limits and verified launcher readiness. Keep per-request authorization and existing class context. Native and Pyodide official/practice/sample/regrade queues have separate names; old consumers cannot claim native jobs. A queued native job must never silently switch engine. Persist dispatch intent or otherwise prove recovery after a lost enqueue acknowledgement using immutable routing. Do not enqueue the same action twice on browser reconnect.

```ts
// Concrete integration assertions: a historical submission with no native
// descriptor is enqueued on cove-grading; a certified native submission uses
// cove-grading-native-v1, retaining the frozen descriptor after a flag change.
expect(legacyQueue).toBe('cove-grading');
expect(nativeQueue).toMatch(/^cove-grading-native-v1-[a-f0-9]{64}$/);
```

- [x] **Step 3: Wire worker, comparator, persistence, recovery and feedback.** Reuse the existing evaluator and atomic finalize transaction. Construct a descriptor-bound native client for each job without mutating a shared engine. Production worker configuration selects exactly one runtime queue family. Maintain node-wide background reservation and comparator bounds, explicit DB pool limits and memory admission. Runtime mismatch/launcher loss is infrastructure error, not student wrong answer. Extend sweepers, regrade dispatch, SSE and staff practice recovery to persisted family. Observe terminal results only after commit; reconnect reads authorized persisted state. Preserve first/repeat solve points and hidden-case redaction.
- [x] **Step 4: Verify with real application fixtures.** Run focused API tests, shared/API/worker/web typechecks and required Next checks. Exercise isolated PostgreSQL/Redis/BullMQ/Unix launcher integration for first and repeat solves, weighted/hidden cases, two actors/classes, buffered/disconnected streams, stopped workers, stale revision, descriptor mismatch, old/new queues and changed default. Deterministic launcher doubles may test routing and persistence but must be labeled as such and cannot count as native containment/performance. Commit the task and record exact tests and remaining actual-Linux gates.

### Task 3: Reproducible node packaging, safe qualification and performance harness

**Files:** Create `deploy/docker/native-grading.Dockerfile`, isolated node/fixture Compose configuration, bounded launch/preflight scripts, a branch-scoped native verification workflow, `packages/api/scripts/benchmark-native-classroom.mjs` with tests, and `docs/research/2026-11-02-native-grading-classroom-implementation.md`. Modify package scripts and docs needed to run them. Reuse old fixture isolation/cleanup patterns and baseline benchmark where compatible.

**Interfaces:** Node configuration consumes Task 1 manifest/resource envelope and Task 2 explicit native queue family. Benchmark consumes only explicit isolated synthetic fixture connections and emits machine-readable per-submission outcomes, timings, queue/execution/commit/display boundaries where exercised, resource settings and failures. Readiness must precede every timed cohort.

- [x] **Step 1: Package a private execution node.** Pin build inputs, keep learner rootfs credential-free, limit privileged launcher access and writable mounts, and enforce aggregate CPU/memory/PID budgets with at least 20% RAM/1-GiB OS headroom. Provide explicit native/Pyodide worker-family configuration and capacity classes through 512 MiB; no public execution port or Docker socket. Missing delegation/security protection stops startup. Add deployment validation for manifest mismatch, unsafe mount/network, insufficient memory and unexpected queue family. Production defaults remain unchanged.
- [x] **Step 2: Build safe actual-Linux qualification.** Reuse the earlier disposable Linux CI approach without importing its rootless attestor. Restrict the workflow to this feature branch or explicit dispatch; no deployment secrets or production connection discovery. Build and run actual NsJail/kernel cases, private DB/Redis full integration, and guaranteed fixture-only cleanup. The fixture refuses remote Docker/DB/Redis and production dotenv. Unsupported kernel capability is a visible failed/unexecuted native gate, not a successful mocked acceptance. Avoid privileged catch-all containers or weakening a learner boundary to make CI green.
- [x] **Step 3: Implement bounded burst measurement.** Support cohorts 1/2/4/5/10/20/50/100/200 with 1/5/10 cases and explicit maximum duration. Preserve failures in denominators; all-200 under five seconds is a max-latency assertion, not p95. Use distinct students and record source/runtime digests, actual node resources, prewarm and replenishment separately. A safe default starts with two clients and needs explicit isolated-fixture authorization for larger cohorts. Report application-level versus engine-only timing honestly; browser display requires actual browser observation, not a DB timestamp. Provide finite generator resource/concurrency bounds and refuse production destinations. Test argument validation, fixture ownership and failed outcomes.
- [x] **Step 4: Verify integrated deliverables and record evidence.** Run meaningful focused suites and typechecks, build the native image, and attempt local 1/2/4 actual execution and full application checks within the local VM budget. Inspect every result and fix defects. Record Linux unsupported outcomes, architecture and missing external fleet resources explicitly. Document how an operator later performs an agreed VPS maintenance test and restores original images/queue pause states using an independent watchdog. Do not run it now. Record code-complete versus unpassed release gates separately, including the actual 200-client fleet test. Commit the final task.

## Final review and branch state

Review the entire implementation against the approved spec and the recovery lessons from `204a3569`. Fix material defects, run appropriate regression/type/deployment checks once on the final code, preserve evidence and keep the requested feature branch. Do not merge, push, deploy, or represent unexecuted production/fleet gates as passed.

## Completion evidence

All three source tasks and their scoped review fixes are committed. The requested feature branch is retained. See [implementation evidence](../../research/2026-11-02-native-grading-classroom-implementation.md) for passing checks and unpassed Linux/browser/fleet release gates. Checked verification steps include the documented unsupported local kernel attempt; they do not certify native containment or the 200-student target.

Whole-branch review and the scoped crash-gate fix re-review are approved at `744a2855`. Final runtime suite:35/35 passed. Native production admission and all external release gates retain their documented status.
