#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  printf 'Run this script as root on a fresh Ubuntu VPS.\n' >&2
  exit 1
fi

deploy_user="${1:-}"
public_key_file="${2:-}"
deploy_root="/opt/cove"

[[ "$deploy_user" =~ ^[a-z_][a-z0-9_-]{2,31}$ ]] || {
  printf 'usage: bootstrap-vps.sh DEPLOY_USER SSH_PUBLIC_KEY_FILE\n' >&2
  exit 2
}
[[ -f "$public_key_file" ]] || {
  printf 'SSH public key file does not exist: %s\n' "$public_key_file" >&2
  exit 2
}
grep -Eq '^(ssh-ed25519|ssh-rsa) [A-Za-z0-9+/=]+' "$public_key_file" || {
  printf 'The supplied file is not a supported SSH public key.\n' >&2
  exit 2
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  ca-certificates curl fail2ban gettext-base gnupg jq restic rsync \
  unattended-upgrades ufw

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
. /etc/os-release
printf '%s\n' \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

if ! id "$deploy_user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$deploy_user"
fi
usermod -aG docker "$deploy_user"

user_home="$(getent passwd "$deploy_user" | cut -d: -f6)"
install -d -m 0700 -o "$deploy_user" -g "$deploy_user" "$user_home/.ssh"
install -m 0600 -o "$deploy_user" -g "$deploy_user" "$public_key_file" "$user_home/.ssh/authorized_keys"

install -d -m 0750 -o "$deploy_user" -g "$deploy_user" "$deploy_root"
for directory in backups generated releases scripts secrets state; do
  install -d -m 0700 -o "$deploy_user" -g "$deploy_user" "$deploy_root/$directory"
done

expected_daemon="$(mktemp)"
trap 'rm -f -- "$expected_daemon"' EXIT
cat > "$expected_daemon" <<'JSON'
{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
JSON
if [[ -f /etc/docker/daemon.json ]] && ! cmp -s "$expected_daemon" /etc/docker/daemon.json; then
  printf '/etc/docker/daemon.json already contains different settings; merge them manually and rerun.\n' >&2
  exit 1
fi
install -m 0644 "$expected_daemon" /etc/docker/daemon.json
systemctl enable --now docker
systemctl restart docker

cat > /etc/fail2ban/jail.d/cove-sshd.conf <<'CONF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
CONF
systemctl enable --now fail2ban

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
systemctl enable --now unattended-upgrades

getent ahosts ghcr.io >/dev/null || {
  printf 'DNS resolution check failed for ghcr.io.\n' >&2
  exit 1
}

clock_synchronized=false
for _ in $(seq 1 30); do
  if [[ "$(timedatectl show --property=NTPSynchronized --value 2>/dev/null)" == "yes" ]]; then
    clock_synchronized=true
    break
  fi
  sleep 1
done
[[ "$clock_synchronized" == "true" ]] || {
  printf 'System clock is not synchronized; fix NTP before deployment.\n' >&2
  exit 1
}

if [[ "${HARDEN_SSH:-0}" == "1" ]]; then
  cat > /etc/ssh/sshd_config.d/99-cove-hardening.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
X11Forwarding no
AllowTcpForwarding yes
CONF
  sshd -t
  systemctl reload ssh
  printf 'SSH password and direct root login are now disabled.\n'
else
  printf 'SSH hardening is staged but not activated. Verify a second SSH session as %s, then rerun with HARDEN_SSH=1.\n' "$deploy_user"
fi

printf 'VPS bootstrap completed. Log out and in again before using Docker as %s.\n' "$deploy_user"
