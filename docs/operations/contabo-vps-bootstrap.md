# Contabo VPS Bootstrap Guide

This guide prepares a Contabo Cloud VPS for Cove's Docker production stack.
It is written for a macOS operator and uses placeholders so infrastructure
identifiers and credentials never enter Git.

The application release procedure continues in
[`production-deployment.md`](production-deployment.md).

## 1. Purchased configuration

The production machine uses:

- Contabo Cloud VPS 6;
- six vCPU and 12 GB RAM;
- 200 GB SSD;
- Ubuntu 24.04 LTS;
- Japan region;
- one public IPv4 address;
- 250 GB Contabo Object Storage;
- no Contabo Auto Backup add-on; and
- no Contabo Monitoring add-on.

Object Storage is for encrypted off-server backups. It does not replace an
automated backup schedule or a tested restore procedure.

## 2. Values that must stay private

Use these placeholders in notes and commands:

```text
VPS_IP
VNC_ADDRESS
VNC_PORT
SHA256_HOST_FINGERPRINT
```

Never commit, paste into chat, or expose in screenshots:

- the SSH private key or its passphrase;
- root, `cove`, VNC, Contabo, or GitHub passwords;
- Supabase, Resend, GHCR, Object Storage, or Restic credentials;
- production `.env` files;
- Contabo customer and order identifiers; or
- recovery codes.

An SSH key passphrase unlocks the private key on the Mac. The `cove` password
is a separate server password used only when `sudo` asks for it. Neither is the
initial Contabo root password.

## 3. Secure the Contabo account

Enable two-factor authentication in the Contabo customer panel and save the
recovery codes in an offline password manager. Keep account 2FA enabled even
though normal server administration uses SSH keys.

VNC is a recovery channel, not the normal login method. Enable it only while
verifying or recovering the server, and disable it after key-only SSH works.

## 4. Create the deployment SSH key on macOS

Run these commands in a local Mac Terminal, not in Ubuntu or VNC:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -a 100 \
  -f ~/.ssh/cove-production \
  -C "cove-production"
chmod 600 ~/.ssh/cove-production
chmod 644 ~/.ssh/cove-production.pub
ls -l ~/.ssh/cove-production ~/.ssh/cove-production.pub
```

Choose a strong key passphrase and store it in the password manager. The file
without `.pub` is private and must never leave the Mac. The `.pub` file is the
public key that may be copied to the VPS. Do not commit either generated file.

## 5. Verify the server's SSH identity

Open the VPS's VNC details in the Contabo panel. Connect using macOS Screen
Sharing at `VNC_ADDRESS:VNC_PORT`, then sign in to Ubuntu as `root` with the
password chosen during purchase.

Inside the VNC Ubuntu console, obtain the authoritative ED25519 fingerprint:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

On the Mac, independently obtain the fingerprint offered over the network:

```bash
ssh-keyscan -t ed25519 VPS_IP 2>/dev/null \
  | ssh-keygen -lf - -E sha256
```

The complete SHA-256 fingerprints must match exactly. Stop if they differ.
Do not accept the SSH host key until the mismatch is understood through the
Contabo console.

## 6. Upload and run the first bootstrap pass

From the repository root on the Mac:

```bash
scp deploy/scripts/bootstrap-vps.sh root@VPS_IP:/root/
scp ~/.ssh/cove-production.pub root@VPS_IP:/root/cove-production.pub
ssh root@VPS_IP
bash /root/bootstrap-vps.sh cove /root/cove-production.pub
```

The script installs Docker, Fail2ban, UFW, unattended upgrades, Restic, and
supporting tools. It creates `cove`, adds it to `docker` and `sudo`, installs
the SSH public key, and prepares `/opt/cove`.

If `cove` has no local password, the script asks for one. This is the password
that future `sudo` commands request. It is not enabled for remote SSH after
hardening.

The first pass deliberately leaves password SSH and root SSH unchanged. Keep
the root session and VNC available until the following acceptance checks pass.

## 7. Verify the deployment account

Open a second Mac Terminal and connect with the key:

```bash
ssh -i ~/.ssh/cove-production cove@VPS_IP
id
docker version
sudo -v
sudo ufw status verbose
```

`id` must show both `docker` and `sudo`. Docker must show client and server
information. Enter the `cove` server password when `sudo` prompts.

UFW must be active and allow only:

```text
22/tcp
80/tcp
443/tcp
443/udp
```

Equivalent IPv6 rules are expected. Do not close this verified session.

## 8. Activate SSH hardening

In the original root session, rerun the bootstrap with hardening enabled:

```bash
HARDEN_SSH=1 bash /root/bootstrap-vps.sh \
  cove /root/cove-production.pub
```

The script installs `/etc/ssh/sshd_config.d/00-cove-hardening.conf`. The `00-`
prefix is important: OpenSSH uses the first obtained value, and Ubuntu's
`50-cloud-init.conf` may otherwise keep password authentication enabled. The
script validates syntax and all effective values before reloading SSH.

Confirm the effective policy:

```bash
sshd -T | grep -E \
  '^(permitrootlogin|pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication) '
```

Expected output:

```text
permitrootlogin no
pubkeyauthentication yes
passwordauthentication no
kbdinteractiveauthentication no
```

If a server was bootstrapped with an older script, inspect precedence with:

```bash
grep -RniE \
  '^[[:space:]]*(Include|PasswordAuthentication|KbdInteractiveAuthentication|PermitRootLogin|PubkeyAuthentication)' \
  /etc/ssh/sshd_config /etc/ssh/sshd_config.d
```

Do not reload SSH after a failed `sshd -t` or incorrect `sshd -T` result.

## 9. Prove fresh key-only access

Open a third Mac Terminal and create a completely new connection:

```bash
ssh -i ~/.ssh/cove-production cove@VPS_IP
echo "Fresh key-only SSH: OK"
```

The prompt may request the private-key passphrase from the Mac. It must not ask
for the `cove` server password as an SSH authentication method.

Only after this new session succeeds may the old root session be closed.

## 10. Reboot and verify the updated kernel

From a verified `cove` SSH session:

```bash
sudo reboot
```

The disconnect is expected. Wait for the VPS to return, reconnect from the
Mac, and verify:

```bash
ssh -i ~/.ssh/cove-production cove@VPS_IP
uname -r
systemctl is-active docker fail2ban ufw ssh
docker version >/dev/null && echo "Docker after reboot: OK"
sudo sshd -T | grep -E \
  '^(permitrootlogin|pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication) '
```

Every service must report `active`, Docker must report `OK`, and the effective
SSH settings must remain the four expected values from the preceding section.

## 11. Disable normal VNC access

After the post-reboot key-only connection succeeds, disable VNC access in the
Contabo customer panel and close Screen Sharing. If SSH later becomes
inaccessible, re-enable VNC from the panel temporarily, repair SSH or the
firewall, verify a fresh SSH session, and disable VNC again.

Do not reinstall the VPS or roll back a snapshot merely because one SSH client
fails. First verify the IP, local key path, key passphrase, network, Contabo
status, and VNC console.

## 12. Completion checklist

- [ ] Contabo account 2FA is enabled and recovery codes are stored offline.
- [ ] The Mac private key is mode `0600` and has never left the Mac.
- [ ] The VNC and network ED25519 fingerprints matched before first SSH trust.
- [ ] `cove` belongs to `docker` and `sudo`.
- [ ] Docker works without `sudo` in a fresh `cove` session.
- [ ] UFW allows only SSH, HTTP, HTTPS, and HTTP/3.
- [ ] Docker, Fail2ban, UFW, and SSH are active after reboot.
- [ ] Root SSH login and SSH password authentication are disabled.
- [ ] A new key-only `cove` connection succeeds after reboot.
- [ ] VNC is disabled for normal operation.

Continue with [the production deployment runbook](production-deployment.md)
only after every applicable item passes.
