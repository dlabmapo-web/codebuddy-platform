# Task 1 report — versioned contracts, registry, additive persistence

Status: implemented on `feat/production-native-grading` from `98fafe73`. No admission, worker routing, dispatcher, broker, persistence recovery, or production activation is integrated in this task. Existing constructors keep emitting historical policy/sample/practice versions until Task 3 explicitly supplies runtime selection. No deployment, push, database connection, seed, migration application, historical backfill, or regrading was performed.

The approved design/brief supplied implementation authorization. The brainstorming skill was read; the existing approved specification and scoped implementation request satisfy its design approval gate. No subagents were dispatched.

## Shared exports and identity

All production exports below are in `packages/shared/src/grading-runtime.ts`, re-exported by `@cove/shared` through its root index. There is no API/database import in these contracts.

- `immutableDigestSchema`: exactly `sha256:` plus 64 lowercase hexadecimal characters.
- `runtimeDescriptorSchema`; `RuntimeDescriptor`: readonly strict schema version 1, `engine: 'pyodide' | 'cpython'`, raw `engineVersion` (bounded numeric three-component version, optional suffix), Python `pythonVersion`, `platform: 'linux'`, `architecture: 'amd64' | 'arm64'`, immutable `imageDigest` and `packageManifestHash`, bounded `shimVersion`, engine-consistent `memoryPolicy: 'pyodide-charged-growth-v1' | 'native-cgroup-growth-v1'`, and `executionPolicy: 'wall-v1'`. Native requires matching engine/Python 3.12 patch versions. Parsing freezes the descriptor. Runtime fixtures are explicitly synthetic identities and are not production image provenance.
- `runtimeDescriptorIdentity(descriptor: RuntimeDescriptor): string`: stable JSON tuple of **every** descriptor field, independent of input JSON property order. Use this for complete identity checks.
- `executionEngineVersion(descriptor: RuntimeDescriptor): string`: family-prefixed execution identity, e.g. descriptor raw `engineVersion: '0.27.5'` becomes existing `ExecutionEngine.version: 'pyodide-0.27.5'`; raw `3.12.10` becomes `cpython-3.12.10`. This string is not a complete descriptor identity.
- `runtimeSelectionContextSchema`; `RuntimeSelectionContext`: organization/academy/material UUIDs, nonnegative bounded `gradingRevision`, `context: 'live' | 'preview'`, positive bounded integer `memoryLimitMb` and `timeLimitMs`. There is no user-role input.
- `runtimeCertificationSchema`; `RuntimeCertification`: selection key plus exact certified memory/time budgets, `packageProfile: 'standard-library'` and complete `runtime` descriptor; budgets 32–256 MiB and 100–60,000 ms.
- `runtimeCertificationKey(context: Pick<RuntimeSelectionContext, 'organizationId' | 'academyId' | 'materialId' | 'gradingRevision' | 'context'>): string`: stable full tenant/context/revision key.
- `brokerCapabilityManifestSchema`; `BrokerCapabilityManifest`: version 1, protocol 1, supported complete descriptor array (1–64), `nativeMemoryPolicy: 'native-cgroup-growth-v1'`, `maxActive: 2`, `maxBackground: 1`, `maxSpare: 0 | 1`. `nativeProfile` contains standard-library/3.12, memory `{min:32,max:256}`, declared time `{min:100,max:60000}`. `compatibilityProfile` contains memory `{min:16,max:4096}`, effective time `{min:1,max:60000}`. Shared bounds are exact: `codeChars:100000`, `stdinChars:8388608`, `stdoutBytes:8388608`, `stderrBytes:262144`. These are semantic envelopes; Task 2 must separately reject a physically unfundable budget without reducing it.
- `runtimeManifestSchema`; `RuntimeManifest` (deep readonly): version 1, `compatibility` descriptor, nullable `native` descriptor, `academyAllowances: {organizationId,academyId}[]`, `certifications: RuntimeCertification[]`, `historical: {engineVersion:string,adapter:RuntimeDescriptor}[]`, `capabilities: BrokerCapabilityManifest`. It validates family, full capability identities, duplicate identities/allowances/certification keys, exact certification/native matching, and allowance ownership. Manifest JSON has a 16 MiB loader/parser bound.
- `HistoricalRuntimeResolution`: `{provenance:'recorded',descriptor:RuntimeDescriptor}` or `{provenance:'unrecorded',engineVersion:string,adapter:RuntimeDescriptor}`. The latter means the manifest chooses an executable adapter; its image digest is **not** historical recorded provenance.

## Broker protocol exports

- `GRADING_BROKER_PROTOCOL_VERSION = 1`.
- `executionAttemptContextSchema`; `ExecutionAttemptContext`: `{attemptId:UUID, kind:'submission'|'practice'|'sample'|'maintenance', caseId:string, generation:positiveInt, leaseToken:UUID, workerGeneration:UUID}`. `caseId` is 1–128 safe identifier characters and can carry an immutable grading-case ID or stable position key. `generation` is persisted attempt fencing; `workerGeneration` identifies the sole active worker incarnation.
- `brokerExecutionInputSchema`; `BrokerExecutionInput`: `{code,stdin,inputPromptPolicy:'INCLUDE'|'IGNORE',timeLimitMs,memoryLimitMb,outputLimitBytes}`. Source/stdin/output respect shared bounds, memory is 16–4096 MiB and effective time 1–60,000 ms. An enhanced cumulative remaining budget may be below 100 ms. Native declared-profile certification stays 100–60,000 ms; Task 2 must enforce runtime-specific memory constraints and resource feasibility.
- `brokerExecutionResultSchema`; `BrokerExecutionResult`: `{stdout,stderr,outcome:'PASSED'|'RUNTIME_ERROR'|'TIME_LIMIT'|'MEMORY_LIMIT',runtimeMs,outputTruncated:boolean}`. Capture validates UTF-8 **bytes**, not only JavaScript string length. Runtime is finite, nonnegative and bounded. A broker cannot return comparison/scoring outcomes such as WRONG_OUTPUT or SKIPPED.
- `executionReceiptSchema`; `ExecutionReceipt`: `{version:1,brokerGeneration:UUID,receiptId:UUID,reservationId:UUID,context:ExecutionAttemptContext,runtime:RuntimeDescriptor,result:BrokerExecutionResult,cleanup:'removed'}`. A receipt must describe acknowledged removal, never uncertain cleanup. `brokerGeneration` is independent from worker/attempt generations and fences broker restarts.
- `brokerRequestSchema`; `BrokerRequest`: strict discriminated union detailed below.
- `brokerResponseSchema`; `BrokerResponse`: strict discriminated union detailed below.
- `GRADING_BROKER_MAX_FRAME_BYTES = 67108864` (existing shared 64 MiB sandbox frame limit).
- `decodeBrokerRequest(frame:string): BrokerRequest`; `decodeBrokerResponse(frame:string): BrokerResponse`: enforce UTF-8 frame bound before JSON parsing and then strict schema validation. The transport must also cap buffers while reading; these functions cannot prevent an already allocated oversized incoming transport buffer.

All requests and responses have `{protocol:1,requestId:UUID,type:...}`. Define `B = {brokerGeneration:UUID,context:ExecutionAttemptContext,runtime:RuntimeDescriptor}` and `R = B & {reservationId:UUID}`.

| Request type | Additional fields |
| --- | --- |
| `health` | none |
| `reserve` | `B` |
| `run` | `R`, `input:BrokerExecutionInput` |
| `receipt` | `R` |
| `ack` | `R`, `receiptId:UUID`, `checkpointId:UUID` |
| `release` | `R` |
| `cancel` | `B`, optional `reservationId:UUID` |

| Response type | Additional fields |
| --- | --- |
| `health` | `brokerGeneration:UUID`, `workerGeneration:UUID|null`, `capabilities:BrokerCapabilityManifest` |
| `reserved` | `R` |
| `receipt` | `receipt:ExecutionReceipt` (includes all fencing identities) |
| `pending` | `R`, `state:'reserved'|'running'|'uncertain'|'acknowledged'` |
| `acknowledged` | `R`, `receiptId:UUID` |
| `released` | `B`, `reservationId:UUID|null`, `cleanup:'removed'` |
| `error` | `code:'BUSY'|'UNSUPPORTED'|'IDENTITY_MISMATCH'|'STALE_GENERATION'|'UNCERTAIN'|'NOT_FOUND'|'INFRASTRUCTURE'`, `message:string` (max 512) |

`run` may yield a receipt or pending/error response; polling/reconciliation uses `receipt`. `ack` is sent only after a private durable checkpoint. State-machine enforcement, worker-generation exclusivity, observation of actual guest identity, cleanup acknowledgement, idempotency, journal retention/quota and recovery remain Task 2/3. Missing receipts/NOT_FOUND must never authorize rerunning known/uncertain code. Transport errors contain no source/expected-output fields.

## Registry API

`packages/api/src/judge/runtime-registry.ts` exports:

```ts
parseRuntimeManifest(json: string): RuntimeManifest;
loadRuntimeManifest(path: string): Promise<RuntimeManifest>;
selectRuntime(options: {
  enabled: boolean;
  manifest: RuntimeManifest;
  context: RuntimeSelectionContext;
}): RuntimeDescriptor;

type HistoricalRuntimeWork = {
  executionRuntimeSnapshot?: unknown;
  engineVersion: string; // family-prefixed existing database identity
};
type DescriptorBoundClient<T> = Readonly<T & {
  descriptor: RuntimeDescriptor;
  version: string;
}>;
interface RuntimeRegistry<T extends {
  readonly version: string;
  readonly descriptor: RuntimeDescriptor;
}> {
  readonly manifest: RuntimeManifest;
  selectRuntime(context: RuntimeSelectionContext): RuntimeDescriptor;
  resolveHistoricalRuntime(work: HistoricalRuntimeWork): HistoricalRuntimeResolution;
  bindEngine(descriptor: RuntimeDescriptor): DescriptorBoundClient<T>;
}
createRuntimeRegistry<T extends {
  readonly version: string;
  readonly descriptor: RuntimeDescriptor;
}>(options: {
  enabled: boolean;
  manifest: RuntimeManifest;
  clientFactory: (descriptor: RuntimeDescriptor) => T;
}): RuntimeRegistry<T>;
```

Parsing copies and recursively freezes a validated manifest. File loading requires an absolute regular-file path and limits bytes while reading; the returned value never hot-reloads after later file changes. The registry retains its own immutable copy and captures its flag/factory. Registry selection uses an indexed validated certification map, avoiding full manifest reparsing on each admission. Selection checks academy allowance, exact full tenant/material/revision/live-preview certification and certified budgets, with compatibility chosen before admission when disabled or ineligible. Invalid manifest/schema configuration fails closed.

Historical non-null snapshots must be registered complete descriptors and must agree with the prefixed recorded version. Historical null/absent snapshots require an explicit known mapping and return unrecorded provenance. Unknown or mismatched identities never silently fall back.

Binding canonicalizes complete identity before calling a client factory and validates **both** the returned complete descriptor and prefixed version. It returns a frozen identity facade while binding methods to the original client, preserving prototype methods/private fields. Another binding never mutates this identity. The factory still owns correct client creation/lifecycle and must actually launch/connect to the requested runtime; broker observations must validate that claim. There is no singleton mutable engine/version setting.

## Decoder and consumer compatibility

- `gradingPolicySnapshotSchema` still decodes v1/v2/v3 with their original optional prompt policy and semantic constraints. Added strict v4 with complete descriptor in `runtime`, explicit prompt policy and independent Pyodide `comparator` identity/budget. New bounds: total 1000–300000 ms, comparator 10–2000 ms, declared case 100–60000 ms, memory 16–4096 MiB, existing output bound. `GradingPolicySnapshot` now includes this branch.
- `runtimeMismatch(policy, running: {engine:string|null, comparator:string|null, descriptor?:unknown}):string|null` preserves historical behavior. v4 requires complete parsed `running.descriptor` equality even when the raw version string matches, then checks execution and comparator identities independently.
- `practiceSnapshotSchema`/`PracticeSnapshot` preserve v1 and add v2 requiring `executionRuntimeSnapshot:RuntimeDescriptor`. Enhanced v2 requires a matching v4 policy runtime. Historical terminal v1 reads remain valid.
- `SampleRuntimeVersion` is `{version?:1,executionRuntimeSnapshot?:never} | {version:2,executionRuntimeSnapshot:RuntimeDescriptor}`; `SampleSnapshot` intersects that versioning with the existing legacy/enhanced payload. `sampleInputPromptPolicy` now rejects unknown versions, invalid v2 descriptors, legacy prefixed-version mismatch and enhanced v4/full-descriptor mismatch; old unversioned records retain their original semantics.
- `ExecutionRequest` gained optional `context?:ExecutionAttemptContext` and `runtime?:RuntimeDescriptor`. Existing callers omit both, retaining behavior. No change to execution results, comparator/evaluator behavior, SSE, progress, points, or sample Redis admission was made.
- Existing snapshot writers still produce historical versions; Task 3 must write v4/new descriptor snapshots and pass descriptors to mismatch checks when accepting new manifest-aware work.

## Persistence and disabled configuration

Migration: `packages/api/prisma/migrations/20261029090000_grading_runtime_contracts/migration.sql` (generated schema-to-schema diff plus reviewed additive checks/RLS).

- `Submission.executionRuntimeSnapshot:Json?`, `executionGeneration:Int?`, `executionLeaseToken:UUID?`; all historical rows remain null. Generation is positive when present.
- `StaffPracticeAttempt.executionGeneration:Int?`, `executionLeaseToken:UUID?`; runtime lives inside practice snapshot v2.
- `GradingDispatchIntent`: UUID primary key, nullable unique `submissionId` and `staffPracticeAttemptId` real FKs with exactly one owner, timestamps `createdAt`, `nextAttemptAt`, nullable `dispatchedAt`, nonnegative `dispatchAttempts`, optional paired dispatch `leaseToken`/`leaseExpiresAt`. `grading_dispatch_pending_idx(next_attempt_at,id) WHERE dispatched_at IS NULL` bounds scans to undelivered intents. Submission/practice reverse relations are singular. Maintenance work is an existing Submission with `regradeRunId`; no new queue naming is introduced.
- `GradingCaseCheckpoint`: UUID key, exactly one submission/practice FK owner, positive `generation`/`casePosition`, required `leaseToken`, unique nullable `receiptId`, bounded runtime descriptor JSON, comparator/outcome/output-match/soft-limit/runtime fields, explicit `weight`, `softPenalty`, `awardedWeight`, `executionState`, `isSample`, nullable sample `actualOutput`, and timestamp. Unique owner+generation+case keys; created-at/id reconciliation index; executed cases require receipts, NOT_RUN cases cannot have receipts. Hidden output is prohibited; sample output max 10,000 characters matches the existing bounded sink. Scoring/nonnegative checks apply. No raw stderr, expected output or full raw stdout is retained here.
- Both new tables enable RLS and revoke all browser/PUBLIC access. They contain infrastructure/private state only. Checkpoint ownership/reconciliation/retirement must remain under trusted API/judge operations.
- New-generation recovery must discover and consume earlier-generation durable checkpoints/receipts before considering any execution. Uniqueness includes generation for fencing; it is **not** permission to rerun the same known case in another generation.
- `GRADING_NATIVE_ENABLED` is strict `'true'|'false'`, default false. `GRADING_RUNTIME_MANIFEST_PATH` is optional absolute bounded path, required when native is enabled. No manifest is loaded by default; the existing development path is unchanged.

## Tests and commands

Every command ran with workdir `/Users/jurabeksamiev/Developer/codebuddy-platform-native-grading`. Existing real connection URLs were not inspected or printed. Prisma commands used dummy loopback `DATABASE_URL`/`DIRECT_URL`; subsequent CLI commands also set `DOTENV_CONFIG_PATH=/dev/null` to avoid dotenv reads. No connection was made.

Initial red evidence, before implementation:

- `pnpm --filter @cove/shared exec vitest run src/grading-runtime.spec.ts` failed: `Cannot find module './grading-runtime.js'` (0 tests).
- `pnpm --filter @cove/api exec vitest run src/judge/runtime-registry.spec.ts src/judge/grading-profile.spec.ts` failed: missing `runtime-registry.js`; new v4 decoder rejected version 4 and `runtime.engine='cpython'`; 3 original profile tests passed, 1 new decoder test failed.
- `pnpm --filter @cove/api exec vitest run src/judge/practice-snapshot.spec.ts` failed: complete v2 descriptor snapshot parsed false, expected true.
- `pnpm --filter @cove/api exec vitest run src/config/env.schema.spec.ts` failed: native disabled default was undefined instead of false; 7 old environment tests passed.

Passing verification:

- `pnpm --filter @cove/shared build`: exit 0.
- `pnpm --filter @cove/shared exec vitest run src/grading-runtime.spec.ts`: 1 file, 6 passed. Covers tags, raw/prefixed versions, immutable descriptors, accounting mismatch, duplicate certification, unknown capability identity, old/extra wire fields, compatibility/effective budgets, source bounds, UTF-8 capture bounds, execution-only outcomes and independent generation requirements for control operations.
- `pnpm --filter @cove/api exec vitest run src/judge/runtime-registry.spec.ts src/judge/grading-profile.spec.ts src/judge/practice-snapshot.spec.ts src/judge/sample-check-snapshot.spec.ts src/config/env.schema.spec.ts`: final run 5 files, 21 passed. Includes frozen file loading/no hot reload and full-descriptor factory/historical mismatch checks.
- Broader API command additionally included `src/judge/sample-check.store.spec.ts src/judge/grading.service.spec.ts src/judge/sample-check.runner.spec.ts`: 7 files passed, 1 file skipped; **84 passed, 11 skipped**, exit 0, about 20 seconds. The later loader test brings the aggregate included case count to 85; it was run separately in the final 21-test focused suite. Existing intentional error-path Nest diagnostics appeared as expected.
- `pnpm --filter @cove/shared exec tsc --noEmit`, `pnpm --filter @cove/api exec tsc --noEmit`, `pnpm --filter @cove/judge-worker exec tsc --noEmit`: exit 0. Invoked directly to avoid lifecycle scripts accidentally reading runtime configuration.
- Dummy-loopback `pnpm --filter @cove/api exec prisma validate`: `The schema ... is valid`.
- Dummy-loopback `pnpm --filter @cove/api exec prisma generate`: generated Prisma Client 7.9.0 successfully. Generated files remain ignored.
- Schema-only `prisma migrate diff --from-schema /tmp/codebuddy-native-task1-base.prisma --to-schema prisma/schema.prisma --script --output prisma/migrations/20261029090000_grading_runtime_contracts/migration.sql`: exit 0, no database source. The temporary baseline was obtained from `git show HEAD:packages/api/prisma/schema.prisma`.
- `git diff --check`: exit 0.

The 11 skipped sample-store tests require explicitly isolated Redis configuration; no Redis/database service was selected implicitly. No DB-backed constraint execution, Linux AMD64 runtime/cgroup acceptance, production image/certification, or resource feasibility proof is claimed.

## Self-review and remaining work

Reviewed scope against spec sections 4/7/8/13. Corrected an initial wire envelope overconstraint so compatibility supports existing declared 16–4096 MiB and effective execution can receive less than 100 ms; native certification remains bounded. Separated broker generation from worker generation and restricted broker outcomes to execution-only states. Strengthened bound-factory validation from version-only to complete descriptor equality; added malformed/versioned sample correlation checks. Historical decoders and default writers retain legacy behavior, with no invented image backfill.

No actual architecture blockers remain for Task 1. Task 2 must implement real broker identity/cgroup/resource/protocol enforcement and bounded transport/journal behavior. Task 3 must integrate frozen selection at atomic admission, new snapshot writers, fenced worker/checkpoint/final persistence, dispatch and Redis recovery without changing legacy paths when no manifest exists. Invalid manifests fail closed; transient slot pressure after acceptance must queue/fail infrastructure, never reselect another descriptor. The SQL-only checks/RLS were reviewed but not applied or exercised against a database in this task. Release manifests require independently reviewed real digests, interpreter patch selection and certification; synthetic test fixtures are not deployable manifests.
