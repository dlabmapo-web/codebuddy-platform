# Contabo VPS Bootstrap Documentation Design

**Date:** 2026-08-26
**Status:** Approved for specification

## 1. Purpose

Create a Git-safe operational guide that records how Cove's Contabo Cloud VPS
6 was provisioned, verified, hardened, and prepared for production deployment.
The guide must help the operator repeat the procedure without relying on chat
history, while exposing no credentials or identifying infrastructure values.

## 2. Deliverables

The implementation will:

1. create `docs/operations/contabo-vps-bootstrap.md`; and
2. add a concise link to that guide from
   `docs/operations/production-deployment.md`.

The existing production deployment runbook remains the source for the complete
application release process. The new guide owns the machine-purchase,
bootstrap, access-verification, and SSH-hardening details.

## 3. Audience and assumptions

The primary reader is a Cove operator working from macOS who may not be
familiar with SSH, VNC, Linux administration, or the difference between an SSH
key passphrase and a server account password.

The guide assumes:

- one Contabo Cloud VPS 6 in the Japan region;
- Ubuntu 24.04 LTS;
- a local checkout of this repository;
- the repository-provided `deploy/scripts/bootstrap-vps.sh`; and
- a dedicated deployment account named `cove`.

## 4. Content structure

The guide will be chronological and contain the following sections:

1. **Purchase configuration** — server size, Japan region, Ubuntu 24.04, one
   IPv4 address, 200 GB SSD, 250 GB Object Storage, and the intentionally
   omitted Contabo Auto Backup and Monitoring add-ons.
2. **Security boundaries** — values that are safe to record and values that
   must never enter Git, screenshots, chat, or terminal transcripts.
3. **Local SSH key** — generate `~/.ssh/cove-production`, explain its two
   files, verify permissions, and distinguish the key passphrase from server
   passwords.
4. **Host identity verification** — obtain the ED25519 fingerprint through the
   Contabo VNC console, obtain it independently with `ssh-keyscan`, and compare
   the exact SHA-256 values before trusting the host.
5. **Initial bootstrap** — upload only the bootstrap script and public key,
   connect as root, and run the first non-hardening bootstrap pass.
6. **Deployment-user verification** — open a second connection as `cove`,
   prove Docker access, configure and verify sudo access, and keep recovery
   sessions open until hardening is accepted.
7. **Firewall and service checks** — verify UFW exposes only SSH, HTTP, HTTPS,
   and HTTP/3; verify Docker, Fail2ban, and UFW service health.
8. **SSH hardening** — disable root login, password authentication, and
   keyboard-interactive authentication while preserving public-key access and
   required SSH forwarding.
9. **Ubuntu cloud-init precedence repair** — document that OpenSSH uses the
   first obtained value, so `50-cloud-init.conf` can override a later
   `99-cove-hardening.conf`; install the hardening file as
   `00-cove-hardening.conf`, validate with `sshd -t` and `sshd -T`, then reload
   SSH.
10. **Kernel reboot and acceptance** — reboot only after fresh `cove` access
    succeeds, then verify the running kernel, services, Docker, and a new
    key-only SSH connection.
11. **VNC shutdown and recovery** — disable VNC only after acceptance, explain
    when it may be re-enabled, and keep recovery instructions separate from
    normal operations.
12. **Completion checklist** — a short set of objective pass/fail assertions.

## 5. Security and redaction rules

The committed guide will use placeholders including `VPS_IP`,
`VNC_ADDRESS`, `VNC_PORT`, and `SHA256_HOST_FINGERPRINT`.

It will not contain:

- the real VPS IPv4 or IPv6 address;
- Contabo customer or order identifiers;
- the real VNC gateway or port;
- root, `cove`, VNC, or account passwords;
- the SSH private key, its passphrase, or private-key contents;
- Object Storage access keys, endpoints tied to the account, or Restic
  credentials; or
- the observed host fingerprint.

The guide may name `~/.ssh/cove-production.pub` because a public-key path is
not secret, but it will explicitly prohibit committing either generated key
file to the repository.

## 6. Error handling and recovery

Each risky transition will have a preceding verification and a recovery note:

- do not accept an SSH host key until the VNC and network fingerprints match;
- do not activate SSH hardening until a fresh `cove` key login works;
- do not reload SSH until `sshd -t` succeeds and `sshd -T` reports the four
  intended authentication values;
- do not reboot until Docker and sudo work for `cove`;
- do not disable VNC until a post-hardening, post-reboot SSH connection works;
  and
- use the Contabo panel to re-enable VNC if key-only SSH later becomes
  inaccessible.

Commands that delete data, reinstall the VPS, reset snapshots, or expose
secrets are outside the guide's normal path.

## 7. Verification strategy

Documentation verification will include:

- checking every shell block for valid Bash syntax where practical;
- checking all referenced repository paths;
- confirming the commands agree with the current bootstrap script and
  production runbook;
- scanning the new and modified documents for the known live IP, customer ID,
  order IDs, VNC address, host fingerprint, and credential-like values;
- scanning for unfinished sections and placeholder markers; and
- reviewing the final diff to ensure the existing application deployment
  procedure is not duplicated or contradicted.

## 8. Repository follow-up boundary

The guide will accurately record the live cloud-init precedence repair and
the need for `cove` administrative access. Changing
`deploy/scripts/bootstrap-vps.sh` to create the correct early-loading SSH file
and configure sudo reproducibly is a separate implementation change. The
documentation may flag that follow-up, but it will not silently claim the
current script already performs it.

## 9. Acceptance criteria

The work is complete when:

1. a new operator can follow the guide from purchase through a verified,
   key-only `cove` SSH connection;
2. the guide explains the cloud-init precedence failure and its safe repair;
3. every destructive or lockout-prone step has a verification gate;
4. no live infrastructure identifier or credential appears in the committed
   files;
5. the production deployment runbook links to the new guide without
   duplicating it; and
6. the documentation checks and secret scans pass.
