# Dedicated user-manager environment fix review — 2026-10-30

Reviewed `5177da1..3d9ee69ef83af204b3bdb5d8e21e6a16c7f09415` using the code-review skill. Read the actual failed run41011046173 archived summary, the two-file source/test diff, production installer renderer and adjacent provisioning/cleanup. No implementation was edited and no push, provisioning or remote run was performed.

## Findings

No blocking issue found in this scoped source fix.

- `provision.py:75` addresses the observed service-launch environment rather than only the correctly addressed systemctl client. The archived run shows successful matching rootless-package selection/install, then the rootless script testing `/run/user/1001`, which differs from the dedicated grading UID. The fix sets only HOME, XDG_RUNTIME_DIR and DBUS_SESSION_BUS_ADDRESS in that dedicated user manager; it does not modify stock `user@` startup, global environment or production unit bytes.
- Runtime-directory checks use lstat and require an actual directory with the dedicated owner and mode0700; the bus must be an actual socket owned by the dedicated UID. Both checks precede manager mutation. `user_command` addresses that manager through the fixed owned account/runtime/bus. Existing principal verification and absent-resource preconditions establish that this is the newly owned manager.
- `provision.py:100` launches a transient user **service**, without `--scope` or `--setenv` for the three values being checked. Its process therefore receives the manager launch environment; a correctly configured client alone cannot satisfy the JSON comparison. This follows the documented [systemd-run service/scope distinction](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html). The probe checks actual process UID and the exact HOME/runtime/bus values.
- The separate `%t` probe is necessary: [SetEnvironment modifies the client service environment](https://raw.githubusercontent.com/systemd/systemd/v255/src/core/dbus-manager.c), while [unit `%t` expansion uses the manager runtime prefix](https://raw.githubusercontent.com/systemd/systemd/v255/src/core/unit-printf.c). The code does not assume that setting XDG_RUNTIME_DIR repairs a prefix captured earlier; it explicitly fails before grading startup if actual `%t` differs. Whether the runner has a separate prefix problem remains an actual-run question, not a source-review success claim.
- Normalization follows the last user daemon-reload and precedes starting the grading slice/daemon. This avoids a later environment-generator reload replacing the checked launch context. Existing production slice, daemon and broker definitions remain unchanged.
- The exact fixed probe unit name must be absent first. RuntimeMaxSec15, MemoryMax32M, TasksMax16, client timeout30 and output bound4096 constrain the probe. `--wait --collect` handles normal completion; both success and launch-failure paths attempt to stop only that exact unit. A failed immediate stop preserves the primary launch exception, and the existing lifecycle trap stops the owned user manager and verifies owned processes/namespaces/cgroups absent. No broader cleanup authority is added.

## Verification

Independently ran `python3 -m unittest discover -s deploy/scripts/grading/ci -p 'test_*.py' -q`: **81 pass**,4.486seconds. Ran `git diff --check 5177da1..3d9ee69e`: pass. The five new tests cover service-based inheritance, runtime/bus ownership refusal before mutation, wrong launch identity and runtime specifier rejection, bounded exact probe cleanup with primary-error preservation, and ordering after the final user reload. These are contract results; actual service behavior on Ubuntu remains pending. No Next.js source/API was changed.

## Verdict

**APPROVE the scoped environment fix.** Proceed with the controller-owned new-source disposable Linux run under the existing authorization. No native guest execution success or production acceptance is established by this review.

## Superseding actual evidence — 2026-10-30

The above approval missed a deterministic probe defect. Actual run41011581831 at3d9ee69 failed before daemon/guest startup,0/24 cases, with exact cleanup0. Its generic environment comparison did not isolate the failed field. The controller then checked [systemd255 dbus-execute.c Environment handling](https://raw.githubusercontent.com/systemd/systemd/v255/src/core/dbus-execute.c): transient D-Bus Environment assignments are stored literally and serialized with specifier escaping. The reviewed `GRADING_CI_RUNTIME_SPECIFIER=%t` therefore supplied literal `%t`, unlike parsed unit-file Environment expansion. My earlier review checked the unit-file formatter but failed to check this transient setter path. That paragraph and source-gate verdict are superseded by this actual failure and the corrected29f0bfe5 source/rereview. The original review remains above as the historical record; it is not positive Linux evidence.
