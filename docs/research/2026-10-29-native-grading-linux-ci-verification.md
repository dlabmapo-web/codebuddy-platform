# Initial hosted Linux grading verification

Run: <https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/40835892964>
Source: `ef1541a2baaba72e83a8c8e7d91ce6095f452b7a` on
`feat/production-native-grading`. Completed 2026-10-29 UTC.

The existing isolated workflow completed successfully. The Linux browser job
passed all 17 browser cases in 5.8 minutes and both actual PostgreSQL timing
contract cases. The job used Node 22.23.4 and the isolated test configuration;
these are actual Pyodide application/browser checks, not native containment.

The capability artifact records Linux x86_64, systemd cgroup driver, cgroup v2,
AppArmor and seccomp, with rootful Docker. The probe correctly returned unsupported
(exit 2) and `nativeAcceptanceExecuted:false`. Its workflow job succeeding means
the capability observation succeeded; no positive native execution is established.
The separately provisioned paired Linux acceptance job was skipped.

GitHub artifact IDs and compressed sizes were:

| Artifact | ID | Bytes |
| --- | --- | ---: |
| isolated-grading-browser-evidence | 12881291060 | 18285 |
| rootless-capability-only | 12879978918 | 492 |

The downloaded raw evidence is ignored local output under
`test-results/linux-ci-40835892964/`. No production SSH, service changes,
deployment, native activation or production latency measurement occurred.

The user approved the next disposable rootless Linux test extension in
`docs/superpowers/specs/2026-10-29-disposable-native-grading-linux-ci-design.md`.
Its results must be recorded separately. Native activation stays disabled and
the five-second production target remains unverified.
