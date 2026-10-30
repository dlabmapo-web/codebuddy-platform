# Dedicated manager environment fix — 2026-10-30

Base: `5177da1002f33096e23e92e0a6e0b1d44f2dfaac`.
Reviewed source: `3d9ee69ef83af204b3bdb5d8e21e6a16c7f09415`.

Actual run41011046173 installed matching official rootless prerequisites but
failed daemon startup while its rootless wrapper checked `/run/user/1001`.
That differs from the dedicated grading UID selected in range10000–59999.
The original failure and successful exact cleanup remain archived. The origin
of the actual environment value was not directly inspected. An upstream
runner-images report describes the same symptom from system-wide XDG settings:
<https://github.com/actions/runner-images/issues/14649>.

The CI-only fix validates the dedicated UID-owned0700 runtime directory and
UID-owned bus socket, then uses only that manager's `systemctl --user
set-environment` to set HOME, XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS.
It runs after the final user-manager reload and before grading services start.
A bounded transient SERVICE launched by the manager verifies its actual UID and
three inherited environment values. An explicit probe-only Environment property
also expands `%t`, independently verifying the manager's runtime prefix rather
than assuming that changing its service environment repaired that prefix.
A mismatch fails before daemon startup.

The exact fresh probe unit is checked absent before use, uses `--collect`,
a15-second runtime limit,32MiB memory cap and16-task cap. Failure attempts an
exact bounded unit stop while preserving the primary launch exception; existing
lifecycle cleanup still stops the exact owned manager. No global environment,
stock manager ExecStart, production installer/rendered unit, isolation or resource
contract changed.

Validation: implementer81 CI contracts pass; parent independently81 contracts
(5.095seconds), compilation and range whitespace pass. Independent review
approved with81 contracts (4.486seconds), range whitespace and read-only
systemd255 source inspection. Runtime/BuildKit results from the prerequisite
revision remain applicable because this fix changes only CI Python provisioning
and its focused contracts.

Controller pushed the new reviewed source to the same feature branch.
[Run41011581831](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41011581831)
is the new kernel execution; actual outcome will be recorded in the main report.
The ordinary isolated workflow41011581840 was also triggered automatically.

## Actual result and correction

Run41011581831 failed the environment comparison before daemon startup or any
guest test. Exact cleanup passed. Its archived summary and main verification
report preserve the failure. The explicit transient Environment `%t` check was
incorrect: systemd255's D-Bus setter keeps raw environment values and escapes
specifiers when serialized. That deterministic probe defect was missed by the
initial review, which is retained. A real transient RuntimeDirectory check is
being implemented; no actual manager-prefix mismatch is established by this run.
Primary source: <https://github.com/systemd/systemd/blob/v255/src/core/dbus-execute.c#L2677-L2701>.

## Corrected source

Source `29f0bfe565794bf6f7a0f1b850702ea55f37bfaa` replaces the unsupported
transient Environment-specifier check with `RuntimeDirectory` and0700 mode.
The probe directory must be absent before launch. The actual manager-launched
service returns only eight fixed booleans: UID/HOME/XDG/D-Bus match, generated
RUNTIME_DIRECTORY match, and actual directory type/owner/mode. Each failed
field has a distinct fixed allowlisted invariant. The probe has no manually
supplied environment variable that substitutes for the generated runtime path.

A regression executes the real Python probe in a temporary directory, checks
that an obsolete literal `%t` environment value has no effect, and rejects
wrong generated path, missing directory and0755 mode. Parent independently83
CI contracts (5.546seconds), compile and whitespace pass. Independent rereview
checked systemd255's actual D-Bus setter, directory-creation and generated
environment paths;83 contracts (4.498seconds) and whitespace pass.
The controller pushed the reviewed correction and started
[run41012042378](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41012042378).
Actual results will be recorded in the main verification report.
