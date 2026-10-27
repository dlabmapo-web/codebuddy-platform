# Local native grading experiment

This is an approved, local-only feasibility fixture. It is not registered as a
production engine and does not connect to application routes, databases, Redis,
student records or grading queues. Do not deploy either experimental image.

See the [design](../../../../docs/superpowers/specs/2026-10-27-native-grading-prototype-design.md)
and [implementation plan](../../../../docs/superpowers/plans/2026-10-27-native-grading-prototype-implementation.md).

## Reproduce

Use a local Linux Docker daemon (Docker Desktop was used for the recorded ARM64
measurements). The native wrapper rejects SSH sessions and remote Docker
endpoints, and refuses to overlap known grading fixtures. Run builds to
completion before starting a benchmark. All source hashes are checked against
the actual controller and guest files before source execution.

Build the existing judge from the deployed source revision `af8c54ae` using the
`deploy/docker/judge-worker.Dockerfile`, with an archived clean revision as its
build context, tagged `cove-native-pyodide-baseline:af8c54ae`.
The recorded report gives its immutable image ID; a rebuild may produce a new
ID. Native Python matches the baseline interpreter patch version, 3.12.7.

```sh
docker build -f packages/api/prototypes/native-grading/guest.Dockerfile \
  --build-arg PYTHON_IMAGE=python@sha256:60d9996b6a8a3689d36db740b49f4327be3be09a21122bd02fb8895abb38b50d \
  -t cove-native-grading:prototype packages/api/prototypes/native-grading

docker build -f packages/api/prototypes/native-grading/controller.Dockerfile \
  --build-arg DOCKER_CLI_IMAGE=docker@sha256:625d9431a9f54c5a2bc90f24f0e1c3d55b1349fd857dd85035f98c2c9acbdd4d \
  --build-arg JUDGE_IMAGE=cove-native-pyodide-baseline:af8c54ae \
  -t cove-native-controller:prototype packages/api/prototypes/native-grading

node --test packages/api/prototypes/native-grading/*.test.mjs
node packages/api/scripts/benchmark-native-grading.mjs --runs 3 --cases 10 --output /tmp/native.json
node packages/api/scripts/benchmark-judge.mjs --image cove-native-pyodide-baseline:af8c54ae --runs 3 --cases 10 --output /tmp/pyodide.json
```

Run the two benchmarks sequentially. Cases may be 1, 5 or 10. `--parallel 2`
measures simultaneous synthetic submissions with default capacity 2. Optional
`--concurrency 4 --parallel 4` has a separately accounted container budget; it is
not production acceptance. Neither harness measures complete committed grading.
Keep unsuccessful attempts as well as timing cohorts.

## Boundary and accounting

The trusted fixture controller owns the Docker socket. A read-only socket bind
still grants Docker API control: the controller is trusted local experiment
code, not a student execution environment. No guest receives that socket, host
mounts, application environment or expected output. Never send arbitrary user
code to the controller process. Stop if guest isolation verification fails.

A root supervisor inside each guest demotes the learner to a separate UID with
no capabilities. Student stdout/stderr use separate bounded OS pipes; trusted
results do not share that channel. Readiness verifies kernel protections before
source arrives. Source/launch pipes are closed before executing student code.
Each guest handles one case, kills/reaps learner descendants, and is removed
before its pool slot or case promise is released. Ambiguous creation/removal
keeps its allocation quarantined and stops admission. Cleanup is restricted to
this fixture's uniquely labeled immutable container IDs.

The two-active/one-spare configuration allocates 3 × 384 MiB / 0.5 CPU guests
and a 768 MiB / 0.75 CPU controller. Four-active/one-spare uses 5 × 320 MiB /
0.3 CPU guests and a 448 MiB / 0.75 CPU controller. Total container ceilings
are respectively 1,920 and 2,048 MiB, both 2.25 CPUs. Docker daemon/VM and outer
harness overhead are outside these cgroups. Full system-budget compliance is
unassessed. Static per-guest quotas also cannot borrow an idle guest's CPU.

Performance cases use the same 256 MiB / 1,000 ms requests as the baseline.
The dedicated 64 MiB diagnostic proves memory-limit classification separately
from the 256 MiB allocation/deadline race. Aggregate learner RSS is sampled by
the supervisor; the higher container ceiling covers runtime overhead and limits
overshoot. This is not proof of exact equivalence with WASM heap accounting.
The supervisor enforces a wall deadline independently of the learner's hard
[CPU limit](https://docs.python.org/3.12/library/resource.html).
Docker [resource/isolation options](https://docs.docker.com/engine/containers/run/)
and the seccomp allowlist are checked before accepting work.

## Remaining gates

Local smoke probes are not an adversarial security certification. Compatibility
is limited to the synthetic stdout/input cases tested. Native and WASM ABI,
filesystem, packages, threading/process/socket behavior, exception text and
memory semantics differ; networking and Unix sockets are explicitly denied.
Only 32–256 MiB and 1–3,000 ms requests are supported by this experiment.

The real comparator runs in the bounded trusted controller, with preparation
and per-case comparison reported separately. The fair execution comparison is
native `engineOnlyMs` versus baseline `wallMs`; native totals also include the
comparator. Native execution includes acknowledged guest removal. Cold pool
and comparator initialization are excluded from submission sample times and
reported separately where available.

Current grading snapshots require `runtime.engine = "pyodide"`; native queue,
commit, points and replay are therefore deliberately unassessed. Do not relabel
native results as Pyodide. A separate runtime contract and production design,
compatibility/security review, complete resource budget, official/background
reservation tests and the original 100-submission acceptance cohorts are needed
before any production proposal. This experiment does not speed up public Turtle
or change page fetching.
