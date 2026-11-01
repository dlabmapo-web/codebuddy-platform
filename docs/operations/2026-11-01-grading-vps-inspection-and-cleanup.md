# Grading VPS inspection and cancelled experiment cleanup

Date: 2026-11-01 (Asia/Seoul).
Scope: user-requested read-only production inspection, removal of identified
cancelled grading experiment artifacts, and a new design specification.
No grading deployment, production benchmark, queue pause, or service restart.

## Verified production state

SSH inspection reached the existing `cove` deployment account on the documented
host. Both public application DNS names resolved to that host. The running
application images identify source `0ae56bc6ce882ce1fad5730c1bc19e5d8677c238`,
matching this checkout at the start of the inspection.

| Observation | Result | Boundary |
| --- | --- | --- |
| Architecture / CPUs | Linux x86_64 / 6 logical CPUs | vCPU allocation, not a dedicated-core guarantee |
| RAM | 11,960 MiB total; 8,627 MiB available in initial snapshot | Idle/current observation, not a workload reservation |
| Swap | None | No additional swap budget assumed |
| Host load average | 0.34 / 0.55 / 0.50 | Initial snapshot |
| Short CPU sample | 6.07% busy, 0% steal, 0.08% I/O wait | Two-second sample, not a load test |
| Last 24 hours CPU | Maximum five-minute average busy 17.88%; maximum five-minute average steal 0% | Prometheus range query sampled every five minutes; short spikes can be missed |
| Last 24 hours memory | Minimum available 8,872,169,472 bytes, approximately 8.26 GiB | Prometheus history, not maximum permitted service allocation |
| Docker Engine | 29.7.2 | Server-reported version |
| Containers | 17 total, 16 running | The stopped container is the production Alertmanager configuration helper |
| Grading worker | 2 slots; 0.75 CPU / 768 MiB | Effective container settings and selected non-secret environment fields |
| Grading sandbox | 2 slots + 1 spare; 1.5 CPU / 1,280 MiB | Effective container settings |
| Runtime | Pyodide 0.27.5 | Effective worker/sandbox environment |
| Grading OOM events | 0 OOM / 0 OOM kills in both containers | Cumulative counters for current container lifetimes |
| Throttling | Nonzero cumulative counters in worker and sandbox | Establishes past throttling, not the fraction of today's submission time attributable to it |
| Root filesystem before | 193 GiB reported size; 138 GiB used; 56 GiB available; 72% | Rounded `df -h` figures |
| Root filesystem after | 137 GiB used; 57 GiB available; 71% | Rounded figures; not an exact reclaimed-byte calculation |

Docker reported 227 images, 141.2 GB image usage and 132.9 GB reclaimable before
cleanup. Most images were historical production releases. Those were preserved:
the user's request concerned cancelled grading artifacts, and general release
retention cleanup needs its own retention policy.

The 16 running containers' configured memory ceilings sum to 11,712 MiB.
These are independent maximums, not resident usage or guaranteed reservations.
They leave only 248 MiB relative to reported host RAM if reached together,
before host overhead or additional execution guests. The current idle headroom
therefore does not justify adding hundreds of execution slots. A production
resource ledger must include simultaneous workload limits and host headroom.

All inspected production services with configured health checks were healthy.
Services without a health check remained running; no additional health
certification is inferred for those services.

## Removed from the VPS

The image matched the immutable ID in the earlier preparation manifest and had
no container references, including stopped containers:

- Tag: `cove-performance-fixture:20261027-99032bc0`.
- Image: `sha256:1fd008592fb0b6df622d6c415523d580263e3c8c60ef26f52e9e2a9bce615345`.
- `docker image inspect` size: 570,770,118 bytes. Docker's listing separately
  displayed 1.2 GB; neither value is claimed as exclusively reclaimed storage.

Removed the exact preparation directory
`/home/cove/performance-benchmark-20261027-99032bc0` after verifying its resolved
path, absence of symlinks, expected top-level entries (`deploy`, `docs`, `node`,
`packages`), and absence of `.env`/`*.env` files and result-directory files.
Its file sizes totaled 125,106,480 bytes; `du -sh` reported 120 MB. This was the
temporary fixture bundle, including an exported Node executable, not the live
application directory. The repository's source and prior research remain.

No custom `/run/systemd/system/cove-performance-benchmark.slice` unit file was
present. The slice reported inactive and no control group. No privileged
systemd cleanup was necessary.

## Removed from local Docker Desktop

Removed 10 tags identifying 9 distinct experimental image IDs, after checking
every local container for references. Local context was explicitly verified as
`desktop-linux`.

- `cove-grading-native:task2`
- `cove-grading-native:task5`
- `cove-native-controller:prototype`
- `cove-native-grading:prototype`
- `cove-native-pyodide-baseline:af8c54ae`
- `cove-judge-performance:candidate-amd64`
- `cove-performance-fixture:20261027-99032bc0`
- `cove-judge-performance:candidate`
- `cove-judge-performance:instrumented`
- `cove-judge-performance:baseline`

No blanket image, system, volume, or build-cache prune was performed. Unrelated
local projects, local volumes and existing build cache were preserved.

## Verification and capacity conclusion

Before/after inventories matched for all 17 VPS containers and all 11 local
containers: IDs, image IDs, states, start times and restart counts. The VPS's
configured health states also matched. Final VPS inspection found no remaining
image tags matching the identified grading experiment prefixes.

Image deletion used exact tags and verified IDs, without forced removal.
No production container, application image tag, database, Redis queue, persistent
volume, learner data, or live deployment configuration was removed or changed.
Removing unused images frees disk space; it does not itself accelerate grading.

The user subsequently specified **200 simultaneous student submissions, all
visible within five seconds**, for short ten-case programs. This VPS has idle
headroom, but that requirement is not established by the current resource
allocation, historical observations, or local prototype. Keep it as a candidate
control plane. Execution capacity and control-plane throughput require the
separate acceptance work in the
[new specification](../superpowers/specs/2026-11-01-native-grading-classroom-capacity-design.md).
