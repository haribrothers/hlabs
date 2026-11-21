#!/bin/sh
# hlabs installer for Linux servers (US-INST-23, US-INST-24, D-140):
#
#   curl -fsSL https://hlabs.h4loom.com/install.sh | sh
#
# Installs Docker Engine when it's missing, the hlabs user and its data in /var/lib/hlabs, hlabs itself in
# /opt/hlabs/<version> (with the `current` link updates switch, D-118), the `hlabs` command and the systemd service
# hlabsd.service, then starts it and prints where to finish setup. Run it again to upgrade; your data stays.
#
# What it downloads is checked against SHA256SUMS, and SHA256SUMS against its signature by the hlabs update key
# (D-141), with openssl. HLABS_VERSION=<v> installs that version instead of the latest; HLABS_TARBALL=<file> installs
# a local build (its SHA256SUMS and SHA256SUMS.sig sit beside it).
#
#   … | sh -s -- --uninstall [--keep-data | --delete-everything] [--yes]     removes hlabs (D-144); so does
#   sudo hlabs uninstall
set -eu

RELEASES="https://github.com/haribrothers/hlabs/releases"
INSTALL_URL="https://hlabs.h4loom.com/install.sh"
# The hlabs update key (Ed25519, base64 of its SubjectPublicKeyInfo). `pnpm build:linux` writes it in.
PUBLIC_KEY="@HLABS_PUBLIC_KEY@"

ROOT=/opt/hlabs
DATA=/var/lib/hlabs
LOG=/var/log/hlabs-install.log
UNIT=/etc/systemd/system/hlabsd.service
PRIV=/usr/lib/hlabs/hlabs-priv
SUDOERS=/etc/sudoers.d/hlabs
DAEMON_PORT=7474
OS_RELEASE="${HLABS_OS_RELEASE:-/etc/os-release}"
MEMINFO="${HLABS_MEMINFO:-/proc/meminfo}"

# ── Output ──────────────────────────────────────────────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  GREEN="$(printf '\033[32m')" YELLOW="$(printf '\033[33m')" RED="$(printf '\033[31m')" BOLD="$(printf '\033[1m')"
  RESET="$(printf '\033[0m')"
else
  GREEN='' YELLOW='' RED='' BOLD='' RESET=''
fi
say() { printf '%s\n' "$*"; }
ok() { printf '%s✓ %s%s\n' "$GREEN" "$*" "$RESET"; }
note() { printf '%s! %s%s\n' "$YELLOW" "$*" "$RESET"; }
# fail <what went wrong> [<what to do>]: says so, points at the log and stops.
fail() {
  printf '%s✗ %s%s\n' "$RED" "$1" "$RESET" >&2
  [ -n "${2:-}" ] && printf '  %s\n' "$2" >&2
  [ -s "$LOG" ] && printf '  Details are in %s\n' "$LOG" >&2
  exit 1
}
# Runs a command with its output in the log.
quietly() { "$@" >>"$LOG" 2>&1; }
has() { command -v "$1" >/dev/null 2>&1; }

# download <url> [<file>]: to the file, or to stdout.
download() {
  if has curl; then
    if [ -n "${2:-}" ]; then curl -fsSL --retry 3 -o "$2" "$1"; else curl -fsSL --retry 3 "$1"; fi
  elif has wget; then
    wget -q -O "${2:--}" "$1"
  else
    fail "Couldn't download $1" "Install curl, then run this again"
  fi
}

# ── Root ────────────────────────────────────────────────────────────────────────────────────────────────────────────
# Not root: run again with sudo, from this file or (piped from curl) from the site.
need_root() {
  [ "$(id -u)" = 0 ] && return 0
  has sudo || fail "Run this as root or with sudo"
  case "$0" in
    *install*.sh)
      [ -r "$0" ] && exec sudo env HLABS_VERSION="${HLABS_VERSION:-}" HLABS_TARBALL="${HLABS_TARBALL:-}" sh "$0" "$@"
      ;;
  esac
  download "$INSTALL_URL" | sudo env HLABS_VERSION="${HLABS_VERSION:-}" HLABS_TARBALL="${HLABS_TARBALL:-}" sh -s -- "$@"
  exit $?
}

# ── This computer ───────────────────────────────────────────────────────────────────────────────────────────────────
os_field() { (. "$OS_RELEASE" && eval "printf '%s' \"\${$1:-}\""); }

# "Ubuntu 24.04", "Debian 12", "Fedora 41"…
os_name() {
  id="$(os_field ID)"
  case "$id" in
    ubuntu) name=Ubuntu ;;
    debian) name=Debian ;;
    fedora) name=Fedora ;;
    rhel) name=RHEL ;;
    rocky) name='Rocky Linux' ;;
    almalinux) name=AlmaLinux ;;
    centos) name=CentOS ;;
    *) name="$(os_field NAME)" ;;
  esac
  printf '%s %s' "${name:-Linux}" "$(os_field VERSION_ID)"
}

# x86_64 or aarch64, the names of hlabs's downloads (D-118); anything else as uname says it.
arch_name() {
  case "$(uname -m)" in
    x86_64 | amd64) echo x86_64 ;;
    aarch64 | arm64) echo aarch64 ;;
    *) uname -m ;;
  esac
}

# Rounded to whole GB: memory as the system counts it (GiB), disks as their makers do (10^9 bytes).
memory_gb() { awk '/^MemTotal:/ { printf "%d", $2 / 1048576 + 0.5 }' "$MEMINFO"; }
free_gb() {
  dir="$DATA"
  while [ ! -d "$dir" ]; do dir="$(dirname "$dir")"; done
  df -Pk "$dir" | awk 'NR == 2 { printf "%d", $4 * 1024 / 1000000000 }'
}

# One line about this computer, then stops if hlabs can't run here.
check_system() {
  arch="$(arch_name)"
  shown_arch="$arch"
  [ "$arch" = aarch64 ] && shown_arch=arm64
  line="$(os_name) · $shown_arch · $(memory_gb) GB memory · $(free_gb) GB free"
  problem=''
  case "$arch" in
    x86_64 | aarch64) ;;
    *) problem="hlabs runs on x86_64 and arm64 computers, and this one is $shown_arch." ;;
  esac
  if [ -z "$problem" ] && [ ! -d "${HLABS_SYSTEMD_DIR:-/run/systemd/system}" ]; then
    problem="hlabs needs systemd, which this system doesn't run."
  fi
  if [ -z "$problem" ] && ! openssl version 2>/dev/null | grep -q '^OpenSSL [3-9]'; then
    problem="hlabs needs OpenSSL 3 to check what it downloads (Ubuntu 22.04, Debian 12, Fedora 39 or newer have it)."
  fi
  if [ -n "$problem" ]; then
    printf '%s✗ %s%s\n' "$RED" "$line" "$RESET" >&2
    printf '  %s\n' "$problem" >&2
    exit 1
  fi
  ok "$line"
}

# ── Checking downloads (D-141) ──────────────────────────────────────────────────────────────────────────────────────
# verify_signature <file> <file.sig>: the .sig is the base64 of a minisign signature as `tauri signer sign` makes it:
# Ed25519 ("ED") over the file's BLAKE2b-512.
verify_signature() {
  v="$(mktemp -d)"
  {
    echo '-----BEGIN PUBLIC KEY-----'
    echo "$PUBLIC_KEY"
    echo '-----END PUBLIC KEY-----'
  } >"$v/key.pem"
  result=1
  if tr -d '\n\r' <"$2" | openssl base64 -d -A >"$v/minisig" 2>/dev/null &&
    sed -n 2p "$v/minisig" | tr -d '\r' | openssl base64 -d -A >"$v/sig" 2>/dev/null &&
    [ "$(wc -c <"$v/sig" | tr -d ' ')" = 74 ] && [ "$(head -c 2 "$v/sig")" = ED ]; then
    tail -c 64 "$v/sig" >"$v/signature"
    openssl dgst -blake2b512 -binary "$1" >"$v/hash"
    openssl pkeyutl -verify -pubin -inkey "$v/key.pem" -rawin -in "$v/hash" -sigfile "$v/signature" \
      >/dev/null 2>&1 && result=0
  fi
  rm -rf "$v"
  return "$result"
}

sha256_of() { openssl dgst -sha256 -r "$1" | cut -d' ' -f1; }

# Puts the checked tarball for this computer in $WORK/hlabs.tar.gz.
fetch_release() {
  arch="$(arch_name)"
  if [ -n "${HLABS_TARBALL:-}" ]; then
    [ -r "$HLABS_TARBALL" ] || fail "There's no file at $HLABS_TARBALL"
    from="$(dirname "$HLABS_TARBALL")"
    cp "$from/SHA256SUMS" "$from/SHA256SUMS.sig" "$WORK/" 2>/dev/null ||
      fail "SHA256SUMS and SHA256SUMS.sig must be next to $HLABS_TARBALL"
    name="$(basename "$HLABS_TARBALL")"
    cp "$HLABS_TARBALL" "$WORK/hlabs.tar.gz"
  else
    if [ -n "${HLABS_VERSION:-}" ]; then base="$RELEASES/download/v${HLABS_VERSION#v}"; else base="$RELEASES/latest/download"; fi
    quietly download "$base/SHA256SUMS" "$WORK/SHA256SUMS" ||
      fail "Couldn't download hlabs from $base" "Check this computer can reach github.com, then run this again"
    quietly download "$base/SHA256SUMS.sig" "$WORK/SHA256SUMS.sig" || fail "Couldn't download hlabs's signature"
  fi
  verify_signature "$WORK/SHA256SUMS" "$WORK/SHA256SUMS.sig" ||
    fail "The download's signature doesn't match the hlabs key" "Nothing was installed. Try again later"
  if [ -z "${HLABS_TARBALL:-}" ]; then
    name="$(awk -v arch="$arch" '$2 ~ ("-linux-" arch "\\.tar\\.gz$") { print $2; exit }' "$WORK/SHA256SUMS")"
    [ -n "$name" ] || fail "This release has no hlabs for $arch"
    quietly download "$base/$name" "$WORK/hlabs.tar.gz" || fail "Couldn't download $name"
  fi
  expected="$(awk -v n="$name" '$2 == n || $2 == ("*" n) { print $1; exit }' "$WORK/SHA256SUMS")"
  [ -n "$expected" ] && [ "$(sha256_of "$WORK/hlabs.tar.gz")" = "$expected" ] ||
    fail "$name doesn't match its checksum" "Nothing was installed. Run this again to download it again"
  VERSION="$(tar -xzOf "$WORK/hlabs.tar.gz" ./version 2>/dev/null | tr -d '[:space:]')"
  [ -n "$VERSION" ] || fail "$name isn't an hlabs download"
}

# ── Docker Engine ───────────────────────────────────────────────────────────────────────────────────────────────────
docker_version() { docker version --format '{{.Server.Version}}' 2>/dev/null; }

# apt (Ubuntu, Debian and their relatives), dnf (Fedora, RHEL and theirs), or nothing.
package_manager() {
  if has apt-get; then echo apt; elif has dnf; then echo dnf; else echo none; fi
}

# The distribution in download.docker.com/linux/<distro> and, for apt, its codename.
docker_distro() {
  id="$(os_field ID)" like="$(os_field ID_LIKE)"
  case "$id" in
    ubuntu | debian | fedora | rhel | centos) echo "$id" ;;
    raspbian) echo debian ;;
    rocky | almalinux) echo rhel ;;
    *)
      case " $like " in
        *' ubuntu '*) echo ubuntu ;;
        *' debian '*) echo debian ;;
        *' fedora '*) echo fedora ;;
        *' rhel '* | *' centos '*) echo rhel ;;
        *) echo '' ;;
      esac
      ;;
  esac
}

docker_codename() {
  if [ "$(docker_distro)" = ubuntu ] && [ -n "$(os_field UBUNTU_CODENAME)" ]; then
    os_field UBUNTU_CODENAME
  else
    os_field VERSION_CODENAME
  fi
}

install_docker() {
  distro="$(docker_distro)"
  case "$(package_manager):$distro" in
    apt:ubuntu | apt:debian)
      quietly apt-get update &&
        quietly env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl &&
        install -m 0755 -d /etc/apt/keyrings &&
        quietly download "https://download.docker.com/linux/$distro/gpg" /etc/apt/keyrings/docker.asc &&
        chmod a+r /etc/apt/keyrings/docker.asc &&
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$distro $(docker_codename) stable" \
          >/etc/apt/sources.list.d/docker.list &&
        quietly apt-get update &&
        quietly env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io
      ;;
    dnf:fedora | dnf:rhel | dnf:centos)
      repo="https://download.docker.com/linux/$distro/docker-ce.repo"
      quietly dnf -y install dnf-plugins-core &&
        { quietly dnf config-manager addrepo --from-repofile="$repo" ||
          quietly dnf config-manager --add-repo "$repo"; } &&
        quietly dnf -y install docker-ce docker-ce-cli containerd.io
      ;;
    *) return 2 ;;
  esac
}

ensure_docker() {
  if has docker; then
    version="$(docker_version || true)"
    if [ -z "$version" ] && systemctl list-unit-files docker.service >/dev/null 2>&1; then
      quietly systemctl enable --now docker || true
      version="$(docker_version || true)"
    fi
    if [ -n "$version" ]; then
      ok "Docker Engine $version found"
      return
    fi
  fi
  say "Docker Engine not found, installing from the official repository"
  status=0
  install_docker || status=$?
  if [ "$status" = 2 ]; then
    fail "Install Docker Engine first, then run this again" "https://docs.docker.com/engine/install/"
  fi
  [ "$status" = 0 ] && quietly systemctl enable --now docker || fail "Couldn't install Docker Engine"
  ok "Installed Docker Engine $(docker_version)"
}

# avahi-publish announces hlabs.local (D-074). Without it hlabs still works by IP address, so this never stops the
# install.
ensure_avahi() {
  if ! has avahi-publish; then
    case "$(package_manager)" in
      apt) quietly env DEBIAN_FRONTEND=noninteractive apt-get install -y avahi-utils avahi-daemon || true ;;
      dnf) quietly dnf -y install avahi avahi-tools || true ;;
    esac
  fi
  has avahi-publish && quietly systemctl enable --now avahi-daemon || true
}

# ── Ports (D-016) ───────────────────────────────────────────────────────────────────────────────────────────────────
port_used() { [ -n "$(ss -Hltn "sport = :$1" 2>/dev/null)" ]; }
port_holder() {
  holder="$(ss -Hltnp "sport = :$1" 2>/dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -n 1)"
  echo "${holder:-another program}"
}

# Sets HTTPS_PORT and HTTP_PORT: 443 and 80, or 8443 and 8080 for one that's taken.
choose_ports() {
  HTTPS_PORT=443 HTTP_PORT=80
  if port_used 443; then
    port_used 8443 && fail "Ports 443 and 8443 are both in use" "Stop the program using one of them, then run this again"
    note "Port 443 is used by $(port_holder 443), using 8443 instead"
    HTTPS_PORT=8443
  fi
  if port_used 80; then
    port_used 8080 && fail "Ports 80 and 8080 are both in use" "Stop the program using one of them, then run this again"
    note "Port 80 is used by $(port_holder 80), using 8080 instead"
    HTTP_PORT=8080
  fi
}

# "ports 80 and 443", "ports 8080 and 8443"
ports_phrase() { echo "ports $HTTP_PORT and $HTTPS_PORT"; }

# ── Installing ──────────────────────────────────────────────────────────────────────────────────────────────────────
as_hlabs() { runuser -u hlabs -- env NODE_ENV=production HLABS_HEADLESS=1 HLABS_INSTALL_ROOT="$ROOT" "$@"; }

create_user() {
  getent group hlabs >/dev/null || quietly groupadd --system hlabs
  if ! id hlabs >/dev/null 2>&1; then
    nologin="$(command -v nologin || echo /usr/sbin/nologin)"
    quietly useradd --system --gid hlabs --home-dir "$DATA" --no-create-home --shell "$nologin" hlabs
  fi
  getent group docker >/dev/null && quietly usermod -aG docker hlabs
  install -d -m 0750 -o hlabs -g hlabs "$DATA" "$DATA/storage"
  # The tray token (D-035): the `hlabs` command reads it, so the hlabs group may too.
  if [ ! -s "$DATA/tray.token" ]; then
    (umask 0027 && openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' >"$DATA/tray.token")
  fi
  chown hlabs:hlabs "$DATA/tray.token" && chmod 0640 "$DATA/tray.token"
  # The key of hlabs's other secrets (07 §7.7), for hlabs alone.
  if [ ! -s "$DATA/secret.key" ]; then
    (umask 0077 && head -c 32 /dev/urandom >"$DATA/secret.key")
  fi
  chown hlabs:hlabs "$DATA/secret.key" && chmod 0600 "$DATA/secret.key"
  [ -n "$upgrading" ] || ok "Created the hlabs user and its data folder $DATA"
}

# Unpacks $WORK/hlabs.tar.gz to $ROOT/$VERSION and points `current` at it.
unpack() {
  install -d -m 0755 -o hlabs -g hlabs "$ROOT"
  rm -rf "$ROOT/.unpack"
  mkdir "$ROOT/.unpack"
  tar -xzf "$WORK/hlabs.tar.gz" -C "$ROOT/.unpack" --no-same-owner || fail "Couldn't unpack hlabs into $ROOT"
  # hlabs updates itself (D-118), so the hlabs user owns its versions.
  chown -R hlabs:hlabs "$ROOT/.unpack"
  rm -rf "${ROOT:?}/$VERSION"
  mv "$ROOT/.unpack" "$ROOT/$VERSION"
  ln -sfn "$VERSION" "$ROOT/current.next"
  mv -T "$ROOT/current.next" "$ROOT/current"
  rm -f "$ROOT/switch.json"
  ln -sfn "$ROOT/current/bin/hlabs" /usr/local/bin/hlabs
  # The only commands hlabsd runs as root (D-061): a root-owned copy outside $ROOT, which the hlabs user can't change.
  install -D -m 0755 -o root -g root "$ROOT/current/bin/hlabs-priv" "$PRIV"
  if [ -d /etc/sudoers.d ] && has visudo; then
    printf 'hlabs ALL=(root) NOPASSWD: %s\n' "$PRIV" >"$WORK/sudoers"
    quietly visudo -cf "$WORK/sudoers" && install -m 0440 -o root -g root "$WORK/sudoers" "$SUDOERS"
  fi
}

install_service() {
  install -m 0644 -o root -g root "$ROOT/current/hlabsd.service" "$UNIT"
  quietly systemctl daemon-reload && quietly systemctl enable hlabsd.service ||
    fail "Couldn't install the systemd service hlabsd.service"
  ok "Installed systemd service hlabsd.service (starts on boot)"
}

wait_until_ready() {
  i=0
  while [ "$i" -lt "${HLABS_READY_TIMEOUT:-60}" ]; do
    download "http://127.0.0.1:$DAEMON_PORT/healthz" >/dev/null 2>&1 && return 0
    sleep 1
    i=$((i + 1))
  done
  return 1
}

start() {
  quietly systemctl restart hlabsd.service || fail "Couldn't start hlabs" "See: journalctl -u hlabsd"
  if ! wait_until_ready; then
    journalctl -u hlabsd --no-pager -n 50 >>"$LOG" 2>&1 || true
    fail "hlabs didn't start within a minute" "See: journalctl -u hlabsd"
  fi
}

# ── Uninstalling (D-144) ────────────────────────────────────────────────────────────────────────────────────────────
# ask <question>: an answer from the terminal (the script itself may be on stdin, piped from curl).
ask() {
  printf '%s ' "$1" >/dev/tty
  IFS= read -r ANSWER </dev/tty || ANSWER=''
}
has_tty() { (: </dev/tty) 2>/dev/null; }

# Size in words, as hlabs writes it: "97 GB", "1.2 TB".
size_words() {
  awk -v b="$1" 'BEGIN {
    gb = b / 1000000000
    if (gb >= 1000) printf "%.1f TB", gb / 1000
    else if (gb < 0.5) printf "less than 1 GB"
    else printf "%d GB", gb + 0.5
  }'
}

# Containers of compose projects named hlabs-*, for when hlabs itself doesn't answer.
remove_app_containers() {
  has docker || return 0
  docker ps -a --format '{{.ID}} {{.Label "com.docker.compose.project"}}' 2>/dev/null |
    awk '$2 ~ /^hlabs-/ { print $1 }' | while read -r id; do quietly docker rm -f "$id" || true; done
  quietly docker network rm hlabs || true
}

# Network drives hlabs mounted under its data folder are unmounted before anything there is deleted.
unmount_inside() {
  findmnt -rn -o TARGET 2>/dev/null | awk -v d="$1/" 'index($0, d) == 1' | sort -r | while read -r target; do
    quietly umount "$target" || quietly umount -l "$target" || true
  done
}

uninstall() {
  keep='' yes=''
  for arg in "$@"; do
    case "$arg" in
      --keep-data) keep=yes ;;
      --delete-everything) keep=no ;;
      --yes) yes=yes ;;
      --uninstall) ;;
      *) fail "Unknown option $arg" "Use --keep-data or --delete-everything, and --yes to skip the questions" ;;
    esac
  done
  need_root "$@"
  : >"$LOG" && chmod 0600 "$LOG"
  [ -L "$ROOT/current" ] || [ -f "$UNIT" ] || [ -d "$DATA" ] || fail "hlabs isn't installed on this server"
  say "${BOLD}hlabs uninstaller${RESET}"

  # What hlabs says about itself; nothing when it doesn't answer.
  info="$("$ROOT/current/bin/hlabs" uninstall --daemon-info 2>>"$LOG" || true)"
  apps="$(printf '%s' "$info" | sed -n 's/^apps=//p')"
  bytes="$(printf '%s' "$info" | sed -n 's/^bytes=//p')"
  storage="$(printf '%s' "$info" | sed -n 's/^storage=//p')"

  if [ -z "$yes" ] || [ -z "$keep" ]; then
    has_tty || fail "Run this in a terminal to answer its questions" "Or pass --yes with --keep-data or --delete-everything"
  fi
  if [ -z "$yes" ]; then
    case "${apps:-}" in
      '' | 0) what='' ;;
      1) what=' Your app stops.' ;;
      *) what=" All $apps apps stop." ;;
    esac
    ask "Uninstall hlabs from this server?$what [y/N]"
    case "$ANSWER" in [yY] | [yY][eE][sS]) ;; *) say "Nothing was changed." && exit 0 ;; esac
  fi
  if [ -z "$keep" ]; then
    ask "Keep your data in $DATA so you can reinstall later? [Y/n]"
    case "$ANSWER" in [nN] | [nN][oO]) keep=no ;; *) keep=yes ;; esac
  fi
  if [ "$keep" = no ] && [ -z "$yes" ]; then
    amount="everything"
    [ -n "${bytes:-}" ] && amount="$(size_words "$bytes")"
    ask "Type delete to delete $amount of apps and files. This can't be undone:"
    [ "$ANSWER" = delete ] || { say "Nothing was changed." && exit 0; }
  fi

  # The daemon's part: every app down (with images and volumes when deleting), its network, Caddy and the names.
  job_flag='--keep-data'
  [ "$keep" = no ] && job_flag='--delete-everything'
  if "$ROOT/current/bin/hlabs" uninstall --daemon-job "$job_flag" >>"$LOG" 2>&1; then
    ok "Stopped every app"
  else
    remove_app_containers
    ok "Stopped every app (hlabs wasn't answering, so their containers were removed directly)"
  fi

  quietly systemctl disable --now hlabsd.service || true
  rm -f "$UNIT"
  quietly systemctl daemon-reload || true
  ok "Removed systemd service hlabsd.service"
  rm -rf "$ROOT" /usr/local/bin/hlabs "$(dirname "$PRIV")" "$SUDOERS"
  ok "Removed hlabs from $ROOT"

  if [ "$keep" = no ]; then
    unmount_inside "$DATA"
    rm -rf --one-file-system "$DATA" || fail "Couldn't delete $DATA" "A drive may still be connected inside it"
    if id hlabs >/dev/null 2>&1; then quietly userdel hlabs || true; fi
    if getent group hlabs >/dev/null; then quietly groupdel hlabs || true; fi
    ok "Deleted $DATA and the hlabs user"
    case "${storage:-}" in
      '' | "$DATA" | "$DATA"/*) ;;
      *) note "Your files in $storage stay; delete them yourself if you don't need them" ;;
    esac
  else
    ok "Kept your data in $DATA"
  fi
  say "Docker Engine and Avahi stay installed. Remove them with your package manager if nothing else uses them."
}

main() {
  case "${1:-}" in --uninstall) uninstall "$@" && return ;; esac
  need_root "$@"
  umask 0022
  : >"$LOG" && chmod 0600 "$LOG"
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT

  say "${BOLD}hlabs installer${RESET}"
  check_system
  fetch_release

  upgrading=''
  if [ -L "$ROOT/current" ] && [ -f "$UNIT" ]; then
    upgrading="$(basename "$(readlink "$ROOT/current")")"
  fi

  ensure_docker
  ensure_avahi
  create_user

  if [ -n "$upgrading" ]; then
    quietly systemctl stop hlabsd.service || true
    unpack
    install_service
    start
    if [ "$upgrading" = "$VERSION" ]; then ok "Reinstalled hlabs $VERSION"; else ok "Upgraded hlabs $upgrading → $VERSION"; fi
  else
    choose_ports
    unpack
    as_hlabs "$ROOT/current/node" "$ROOT/current/hlabsd.mjs" --set-ports "$HTTPS_PORT" "$HTTP_PORT" >>"$LOG" 2>&1 ||
      fail "Couldn't save the ports hlabs uses"
    install_service
    start
    ok "Started hlabs · proxy on $(ports_phrase)"
  fi
  finish
}

# US-INST-24: whether hlabs.local was announced, where to finish setup, and the commands for later.
finish() {
  "$ROOT/current/bin/hlabs" setup-url --installer 2>>"$LOG" ||
    note "Run hlabs setup-url to see where to finish setup"
  say "Manage later with: ${BOLD}hlabs status${RESET} · ${BOLD}hlabs logs${RESET} · ${BOLD}hlabs setup-url${RESET} · ${BOLD}hlabs reset-password${RESET}"
}

[ -n "${HLABS_INSTALL_LIB:-}" ] || main "$@"
