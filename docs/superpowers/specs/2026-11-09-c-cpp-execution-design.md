# C and C++ exercises on the native grader (phase 1)

Date: 2026-11-09. Status: approved 2026-11-09; implemented 2026-11-10 on
`feat/c-cpp-execution` (from `feat/cove-studio-v2`), not yet deployed. §13
records where the implementation departs from the text. The language is
chosen per course, not per exercise: see
[Course language](2026-11-10-course-language-design.md), which replaces the
exercise language picker of §3.1 and §5.4.

## 1. User direction

The owner wants students to write, run and submit C and C++ programs, as they
do on Elice. Decisions taken on 2026-11-09:

| Question | Decision |
| --- | --- |
| Where code runs | On Cove's server, in the native NsJail grader, as Elice does. Not in the browser. |
| Scope of this spec | Submit, Test and a simple Run whose input is given before the program starts. Typing into a running program is phase 2, with its own spec (§10). |
| Language model | One language per exercise, chosen by the author: Python, C or C++. |
| Compiler settings | C as Elice compiles it: `-std=gnu11 -lm`, no optimization. C++ as Baekjoon does: `-O2 -std=gnu++17`. (Revised the same day after the Elice inspection in §2.1; the first choice was `-O2` for both.) |
| Code that does not compile | A failed submission with 0 points that counts as an attempt. |

Done means: an author creates a C or C++ exercise; a student runs it with
their own input, tests it against the public examples and submits it; the
verdict, score and runtimes come from a native 64-bit GCC build; compile
errors and crashes are explained in plain words; and nothing about Python
grading changes, including its runtime identity, queues and fallback.

## 2. Evidence and alternatives

### 2.1 How Elice runs C and C++

Elice's "CLI programming" exercises run in server containers, one environment
per language. Authors set a time limit (1–1800 s) and a memory limit
(64–4096 MB) and may enable a TTY terminal for typed input. Run invokes
`runner.sh`. Submit invokes `grader.sh`, whose STDIO grader pipes each case's
input into the program and compares the output. Sources:
[practice environment](https://www.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/environment),
[exercise types and grading](https://help.elice.io/help/en/docs/aidt/manual/classroom/course/edit/feature/material/exercise/).

The D.LAB Elice C courses (C Basic DC-C-1, C Advanced DC-C-2) were inspected
on 2026-11-09 ([research note](../../research/2026-11-09-elice-c-cpp-runtime.md)):

- The Run script is `gcc main.c -o main` followed by `./main`: no
  optimization and no `-std`. A linker path names GCC 5, whose default C
  dialect is `gnu11`.
- Run is interactive: a program's prompt appears and `scanf` waits for typed
  input. Run turns into Stop and shows a countdown.
- An empty `main.c` produces the linker's "undefined reference to `main`".
- The environment is labelled "C / C++". The inspected exercise allows 91 s
  in total and 512 MB.
- C Advanced teaches pointers, dynamic memory, structures and file I/O.
- No C++ course was visible, so C++ has no Elice reference.

### 2.2 Compile cost, measured

GCC 14.3, one CPU (`docker run --cpus 1`), Docker Desktop on Apple Silicon,
2026-11-09. Three runs each; the first `bits/stdc++.h` run had a cold file
cache.

| Program | Compile time |
| --- | --- |
| C, `stdio.h` | 33–64 ms |
| C++, `iostream` + `vector` + `algorithm` | 252–321 ms |
| C++, `bits/stdc++.h` | 725–1,061 ms (3,443 ms cold) |
| C++, `bits/stdc++.h`, static link | 941–2,628 ms |
| C++, `bits/stdc++.h`, precompiled header | 190–273 ms |
| Running a compiled program on small input | under 1 ms |

Binary sizes: 70–72 KB dynamically linked, 2.3 MB statically linked. The
production host's CPU may be slower, and the AWS Lightsail instance sustains
only about 1.6 cores; §8 gates on measurements there. GCC 12 (§4) compiles at a similar speed;
§8 measures it.

Consequences: compile **once per submission** and run that binary for every
case; cache builds by source; precompile `bits/stdc++.h`.

### 2.3 Alternatives rejected

- **Compile in the browser** (clang built for WebAssembly: YoWASP about
  25 MB gzipped, Wasmer about 100 MB). WebAssembly is 32-bit: the measured
  native program prints `sizeof(long)` and `sizeof(void*)` as `8 8`, the
  browser build would print `4 4`, and crashes behave differently. Run and
  Submit would disagree, which is the v1 "Run passed, Submit failed" problem
  ([scale design §5.3](../../design/2026-07-31-student-problem-solving-scale-design.md)).
- **Judge0 or Piston.** A second sandbox beside the one already qualified.
  Judge0 runs privileged and had CVSS 10.0 sandbox escapes in 2024
  (CVE-2024-28185, CVE-2024-28189; [Tanto Security](https://tantosec.com/blog/judge0/)).
  Judge0 is batch-only, so phase 2 would need another system.
- **A second native container for GCC.** Another 1 GiB of service overhead,
  and two resource banks competing for the same CPUs on one host.
- **Add GCC fields to the existing CPython descriptor.** Every toolchain
  change would change Python's runtime identity and queue names, which the
  [runtime ADR](../../adr/2026-10-27-grading-runtime-latency.md) forbids:
  a new runtime "cannot silently inherit the current runtime's identity".

**Chosen:** one native node and one resource bank, serving two runtime
families: the unchanged `native-cpython` and a new `native-gcc`.

## 3. Behaviour

### 3.1 Authors

- The exercise editor gains **Language**: Python, C or C++. It is shown only
  in academies with the new feature `C_CPP_EXERCISES` (§5.3). Changing the
  language is a grading edit and increments `gradingRevision`. Submissions
  keep the language and runtime they were graded with.
- Choosing C or C++ sets weighted Elice-style grading (`ELICE_STDIO`) and
  prompt policy `INCLUDE`, and hides the input-prompt setting, which only has
  a meaning for Python's `input()`. Every other grading control is unchanged:
  comparators, weights, time and memory limits, soft limits and the total
  budget.
- When the starter code is empty or still the previous language's template,
  a language change fills in the new template:

  ```c
  #include <stdio.h>

  int main(void) {

      return 0;
  }
  ```

  ```cpp
  #include <iostream>
  using namespace std;

  int main() {

      return 0;
  }
  ```

- Course copies already carry `exercise.language`
  (`course-tree-copy.ts`). Workbook and Elice imports stay Python-only.
- Authoring guidance (operations doc, §9) notes that Visual Studio–only code
  does not compile with GCC: `scanf_s`, `<conio.h>`, `<windows.h>`.
  `#define _CRT_SECURE_NO_WARNINGS` is harmless.

### 3.2 Students

| Action | C/C++ behaviour |
| --- | --- |
| Edit | Monaco highlights `c` or `cpp`. |
| Run | Sends the code and the **Input** panel's text to the server. The panel is prefilled with the first public example's input and can be edited. The terminal shows compiler messages, then the output, then how the program ended. A program that reads past the given input gets end-of-file. A note in the panel says typing while the program runs is coming. |
| Test | Always judged by the server with Submit's rules (server sample checks), whatever `SERVER_SAMPLE_CHECKS` says. Python's Test is unchanged. |
| Submit | Graded on the `native-gcc` runtime. |
| Compile error | The terminal shows GCC's messages and the editor underlines the lines they name. The submission is recorded as failed with 0 points, counts as an attempt and is labelled "Compile error". |
| Crash or bad exit | Explained (table below) and graded as a runtime error, as for Python. |

How a program ended, shown in the terminal (Korean and English catalogs):

| Ending | Message (English) |
| --- | --- |
| `SIGSEGV` | Invalid memory access: an array index out of range, a null pointer, or recursion that is too deep. |
| `SIGFPE` | Arithmetic error, usually integer division by zero. |
| `SIGABRT` | The program aborted: a failed `assert`, or a C++ exception that was not caught. |
| `SIGSYS` | The program used a system feature that is not allowed, such as `system()` or `fork()`. |
| Exit code N ≠ 0 | The program ended with exit code N. `main` should return 0. |
| Time or memory limit | As for Python. |

Run, Test, and the public cases of Submit results and history, show this
explanation. A hidden case that ended in a runtime error shows one generic
message to students instead: "The program crashed or ended with a nonzero exit
code on a hidden test. Check array bounds, division by zero, and that `main`
returns 0." The exact exit code or signal would reveal hidden input (§5.3).

The program's own stderr is shown in Run and Test, so an uncaught exception's
`terminate called after throwing an instance of 'std::out_of_range'` is
visible there. Submit results do not store stderr (§5.3).

Programs may create, write and read back files in their working directory
(`/tmp`, 16 MiB, empty at the start of every Run and every case), so
`fopen` lessons that write a file and read it back work. Author-supplied input
files and graded output files are not part of this phase (§11).

### 3.3 Teachers

Submission review, the live editor, the live preview and the staff workspace
highlight code in its language. Run output goes into the same terminal
transcript as Python's Run, so live terminal mirroring keeps working. History
lists show "Compile error" for submissions that did not compile. A
hidden case's exact exit code or signal is shown only to people who may
already read that exercise's hidden cases (§5.3). Staff
practice runs use the same engine.

### 3.4 When the grader is unavailable

Python falls back to Pyodide when the native node is not ready. C and C++
have no fallback. Run, Test and Submit are refused with `GRADING_UNAVAILABLE`
(HTTP 503) and the message "C/C++ execution is temporarily unavailable. Your
code is saved; try again in a minute." This is never a wrong answer and never
an attempt. The emergency stop (`docker stop cove-production-native-grader-1`)
therefore stops all C/C++ execution; the operations doc records that.

## 4. Toolchain and limits

The compiler is **GCC 12.2** from Debian bookworm at the snapshot
`20260301T000000Z`, which the native image already pins. It implements all of
C11 and C++17. GCC 12 is also preferred to GCC 14 for Elice content: GCC 14
turns implicit function declarations, implicit `int` and incompatible pointer
types into errors in C. GCC 12 keeps them as warnings, as Elice's GCC 5 does,
so older course code still compiles. A later upgrade is a new `native-gcc`
identity; graded submissions keep theirs.

| | C | C++ |
| --- | --- | --- |
| Source file | `main.c` | `main.cpp` |
| Command | `gcc main.c -o main -std=gnu11 -Wall -DONLINE_JUDGE -lm -fdiagnostics-color=never -fmax-errors=20` | `g++ main.cpp -o main -O2 -Wall -std=gnu++17 -DONLINE_JUDGE -I/opt/cove/pch -Winvalid-pch -fdiagnostics-color=never -fmax-errors=20` |

- C matches Elice's dialect and optimization level (none, i.e. `-O0`).
  Programs with undefined behaviour, such as an uninitialised variable or an
  array read out of range, therefore behave as they did on Elice as far as
  the compiler allows. Compiling is also cheaper. `-lm` is added so programs
  that use `<math.h>` link; this only accepts more programs than Elice does.
- C++ uses `-O2`, the judge convention: STL code is several times slower
  without optimization.
- `-DONLINE_JUDGE` matches Baekjoon, so students' `#ifndef ONLINE_JUDGE`
  blocks behave as they expect.
- `-Wall` adds messages and never changes the program.
- Programs are linked **dynamically**. The run root contains only the loader,
  `libc`, `libm`, `libstdc++` and `libgcc_s`. Static linking was rejected:
  binaries are 30 times larger and linking is slower (§2.2).
- `/opt/cove/pch/bits/stdc++.h.gch` and `/opt/cove/pch/iostream.gch` are
  built when the image is built, with exactly the C++ flags above. GCC uses a
  precompiled header only when the flags match and the program's first include
  names it; `-Winvalid-pch` makes a mismatch visible, the image build fails if
  `<iostream>`'s is not used, and qualification checks both (§6).
- Warnings are shown on Run and never affect grading.

| Limit | Compile | Run, per case |
| --- | --- | --- |
| CPU time | 10 s | The case's authored limit (default 3 s); native speed, time scale 1 |
| Wall-clock backstop | 20 s | As for Python |
| Memory | 512 MiB | The exercise's limit, within the node's 512 MiB class |
| Processes | 16 | The exec gate and the program; the program cannot create processes or threads (§5.2) |
| Stack | 8 MiB | Equal to the memory limit, as on common judges, so deep recursion behaves as students expect |
| Files | Binary ≤ 64 MiB; diagnostics kept to 16 KiB | `/tmp` 16 MiB, not executable |
| Run input | — | Run panel ≤ 64 KiB; cases as today |
| Output | — | As for Python. Bytes are decoded as UTF-8 with replacement characters, so output that is not valid UTF-8 (an uninitialised `char` array) is judged deterministically. |

Compile time counts against the submission's total job budget, never against
a case's limit. A compile that the host stops for CPU time, memory or wall
time (a template bomb, for example) is a compile error with reason `LIMITS`,
and its message names the limit. Only the host's own cgroup and timer
evidence sets `LIMITS`, never text in GCC's output, which quotes learner
source. That result is not cached, because it depends on load. A binary over
the file-size limit (a huge static array) fails inside GCC. It is reported as
an ordinary compile error with the linker's message, and it is cached,
because the same source always fails the same way.

## 5. Architecture

### 5.1 Runtime identity and manifest (`packages/shared/src/native-grading.ts`)

- `nativeRuntimeDescriptorSchema` (`engine: "native-cpython"`) does not
  change, byte for byte. Python's identity, version string and queue names
  stay the same.
- New `nativeGccDescriptorSchema`, strict, every field part of identity:
  `schemaVersion: 1`, `engine: "native-gcc"`, `gccVersion`, `architecture`,
  `toolchainRootfsDigest`, `runRootfsDigest`, `packageManifestDigest`,
  `compile: { C: { argv }, CPP: { argv, pchDigest } }`, `nsjailRevision`,
  `nsjailBinaryDigest`, `sandboxPolicyVersion: "nsjail-gcc-v1"`,
  `compilePolicyDigest`, `runPolicyDigest`, `execGateDigest`, and the same
  `comparator` object as the CPython descriptor.
- `nativeAnyRuntimeDescriptorSchema` is a union discriminated by `engine`.
  Identity and version helpers accept either kind. Version strings are
  `native-cpython-<sha256>` (unchanged) and `native-gcc-<sha256>`.
- The release manifest reaches `schemaVersion: 2` with an optional `gcc`
  descriptor beside `descriptor`. Version 1 manifests still parse, with no
  GCC runtime.
- Eligibility entries gain `languages` (`PYTHON`, `C`, `CPP`). An absent value
  means `["PYTHON"]`, so today's production eligibility admits exactly what it
  admits now. Admission kinds gain `run`, and an entry's `kinds` list may
  hold five values.
- Node resources gain `maxCompilePids` (default 16). It is validated together
  with the existing per-case budget against the parent's 256 tasks.
- Node resources gain `artifactStoreMb` (default 256), the size of the
  artifact store's tmpfs (§5.2). The schema requires
  `artifactStoreMb ≥ cpuSlots × 64` and `artifactStoreMb < serviceOverheadMb`.
  The launcher checks the measured service memory against both values (§5.2).

### 5.2 Native node (`packages/grading-runtime`)

**Images.** `guest/Dockerfile` builds two more trees, digested like today's
rootfs. The *toolchain root* holds `gcc`, `g++`, `cc1`, `cc1plus`, `as`, `ld`,
`collect2`, the C runtime objects, the libc and libstdc++ headers and the
precompiled header. The *run root* holds the loader, the four shared libraries
and the exec gate. The package manifest lists the exact Debian package
versions.

**Jail configurations** (`src/policy.ts`). Python's `jailConfig` is unchanged.
Two new functions are added:

- `compileJailConfig`: the toolchain root, read-only. `/src/main.c` or
  `/src/main.cpp` is a read-only bind of a file the launcher wrote. `/out` is
  an empty, writable, non-executable per-compile directory, and the file-size
  limit bounds the binary. Its host side is on a dedicated staging tmpfs,
  `/var/lib/cove-native/staging`, noexec, sized `cpuSlots × 64 MiB`. The
  compiler writes the binary there, so its pages are charged to the compile's
  own cgroup and count against its 512 MiB reservation. `/tmp` is a non-executable tmpfs for GCC's temporary files.
  `/dev/null` is mounted only if qualification shows GCC needs it; there is no
  `/proc` and no network. Same namespaces, uid 65534, no capabilities. Policy
  `gcc-compile.{amd64,arm64}.policy` is its own explicit list, found and
  qualified like the run policy below. Beyond ordinary file, memory and time
  calls, it holds what the GCC driver needs to start its stages: `clone`
  without namespace flags, `vfork`, `wait4`, `execve`, `pipe2`, and `kill`
  inside its own PID namespace. `clone3` is refused with `ENOSYS` so glibc
  falls back to `clone`, whose flags seccomp can inspect. Every writable
  mount is non-executable, so only toolchain binaries can run.
- `binaryJailConfig`: a fresh jail for every case. The run root is read-only.
  The artifact is bind-mounted read-only at `/box/main`, executable, nosuid,
  nodev. Same namespaces, uid and capabilities. `/tmp` is a non-executable
  tmpfs. The stack limit equals the memory limit (§4).

**Run-jail syscall policy.** Two filters stack, and the kernel enforces both.
Neither is "Python's list plus additions"; each is its own explicit list with
a comment per group, as `python.amd64.policy` has today.

1. *Jail filter* `gcc-run.{amd64,arm64}.policy`, installed by NsJail, covers
   the gate and the program:
   - What a native C/C++ program and glibc need: I/O, memory, time, signal
     handling, `futex`, `getrandom`, file operations in `/tmp`, and process
     information.
   - `kill`, `tkill` and `tgkill`, because glibc's `raise` and `abort` use
     `tgkill`. These are safe because the PID namespace holds only the gate
     and the program. The gate is the namespace's init, and the kernel never
     delivers it a signal from inside the namespace unless it installed a
     handler, which it does not.
   - `execve`, needed to start the gate and then the program.
   - For the gate: `memfd_create`, `wait4`, `seccomp` (`SECCOMP_SET_MODE_FILTER`
     only), `prctl` (`PR_SET_DUMPABLE` only), and `clone` only with flags
     exactly `SIGCHLD`. `clone3` is refused with `ENOSYS`.
   - **No call can act on another process.** The gate and the program share
     uid 65534, and Linux lets a process with the same user and group IDs
     change another's resource limits, affinity or priority. The kernel's
     protection of a namespace's init covers signals only
     ([`prlimit(2)`](https://man7.org/linux/man-pages/man2/prlimit.2.html)).
     So:
     - `prlimit64` and `sched_getaffinity` are allowed only with a `pid`
       argument of 0 (the caller). glibc's `setrlimit`, `getrlimit` and
       `sched_getaffinity` already pass 0.
     - These are not allowed at all: `pidfd_open`, `pidfd_getfd`,
       `pidfd_send_signal`, `process_vm_readv`, `process_vm_writev`, `kcmp`,
       `ptrace`, `setpriority`, `sched_setaffinity`, `sched_setscheduler`,
       `sched_setparam`, `sched_setattr`, `ioprio_set`, `move_pages`,
       `migrate_pages`, `process_madvise`, `get_robust_list`,
       `rt_sigqueueinfo`, `rt_tgsigqueueinfo`.
     - Signals stay the one exception, covered by init's protection above.
   - Default action: kill the process.
2. *Program filter*, installed by the gate in the child just before `execve`,
   further denies `clone`, `clone3`, `fork`, `vfork`, `memfd_create`,
   `seccomp` and `prctl`. `system()`, `fork()` and threads therefore end with
   `SIGSYS`.

Before forking, the gate also makes itself non-dumpable
(`PR_SET_DUMPABLE 0`). This adds a kernel check against any same-uid
inspection that the filters might have missed.

`execve` stays permitted, because seccomp cannot tell the program's first
exec from a later one. Nothing else is executable: the read-only run root
holds only the gate, the loader, four libraries and `/box/main`, and every
writable mount is non-executable. Executing the gate again fails because its
control FD is gone. Executing `/box/main` again restarts the program within
the same limits.

Both lists are found in development by running the §6 corpus under the same
filters with a logging action instead of kill. They ship with the kill action
and are qualified on the host (§6).

**After a compile.** The launcher opens the result's staging path with
`O_NOFOLLOW`. It accepts only a regular ELF file of at most 64 MiB, then
copies it into the artifact store, root-owned with mode 0555, named by its
content hash. The launcher never follows a name the learner could choose.
The order is fixed:

1. Copy into the store.
2. Delete the staging directory.
3. Kill and remove the compile's cgroup.
4. Release the compile's reservation.

Staged pages are therefore freed while they are still charged to the
compile. They are never reparented to the node envelope, where no reservation
covers them.

**Artifact store.** A new tmpfs in the `native-grader` container at
`/var/lib/cove-native/artifacts`: `artifactStoreMb` (256 MiB), mode 0700,
nosuid, nodev, and **executable**. Executable is required because a bind
mount inside the jail's user namespace cannot remove a `noexec` flag
inherited from its source, and every existing tmpfs is `noexec`. The store is
empty after a restart, which only costs a recompile.

- **Index.** Maps `sha256(GCC identity, language, source bytes)` to
  `{ artifact, diagnostics }` for a successful compile, or `{ diagnostics }`
  for a compile error. Results stopped by limits are not cached.
- **Diagnostics are files.** Diagnostics (each at most 16 KiB) are files in
  the store, beside the binaries. The kernel's tmpfs size limit therefore
  bounds everything cached. The in-memory index holds only keys, sizes and
  lease state, at most 4,096 entries (about 1 MiB), least-recently-used.
- **Leases.** Every `compile` response, including a cache hit, grants a lease
  on its artifact for one attempt: a grading job, a sample check, a run check
  or a staff practice run. Each `run` presents the artifact and its lease. The
  worker sends `release` after the last case and that case's cleanup, in a
  `finally`.
- **Lease expiry.** A lease also expires at the duration the client
  requested, bounded by the attempt's remaining job deadline plus the cleanup
  allowance. This releases leases held by a crashed worker. A `run` with an
  expired or unknown lease is refused as `UNAVAILABLE`, which is an
  infrastructure failure, never a verdict. It can only happen after the job
  deadline has already passed.
- **Eviction.** Least-recently-used, by bytes, and only among artifacts with
  no live lease. When unleased artifacts cannot free enough space, `compile`
  answers busy, and the client retries within its acquisition budget, like a
  busy CPU slot. A leased artifact is never evicted.
- **Size at startup.** The launcher refuses readiness unless the store holds
  every concurrently admitted attempt's largest artifact: store bytes ≥ CPU
  slots × 64 MiB. Today that is 3 × 64 = 192 MiB, within 256 MiB. Admitted
  attempts are bounded by the node's job gate, which holds a reservation for
  a whole job.

**Memory accounting.** The store's tmpfs pages are written by the launcher,
so they are charged to the service leaf and persist outside every case
reservation. The service reservation must therefore cover a full cache:

```
serviceOverheadMb ≥ measured service baseline + artifactStoreMb + index (1 MiB)
```

The measured baseline is the launcher, worker, comparator pool and copy
buffers, as today.

Today the launcher compares the envelope's `memory.current` with
`serviceOverheadMb` once, at startup (`launcher.ts`). It changes as follows:

- At startup it requires `memory.current + artifactStoreMb + 1 MiB ≤ serviceOverheadMb`.
- Every readiness heartbeat checks that the service leaf's `memory.current`
  stays at or below `serviceOverheadMb`. Exceeding it withdraws readiness,
  the same treatment as a cleanup uncertainty.

The cache therefore cannot grow into the memory that cases and Python
standbys are promised. Staging is covered by each compile's own reservation
(above).

Production's `serviceOverheadMb` (1,024 today) and envelope (3,376 MiB) are
set from the full-cache measurement in §8. If the envelope cannot hold the
larger overhead, it grows within the host's free memory, keeping the 20% and
1 GiB headroom the schema enforces. Python's case and official reservations
never shrink.

**Exec gate** (`guest/exec-gate.c`, static, in the run root). It is the
jail's first process and therefore PID 1 of the namespace. It speaks the
Python bootstrap's protocol up to GO, so the launcher's existing readiness,
CPU-limit read-back and GO timing are reused:

1. Write `R` on FD 3.
2. Read the header `cove-binary-1 <stdin bytes> <time limit ms>` and the stdin
   bytes from FD 0. Put the stdin bytes in a `memfd`.
3. Lower its own `RLIMIT_CPU` (the child inherits it), write `A`, and wait
   for `G`.
4. Fork once. In the child: close FD 3, put the `memfd` on FD 0, install the
   program filter, and run `execve("/box/main", ["./main"])`.
5. In the gate: close every descriptor except FD 3, `wait4` for the child,
   write one fixed-format status record on FD 3 (`X <exit code>` or
   `S <signal number>`), and exit 0.

The program never holds FD 3, and its stdin is a file, as on judges that
redirect input. The program is PID 2, not PID 1. As PID 1, the kernel would
drop its own `SIGABRT` (no handler), so a failed `assert` would surface as a
different signal or not at all.

**How a program ended.** The gate's status record is the only source.
NsJail's exit code is not used, because NsJail returns `128 + signal` for a
signal and the plain code for an exit
([`subproc.cc`](https://github.com/google/nsjail/blob/d8415bc8eea43cdd413daba25af63127019a1189/subproc.cc)),
so `return 139` and `SIGSEGV` would be indistinguishable.

The record is trusted for four reasons:

- The program cannot write to FD 3. It closed it before `execve`, and there
  is no `/proc` from which to reopen it. `pidfd_getfd` is denied.
- The program cannot stop the gate: the kernel ignores signals to a
  namespace's init that the init has no handler for, and `ptrace` and
  `process_vm_*` are denied.
- The program cannot change the gate's resources. `prlimit64` acts only on
  the caller, and every other call that can name another process is denied
  (run-jail policy above). Lowering the gate's CPU or file limits would
  otherwise kill it and turn a learner's failure into a judge error, which is
  not counted as an attempt.
- The gate is root-owned in the read-only run root, and its digest is part of
  the runtime identity.

Host decisions outrank the record. When the launcher itself ended the case
for time, memory, output or cancellation, that outcome stands, and no record
is expected because the whole cgroup was killed. When the supervisor exits
without a record and without a host decision, the result is an
infrastructure failure, never a learner verdict. The launcher maps the record
to `{ exit: code }` or `{ signal: name }`. Qualification proves both
situations (§6).

**Protocol** (`src/contract.ts`). `protocol: 2`; client and service ship in
the same image, so versions never mix.

- `health`: unchanged.
- `run`: unchanged for CPython. For GCC it carries `artifact` and `lease`
  instead of `code`.
- `compile`: GCC only, with a requested `leaseMs`. It returns either
  `{ status: "COMPILED", artifact, lease, diagnostics, compileMs, cached }` or
  `{ status: "COMPILE_ERROR", reason: "ERRORS" | "LIMITS", diagnostics, compileMs, cached }`.
- `release`: GCC only; ends a lease. Releasing an unknown or expired lease
  succeeds.
- A GCC run result carries `termination`: `{ exit: number }` or
  `{ signal: "SIGSEGV" | "SIGFPE" | "SIGABRT" | "SIGSYS" | "SIGBUS" | "SIGILL" | "SIGKILL" | "OTHER" }`,
  absent when the host decided the outcome.

**Resources and readiness.** A compile is a reservation, like a case: one CPU
slot plus 512 MiB, overhead and scratch, on the caller's lane. The node
reports GCC ready only after a self-test compiles and runs one C and one C++
program through the real jails and gets the expected output, as the Python
version probe does today. A GCC failure withdraws only GCC readiness; Python
stays ready.

### 5.3 API (`packages/api`)

- **Engine.** `ExecutionEngine` gains an optional
  `compile({ language, code, leaseMs, signal })` and an optional
  `release(lease)`. `ExecutionRequest` gains optional `artifact` and `lease`,
  and `ExecutionResult` gains an optional `termination`.
  `NativeExecutionClient` implements all of them for a GCC descriptor.
- **Grading** (`GradingService.gradeElice`). For C and C++ it compiles once
  before the first case, within the job deadline, and releases the lease in a
  `finally` after the last case and its cleanup:
  - `COMPILED`: every case runs the artifact.
  - `COMPILE_ERROR`: the submission is finalized `FAILED` with score 0,
    `compileFailed: true` and `compileDiagnostics`. Every case is recorded
    `NOT_RUN`/`SKIPPED`. `nextProgress` counts the attempt.
  - Infrastructure failure: `ERRORED`, as today.
- **Crash details are kept.** `CaseRow` and `SubmissionCase` gain
  `exitCode` and `exitSignal`, written only for an executed case whose
  outcome is `RUNTIME_ERROR` and whose termination came from the gate (§5.2).
  Every other case, and every Python case, leaves both null. Each place that
  writes or copies case rows carries them: official grading, regrades, staff
  practice results, and sample and run check records.
- **What students may see.** Students already see every case's outcome,
  hidden cases included, but never a hidden case's input, expected output or
  actual output (`submission.service.ts`). For a hidden case, the exact
  ending is withheld from students:
  - **Why it is withheld.** It is a channel the program controls.
    `return getchar();` would put the first input byte in the exit code, and
    choosing between `SIGSEGV`, `SIGFPE` and `abort()` encodes further bits.
  - **What students get.** The student projection sets `exitCode` and
    `exitSignal` to null for every hidden case, exactly as it nulls
    `actualOutput`. Students see `RUNTIME_ERROR` and the generic message
    (§3.2).
  - **Public cases** carry both values, since their input is public.
  - **Raw values for hidden cases** are projected only to people who may
    already read that exercise's hidden cases, the permission that opens the
    test-case editor. Seeing the exit code reveals nothing to them.
  - **Stderr** is never stored with a submission, because it can echo a
    hidden case's input. It appears only in Run and Test, which use public
    or student-typed input.

  Hidden-case runtimes are shown today and are an existing, separate channel
  that this spec neither widens nor addresses.
- **Contracts that carry them.** `submissionCaseSchema`
  (`packages/shared/src/content/submission.ts`), the submission result and
  history projections, the SSE result event, the teacher case view
  (`teacher-progress.ts`), the staff-practice result schema and the
  sample-check view (`sample-check.ts`) gain `exitCode` and `exitSignal`.
  Every projection to a person applies the hidden-case rule above, and each
  is covered by the regression test in §8. The web maps the values to the
  messages in §3.2.
- **Policy snapshot version 5**: version 4's shape plus `language: "C" | "CPP"`,
  with `runtime` holding the GCC descriptor. Versions 1–4 are unchanged. The
  runtime checks in `grade()` accept a GCC descriptor only with a matching
  `native-gcc-…` engine and a version 5 policy.
- **Admission** (`NativeAdmission.select`). It is language-aware. It returns
  the GCC descriptor for C and C++ only when eligibility lists that language
  and kind and GCC readiness is current. For C and C++, the submission,
  sample-check, run-check and staff-practice services turn "no descriptor"
  into `GRADING_UNAVAILABLE`, never into Pyodide routing. Regrades and repairs
  keep their recorded runtime, as today.
- **Queues.** `runtimeQueueName` accepts either descriptor; GCC queues are
  named `…-native-gcc-v1-<hash>`. The native worker consumes CPython and GCC
  queues under one `NativeJobGate`. GCC sample and run jobs use background
  concurrency `cpuSlots − officialReservedSlots`, so the official slot is
  never used by them.
- **Run check.** Sample checks gain `kind: "run"`. It is started by a new
  procedure, `learn.startRunCheck`, with `{ academyId, classId, materialId,
  code, stdin, workspaceRevision, clientRequestId }`. It has no expected output
  and no comparison, and returns compile diagnostics, stdout, stderr, outcome,
  runtime and termination. It shares the sample-check store, cancel and get
  procedures, rate limits, per-academy cap, polling interval and Redis expiry.
  Python's Run is unchanged.
- **Sample checks** for C and C++ ignore the `SERVER_SAMPLE_CHECKS` flag.
- **Authoring.** `exerciseLanguages` becomes `["PYTHON", "C", "CPP"]`. The
  shared exercise schema refines: a language other than Python requires
  `ELICE_STDIO` and `INCLUDE`. The create paths in `course.service.ts`
  (currently `language: "PYTHON"` at lines 1295 and 1871) take the input's
  language. Creating an exercise in C or C++, or changing an exercise to C or
  C++, is permitted only with `C_CPP_EXERCISES` on. The import path stays
  `"PYTHON"`.
- **Feature flag** `AcademyFeature.C_CPP_EXERCISES` gates only *choosing* C or
  C++ while authoring. Running depends on eligibility (§5.1). Existing C/C++
  exercises keep working if the flag is later turned off.
- **Migration.** Additive only:
  - `ALTER TYPE "ExerciseLanguage" ADD VALUE 'C'` and `'CPP'`.
  - `submissions.compile_failed boolean not null default false`.
  - `submissions.compile_diagnostics text null`.
  - A check constraint that `compile_failed` is true exactly when the
    diagnostics are present.
  - `submission_cases.exit_code int null` and
    `submission_cases.exit_signal text null`, with a check constraint that at
    most one is set and only when `outcome = 'RUNTIME_ERROR'`.
  - The staff-practice attempt's result JSON schema gains the compile fields
    and the per-case exit fields.

### 5.4 Web (`packages/web`)

- `monacoLanguageFor(language)` and a language label replace the hard-coded
  `language="python"` and `language_python` labels in `editor-pane.tsx`,
  `staff-student-pane.tsx`, `preview-modal.tsx`, `solution-code-editor.tsx`,
  `starter-code-editor.tsx`, `submission-review.tsx`, `live-editor.tsx`,
  `live-workspace.tsx` and `preview-editor.tsx`.
- **Workspace.** For C and C++, Run uses a new `useServerRun`, modelled on
  `use-sample-runner.ts`. It writes into the same terminal transcript and
  events, so mirroring and recovery behave as they do for Test. An `Input`
  panel (`components/workspace/stdin-panel.tsx`) is shown only for C and C++.
  Test always takes the server path. Python-only parts are hidden: the error
  coach, prompt-policy hints, Pyodide loading states and Turtle.
- **Diagnostics.** `parseGccDiagnostics` in `packages/shared` turns
  `main.c(pp):LINE:COL: error|warning|note: message` into editor markers. The
  terminal shows GCC's text unchanged.
- **Authoring.** A language select in basic information, the templates from
  §3.1, and no prompt-policy control for C and C++.
- **History and review.** A "Compile error" label from `compileFailed`.
- Korean and English catalogs for every new string, in the existing
  page-scoped namespaces.

## 6. Security and qualification

The NsJail boundary is the same one Python uses. The new risks are a
multi-process compiler and an executable learner binary. Each item below
becomes a check in `packages/grading-runtime/test/linux-smoke.ts` or
`deploy/native/kernel-qualification.mjs`, run on a production-equivalent
Linux host.

| Attempt | Expected |
| --- | --- |
| `#include "/etc/passwd"`, `"/proc/self/environ"`, `"/dev/stdin"` | Not found: only toolchain files exist |
| Template or `constexpr` recursion bomb | Compile stopped by CPU or memory limit: `LIMITS` |
| `static char a[1 << 30] = {1};` | Compile error from the file-size limit, with the linker's message (reason `ERRORS`) |
| Output replaced by a symlink, a directory or more than 64 MiB | Rejected by the launcher; nothing stored |
| Compiler tries to start more than 16 processes | Refused by the PID limit |
| `system("ls")`, `fork()`, a `std::thread` | `SIGSYS` from the program filter: runtime error |
| `execve` of the gate or of `/box/main` | The gate exits at once without its control FD; `/box/main` restarts within the same limits and deadline |
| `return 139;`, and `*(volatile int *)0 = 0;` | Exit code 139, and `SIGSEGV`: told apart by the gate's record |
| `assert(0)`, `abort()`, an uncaught C++ exception | `SIGABRT`, not `SIGSYS` or another signal |
| Integer division by zero | `SIGFPE` |
| `kill(1, SIGKILL)` and `kill(-1, SIGKILL)` from the program | The gate is unaffected and reports how the program ended |
| From the program, aimed at PID 1: `prlimit64(1, RLIMIT_CPU \| RLIMIT_NOFILE \| RLIMIT_FSIZE, low)`, `sched_getaffinity(1)`, `setpriority(PRIO_PROCESS, 1, 19)`, `pidfd_open(1)` and `pidfd_getfd`, `process_vm_writev(1)`, `kcmp(1, …)`, `ptrace(PTRACE_ATTACH, 1)` | Each ends the program with `SIGSYS`. The gate's limits read back unchanged, and it reports `SIGSYS`, never an infrastructure failure |
| Supervisor killed with no status record and no host decision (fault injection) | Infrastructure failure, never a verdict |
| Loading a `/tmp` file through the dynamic loader | Fails: executable mapping is refused on a non-executable mount |
| Reading `/etc` or `/proc` while running | Absent |
| Memory bomb, infinite loop, `sleep`, output flood | Memory limit, time limit, wall limit, truncated output |
| Deep recursion beyond the memory limit | `SIGSEGV`: runtime error |
| Network, Unix socket, control FD | Denied, as for Python |
| After any case or compile | Case cgroup reports no processes and every jail file is removed |
| `bits/stdc++.h` with the precompiled header | No `-Winvalid-pch` warning; `-H` shows the header used |

Isolation between students: artifacts are named by content and only the
trusted worker chooses which one a case runs. Compile jails never see the
artifact store. A run jail mounts exactly one artifact. Two students with the
same source share one deterministic binary, which reveals nothing.

## 7. Database statements

Rules from `AGENTS.md`. Submission admission keeps its statement count; the
language is already read with the exercise. The compile columns ride on
existing submission reads: detail views read `compileDiagnostics`, and lists
read only `compileFailed`. `exitCode` and `exitSignal` are columns of
`submission_cases` and are read with the existing case reads. The run-check admission path is new and makes the
same reads as sample-check admission. Its statements are counted in an
integration spec, as `navigation-performance.integration.spec.ts` does,
against a disposable Docker PostgreSQL through
`COVE_INTEGRATION_DATABASE_URL`.

## 8. Capacity and release gates

Measured on the production host or an equivalent one with the node's current
envelope (3 CPU slots, one reserved for official grading):

| Gate | Target |
| --- | --- |
| One C++ Run (`iostream`, not cached), click to output | p50 ≤ 1.5 s, p95 ≤ 3 s |
| 30 students press Run on C++ at once | All finish within 15 s; no errors |
| Python Submit during that burst | p95 within the threshold of the [classroom capacity design](2026-11-01-native-grading-classroom-capacity-design.md) |
| C++ Submit with 10 cases, not cached | p95 ≤ 5 s |
| C++ Submit after Run of the same code | No second compile (cache hit recorded) |
| Full cache under full load: the artifact store filled to `artifactStoreMb` with binaries and diagnostics, the index at 4,096 entries, every CPU slot running a maximum-memory case, compiles staging maximum-size binaries, and Python standbys waiting | No OOM kill anywhere in the envelope. The service leaf stays within `serviceOverheadMb`. Python's official reservation and standby budget stay admissible. The startup and heartbeat checks pass, and fail when `serviceOverheadMb` is lowered below the measurement |

If a gate fails, the remedy is a larger host or a separate execution host,
decided with the owner. Limits are never raised to pass a gate.

Further gates:

- Unit tests:
  - Shared schemas and identity, the diagnostics parser, jail configurations
    and the contract.
  - The artifact store:
    - A leased artifact is never evicted while other attempts compile into a
      nearly full store.
    - Expiry frees the lease of a worker that never released it.
    - A full store of leased artifacts answers busy.
    - The index stays within its entry and byte bounds.
- Integration tests against the disposable PostgreSQL:
  - Accepted, wrong answer, time limit, and `GRADING_UNAVAILABLE` when GCC is
    not ready.
  - Compile error: attempt counted, 0 points.
  - Crash on a public and on a hidden case: `exitSignal` stored for both,
    stderr stored for neither.
  - **Hidden-ending probe** (regression test). Two submissions, each with a
    public and a hidden case:
    - `int main(void){ return getchar(); }`
    - `#include <signal.h>` and
      `int main(void){ raise(getchar() & 1 ? SIGSEGV : SIGFPE); }`

    The student's result, history, SSE event and teacher-progress views carry
    no exit code or signal for the hidden case and do carry them for the
    public case. A person with access to the hidden cases sees both.
  - Run check.
  - Statement counts.
- The §6 qualification on the host.
- An Elice C corpus check: the model answers of the D.LAB C Basic and C
  Advanced exercises, compiled and run on Cove with their examples. Every
  difference from Elice (a compile error, a warning that became visible, or a
  different output) is recorded in a research note before the pilot.
- Browser acceptance in the development app:
  - An author creates a C exercise and a C++ exercise.
  - A student runs with input, tests and submits.
  - A compile error is underlined in the editor.
  - A segfault is explained.
  - A teacher's live view shows the Run output.
- API, web and judge-worker typechecks, and the native image build and scan.

## 9. Rollout and rollback

1. Merge with GCC built into the image, no eligibility entry listing C or C++,
   and the flag off. Nothing visible changes.
2. Deploy, run `docker compose run --rm native-grader qualify`, and measure
   §8.
3. Add `"languages": ["PYTHON", "C", "CPP"]` and kind `run` to one test
   academy's eligibility and turn its flag on. The owner accepts it in the
   browser.
4. Widen eligibility, and turn the flag on for each academy that wants C/C++.
5. Update `docs/operations/` with the emergency-stop consequence (§3.4) and
   the authoring guidance (§3.1).

**Rollback.** C/C++ is switched off without changing the application version:

- Removing C and C++ from eligibility refuses new C/C++ work with the §3.4
  message and leaves Python untouched.
- Turning `C_CPP_EXERCISES` off stops new C/C++ authoring.
- Returning to the previous native image refuses C/C++ execution the same
  way. Queued GCC work drains first, as native work does today.

Together these switches are the supported rollback for any C/C++ incident.
Every later fix rolls forward.

**Minimum application version.** Once the first C or C++ exercise or
submission row exists, this release is the oldest application version that
may run against the database. Older Prisma clients cannot read the `C` and
`CPP` values. Deleting exercises does not remove that dependency:
submissions keep their language after their exercise is deleted
(`Submission.material` is `onDelete: SetNull`).

The release notes and `docs/operations/` state this.
`deploy/scripts/rollback.sh` enforces it. Today the script only swaps image
settings and restarts services. This release adds a preflight that runs in
the still-running current API container before anything is stopped. It
refuses the rollback when two things are both true:

- the target release in `previous-deployment.env` predates this release, and
- any `programming_exercises` or `submissions` row has language `C` or `CPP`.

An application rollback past this release would need its own procedure,
rehearsed on a copy of production, which this spec does not define.

## 10. Phase 2, outlined

A live terminal for C and C++: the program runs on a pseudo-terminal, so
`printf` prompts appear before `scanf` waits, as on Elice's TTY terminal
(verified on D.LAB's Elice, §2.1). Grading keeps pipes, so terminal echo and
line-ending conversion never reach compared output.
Input and output stream over a WebSocket. Sessions are limited (60 s without
input, 10 s of CPU, 3 minutes in total) and run on their own capped lane. A
`ServerRunner` emits the same `RunnerEvent`s as `InteractiveRunner`, so the
terminal, paste handling and mirroring are reused. It replaces the Input
panel. Its own spec covers WebSocket authentication through Caddy, session
capacity and abuse limits.

## 11. Out of scope

- Students choosing the language (Elice's multi-language exercises).
- Other languages.
- Custom grader scripts and special judges.
- Multi-file programs.
- Author-supplied input files, and grading a file the program writes. The
  C Advanced file I/O lessons that need them are listed by the corpus check
  (§8) for a later phase.
- Per-exercise compiler or standard choice.
- C/C++ in workbook or Elice import.
- Compiler warnings as a grading signal.

## 12. References

- `packages/grading-runtime/` (README, `src/policy.ts`, `src/launcher.ts`,
  `src/contract.ts`, `guest/`)
- `packages/shared/src/native-grading.ts`, `packages/shared/src/content/course.ts`
- `packages/api/src/judge/` (`execution-engine.ts`, `grading.service.ts`,
  `grading-profile.ts`, `native-admission.ts`, `native-worker.ts`,
  `judge.queue.ts`, `sample-check.runner.ts`)
- `packages/api/src/learn/` (`submission.service.ts`,
  `sample-check.service.ts`, `staff-practice.service.ts`)
- `packages/web/src/lib/workspace/` (`use-python-runner.ts`,
  `use-sample-runner.ts`), `packages/web/src/components/workspace/`
- `deploy/compose.production.yml` (`native-grader`), `deploy/native/`
- [Elice C/C++ research note](../../research/2026-11-09-elice-c-cpp-runtime.md)
- [Native grading classroom capacity design](2026-11-01-native-grading-classroom-capacity-design.md)
- [Terminal multi-line paste design](2026-11-09-terminal-multiline-paste-design.md)

## 13. Implementation notes (2026-11-10)

Where the build differs from the sections above, and why:

- **The exec gate also starts the compiler** (`exec-gate exec …`), so the
  compile jail is verified before GO exactly like the run jail and Python's:
  uid, capabilities, seccomp, namespaces and mounts.
- **Store directories are traverse-only (0711), not 0700.** NsJail resolves a
  bind source inside the jail's user namespace, where the launcher's ownership
  grants nothing. Nothing can be listed, read or written; every name below is a
  random staging name or a content digest.
- **A run with an unknown or expired lease is answered `INVALID_REQUEST`**
  (an immediate infrastructure failure) rather than `UNAVAILABLE`, which the
  client would retry for its whole acquisition budget first.
- **Unbounded recursion** ends as `MEMORY_LIMIT` or `SIGSEGV`: with the stack
  equal to the memory limit, whichever the kernel reaches first.
- **Compile limits.** GCC bounds constant evaluation itself (2²⁵ operations),
  so a `constexpr` loop is the learner's compile error. Preprocessor expansion
  reaches the host's memory limit and is `LIMITS`.
- **Choosing C/C++ without the feature** is refused with `PERMISSION_DENIED`.
  A dedicated error code did not fit the Korean `errors` catalog's budget, and
  the picker is offered only where the feature is on.
- **Rollback preflight** (`deploy/scripts/check-language-floor.sh`) compares
  capabilities, not versions: releases are identified by image digests, so it
  refuses when C/C++ rows exist and the target API image's Prisma client lacks
  `CPP`.
- **Teachers.** A teacher's own Run/Test in the live view is off for C/C++ in
  this phase (Run checks are a student permission); teachers see the student's
  runs mirrored, and the staff pane's own Run is off for them too. The
  submission review, the student history, the staff pane and both solution
  viewers highlight by language. The review and history show a public case's
  ending and a compile error's GCC messages; a hidden case's ending is never
  projected to them. The attempt list marks attempts that did not compile.
- **Rollback guard tests.** `deploy/scripts/language-floor.test.py` runs the
  guard and `rollback.sh` with a stub `docker`: no C/C++ rows, rows with a
  target that lacks `CPP`, a target that has it, an unreadable count with and
  without the operator override, and a refusal that stops nothing and leaves
  the manifest unchanged. CI and `validate-local.sh` run it.
- **Measured** (arm64, Docker Desktop, real jails, two qualification runs):
  C compile 43–52 ms, C++ `iostream` 235–251 ms, C++ `bits/stdc++.h` with the
  precompiled header 218–229 ms; a memory-limited compile stopped after
  0.7–1.1 s. The Run check's admission is 11 statements, the same as a Test's.

### Verification

| Suite | Result |
| --- | --- |
| Native kernel qualification of the final image, arm64, production container flags | CPython 39 checks PASS; GCC 45 checks PASS |
| `@cove/grading-runtime` unit | 67 passed |
| `@cove/shared` | 935 passed |
| `@cove/api` unit | 1,718 passed, 249 skipped (database specs) |
| `@cove/api` database specs on a disposable PostgreSQL 16 and Redis 8 (12 files, named) | 122 passed; includes 8 C/C++, sample-check, weighted-grading and statement-count specs |
| `native-application.integration.spec.ts` in its isolated harness | 12 passed |
| `@cove/web` unit | 1,566 passed |
| `@cove/i18n` | 140 passed |
| Typechecks and builds | shared, grading-runtime, API (`nest build`), web (`next build`) |
| `validate-local.sh`, `deploy/native` (13), `language-floor.test.py` (6), `turtle-browser-rollback.test.py` (6) | passed |

A local browser acceptance with real native execution passed afterwards
(`packages/api/scripts/test-c-cpp-local.sh`), and the development database is
migrated. Not yet done: amd64 qualification on the production host, the
production migration, and the §8 capacity gates there.
Evidence and the release gates in detail:
[C and C++ implementation verification](../../research/2026-11-10-c-cpp-implementation-verification.md).

