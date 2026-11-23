#!/usr/bin/env bash
# Public apps prototype (phase 7 group 11, track D, Q-19): what Tailscale Funnel can give each public app.
#
# Run it on the hlabs Mac, signed in to your tailnet, with Funnel allowed for this device in the tailnet policy
# (nodeAttrs "funnel") and HTTPS certificates on. It publishes only throwaway text pages that Tailscale serves itself
# (no app, no server, nothing of yours), on ports 8443 and 10000, never 443 (the dashboard's tailnet address may hold
# it). It stops if either port is already in use, and on exit (even Ctrl-C) it turns every page it made off again and
# checks your Serve settings are as they were.
#
#   bash scripts/prototypes/funnel-q19.sh                   # ports and paths
#   bash scripts/prototypes/funnel-q19.sh --try-services    # also try a Tailscale Service (needs svc:hlabs-q19 defined
#                                                           # in the admin console and this device allowed to host it)
#
# It asks you to open the pages from your phone on mobile data (outside the home network) and writes what it saw and
# what you answered to funnel-q19-results.txt here. Send that file back; it names your tailnet, so don't post it.
set -euo pipefail

TS=${TAILSCALE:-$(command -v tailscale || echo /Applications/Tailscale.app/Contents/MacOS/Tailscale)}
OUT="$PWD/funnel-q19-results.txt"
TRY_SERVICES=false
[[ "${1:-}" == "--try-services" ]] && TRY_SERVICES=true
SERVICE=svc:hlabs-q19

log() { printf '%s\n' "$*" | tee -a "$OUT"; }
run() { log "\$ tailscale $*"; "$TS" "$@" 2>&1 | tee -a "$OUT"; return "${PIPESTATUS[0]}"; }
ask() { local a; read -r -p "$1 [y/n/?] " a; log "Q: $1 → ${a:-?}"; }

: >"$OUT"
log "hlabs Funnel prototype (Q-19) · $(date -u +%FT%TZ)"
log "Tailscale: $("$TS" version | head -1)"
log "funnel has --service: $("$TS" funnel --help 2>&1 | grep -q -- '--service' && echo yes || echo no)"
log "serve has --service: $("$TS" serve --help 2>&1 | grep -q -- '--service' && echo yes || echo no)"

state=$("$TS" status --json | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("BackendState",""))')
[[ "$state" == "Running" ]] || { log "Tailscale isn't connected ($state). Sign in and run this again."; exit 1; }
HOST=$("$TS" status --json | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
log "This device: $HOST"

BEFORE=$("$TS" serve status --json 2>/dev/null || echo '{}')
log "Serve settings before:"; log "$BEFORE"
for port in 8443 10000; do
  if grep -q "\"$HOST:$port\"" <<<"$BEFORE"; then
    log "Port $port is already in use by your Serve or Funnel settings; nothing was changed. Free it and run again."
    exit 1
  fi
done

cleanup() {
  set +e
  log ""; log "Turning the test pages off…"
  "$TS" funnel --yes --https=8443 off >/dev/null 2>&1
  for p in /a /b; do "$TS" funnel --yes --https=10000 --set-path="$p" off >/dev/null 2>&1; done
  "$TS" funnel --yes --https=10000 off >/dev/null 2>&1
  $TRY_SERVICES && "$TS" serve clear "$SERVICE" >/dev/null 2>&1
  AFTER=$("$TS" serve status --json 2>/dev/null || echo '{}')
  if [[ "$AFTER" == "$BEFORE" ]]; then log "Serve settings are back as they were."
  else log "Serve settings differ from before; please check \`tailscale serve status\`:"; log "$AFTER"; fi
  log "Results: $OUT"
}
trap cleanup EXIT

log ""; log "1. One app on its own port (8443)"
run funnel --bg --yes --https=8443 "text:hlabs Funnel test · port 8443" || log "→ Funnel refused (is it allowed in the tailnet policy?)"
log "Public address: https://$HOST:8443/"

log ""; log "2. Two apps on one port by path (10000)"
run funnel --bg --yes --https=10000 --set-path=/a "text:hlabs Funnel test · 10000/a" || true
run funnel --bg --yes --https=10000 --set-path=/b "text:hlabs Funnel test · 10000/b" || true
log "Public addresses: https://$HOST:10000/a and https://$HOST:10000/b"

if $TRY_SERVICES; then
  log ""; log "3. A Tailscale Service with its own name, made public ($SERVICE)"
  run serve --yes --service="$SERVICE" --https=443 "text:hlabs Service test" || log "→ serve --service refused"
  run funnel --yes --https=443 --service="$SERVICE" "text:hlabs Service test" || log "→ funnel has no --service (expected if 'funnel has --service: no' above)"
fi

log ""; log "Funnel status now:"; run funnel status || true
log ""; log "Public DNS for $HOST (Funnel's public addresses answer only while a page is public):"
log "$(dig +short "$HOST" @1.1.1.1 2>&1 || echo 'dig failed')"

cat <<EOF

Now, on your phone with Wi-Fi OFF (mobile data, outside your home network), open:
  1. https://$HOST:8443/
  2. https://$HOST:10000/a   and   https://$HOST:10000/b
  3. https://$HOST/          (your dashboard's tailnet address: it must NOT open from outside the tailnet)
$($TRY_SERVICES && echo "  4. https://hlabs-q19.${HOST#*.}/   (the Service's own name)")
Then answer here.
EOF
ask "1. Did https://$HOST:8443/ show the 8443 test page?"
ask "2. Did both /a and /b on port 10000 show their own page?"
ask "3. Did the dashboard address (port 443) fail to open from outside?"
$TRY_SERVICES && ask "4. Did the Service's own address open from outside?"
ask "Anything else you noticed (a certificate warning, slowness)? (type it, then Enter)"
