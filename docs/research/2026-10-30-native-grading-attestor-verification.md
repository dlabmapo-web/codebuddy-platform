# Native grading attestor verification — in progress

The approved repair is being implemented on `feat/production-native-grading`.
Production is unchanged and deployment readiness is not established. Task1's
native source and packaging passed independent review; actual live contracts
remain incomplete. Task2 lifecycle/transport and Task3 broker/learner integration
have not started.

The previous failed broker verification, including all six source records and
zero-of24 guest execution, remains in
`2026-10-29-disposable-native-grading-linux-verification.md`. This repair does not
replace that history with passing parser or policy results.

## Source and local evidence

- Native tools/protocol/pinned static build: `8b8a078a`.
- Reviewed generated-bin packaging correction: `134c54b3`. Actual BuildKit2/2,
  explicit package inventory and extracted broker checks exclude synthetic
  fixture, arbitrary binary and license canaries. Both static native binary
  hashes are unchanged by that correction.
- Published source: `3ea3e796c3a6035d33450e1e150bfff4f215b2eb`, including approved
  design/plan and the root-launch precondition clarification. Next reviewed
  code is9475775d plus fixture-only0257fc29; its new-source run is pending.
- Local pure native5, CI87 and runtime41 passed. Desktop AMD64 emulation rejects
  even a minimal ALLOW seccomp control with EINVAL and close_range with ENOSYS;
  its full native suite failed and supplies no live-policy acceptance.

## Actual AMD64 record

[Run41038461369](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41038461369)
on source`3ea3e796` failed at `native_contracts`. The pinned native image compiled
successfully. Six test methods passed, including the real production-filter
denial fixture and all five pure/format/static checks. All13 live test methods
failed their shared setup at root bootstrap with `ATTESTOR_CLIENT_PEER`; their
adversarial assertions did not execute.

The production kernel wrapper was skipped, so required guest execution is0/24
and wrapper cleanup is unexecuted. The fallback summary truthfully records these
states; it is not a host attestation. Sanitized native-step output and the exact
summary bytes/hashes are retained in
`assets/2026-10-30-native-grading-attestor-verification/run-index.json`.

Source diagnosis found the producer uses umask0077 for Unix bind, creating0700,
while bootstrap requires0600. An isolated Linux socket control confirmed this
permission calculation. Producer correction9475775d and its shared bind
regression preserve the strict verifier. Fixture-only0257fc29 closes a reviewed
false-positive path: the forged peer stays alive after EOF, and valid/instance-only
mutation/valid controls use one unchanged proof/PID/socket. Independent source
rereview is approved; local fixture lifecycle3/3 passed. Actual native-client
controls still require the next reviewed-source AMD64 run.

The matching [ordinary run41038461105](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41038461105)
completed successfully:17 browser cases and2 actual database timing contracts.
Its capability probe is not native acceptance; paired
native acceptance is skipped.

## Remaining work

Run the mandatory real AMD64 native contracts on new reviewed source. Task2 consumes the unchanged native
contract only after that gate passes. Its root-controlled launch must protect
the pre-dumpable0 interval as specified in the approved design; existing unknown
listeners/managers cannot be adopted from post-startup metadata alone.

Task3 must execute the actual hardened broker, helper and all24 kernel cases with
source-bound evidence and exact cleanup. Full native app E2E, paired100-sample
cohorts, mixed load, host equivalence, release/license proofs and activation
remain separate gates even after a hosted kernel pass.
