# Production Native Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved versioned native grading path, fail-closed execution service, durable grading recovery, and authenticated end-to-end coverage, with native production activation disabled until acceptance passes.

**Architecture:** A runtime registry freezes descriptor-bound clients per attempt. A shared rootless broker owns both native and compatibility guests inside one resource bank; the existing judge remains the sole evaluator, comparator and grade writer. Existing queues/SSE remain, with durable dispatch/checkpoints and separate owner-authorized staff completion.

**Tech Stack:** Node 22 / TypeScript, Python 3.12, Zod, Prisma/PostgreSQL, BullMQ/Redis, rootless Docker/cgroup v2, Nest/oRPC, Next.js, Vitest, Node/Python tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-production-native-grading-design.md` (binding).

## Global Constraints

- Production selection stays disabled: `GRADING_NATIVE_ENABLED=false`; no production SSH mutations, deployment, workload pause, account changes, or historical regrading.
- Trusted worker: 768 MiB / 0.75 CPU. Execution family: 1,280 MiB / 1.5 CPUs, no swap, including broker/daemon/helpers/all guests. Combined: 2,048 MiB / 2.25 CPUs.
- Two active reservations across all engines/kinds, maximum one optional spare; background occupies at most one of two slots. Execution family PID cap 256, per guest 32, worker 256.
- Native pilot: certified standard-library revisions, 32–256 MiB, 100–60,000 ms, all shared source/stdin/output bounds. No unsafe container/process reuse or guest credential/answer/socket access.
- Freeze runtime identity before acceptance; preserve all historical decoders; after acceptance never silently switch engines. Grade/points correctness and cleanup precede speed.
- `native-cgroup-growth-v1` requires a broker-owned learner leaf assigned before interpreter initialization; READY baseline plus allowance is the kernel memory ceiling, supervisor in a sibling leaf, zero swap. No sampled-RSS fallback.
- Keep existing queues, evaluator/comparator, student SSE, class/tenant/owner checks. Native/Pyodide selection is role-independent for the same material/revision/context.
- New versioned policy v4; new staff snapshot v2; additive database migrations only. Historical image provenance must remain explicitly unrecorded.
- Do not infer acknowledged database commit time from `gradedAt`. Preserve existing slowest-case `runtimeMs` semantics.
- Read installed Next documentation before web changes. Never read/seed a database selected from production dotenv files in tests.
- Local ARM64 Docker Desktop is not Linux AMD64 production acceptance. Record unsupported rootless/cgroup checks as unavailable, never bypass them or relabel test doubles as production proof.

## File and interface map

New shared contracts live in `packages/shared/src/grading-runtime.ts` and are exported from the shared index. Production execution implementation lives in `packages/grading-runtime` (no API/database imports). API registry/client/recovery modules live beside the existing judge. New database fields/tables are defined in the Prisma schema and additive migration. Grading-specific deployment scripts do not change Turtle scripts or reuse its daemon. Isolated E2E harness owns uniquely labelled local PostgreSQL/Redis/auth fixtures and explicit loopback endpoints.

Interfaces use these names unless a documented spec-based review ruling changes them:

```ts
type RuntimeDescriptor = {
  version: 1; engine: 'pyodide' | 'cpython'; engineVersion: string;
  pythonVersion: string; platform: 'linux'; architecture: 'amd64' | 'arm64';
  imageDigest: string; packageManifestHash: string; shimVersion: string;
  memoryPolicy: 'pyodide-charged-growth-v1' | 'native-cgroup-growth-v1';
  executionPolicy: 'wall-v1';
};
type RuntimeSelectionContext = {
  organizationId: string; academyId: string; materialId: string;
  gradingRevision: number; context: 'live' | 'preview';
  memoryLimitMb: number; timeLimitMs: number;
};
// Descriptor schemas validate immutable sha256 digests and bounded fields.
// Registry: selectRuntime(context), resolveHistoricalRuntime(work), bindEngine(descriptor).
// Broker protocol: health/reserve/run/receipt/ack/release/cancel with fixed version,
// request IDs, generation, frozen descriptor and bounded messages.
// New optional ExecutionRequest context carries stable attempt/case/lease identity;
// legacy callers retain their existing behavior with no runtime manifest configured.
```

## Task 1: Versioned contracts, registry, and additive persistence

**Files:** Create `packages/shared/src/grading-runtime.ts`, shared runtime tests, `packages/api/src/judge/runtime-registry.ts` and tests, additive Prisma migration. Modify shared exports, `packages/api/prisma/schema.prisma`, `packages/api/src/config/env.schema.ts`, `grading-profile.ts`, `practice-snapshot.ts`, `sample-check.store.ts` and relevant decoder tests.

**Consumes:** Existing v1/v2/v3 policy and v1 staff schemas and execution result types.

**Produces:** Runtime descriptor/manifest/certification/protocol schemas and types; runtime registry with strict selection, historical resolution and per-attempt binding interfaces; nullable `Submission.executionRuntimeSnapshot` and execution lease token; staff lease token; dispatch-intent and private per-case checkpoint tables with uniqueness/indexes. New fields are optional/null for historical data. Env supports disabled native activation and immutable manifest path.

- [x] Add meaningful decoder/selection tests before implementation. Core assertions:
  ```ts
  expect(selectRuntime({enabled:false, manifest, context})).toEqual(manifest.compatibility);
  expect(selectRuntime({enabled:true, manifest, context: {...context, gradingRevision:2}})).toEqual(manifest.compatibility);
  expect(() => runtimeDescriptorSchema.parse({...native, imageDigest:'latest'})).toThrow();
  ```
  Use complete typed fixture descriptors in test helpers. Test cross-organization UUID/context mismatch, duplicate certification, native unsupported budgets, unknown historical versions, and v4 comparator identity independent of execution.
- [x] Run focused shared/API tests and retain the expected initial failure evidence.
- [x] Implement strict schemas, immutable validated manifest loading, selection and provenance handling; preserve original policy behavior with native off. Update snapshot/profile consumers enough to keep current builds valid. Define real database relations, generation/checkpoint keys and bounded dispatch indexes; generate Prisma client.
- [x] Run shared build, focused decoder/registry tests, API/judge-worker typechecks and Prisma schema validation. No production migrations.
- [x] Commit the task and write the scoped report with test commands/results and exact interfaces for later tasks.

## Task 2: Production execution broker, guests, and kernel resource enforcement

**Files:** Create `packages/grading-runtime/{package.json,src/*,guest/*,test/*,README.md}` and broker/guest Dockerfiles; modify pnpm lock only for actual workspace dependencies. Implement focused modules for protocol, verified manifest loading, resource bank, lifecycle/receipts, driver, cgroup inspection, Unix server and startup. Add minimal native and compatibility guest launchers and reviewed seccomp profile.

**Consumes:** Shared descriptor/manifest/protocol contracts from Task 1; existing Pyodide runner semantics and `ExecutionRequest`/result wire limits.

**Produces:** Buildable production broker and immutable guest artifacts. Trusted `BrokerClient` protocol supports health, whole-job reservation, per-case execution, fenced receipt retrieval/ack, release and cancellation. Driver verifies rootless/systemd/cgroup v2 and parent membership before accepting code. Compatibility guests use the real pinned Pyodide runner artifacts; no duplicate grading/comparator implementation.

- [x] Add resource/lifecycle tests with a deterministic driver that records allocations and cleanup. Test:
  ```ts
  const a = await bank.reserve({bytes:512*MiB, pids:32});
  expect(await bank.tryReserve({bytes:900*MiB,pids:32})).toBeNull();
  await expect(pool.run(requestWithForgedRuntime)).rejects.toThrow();
  expect(pool.census().quarantined).toBe(1); // after unconfirmed removal
  ```
  Test FIFO/large-request fairness, background reservation, cancellation/create/removal races, stale generations, restart reconciliation, immutable image restrictions, bounded frames/output and receipts, partial UTF-8, and single-use state transitions.
- [x] Implement protocol/client/server and allocator/receipt journal before wiring real container execution. Native refuses READY without a verified learner leaf; compatibility preserves baseline memory/runtime semantics. No test-only bypass in production startup.
- [x] Implement fixed-argument rootless driver and guest launch handshake: assign launcher to learner leaf before CPython initialization, check baseline and limits, then release source. The supervisor/daemon socket never reaches learner FDs/mounts. Confirm exit/drain/all descendants/removal before replying. Use immutable owned IDs for cleanup.
- [x] Run Node/Python unit and protocol integration tests. Run local real-container tests where supported; explicitly test fail-closed behavior for this host's unsupported rootless parent. Never claim rootful or fake-driver tests prove rootless containment.
- [x] Build guest/broker artifacts, run source/import checks, document exact commands and capability results, commit and report.

## Task 3: Admission, durable dispatch, descriptor-bound evaluation and recovery

**Files:** Modify `submission.service.ts`, `staff-practice.service.ts`, `sample-check.service.ts` (actual located service), regrade admission, `judge.queue.ts`, `judge.main.ts`, `grading.service.ts`, `practice.runner.ts`, `sample-check.runner.ts`, `case-evaluator.ts`, `execution-capacity.ts`, `execution-engine.ts`, `sandbox-engine.ts`. Create runtime client/router, dispatch-intent service, fenced checkpoint/recovery modules and targeted tests. Add a second additive Prisma migration for immutable private execution-lease history required to retain original worker/broker/reservation context across recovery.

**Consumes:** Task 1 registry/persistence types and Task 2 broker protocol. Existing public RPC result schemas stay compatible.

**Produces:** Frozen descriptors on all newly accepted executable work; one registry and role-independent policy; outbox insertion inside attempt transaction; idempotent queue dispatch/sweeping; actual broker job leases across both engines/workload kinds; per-job immutable engine adapter; fenced claims/checkpoints and finalization with no duplicate execution/award. `GradingExecutionLease` stores its owner, generation/token, worker generation, original broker generation, reservation ID, runtime/budget and lifecycle state; changing an attempt’s active generation must not erase an older lease context needed to retrieve/ack its receipt. Sample lease context stays in its private Redis record, preserving ephemeral semantics.

- [x] Add admission tests verifying transaction boundaries and frozen identity:
  ```ts
  expect(created.executionRuntimeSnapshot.engine).toBe('cpython');
  expect(dispatchIntent.attemptId).toBe(created.id);
  await dispatcher.flush(); await dispatcher.flush();
  expect(enqueuedJobIds).toEqual([created.id]);
  ```
  Also cover queue outage after commit, retry after uncertain acknowledgement, stale worker fence, crash after removal/before case checkpoint and after checkpoint/before final commit, old snapshot routing and disabled manifest behavior.
- [x] Wire selection consistently into student/practice/sample/regrade snapshots; retain complete original policies and comparator identity. Resolve old work without invented image provenance. Native readiness/catalog errors cannot silently relabel accepted work.
- [x] Persist immutable claim/lease context before source release; persist the broker reservation ID before calling run. A crash between reserve and its DB acknowledgement must be recoverable through idempotent reserve using the stored original context. Derive stable case IDs from frozen case positions, not a run-call counter that resets after recovery.
- [x] Integrate descriptor-bound engine contexts into the existing evaluator; never mutate a global `.version` across concurrent jobs. Claim only with the owned reservation/fence. Acknowledge receipts only after private case checkpoint durability; final transaction consumes checkpoints and preserves points atomicity.
- [x] Integrate durable dispatch and recovery in normal worker lifecycle, with bounded batches and idempotent job IDs. Preserve separate queues/background priorities and check broker generation before execution/commit. Post-commit events only.
- [x] Run targeted submission/practice/sample/regrade/points/queue tests, migration-backed integration with fresh local PostgreSQL/Redis, and API/worker typechecks. Commit and report real commands and limitations.

## Task 4: Owner-scoped practice completion and frontend recovery

**Files:** Add practice stream controller/authorization tests and web BFF route beside the existing student stream; modify `use-practice-submission.ts`, shared recovery adapter only where useful, frontend result-race tests, API module registration. Existing student SSE behavior remains.

**Consumes:** Committed practice events, existing ownership checks and bounded public result schema; no broker access from browsers.

**Produces:** Owner-authorized practice SSE completion with current polling retained as fallback, narrow result reads, no broad course refresh before verdict.

- [x] Read `packages/web/AGENTS.md` and installed Next route-handler docs before web edits. Add tests for another user's/academy's attempt, revoked membership, completed-before-connect, reconnect, stale results and failed stream recovery.
- [x] Implement scoped controller/BFF and frontend EventSource lifecycle with cleanup and bounded fallback. Filter payloads through public schemas; never stream hidden expectations or internal leases.
- [x] Verify student SSE tests still pass and practice completion does not open student monitoring or change points.
- [x] Run API/web targeted tests and web/API typechecks. Commit and report.

## Task 5: Rootless deployment, manifest verification and disabled activation

**Files:** Add `deploy/scripts/setup-grading-rootless.sh`, grading manifest/envelope/preflight/release/drain/rollback utilities and tests, optional grading compose override, runtime build/CI image registration, operations guide. Modify base env validation only as needed, with disabled defaults and current production sandbox unchanged by ordinary deployment.

**Consumes:** Runtime package/artifacts, immutable manifest, new worker handshake and schema versions.

**Produces:** Operator-reviewable rootless user-service setup; family cgroup membership and effective CPU/memory/PID/swap attestation; explicit budget handover and image retention; activation refused without compatibility/certification/Linux acceptance proof; forward-compatible rollback for already accepted native and v4 Pyodide work.

- [x] Add tests that missing CPU delegation, wrong daemon, unrelated cgroup, image mismatch, unsigned/stale proof, mismatched concurrency and over-budget overlap all reject activation:
  ```python
  with self.assertRaises(ValueError):
      verify_activation({**valid, 'nativeAcceptancePassed': False})
  ```
  Valid fixtures must check actual manifest hashes/generation rather than a caller-supplied success boolean alone.
- [x] Implement scoped fixed-service installers/verifiers; no daemon sharing with Turtle, no global cleanup/prune, no app or production credentials in broker release. Preserve effective existing settings unless the explicit grading override is selected.
- [x] Provide normal install/verify/drain/rollback commands; disable only new native selection on rollback and retain compatible readers/images for queued/recoverable work. No irreversible schema rollback.
- [x] Run Python/shell checks, compose config validation without printing secrets, manifest/guard tests, build/typecheck checks, commit and report.

## Task 6: Isolated end-to-end testing, Linux acceptance harness and final report

**Files:** Add `packages/api/scripts/test-native-grading-isolated.*`, dedicated fixture seed/server modules, `e2e/native-grading.playwright.config.ts`, `e2e/specs/native-grading.spec.ts`, rootless Linux CI/benchmark entrypoint, and `docs/research/2026-10-29-production-native-grading-verification.md`. Keep all credentials synthetic and test endpoints loopback-only.

**Consumes:** Tasks 1–5. Use actual API, queue, evaluator/comparator, PostgreSQL/Redis persistence and browser result delivery for positive complete-flow tests; isolate authentication using the existing explicitly local provider fixture pattern.

**Produces:** Repeatable browser E2E tests for staff/student Submit, correct/wrong/runtime/limit outcomes, first/repeat points, disconnect/refresh recovery, staff ownership and grade isolation, frozen engine/revision and fail-closed unsupported native activation. Production rootless positive/containment and 100-run AMD64 performance cohorts have a separate capability-gated entrypoint with a truthful executed/not-executed report.

- [ ] Boot unique disposable PostgreSQL/Redis fixtures with explicit loopback URLs, minimal migration scaffolding, and scoped cleanup traps; refuse remote DB/production endpoints before any seed/migrate. Test bridge owns synthetic auth identities only. No production dotenv selection.
- [ ] Add Playwright assertions against visible results and acknowledged persisted records:
  ```ts
  await page.getByRole('button', {name:'Submit', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Everything passed'})).toBeVisible();
  await expect(page.getByText('10 / 10', {exact:true})).toBeVisible();
  expect(await fixture.countPointAwards()).toBe(1);
  ```
  Test native only through the real verified broker when the environment supports it. Use deterministic drivers for contract tests only and label them accordingly. Unsupported rootless native activation must fail closed, while the existing disabled/default path remains usable.
- [ ] Run local browser E2E and available real-container checks. Retain reports/traces/screenshots of failures, fix actual regressions, then rerun covering tests. Run core shared/API/worker/web typechecks and appropriate grading regressions.
- [ ] Provide Linux AMD64 rootless CI/harness commands for paired 100-submission 1/5/10 cohorts, first/repeat points, two-in-flight/ten-client burst and mixed load, collecting all failed outcomes and post-commit/browser boundaries. Do not execute on production or purchase/provision a server implicitly.
- [ ] Write the verification report distinguishing executed local tests, test doubles, capability failures, unexecuted AMD64 acceptance, remaining certification coverage and disabled activation. Do not claim five-second production acceptance without the specified evidence. Commit and report.

## Final integration review

- [ ] Generate one full implementation-range review package; perform code-review skill's security/performance/correctness review with fresh reviewer context.
- [ ] Address critical/important findings in one scoped fix wave and rerun covering tests; record any adjudicated residual risks.
- [ ] Verify a clean committed branch and preserve commands/results/evidence in tracked documentation. No push, merge to v2, or deployment is included in this implementation request.

## Environment facts recorded before implementation

- Source base: `29fa6a0d`; feature branch: `feat/production-native-grading`.
- Isolated worktree: `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`.
- Docker Desktop reports Linux aarch64, cgroup v2/cgroupfs, about 4.1 GB memory. This does not satisfy the production rootless/systemd AMD64 attestation.
- Existing unrelated local containers are not stopped or repurposed by this plan.
