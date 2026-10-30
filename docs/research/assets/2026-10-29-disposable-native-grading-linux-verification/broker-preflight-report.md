# Read-only broker preflight — 2026-10-30

Base: `29f0bfe565794bf6f7a0f1b850702ea55f37bfaa`; reviewed source:
`8e87354cd607d20a7c663d5f7b37097b271e7432`.

Actual29f0bfe5 execution passed the corrected runtime probe and started the
properly attested dedicated rootless daemon with loaded immutable images, but
normal broker startup failed with only its fixed generic journal message.
The cause was not inferred from that message. No required case executed.

This CI-only diagnostic imports deployed production manifest/daemon-identity/
RootlessDriver modules and invokes loadManifest, loadDaemonIdentity and
RootlessDriver.verify. That actual production call graph is read-only: daemon
info and image inspection, kernel/file/socket verification, no guest discovery,
creation, execution or removal. Its passing result still proceeds through normal
production-unit startup, real health and all required kernel cases.

The bounded transient user service uses the current renderer's process policy:
execution slice, NoNewPrivileges, PrivateTmp, ProtectSystem, ReadWritePaths,
EnvironmentFile, working directory, Node path/128MiB heap, PATH and umask.
It rejects unsupported new service directives. Only verified concrete home/runtime
paths replace unit-file specifiers before typed D-Bus submission. The fixed
exclusive root-owned module is staged inside existing /opt/cove/grading/ci;
no new cleanup roots or kernelFiles/ownedFiles exceptions are introduced.
The service has a60-second lifetime and exact bounded cleanup on failure.

Only closed stage/type/errno/syscall identifiers, exact configured-path roles
and approved literal-invariant identifiers leave the diagnostic. No actual error
message, stack, arbitrary path, raw environment or subprocess output is uploaded.
The root controller validates the4096-byte maximum projection and writes fixed
root-owned broker-preflight.json. The existing collector treats it as optional
diagnostic-only evidence, never kernel success.

Validation: implementer86 CI contracts; parent independently86 contracts
(4.476seconds), Node syntax, Python compile and range whitespace pass. Independent
review86 contracts (4.304seconds), Node syntax/range whitespace and direct
systemd255 typed-property parser/read-only production call-graph inspection pass.
Source approved before controller push. Actual Linux result is recorded in the
main verification report when available.

## Actual result and namespace observation

Run41013115176 at8e87354c retained driver-verify EACCES/stat at the daemon
process executable,0/24 required cases and successful exact cleanup. The
follow-up diagnostic-only6e1cea33 added three closed namespace booleans. Root
read only fixed host/attested-daemon namespace paths bracketed by complete
daemon identity checks; the trusted same-policy service read its own namespace.
No raw namespace IDs left the root-owned projection.87 contracts pass by
implementer, parent (4.837seconds), and independent reviewer (4.575seconds);
syntax/compile/range whitespace pass and source approved before push.

Actual run41013987308 preserved the same EACCES/stat failure and recorded
brokerMatchesHost=false, brokerMatchesDaemon=false, daemonMatchesHost=false.
No required guest case ran; exact cleanup passed again. The root observations
are prelaunch bindings and do not alone establish a causal counterfactual.
Systemd255 source plus the observed namespace split explains the likely boundary;
no identity check or production hardening was weakened. The separately written
production attestor proposal remains unapproved and unimplemented.
