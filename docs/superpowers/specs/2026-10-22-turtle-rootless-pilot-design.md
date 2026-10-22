# Public Turtle pilot on the existing VPS

## Purpose and scope

The operator has no separate execution server and requested a Turtle pilot on
the existing VPS. Use a separate rootless Docker daemon on that machine, with
one active drawing. This is a limited pilot; shared host resources and kernel
remain a constraint, and a full class requires measured capacity and a separate
execution host.

## Design

The deployment user's `cove-turtle-docker.service` owns a separate socket and
data directory. Its user cgroup slice includes the daemon and student scopes,
with a 1 GiB memory maximum, 1.5 CPU quota, and 256 task maximum. Each student
container additionally keeps the established 512 MiB, one CPU, 64 PID, 120-second
profile, network isolation, and read-only filesystem.

A separate Compose project runs the trusted broker on the existing internal
GUI control network. It exposes no host ports, mounts only the rootless socket,
and reserves 256 MiB. Broker startup requires rootless mode, cgroup v2/systemd,
working memory/CPU/PID controllers, the trial-only profile, and capacity one.
The course Docker socket and context are not changed. API and display traffic
reach this broker only through the private network and the protected public BFF.

The setup script runs without sudo after the administrator installs `uidmap`
and `slirp4netns` and enables user lingering. It refuses to overwrite differing
configuration. PIN pepper and independent broker credentials stay in protected
server files. Admission is enabled through the approved release manifest only
after the broker and a real drawing have been verified.

## Verification and completion criteria

The existing VPS passes a real resource smoke check: cgroup memory 536870912,
CPU quota 100000/100000, PIDs 64, blocked network, and read-only root filesystem.
The slice reports a 1 GiB maximum and 1.5 CPU quota. Unit tests reject rootful
Docker and missing controllers. Compose validation checks the private network,
independent socket, one-session profile, and broker resource limits. An actual
drawing through the private broker must pass before the operator is told the
GitHub production approval is ready.
