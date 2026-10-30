# Focused prerequisite fix — 2026-10-30

Base: `4ea8b4c2`; code revision: `5177da1002f33096e23e92e0a6e0b1d44f2dfaac`.
Resumed by the user from the saved checkpoint. The approved disposable Linux
design and resource/isolation contracts remain in force.

The first run40848107655 failed before guest execution because its latest-version
rootless prerequisite transaction proposed changing a protected engine package.
That failed summary remains preserved; it did not identify the exact package.

The fix selects `docker-ce-rootless-extras:amd64` at the installed
`docker-ce:amd64` package version. It verifies the selected version has exclusively
the official Docker noble/stable AMD64 package origin, independently of the
latest APT candidate. The simulated and real transactions specify every installed
protected engine package at its installed architecture/version. Any removal or
protected `Inst`, including architecture-qualified names, refuses installation;
the real transaction also uses `--no-remove`. Protected package maps, selected
extras version, dockerd hash and existing rootful daemon/workload identity are
checked afterward. No rootful guest or isolation fallback was introduced.

A fixed root-owned `prerequisite-packages.json` retains only bounded installed
protected versions, selected rootless version, official-origin result and
projected simulation actions/package/old/new versions/status. Failed simulations
retain their numeric status and parseable plan. Raw APT prose, origins and stderr
are discarded. The existing collector reads and projects this diagnostic through
its guarded fixed path; it does not establish kernel success.

Validation: implementer76 CI contracts; parent independently76 contracts
(4.715seconds), Python compile, shell/Node syntax and whitespace pass. Parent
also reran41 runtime tests (zero skips) and the actual synthetic BuildKit
COPY-context export successfully. Independent scoped reviewer76 contracts
(5.086seconds) and range whitespace check pass; source fix approved.

Controller pushed the reviewed source to the existing feature branch. New runs:
- Disposable kernel41011046173:
  <https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41011046173>.
- Ordinary isolated41011046179:
  <https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41011046179>.

Actual run41011046173 failed later at daemon startup after matching package
installation succeeded. Its summary is archived and its details are recorded
in the main verification report; no guest case started and exact cleanup passed. No production access, activation, merge, tag, paid runner or
server purchase was performed.
