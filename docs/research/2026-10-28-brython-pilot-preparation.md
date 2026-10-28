# Public Turtle Brython pilot preparation

Date: 2026-10-28, Asia/Seoul. Activation branch:
`feat/public-turtle-browser-pilot`, based on v2.0.45 / `e4105075`.

The user requested actual browser execution, rather than a release with its
switches disabled, and authorized the dedicated DNS record. This preparation
is for new Dlab-Mapo academy grants only. It is not broad classroom acceptance.
Production application switches remain false until the protected release runs.

## Infrastructure and release changes

Added the `turtle-runtime` A record in Gabia, TTL 600, to the existing VPS.
Authoritative and public DNS resolved it. The saved
[DNS view](assets/2026-10-28-brython-activation/gabia-runtime-dns.jpg)
shows the new row beside the existing application records. Existing records
were visually inspected; an attempted automated before/after comparison had
an empty initial snapshot and is not evidence of a successful comparison.

Published only verified immutable files extracted from the currently approved
Studio image, without starting that image. Artifact:
`brython-3.15.0-2ab1760c5c7107d57457`, production parent
`https://cs.coveedu.com`, 1,410,816 bytes gzip. Application flags, rootless broker,
capacity, warm setting, grading and student data were unchanged by staging.
Caddy was validated and gracefully reloaded. All twelve live HTTPS asset
hashes match; TLS validation succeeds, application routes and POST return 404.
See [HTTPS evidence](assets/2026-10-28-brython-activation/https-runtime-verification.json).

The first effective HTTPS inspection found the shared deferred header was
replacing `no-referrer` with `strict-origin-when-cross-origin`. Corrected the
runtime's outer deferred header, added a regression test using real Caddy and
the exact production common block, then verified effective live headers again.
The frame has no compiler evaluation permission; only the worker has it.
Networking and nested workers remain denied; no cookies are set.
Python's local certificate store lacked a CA issuer, so the independent asset
check used system curl with normal certificate verification, never insecure TLS.

The new workflow passes an optional allowlisted, non-secret JSON configuration
through the existing protected Production job. A private candidate receives
reviewed pilot fields before normal preflight/rollback/deployment. Invalid
fields fail before deployment; ordinary releases preserve installed settings.
The persistent Redis browser-drain marker was absent at preflight. No marker
was deleted and no shared Redis keys or native sessions were modified.

## Local diagnostics and limitations

On the existing developer Mac/Chrome, the unchanged runtime passed square,
race helpers (`-330.0 -370.0`), unsupported `input()` handling and infinite-loop
Stop checks. Stop acknowledgement was 14.285 ms in one sample. These screenshots
are fixture evidence, not proof of deployed product UI or classroom devices.

A new 100-run helper cohort measured dispatch to validated renderer stroke
followed by its next animation-frame signal: p50 52.690 ms, p95 71.365 ms,
maximum 95.775 ms. It excludes API admission and is not independent physical
pixel timing. The local parent produces runtime ID `8dc744cc86e3dab4db7e`;
production bytes differ in the embedded parent-origin configuration.
All 100 completed; no preparation timeout occurred in this cohort. The 101
preparations had p50 1,242 ms, p95 1,567.9 ms and maximum 1,884.9 ms.
Earlier slow samples and two preparation timeouts remain in the
[original implementation report](2026-10-28-public-turtle-browser-runtime-verification.md).
They are not superseded by this better local sample.

A separate synthetic loopback Nest/Redis cohort admitted twenty independent
visitors at the same time, renewed all twenty and cleaned all twenty up.
Admission p95 was 19.595 ms; renewal p95 19.671 ms. Broker methods throw in
this fixture, so success confirms no broker dependence. This excludes real
academy database reads, Next BFF, network, rendering and twenty physical devices.
It is not a capacity guarantee or a production load test.

Raw evidence: [100 runs](assets/2026-10-28-brython-activation/helper-cohort-100.json),
[20 admissions](assets/2026-10-28-brython-activation/concurrent-admissions-20.json),
[Stop](assets/2026-10-28-brython-activation/stop-result.json).

The full-path 500 ms p95, readiness under constrained networks, classroom Windows/
Chromebook/iPad coverage, twenty actual devices and API/navigation regression
gates remain open. No unrestricted rollout or student-count guarantee follows
from this pilot. The release must first be approved by the designated human;
after deployment, verify a fresh live grant, actual drawing, effective profile,
startup timing and zero new native allocations for supported drawing.
Existing native grants require Exit and new code entry to select Brython.
