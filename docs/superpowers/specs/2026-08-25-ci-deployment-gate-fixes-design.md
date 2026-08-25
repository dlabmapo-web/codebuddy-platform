# CI and Deployment Gate Fixes Design

## Goal

Restore the production CI gates without weakening the deployment security model.

## Clean typechecking

`@cove/i18n` tests import Node built-ins and use Node-specific `import.meta`
properties. The package will declare `@types/node` directly so a clean pnpm
install has the same type environment as local development.

## Container scanning

All workflows will use Trivy Action `v0.36.0` pinned to its immutable commit SHA.
This fixes the invalid tag and prevents a mutable action tag from changing the
code executed by CI.

The final Node images will omit npm and Corepack because the services execute
already-built JavaScript and do not need package managers at runtime. The
migration image will invoke the installed Prisma CLI directly. This removes the
base image's vulnerable `node-tar` copy without suppressing a valid scanner
finding.

## Cross-runtime formatting

Korean day periods will be rendered from academy-local numeric clock fields
instead of ICU's localized day-period token. ICU versions disagree between
`오전`/`오후` and `AM`/`PM`; explicit rendering keeps server, browser, macOS, and
Linux output identical and prevents hydration mismatches.

## Alertmanager configuration

The rendered Alertmanager configuration contains a Resend credential and will
remain mode `0600`. A one-shot, capability-limited initializer will copy it into
Alertmanager's private persistent volume and assign ownership to the existing
non-root Alertmanager user. Alertmanager will read the private copy and continue
to run as UID/GID `65534` with a read-only root filesystem.

The local CI validator is an ephemeral read-only process, so it will run as root
only to read the protected temporary source file. It will not start the service
or write deployment state.

## Verification

- Install from the updated lockfile.
- Run repository typechecking and tests.
- Run deployment configuration validation, including Caddy, Prometheus, and
  Alertmanager validators.
- Push the fixes and confirm all GitHub Actions jobs complete successfully.
