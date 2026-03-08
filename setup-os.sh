#!/usr/bin/env bash
set -euo pipefail

# Bazalt — OS bootstrap for Debian 13 (trixie)
# Run as root: sudo bash setup-os.sh
# Or: chmod +x setup-os.sh && sudo ./setup-os.sh

log() { echo -e "\033[1;32m[setup]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && err "Run with sudo: sudo bash setup-os.sh"

# Determine the real user: prefer SUDO_USER, fall back to first non-root user in /home
if [[ -n "${SUDO_USER:-}" ]]; then
  ACTUAL_USER="$SUDO_USER"
elif [[ "$USER" != "root" ]]; then
  ACTUAL_USER="$USER"
else
  # Running as root directly (su -); pick the first human user from /home
  ACTUAL_USER=$(ls /home | head -1)
  [[ -z "$ACTUAL_USER" ]] && err "Could not determine a non-root user. Run: SUDO_USER=youruser bash setup-os.sh"
fi
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
log "Configuring for user: $ACTUAL_USER (home: $ACTUAL_HOME)"

log "Updating apt..."
apt-get update -qq
apt-get upgrade -y -qq

log "Installing base packages..."
apt-get install -y -qq \
  curl wget git unzip zip \
  build-essential \
  ca-certificates gnupg \
  lsb-release \
  apt-transport-https \
  jq \
  htop \
  sudo

# ── Sudoers ──────────────────────────────────────────────────────────────────
if ! groups "$ACTUAL_USER" | grep -q sudo; then
  log "Adding $ACTUAL_USER to sudo group..."
  usermod -aG sudo "$ACTUAL_USER"
fi

# ── Docker ───────────────────────────────────────────────────────────────────
log "Installing Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
usermod -aG docker "$ACTUAL_USER"
log "Docker installed. docker compose version: $(docker compose version)"

# ── Node.js 22 via fnm ───────────────────────────────────────────────────────
log "Installing fnm (Node version manager)..."
sudo -u "$ACTUAL_USER" bash -c 'curl -fsSL https://fnm.vercel.app/install | bash'

FNM_BIN="$ACTUAL_HOME/.local/share/fnm/fnm"

log "Installing Node.js 22 LTS..."
sudo -u "$ACTUAL_USER" bash -c "
  eval \"\$($FNM_BIN env)\"
  $FNM_BIN install 22
  $FNM_BIN default 22
"

# Persist fnm in shell rc files
SHELL_RCS=("$ACTUAL_HOME/.bashrc" "$ACTUAL_HOME/.zshrc")
FNM_INIT='eval "$(~/.local/share/fnm/fnm env --use-on-cd)"'
for rc in "${SHELL_RCS[@]}"; do
  if [[ -f "$rc" ]] && ! grep -q "fnm env" "$rc"; then
    echo "" >> "$rc"
    echo "# fnm (Node version manager)" >> "$rc"
    echo "$FNM_INIT" >> "$rc"
    log "Added fnm init to $rc"
  fi
done

# ── pnpm ────────────────────────────────────────────────────────────────────
log "Installing pnpm..."
sudo -u "$ACTUAL_USER" bash -c "
  eval \"\$($FNM_BIN env)\"
  npm install -g pnpm
"
log "pnpm installed."

# ── Git config reminder ──────────────────────────────────────────────────────
log "Checking git config..."
GIT_NAME=$(sudo -u "$ACTUAL_USER" git config --global user.name 2>/dev/null || true)
if [[ -z "$GIT_NAME" ]]; then
  log "NOTE: Git user not configured. Run after setup:"
  echo "    git config --global user.name 'Your Name'"
  echo "    git config --global user.email 'you@example.com'"
fi

# ── Init git repo ────────────────────────────────────────────────────────────
BAZALT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -d "$BAZALT_DIR/.git" ]]; then
  log "Initialising git repository in $BAZALT_DIR..."
  sudo -u "$ACTUAL_USER" git -C "$BAZALT_DIR" init
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
log "Done! Tools installed:"
sudo -u "$ACTUAL_USER" bash -c "eval \"\$($FNM_BIN env)\" && echo '  node  '$(node --version) && echo '  npm   '$(npm --version) && echo '  pnpm  '$(pnpm --version)"
echo "  docker  $(docker --version)"
echo "  docker compose  $(docker compose version)"
echo ""
log "IMPORTANT: Log out and back in (or run 'newgrp docker') so Docker group takes effect."
log "Then open a new terminal and run: claude"
