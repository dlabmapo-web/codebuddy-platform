# Dedicated user-manager probe correction rereview — 2026-10-30

Reviewed `3d9ee69..29f0bfe565794bf6f7a0f1b850702ea55f37bfaa` using the code-review skill, scoped to the failed transient-specifier probe and changes introduced by its correction. Read the archived run41011581831 summary and inspected the actual systemd255 D-Bus setter/execution paths. Original review is preserved with an appended superseding-evidence note. No source was edited and no provisioning, push or remote run was performed.

## Finding disposition

**Transient Environment specifier defect — ADDRESSED.** The source no longer sets or reads GRADING_CI_RUNTIME_SPECIFIER and requests no transient Environment property. A fixed relative RuntimeDirectory plus RuntimeDirectoryMode0700 now exercises actual manager directory setup, independently of the client's XDG environment.

Primary-source verification:

- [systemd255 dbus-execute.c](https://raw.githubusercontent.com/systemd/systemd/v255/src/core/dbus-execute.c), lines2677–2701, confirms Environment merges raw D-Bus values and escapes specifiers when serializing. Lines2951–2992 accept normalized relative RuntimeDirectory names and add the exact name to the execution context. The corrected fixed name needs no specifier expansion.
- [systemd255 exec-invoke.c](https://raw.githubusercontent.com/systemd/systemd/v255/src/core/exec-invoke.c), lines2126–2166 and2341–2370, constructs and creates the runtime directory using the execution runtime prefix and configured mode. Lines4063–4067 run directory setup before the payload. Lines1679–1685 and1852–1879 construct RUNTIME_DIRECTORY from that same runtime prefix and configured name; lines4114–4119 merge this generated environment after the manager's environment. This is an actual execution path, not a synthetic success string supplied by the client.
- The [systemd255 execution manual](https://www.freedesktop.org/software/systemd/man/255/systemd.exec.html) also documents automatic directory creation, the RUNTIME_DIRECTORY variable and removal at service stop. The transient service retains default runtime-directory preservation behavior.

## New breakage assessment

None found that blocks this scoped correction.

`provision.py:88` refuses any preexisting path at the expected dedicated probe directory before normalization/launch, preventing an old directory from substituting for manager creation. The service probes its actual UID, HOME/XDG/bus values, the automatically generated RUNTIME_DIRECTORY path, and an lstat of the expected directory requiring directory type, dedicated ownership and mode0700. Correct service environment with a wrong manager prefix still fails either launch or the path/directory checks. The manager-owned process receives only the fixed expected UID/home/runtime as comparison arguments; they do not set its inherited values.

The process emits exactly eight booleans. The caller requires the exact field set and actual bool types, then uses separate literal invariant messages for each failed check. Arbitrary inherited environment strings are no longer returned. Existing diagnostic reason projection can retain these fixed messages without broadening its allowlist to raw subprocess output.

The transient service remains a service without scope/setenv, with runtime/memory/PID/client/output bounds. Normal completion and launch failure retain the previous exact-unit stop/collect behavior; no cleanup target or production unit is widened. The generated runtime directory belongs to that unit and is removed when it stops.

## Verification

Independently ran83 CI contracts: pass in4.498seconds. Range whitespace check `git diff --check 3d9ee69..29f0bfe5`: pass. The added executed-probe contract runs the real generated Python body against a real temporary directory, deliberately includes the obsolete literal `%t` environment value, and tests wrong mode, wrong RUNTIME_DIRECTORY and missing directory. The added absent-path contract rejects a preexisting probe directory. These checks verify probe logic and refusal behavior; they do not substitute for the next actual Ubuntu systemd service run. No Next.js source/API changed.

## Verdict

**APPROVE the scoped correction29f0bfe5.** The deterministic transient-specifier defect is fixed without weakening manager-prefix verification. The controller may proceed with the separately authorized new-source disposable Linux run. Native guest execution and broader acceptance remain unverified.
