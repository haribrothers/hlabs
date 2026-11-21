#!/bin/sh
# After the .deb or .rpm installs hlabs (US-INST-27, D-145): Caddy may use ports 80 and 443 from the user's service,
# and the people who can administer this computer may run hlabs-priv, the only commands hlabs runs as root (D-061).
set -e
chmod 0755 /usr/lib/hlabs/hlabs-priv /usr/lib/hlabs/hlabs-confirm
if command -v setcap >/dev/null 2>&1; then
  setcap cap_net_bind_service=+ep /usr/lib/hlabs/daemon/bin/caddy || true
fi
if [ -d /etc/sudoers.d ] && command -v visudo >/dev/null 2>&1; then
  rule="$(mktemp)"
  printf '%%sudo ALL=(root) NOPASSWD: /usr/lib/hlabs/hlabs-priv\n%%wheel ALL=(root) NOPASSWD: /usr/lib/hlabs/hlabs-priv\n' >"$rule"
  if visudo -cf "$rule" >/dev/null 2>&1; then install -m 0440 "$rule" /etc/sudoers.d/hlabs; fi
  rm -f "$rule"
fi
exit 0
