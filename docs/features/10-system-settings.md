# 10 · Settings · system

The system half of Settings: how hlabs is reached on the home network and over Tailscale, where its data lives, which container engine runs the apps, how hlabs and apps are updated, troubleshooting tools, AI access and the danger zone. Every screen here is admin-only; members never see these sections in the Settings sidebar.

**Screens:** `SettingsNetwork` (P1), `RenameHostname` (Nice to have), `CertGuide` (Nice to have), `SettingsStorage` (P2), `MoveAllData` (Nice to have), `SettingsRuntime` (P1), `EngineSwitch` (Nice to have), `SettingsUpdates` (P1), `SettingsAdvanced` (P2), `SettingsAI` (P3), `FactoryReset` (P2), `SettingsAbout` (P3).
**Depends on:** `01-install-tray.md` (tray applies hlabs updates, launch agent), `02-onboarding.md` (engine detection, remote access, factory reset returns here), `05-app-store.md` (app updates, rollback), `06-apps.md` (app hostnames, autostart, auto-update per app), `07-files.md` (NetworkDrives, trash), `08-usage-backups.md` (backup destinations, pre-update backups), `09-account-people.md` (Settings shell and sidebar, admin role), `11-system-states.md` (SysUpdating, SysEngineStopped, SysDialogs, SysDaemonDown).

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-SYS-01 | Network and remote access | P1 | 3 | `SettingsNetwork` |
| F-SYS-02 | Rename server | Nice to have | 9 | `RenameHostname` |
| F-SYS-03 | Certificate guide | Nice to have | 9 | `CertGuide` |
| F-SYS-04 | Storage overview | P2 | 7 | `SettingsStorage` |
| F-SYS-05 | Move all data | Nice to have | 9 | `MoveAllData` |
| F-SYS-06 | Engine and startup | P1 | 1 | `SettingsRuntime` |
| F-SYS-07 | Switch engine | Nice to have | 9 | `EngineSwitch` |
| F-SYS-08 | Updates | P1 | 4 | `SettingsUpdates` |
| F-SYS-09 | Advanced and troubleshooting | P2 | 7 | `SettingsAdvanced` |
| F-SYS-10 | AI access (MCP) | P3 | 8 | `SettingsAI` |
| F-SYS-11 | Factory reset | P2 | 7 | `FactoryReset` |
| F-SYS-12 | About | P3 | 8 | `SettingsAbout` |

## User stories

### US-SYS-01 · See how hlabs is reached on the home network
**Feature:** F-SYS-01 · **Priority:** P1 · **Phase:** 3 · **Screens:** `SettingsNetwork`
**As** an admin, **I want** to see the local address, HTTPS status and every app's address in one place, **so that** I know what to type on each device and whether it will show a padlock.

**Acceptance criteria**
- **Given** I am an admin, **when** I open Settings › Network & remote access, **then** the "Home network" group shows "Local address" with the current hostname (e.g. `hlabs.local`) and a "Rename" button, "HTTPS on the home network" with the copy "Install the hlabs certificate once on each device to remove browser warnings" and a "Get certificate" button, and "Web ports".
- **Given** apps are installed, **when** the page loads, **then** "App addresses" lists each installed app (AppIcon + name) with its full URL (e.g. `https://jellyfin.hlabs.local`), sorted by name; an app on port fallback shows `https://hlabs.local:<port>` instead.
- **Given** the "Home network" group, **when** shown, **then** the Local address row also gives the DNS name `hlabs.home.arpa` with "For devices that use your DNS server" (D-105); app rows show their `home.arpa` address under the `.local` one when a local DNS server is set up (US-SYS-06).
- **Given** I click an app address, **when** the row is activated (click or Enter), **then** the URL opens in a new tab; a copy icon button copies it and shows a Toast "Address copied".
- **Given** no apps are installed, **when** the page loads, **then** "App addresses" shows "No apps yet" with a link to the App Store.
- **Given** the mDNS name could not be published, **when** the page loads, **then** the Local address row shows a warning Badge "Not published" and the fallback address `https://<LAN IP>:<port>`, plus the LAN IPv4 addresses from `network.status`.
- **Given** I am a member, **when** I navigate to this URL directly, **then** I see the "You don't have access to this" page (US-STATE-20), with no redirect, and `network.status` returns `FORBIDDEN`.
- The "Rename" button is hidden until phase 9 ships and the "Get certificate" button is hidden until phase 9 ships (D-036).

**Implementation notes**
- API: `network.status` (adminProcedure), `apps.list`.
- Data: `settings.hostname`, `apps.hostname`, `apps.port_fallback`.
- UI: GlassCard groups, List/ListRow, AppIcon, Badge, Button, Toast. Same page is rendered as a sheet in the phone layout.
- Refresh on `system.status` and `app.stateChanged` events; no polling.

### US-SYS-02 · Connect remote access with Tailscale
**Feature:** F-SYS-01 · **Priority:** P1 · **Phase:** 3 · **Screens:** `SettingsNetwork`
**As** an admin, **I want** to turn on Tailscale remote access from Settings, **so that** my family can reach hlabs away from home without opening ports.

**Acceptance criteria**
- **Given** Tailscale is not installed, **when** I view "Remote access", **then** the Tailscale row shows "Not installed" and a "Get Tailscale" button linking to the official installer for this OS; no connect action is offered.
- **Given** Tailscale is installed but logged out, **when** I click "Connect", **then** `network.remote.connect` returns a login URL, which opens in a new tab, and the row shows StatusDot "Waiting for sign-in…" until the LocalAPI reports running. hlabs names the node after the server's name (`hlabs`) for this first log-in (D-102).
- **Given** Tailscale is already logged in, **when** I click "Connect", **then** a Dialog names the tailnet and this computer's name on it ("Publish hlabs on <tailnet> as <node>.<tailnet>.ts.net?") with "Cancel" and "Connect"; nothing is published until I confirm, and the node is never renamed (D-102).
- **Given** something else is already served on port 443 (or an app's port) of this computer's tailnet name, **when** I connect, **then** nothing is overwritten: a Dialog explains which port is in use and offers "Use port 8443 for the dashboard" or "Cancel" (hlabsCode `TAILSCALE_SERVE_CONFLICT`, D-103).
- **Given** Linux and the daemon isn't Tailscale's operator, **when** I connect, **then** the row says "Tailscale needs permission first" with the command `sudo tailscale set --operator=hlabs`, a Copy button and "Try again" (hlabsCode `TAILSCALE_PERMISSION_DENIED`, D-104).
- **Given** the login completes, **when** Tailscale reports running, **then** within 5 s the row shows the tailnet URL (`<node>.<tailnet>.ts.net`), a green StatusDot "Connected" and a "Disconnect" button; the dashboard (`https://<node>.<tailnet>.ts.net`, or `:8443` after a clash) and every app (`https://<node>.<tailnet>.ts.net:<port>`, D-012, D-102) are published with Tailscale Serve over HTTPS using `tailscale cert`.
- **Given** remote access is connected, **when** the row is shown, **then** it also warns when the node's key expires within 14 days ("Tailscale will sign this computer out on <date>. Renew the key in the Tailscale admin console.") and links the help page on sharing hlabs with family on the tailnet (D-108).
- **Given** the sign-in is not completed within 10 minutes, **when** the timeout passes, **then** the row returns to "Connect" and shows "Sign-in timed out. Try again."
- **Given** Tailscale is connected, **when** I open the dashboard on the tailnet URL, **then** sign-in works and the session cookie is valid for that host.
- **Given** any state, **when** remote access is configured, **then** Tailscale Funnel is never enabled, and Funnel or Serve entries hlabs didn't create are left as they are (verified by a test that inspects the Serve config, D-103).

**Implementation notes**
- API: `network.status`, `network.remote.connect`.
- API: `network.remote.connect { confirmTailnet?: boolean, dashboardPort?: 443 | 8443 }`; hlabsCodes `TAILSCALE_SERVE_CONFLICT` (detail: port), `TAILSCALE_PERMISSION_DENIED`, `TAILSCALE_HTTPS_DISABLED`.
- Data: `settings.remote` (mode, state, tailnet and node name, dashboard port, the Serve entries hlabs created), `audit_log` action `network.remote.connect`.
- Track B starts with a spike of the LocalAPI on each macOS Tailscale variant and on Linux (D-104, R-12).
- UI: ListRow with StatusDot, Button. Tailscale is not bundled (02 §2.2).
- Edge cases: Tailscale daemon stopped (show "Tailscale isn't running" + "Open Tailscale"); tailnet without HTTPS certificates enabled (show hlabsCode `TAILSCALE_HTTPS_DISABLED` with a link to the admin console setting).

### US-SYS-03 · Disconnect remote access
**Feature:** F-SYS-01 · **Priority:** P1 · **Phase:** 3 · **Screens:** `SettingsNetwork`
**As** an admin, **I want** to disconnect remote access, **so that** hlabs is only reachable at home.

**Acceptance criteria**
- **Given** Tailscale is connected, **when** I click "Disconnect", **then** a Dialog "Turn off remote access?" explains "People away from home can't open hlabs or its apps until you connect again." with "Cancel" and "Disconnect".
- **Given** I confirm, **when** `network.remote.disconnect` succeeds, **then** all Tailscale Serve entries created by hlabs are removed, the row shows "Not connected" with a "Connect" button, and a Toast "Remote access is off" appears.
- **Given** I am currently viewing the dashboard over the tailnet URL, **when** I confirm, **then** the Dialog warns "You're using remote access right now. This page will stop working." before disconnecting.
- **Given** disconnect, **when** it completes, **then** the Tailscale login itself is left untouched (hlabs only removes its Serve config) and sessions on the tailnet host are revoked.

**Implementation notes**
- API: `network.remote.disconnect`, `auth.revokeSession` logic in `AuthService` for tailnet-host sessions.
- Data: `settings.remote`, `sessions`, `audit_log`.
- UI: Dialog, Toast.

### US-SYS-04 · See each app's tailnet address
**Feature:** F-SYS-01 · **Priority:** P1 · **Phase:** 3 · **Screens:** `SettingsNetwork`
**As** an admin, **I want** to see and copy the tailnet address of the dashboard and of each app, **so that** I can open them or share them with family away from home.

**Acceptance criteria**
- **Given** remote access is connected, **when** I view "Remote access", **then** it shows "Dashboard" with `https://<node>.<tailnet>.ts.net` (with `:8443` after a port clash, D-103) and, for each installed app (AppIcon + name, sorted by name), its address `https://<node>.<tailnet>.ts.net:<port>`, where `<port>` is the app's tailnet port in 14000–14999 (its LAN fallback port + 2000, D-012, D-102, D-110).
- **Given** an address row, **when** I click the copy icon button, **then** the address is copied and a Toast "Address copied" appears; clicking the address opens it in a new tab.
- **Given** an app is installed or uninstalled while remote access is connected, **when** `app.stateChanged` arrives, **then** its Tailscale Serve entry is added or removed and the list updates within 10 s without reload.
- **Given** remote access is not connected, **when** I view the page, **then** no tailnet addresses are shown, only the "Connect" row from US-SYS-02.
- **Given** any state, **then** there are no per-app tailnet names and no sub-paths; there is no setting to change the address format (D-012, D-040).

**Implementation notes**
- API: `network.status` (tailnet URL), `apps.list` (app ports).
- Data: `settings.remote`, `apps.port_fallback` (the app's port, also used on the tailnet).
- UI: List/ListRow, AppIcon, copy Button, Toast. Local `*.hlabs.local` addresses are listed separately in US-SYS-01.
- `HLABS_TAILNET_URL` for an app is `https://<node>.<tailnet>.ts.net:<port>`; restart only apps whose compose uses it when remote access is connected or disconnected.

### US-SYS-05 · See and change web ports
**Feature:** F-SYS-01 · **Priority:** P1 · **Phase:** 3 · **Screens:** `SettingsNetwork`
**As** an admin, **I want** to see which ports hlabs listens on and change them when another program holds 443, **so that** the dashboard still loads.

**Acceptance criteria**
- **Given** Caddy bound 80 and 443, **when** I view "Web ports", **then** it reads "HTTP 80 · HTTPS 443".
- **Given** 443 was in use at startup, **when** Caddy fell back to 8443, **then** the row reads "HTTP 80 · HTTPS 8443 (443 is used by another program)" and the Local address includes `:8443`; likewise a taken port 80 falls back to 8080 and the row names it (D-016).
- **Given** I click "Change", **when** the Dialog opens, **then** I can enter an HTTPS port (1024–65535, or 443) and an HTTP port (1024–65535, or 80); the ports are validated as free before saving, else hlabsCode `NETWORK_PORT_IN_USE` shows "Port <n> is already in use by another program."
- **Given** I save new ports, **when** Caddy reloads, **then** the browser is redirected to the new address within 10 s.
- **Given** raw ports declared by apps, **when** the Dialog opens, **then** they are listed read-only (from `network.ports`) so I can avoid clashes.

**Implementation notes**
- API: `network.ports`, `network.setPorts` (addition).
- Data: `settings` key `network` field `ports` (`{ https, http }` after fallback; 04 data model).
- UI: Dialog, TextField (numeric), Button.
- Fallback at startup (D-016): HTTPS 443, else 8443; HTTP 80, else 8080. No other fallback ports. Record which ones were used.

### US-SYS-06 · Use a local DNS server
**Feature:** F-SYS-01 · **Priority:** P1 · **Phase:** 3 · **Screens:** `SettingsNetwork`
**As** an admin who runs a DNS server such as Pi-hole or AdGuard Home, **I want** hlabs to keep its names in that server, **so that** every device on the home network finds hlabs, including the ones that don't use mDNS (D-105, D-106).

**Acceptance criteria**
- **Given** "Local DNS server", **when** shown, **then** I can choose "None" (default), "AdGuard Home on this computer", "Pi-hole", or "Another DNS server", with the helper "Point your router's DNS at it so every device uses it."
- **Given** AdGuard Home isn't installed, **when** I view the choices, **then** "AdGuard Home on this computer" is disabled with "Install AdGuard Home from the App Store to use this", linking to its AppDetails.
- **Given** I choose AdGuard Home (installed and running), **when** it saves, **then** hlabs adds a DNS rewrite for `*.<host>.home.arpa`, `<host>.home.arpa` and the `.local` names to this computer's LAN address through AdGuard Home's API, and keeps it right when the LAN address or the server name changes.
- **Given** I choose Pi-hole, **when** I enter its address and an app password and click "Test", **then** hlabs checks Pi-hole's API and shows success or the error inline; on Save the password goes to the secret store and hlabs writes the records (a dnsmasq wildcard for `<host>.home.arpa`) through Pi-hole's API. It works for a Pi-hole on another device (such as a Raspberry Pi that's the router's DNS) as well as on this computer.
- **Given** I choose "Another DNS server", **when** it saves, **then** the page lists the records to add by hand (name, type, address) with a Copy button, and says they change if this computer's LAN address does.
- **Given** a DNS server is chosen, **when** apps are installed, uninstalled or renamed, **then** the records stay in sync (one wildcard covers apps where the server supports it).
- **Given** I switch to "None" or to another server, **when** it saves, **then** hlabs removes only the records it created.
- **Given** the server can't be reached when hlabs syncs, **then** the row shows a warning Badge "<server> isn't answering" and hlabs tries again on the next change and every 10 minutes.

**Implementation notes**
- API: `network.setDnsServer { kind: 'none' | 'adguard' | 'pihole' | 'manual', address?, appPassword? }` (replaces `network.setPiholeDns`), `network.testDnsServer` (Pi-hole), `network.status` (the records, last sync, problem); hlabsCodes `DNS_SERVER_UNREACHABLE`, `DNS_SERVER_AUTH_FAILED`.
- Data: `settings.network.dns` (kind, address, last sync); the Pi-hole app password in the secret store (`secret_ref`), never SQLite.
- Pi-hole v6 no longer reads `custom.list`; use its API (check the v6 API docs when building). Pi-hole isn't in the built-in store; AdGuard Home is.
- The Pi-hole address is an outbound connection: list it in Settings › Advanced › "What hlabs connects to" (07 §7.1).
- UI: ChoiceList, TextField, Button, Badge, List/ListRow, copy Button, Toast.

### US-SYS-41 · Reach hlabs through a subnet router
**Feature:** F-SYS-01 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsNetwork`
**As** an admin who already reaches my home network through a Tailscale subnet router (for example on a Raspberry Pi), **I want** to tell hlabs so, **so that** I don't need Tailscale on this computer and see the addresses that work from away (D-107).

**Acceptance criteria**
- **Given** "Remote access", **when** remote access isn't connected, **then** besides "Connect" it offers "I reach my home network through a Tailscale subnet router".
- **Given** I choose it, **when** it saves, **then** hlabs doesn't use Tailscale on this computer, and "Remote access" shows "Through your subnet router" with the dashboard's LAN-IP address (`https://<LAN IP>[:port]`) and, if a local DNS server is set up (US-SYS-06), `https://<host>.home.arpa`, each with Copy.
- **Given** this mode, **when** shown, **then** a help link explains pointing the tailnet's split DNS for `home.arpa` at the local DNS server, and installing the hlabs certificate on each device.
- **Given** this mode, **when** I choose "Use Tailscale on this computer instead", **then** it goes back to the Connect flow (US-SYS-02).
- **Given** this mode, **then** invite and reset links use the home-network address (D-109).

**Implementation notes**
- API: `network.setRemoteMode { mode: 'off' | 'subnetRouter' }` (Tailscale mode is set by `network.remote.connect`), `network.status`.
- Data: `settings.remote.mode`; `audit_log` action `network.remote.mode`.
- UI: ListRow, Button, copy Button, help link via `helpUrl()`.

### US-SYS-42 · See why hlabs can't serve its address
**Feature:** F-SYS-01 · **Priority:** P1 · **Phase:** 4 · **Screens:** `TrayMenu`, `SettingsNetwork`
**As** an admin, **I want** to be told when another program holds the port hlabs serves its dashboard and apps on, and to move hlabs off it in one step, **so that** hlabs isn't silently unreachable (D-122).

**Acceptance criteria**
- **Given** hlabs's web proxy can't start because its HTTPS (or HTTP) port is in use, **then** the menu-bar app says "Can't use port 443" with "Port 443 is in use by Tailscale Serve, so other devices can't reach hlabs." (or "by another program" when hlabs can't tell), a "Use port 8443" button, and the icon's red dot.
- **Given** that state, **when** I choose "Use port 8443", **then** hlabs moves to 8443 (8080 for HTTP), as Settings › Network › web ports would (US-SYS-05: checked free first, audited), and its addresses carry the port.
- **Given** that state, **then** "Open Dashboard" opens the dashboard on this computer (`http://127.0.0.1:7474`), which still works.
- **Given** that state, **then** admins get a critical notification "hlabs can't use port 443" saying what holds it and what to do, with "Change port" (Settings › Network); it's marked read once hlabs serves again.
- **Given** the other program lets go of the port, **then** hlabs serves on it again by itself within a minute or so (it keeps trying, 30 s doubling to 10 minutes), and the menu goes back to normal.
- **Given** the port is held by Tailscale Serve entries hlabs made itself, **then** this doesn't apply: hlabs moves its own entries aside while Caddy starts (D-111).

**Implementation notes**
- API: `tray.status.portProblem { port, heldBy: 'tailscaleServe' | null, fallbackPort } | null`; `tray.useOtherPort`; notification kind `network.port_in_use`.
- "Held by Tailscale Serve" means Serve has an entry on that port that hlabs didn't create (`settings.remote.serve`, D-103). hlabs never removes it.

### US-SYS-07 · Pick a new server name
**Feature:** F-SYS-02 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `RenameHostname`
**As** an admin, **I want** to rename hlabs on my network and see exactly which addresses change, **so that** I can pick a name without surprises.

**Acceptance criteria**
- **Given** I click "Rename" on Local address, **when** the Dialog "Rename this server" opens, **then** it shows a TextField "Name on your network" with a fixed ".local" suffix, pre-filled with the current name and focused.
- **Given** I type, **when** the value changes, **then** "What changes" updates live: `hlabs.local →` `<new>.local` and `jellyfin.hlabs.local →` `jellyfin.<new>.local` using the first installed app, followed by "(and every other app)".
- **Given** the name does not match `^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`, **when** I type, **then** the hint "Lowercase letters, numbers and dashes" turns into an error and "Rename" is disabled; uppercase input is lowercased as I type.
- **Given** the name is unchanged, **when** I view the Dialog, **then** "Rename" is disabled.
- **Given** the name is already answered by another device on the network (mDNS probe), **when** I click "Rename", **then** hlabsCode `HOSTNAME_TAKEN` shows "Another device on your network already uses this name."
- **Given** the Dialog, **then** it always shows the warning "Old bookmarks stop working. Phones and apps that use the address, like the Immich app, need the new one." and Escape or "Cancel" closes it without changes.

**Implementation notes**
- API: `network.setHostname` (validates, probes, then starts the job).
- Data: `settings.hostname`.
- UI: Dialog, TextField with suffix, Button.

### US-SYS-08 · Apply a rename everywhere
**Feature:** F-SYS-02 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `RenameHostname`
**As** an admin, **I want** the rename to update every address and certificate in one step, **so that** nothing is left pointing at the old name.

**Acceptance criteria**
- **Given** I click "Rename", **when** `network.setHostname` returns a `jobId`, **then** the Dialog shows Progress with steps "Publishing new name", "Issuing certificates", "Updating apps".
- **Given** the job runs, **then** it re-registers mDNS names for the dashboard and all apps, rebuilds Caddy routes and internal CA certificates for `*.<new>.local`, updates `apps.hostname`-derived URLs, re-renders `HLABS_HOSTNAME`/`HLABS_URL` in app `.env` files and restarts only apps whose compose uses those variables.
- **Given** the job succeeds, **when** it finishes, **then** the browser is redirected to `https://<new>.local/login` (the cookie domain changes, so everyone signs in again) and the old name stops resolving.
- **Given** a step fails, **when** the job fails, **then** all changes are reverted to the old name, the Dialog shows the mapped error and "Try again".
- **Given** an exclusive job (update, restore, move all data, factory reset) is running, **when** I click "Rename", **then** hlabsCode `JOB_EXCLUSIVE_RUNNING` shows "Wait for <job> to finish first."
- **Given** remote access is on, **then** the tailnet name is not changed.

**Implementation notes**
- API: `network.setHostname` → job, `jobs.get`, `events.stream` (`job.progress`).
- Data: `settings.hostname`, `jobs` (kind `rename_host`), `sessions` (all revoked), `audit_log`.
- UI: Dialog, Progress, Stepper.
- Test: CA root is unchanged by a rename, so devices that installed the certificate keep trusting hlabs.

### US-SYS-09 · Follow install steps for my device
**Feature:** F-SYS-03 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `CertGuide`
**As** anyone setting up a device, **I want** short steps for my kind of device, **so that** I get the padlock without browser warnings.

**Acceptance criteria**
- **Given** I click "Get certificate", **when** the Dialog "Trust hlabs on your devices" opens, **then** it shows "Do this once per device to get the padlock without browser warnings on your home network." and a Segmented control: "Mac", "iPhone & iPad", "Windows", "Android".
- **Given** the Dialog opens, **then** the tab preselected matches the viewer's OS from the user agent (fallback "Mac").
- **Given** "Mac", **then** steps read: 1 "Download certificate", 2 "Double-click the downloaded file to add it to Keychain Access.", 3 "Open it in Keychain Access, expand Trust and set it to Always Trust.", 4 "Reload hlabs.local. The browser should show a padlock." (hostname substituted).
- **Given** "iPhone & iPad", "Windows" or "Android", **then** each shows 3–5 numbered steps with the OS-specific path (iOS: Settings › General › VPN & Device Management, then Settings › General › About › Certificate Trust Settings; Windows: Install Certificate › Local Machine › Trusted Root Certification Authorities; Android: Settings › Security › Encryption & credentials › Install a certificate › CA certificate).
- **Given** "Done" or Escape, **then** the Dialog closes; arrow keys move between tabs.

**Implementation notes**
- API: none beyond US-SYS-10.
- UI: Dialog, Segmented, numbered List, Button. Step copy lives in the web app's locale file.
- Viewable by any signed-in user (the guide is harmless), but reached from the admin-only Network page; members get it from their own settings in `09-account-people.md` if linked there.

### US-SYS-10 · Download the certificate on a computer or phone
**Feature:** F-SYS-03 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `CertGuide`
**As** anyone setting up a device, **I want** to download the hlabs certificate directly or by scanning a QR code, **so that** I don't have to move files between devices.

**Acceptance criteria**
- **Given** any tab, **when** I click "Download certificate", **then** the browser downloads `hlabs-ca.crt` (the Caddy internal CA root only, PEM on Mac/iOS/Android, DER `.cer` on Windows).
- **Given** the Mac or Windows tab, **then** a QR code with the caption "Scan on a phone to download" encodes `http://<hostname>/ca.crt`.
- **Given** a phone that doesn't trust hlabs yet, **when** it opens the QR link, **then** the certificate downloads over plain HTTP without signing in (the CA root is public; no private key or other file is served on that route).
- **Given** the download route, **then** it never redirects to HTTPS and returns `Content-Type: application/x-x509-ca-cert`.

**Implementation notes**
- API: `network.caCertificate`; new unauthenticated route `GET /ca.crt` on Caddy port 80 (addition, non-tRPC).
- UI: Button, QR code rendered client-side (no external service).
- Test: the route serves only the root certificate; requests for any other path on port 80 still redirect to HTTPS.

### US-SYS-11 · See what is using storage
**Feature:** F-SYS-04 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsStorage`
**As** an admin, **I want** a breakdown of disk use, **so that** I know what fills the disk before it runs out.

**Acceptance criteria**
- **Given** I open Settings › Storage, **then** the header shows the disk label (e.g. "This computer · internal SSD") and "<free> free of <total>" (e.g. "142 GB free of 256 GB").
- **Given** the summary, **then** a StackedBar shows segments "Apps", "Files", "Backup cache", "hlabs" and free space, each with a legend label and size (e.g. "Apps 77 GB"); segments under 1% still render at a minimum visible width.
- **Given** free space is below 10% or 10 GB, **then** the header shows a warning Badge "Low disk space" (matching the SysDialogs notification).
- **Given** the summary is loading, **then** the bar shows a skeleton; on error, "Couldn't read storage. Try again." with a retry Button.
- **Given** sizes, **then** they use decimal units (GB = 10^9 bytes) with at most one decimal.

**Implementation notes**
- API: `storage.summary` (add `backupCacheBytes`, `hlabsBytes`, `reclaimableImageBytes` to its output).
- Data: `storage_locations` (is_root).
- UI: GlassCard, StackedBar, Badge.
- Sizes are computed in the background and cached for 10 minutes; "Apps" = `app-data/` + images, "Files" = `users/` + `shared/`, "Backup cache" = restic cache, "hlabs" = data dir + bundled binaries.

### US-SYS-12 · Manage data location and drives
**Feature:** F-SYS-04 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsStorage`
**As** an admin, **I want** to see where hlabs keeps data and which drives are connected, **so that** I can connect, disconnect or move storage.

**Acceptance criteria**
- **Given** the page, **then** "Data location" shows the storage root path (e.g. `~/hlabs`) with "Home folders, Shared and media live here", a separate "App data" row with the app data path (default on this computer, `appDataDir`; D-011) and a "Move data…" button that opens MoveAllData (hidden until phase 9 ships, D-036).
- **Given** storage locations, **then** "Drives" lists each non-root location with name, address (e.g. `smb://nas.local/Media`), which apps use it ("used by Jellyfin") and a Badge "Connected" or "Offline".
- **Given** a connected network drive, **when** I click "Disconnect", **then** a Dialog names the apps that use it ("Jellyfin will stop until the drive is back") and on confirm those apps are stopped and the drive is unmounted.
- **Given** an external drive that is not plugged in, **then** the row reads "External drive · not plugged in" with Badge "Offline" and no Disconnect button.
- **Given** I click "+ Connect a drive", **then** the NetworkDrives dialog from Files opens.
- **Given** a drive comes online or goes offline, **then** the row updates within 10 s without reload.

**Implementation notes**
- API: `storage.locations.list`, `storage.locations.eject`, `storage.locations.remove` (from a row Menu "Remove"), `apps.list` for usage.
- Data: `storage_locations`, `app_mounts`.
- UI: List/ListRow, Badge, Dialog, Menu.

### US-SYS-13 · Free space from unused app images
**Feature:** F-SYS-04 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsStorage`
**As** an admin, **I want** to delete images left over from updates and uninstalls, **so that** I get disk space back safely.

**Acceptance criteria**
- **Given** reclaimable images exist, **then** "Unused app images" shows "Left over from updates and uninstalled apps" and a Button "Free <size>" (e.g. "Free 6.2 GB").
- **Given** I click it, **when** the job runs, **then** only images not used by any hlabs app container and not the previous version of an app still inside its rollback window are removed; the button shows a spinner.
- **Given** the job finishes, **then** a Toast "Freed 6.2 GB" shows the actual amount and the StackedBar refreshes.
- **Given** nothing is reclaimable, **then** the button is disabled and reads "Nothing to clean up".
- **Given** images not labelled `dev.hlabs.app` (the user's own), **then** they are never removed.

**Implementation notes**
- API: `storage.pruneImages` (addition) → job.
- UI: Button, Toast.
- Rollback window: keep `apps.previous_version` images for 7 days after an update.

### US-SYS-14 · Empty everyone's trash
**Feature:** F-SYS-04 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsStorage`
**As** an admin, **I want** to empty the trash now, **so that** I free space without waiting 30 days.

**Acceptance criteria**
- **Given** the page, **then** "Trash" shows "Emptied automatically after 30 days", the current trash size, and "Empty now".
- **Given** I click "Empty now", **when** the Dialog "Empty trash for everyone?" confirms, **then** all users' trash items are permanently deleted and a Toast shows the space freed.
- **Given** trash is empty, **then** "Empty now" is disabled.

**Implementation notes**
- API: `files.emptyTrash` with new input `{ allUsers: true }` (admin only).
- Data: `trash_items`, `audit_log`.
- UI: Dialog, Button, Toast.

### US-SYS-15 · Choose where to move all data
**Feature:** F-SYS-05 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `MoveAllData`
**As** an admin, **I want** to pick a destination and see the size, time and risks, **so that** I can move hlabs to a bigger drive with confidence.

**Acceptance criteria**
- **Given** I click "Move data…", **then** the Dialog "Move all hlabs data" shows "Step 1 of 2", sizes for "Apps", "Files" and "Total" (e.g. 77 GB, 20 GB, 97 GB).
- **Given** destinations, **then** each connected drive is a selectable row with free space; external drives show "hlabs will stop if this drive is unplugged". Local and external drives can take app data and files (D-011).
- **Given** a network drive (SMB/NFS, e.g. a NAS), **then** it can take only Home folders, Shared and media: choosing it moves "Files" there and leaves app data where it is, with the note "App data needs a drive that's always connected and fast, so it stays on <current drive>." and the sizes update to show only "Files".
- **Given** a drive with less free space than Total + 10%, **then** it is disabled with "Not enough space".
- **Given** a destination is chosen, **then** the estimate reads "Takes about <n> minutes. All apps stop while data is copied, then start again from the new drive." using a measured write speed from a 5 s probe.
- **Given** the checkbox "Keep the old copy until everything starts correctly" (on by default), **then** "Continue" is enabled only once a destination is selected; "Cancel" closes without changes.

**Implementation notes**
- API: `storage.moveAllPlan` (addition: destination → sizes, free space, estimate, blockers), `storage.locations.list`.
- UI: Dialog, Stepper, List with radio rows, Checkbox, Button.

### US-SYS-16 · Move all data as a safe job
**Feature:** F-SYS-05 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `MoveAllData`
**As** an admin, **I want** the move to stop apps, copy, verify and restart them, **so that** no data is lost if something fails.

**Acceptance criteria**
- **Given** I click "Continue", **when** `storage.moveAll` returns a `jobId`, **then** "Step 2 of 2" shows Progress with the current phase ("Stopping apps", "Copying 43 of 97 GB", "Verifying", "Starting apps") and time remaining.
- **Given** the job runs, **then** it holds the exclusive lock: other jobs and app installs are refused with `JOB_EXCLUSIVE_RUNNING`, and the tray shows "Moving data".
- **Given** copy and verification (size + checksum per file) succeed, **then** the storage root is switched (and `appDataDir` too when app data moved to a local or external drive), apps start from the new paths and must pass health checks.
- **Given** the destination is network storage, **then** the job never copies app data there; the daemon rejects such a plan even if the UI is bypassed (D-011).
- **Given** "Keep the old copy until everything starts correctly" is on, **then** the old copy is deleted only after every app is healthy; if off, it is deleted right after verification.
- **Given** any step fails or an app fails its health check, **then** hlabs switches back to the old location, starts apps there, and shows "The move didn't finish. Everything is back where it was." with the reason.
- **Given** the daemon crashes mid-copy, **when** it restarts, **then** the job resumes from the copy phase or fails cleanly with the old location active.

**Implementation notes**
- API: `storage.moveAll` → job, `jobs.get`, `events.stream`.
- Data: `jobs` (kind `move_all_data`, invariant 5), `storage_locations.is_root` (invariant 4), `audit_log`.
- UI: Stepper, Progress. Closing the Dialog leaves the job running; progress also shows in HomeNotifications.

### US-SYS-17 · See the container engine
**Feature:** F-SYS-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsRuntime`
**As** an admin, **I want** to see which container engine hlabs uses and which others are available, **so that** I understand what runs my apps.

**Acceptance criteria**
- **Given** I open Settings › Engine & startup, **then** the header shows a StatusDot and "Engine running" (or "Engine stopped" / "Starting…").
- **Given** detection results, **then** "Container engine" lists OrbStack, Docker Desktop, Colima and (Linux) Docker Engine with a status: the active one shows its detail (e.g. "Installed by hlabs · open source") and "Restart engine"; others show "Found on this Mac" with "Switch…" or "Not installed".
- **Given** Linux, **then** only Docker Engine (and any other detected socket) is listed and macOS-only engines are hidden.
- **Given** the engine stops, **when** `engine.status` arrives, **then** the header updates within 2 s without reload.
- The "Switch…" button (engine switch, US-SYS-21) is hidden until phase 9 ships (D-036).

**Implementation notes**
- API: `settings.engine.get` (detected engines, active, versions, resources, status).
- Data: `settings.engine`.
- UI: GlassCard, List/ListRow, StatusDot, Button.

### US-SYS-18 · Restart the container engine
**Feature:** F-SYS-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsRuntime`
**As** an admin, **I want** to restart the engine, **so that** I can recover from a stuck engine without a terminal.

**Acceptance criteria**
- **Given** I click "Restart engine", **then** a Dialog "Restart the container engine?" says "All apps stop for about a minute." with "Cancel" and "Restart".
- **Given** I confirm, **then** the job stops the engine (Colima: `colima restart -p hlabs`; OrbStack/Docker Desktop: their CLI restart; Linux: `systemctl restart docker` via the privileged helper), waits for `docker.ping()`, then restarts apps marked autostart.
- **Given** the engine is not back within 3 minutes, **then** the job fails and the SysEngineStopped state is shown with "Start engine".
- **Given** an exclusive job is running, **then** the button is disabled with a tooltip "Wait for <job> to finish".

**Implementation notes**
- API: `settings.engine.restart` (addition) → job.
- Data: `jobs` (kind `engine_restart`), `audit_log`.
- UI: Dialog, Button, Progress in the row.

### US-SYS-19 · Set resources given to apps
**Feature:** F-SYS-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsRuntime`
**As** an admin on a Mac, **I want** to set CPU, memory and disk for the engine, **so that** apps have enough room without starving my computer.

**Acceptance criteria**
- **Given** the active engine is hlabs-managed Colima, **then** "Resources for apps · macOS only, applied after a restart" shows editable "CPU cores" (1 to host cores), "Memory" (2 GB to host memory minus 2 GB) and "Disk" (current size up to free space; can only grow).
- **Given** I change a value, **then** "Apply and restart engine" appears; applying runs the engine restart job from US-SYS-18.
- **Given** OrbStack or Docker Desktop is active, **then** values are read-only with "Change this in <engine>'s settings".
- **Given** Linux, **then** the section is hidden (containers use the host directly).
- **Given** a value outside the range, **then** the field shows the allowed range and Apply is disabled.

**Implementation notes**
- API: `settings.engine.setResources`, `settings.engine.get`.
- Data: `settings.engine.resources`.
- UI: TextField (numeric steppers) or Segmented presets, Button.

### US-SYS-20 · Control startup behaviour
**Feature:** F-SYS-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsRuntime`
**As** an admin, **I want** to choose whether hlabs starts at login, restarts apps and keeps the computer awake, **so that** my apps are there when I need them.

**Acceptance criteria**
- **Given** "Start hlabs when I log in" ("Runs from the menu bar"), **when** toggled, **then** the switch calls `settings.startup.update`, the daemon saves the choice and emits `startup.changeRequested`, and the tray applies it (macOS: SMAppService / LaunchAgent `RunAtLoad`; Linux desktop: systemd user unit and autostart entry), because the tray owns start at login (D-042, same as US-INST-09). The switch is hidden until phase 4 (tray) ships (D-036).
- **Given** Linux headless, **then** the "Start hlabs when I log in" switch is not shown, because the systemd unit is always enabled at boot.
- **Given** the tray is not running when the switch changes, **then** the saved choice is applied the next time the tray starts.
- **Given** "Start apps automatically" ("Apps set to "Start automatically" come back after a restart"), **when** off, **then** reconciliation at startup does not start any app.
- **Given** "Keep this computer awake" ("Prevents sleep while apps are running; the display can still turn off"), **when** on and at least one app is running, **then** hlabs holds a sleep assertion (macOS `caffeinate -i`, Linux `systemd-inhibit --what=sleep`) and releases it when no app runs.
- **Given** any toggle, **when** the save fails, **then** the Switch reverts and a Toast shows the mapped error.
- **Given** defaults, **then** all three are on after onboarding.

**Implementation notes**
- API: `settings.startup.update` (`startAtLogin`, `autostartApps`, `keepAwake`), `settings.get`; event `startup.changeRequested` (tray-scoped, on `events.stream`) consumed by the tray (D-042).
- Data: `settings` key `startup` (`startAtLogin`, `autostartApps`, `keepAwake`; 04 data model). The daemon never writes the LaunchAgent or autostart entry itself.
- UI: Switch in ListRow.

### US-SYS-21 · Review an engine switch
**Feature:** F-SYS-07 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `EngineSwitch`
**As** an admin, **I want** to see what switching engine involves before I start, **so that** I know how long apps will be offline.

**Acceptance criteria**
- **Given** I click "Switch…" on a detected engine, **then** a Dialog "Switch from <current> to <target>?" shows "<target> is installed" and "Version <version>".
- **Given** the plan, **then** three numbered steps show: "Stop all apps · About 1 minute", "Copy app data to <target> · <size> · about <n> minutes", "Start apps on <target> and check they respond".
- **Given** the plan, **then** the summary reads "Apps are offline for about <n> minutes. If anything fails, hlabs switches back to <current> automatically."
- **Given** the current engine is hlabs-managed Colima, **then** a checkbox "Remove Colima afterwards to free <size>" is shown (off by default); it is hidden for engines hlabs did not install.
- **Given** the target engine is not running, **then** "Switch now" is replaced with "Open <target>" and the hint "Start <target>, then try again".

**Implementation notes**
- API: `settings.engine.planSwitch` (addition: target → version, sizes, estimates, removable size).
- UI: Dialog, Stepper, Checkbox, Button.

### US-SYS-22 · Switch engine with automatic fallback
**Feature:** F-SYS-07 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `EngineSwitch`
**As** an admin, **I want** the switch to move my apps and roll back if anything fails, **so that** I never end up with broken apps.

**Acceptance criteria**
- **Given** I click "Switch now", **when** `settings.engine.switch` returns a `jobId`, **then** each step shows progress and the exclusive lock is held (same rules as move all data).
- **Given** the job, **then** it stops apps, copies named Docker volumes that are not already under `app-data/` to the target engine, pulls images on the target by digest, runs `compose up` and waits for each app's health check.
- **Given** every app is healthy, **then** `settings.engine.preferred` is saved, the Dialog shows "Now using <target>", and if chosen the hlabs-managed Colima VM and binaries are removed.
- **Given** any step fails, **then** hlabs stops apps on the target, restarts them on the previous engine, and shows "Switch didn't finish. Your apps are back on <current>." with the reason.
- **Given** the switch, **then** it is written to `audit_log`.

**Implementation notes**
- API: `settings.engine.switch` → job, `jobs.get`, `events.stream`.
- Data: `jobs` (kind `engine_switch`), `settings.engine`, `audit_log`.
- UI: Stepper, Progress.
- Bind mounts under the storage root need no copy; only named volumes and images do.

### US-SYS-23 · Update hlabs
**Feature:** F-SYS-08 · **Priority:** P1 · **Phase:** 4 · **Screens:** `SettingsUpdates`
**As** an admin, **I want** to see when a new hlabs version is available, read its notes and install it, **so that** I stay current with one click.

**Acceptance criteria**
- **Given** an update is available, **then** the card shows "hlabs <next> is available", "You have <current>. Apps restart for about a minute.", up to 5 release-note bullets and "Update now"; a "Full release notes" link opens the GitHub release.
- **Given** I click "Update now", **when** `settings.updates.install` succeeds, **then** the UI switches to SysUpdating and reloads by itself when `/healthz` returns 200.
- **Given** no update, **then** the card shows "hlabs is up to date", "Version <current>", "Last checked <relative time>" and "Check now".
- **Given** macOS or Linux desktop, **when** `settings.updates.install` creates the `system_update` job, **then** the daemon emits `update.applyRequested` and the tray downloads, verifies and installs the update (tray, daemon bundle and helper binaries), then restarts the daemon (02 §2.10, D-034).
- **Given** Linux headless (no tray), **then** the daemon applies the update itself: it downloads the signed tarball, verifies checksum and signature, unpacks it to `/opt/hlabs/<version>`, switches the `current` symlink and asks systemd to restart `hlabsd`; if `/healthz` isn't ready within 3 minutes, the symlink is switched back.
- **Given** automatic updates are on, **then** they run only in the 03:00–05:00 window, after any running backup finishes (US-SYS-26, D-026).
- **Given** the signature check fails, **then** the update is refused with `UPDATE_SIGNATURE_INVALID` and nothing is installed.
- **Given** an exclusive job is running, **then** "Update now" is disabled with "Wait for <job> to finish".

**Implementation notes**
- API: `settings.updates.get`, `settings.updates.install` (addition) → job; on desktop the daemon emits `update.applyRequested` and the tray runs the Tauri updater; on headless Linux the daemon's own updater runs (02 §2.10).
- Data: `settings.updates`, `jobs` (kind `system_update`).
- UI: GlassCard, List, Button.

### US-SYS-24 · Check for updates now
**Feature:** F-SYS-08 · **Priority:** P1 · **Phase:** 4 · **Screens:** `SettingsUpdates`
**As** an admin, **I want** to check for hlabs and app updates on demand, **so that** I don't wait for the next scheduled check.

**Acceptance criteria**
- **Given** I click "Check now", **then** the button shows a spinner and hlabs checks its update manifest and syncs all enabled store sources.
- **Given** the check finishes, **then** the page updates and "Last checked" reads "Just now"; the App Store tab badge updates.
- **Given** the machine is offline, **then** a Toast "Couldn't check for updates. Check your internet connection." appears and the previous result stays.
- **Given** automatic checks, **then** hlabs checks every 6 h and emits `update.available` once per new version.

**Implementation notes**
- API: `settings.updates.check`, `store.sources.sync`.
- UI: Button, Toast.

### US-SYS-25 · Update apps from Settings
**Feature:** F-SYS-08 · **Priority:** P1 · **Phase:** 4 · **Screens:** `SettingsUpdates`
**As** an admin, **I want** to see and apply app updates here, **so that** all updates live in one place.

**Acceptance criteria**
- **Given** app updates exist, **then** "App updates · <n>" lists each app with AppIcon, name, "<old> → <new>", "What's new" and "Update".
- **Given** I click "What's new", **then** a Dialog shows the app's release notes from its manifest source.
- **Given** I click "Update", **then** `apps.update` starts a job and the row shows Progress; on success the row disappears; on rollback the row shows "Rolled back" linking to UpdateRolledBack.
- **Given** I click "Update all", **then** updates are queued one app at a time in list order, and each row shows "Waiting" until its turn.
- **Given** "Update all", **then** it is hidden until phase 7 ships (D-036).
- **Given** no app updates, **then** the section reads "All apps are up to date".

**Implementation notes**
- API: `store.listUpdates`, `apps.update` → job, `events.stream`.
- UI: List/ListRow, AppIcon, Button, Progress, Dialog.

### US-SYS-26 · Choose automatic updates
**Feature:** F-SYS-08 · **Priority:** P1 · **Phase:** 4 · **Screens:** `SettingsUpdates`
**As** an admin, **I want** hlabs and my apps to update overnight, **so that** I don't have to remember.

**Acceptance criteria**
- **Given** "Update hlabs automatically" ("Installs overnight between 3 and 5 am") is on, **then** an available hlabs update is applied between 03:00 and 05:00 local time, hlabs first and then apps (02 §2.10); if a backup or exclusive job is running it waits until it finishes, still within the window, else the next night.
- **Given** "Update apps automatically" ("Only apps you've allowed in their settings") is on, **then** only apps with `apps.auto_update = 1` are updated in the same window.
- **Given** "Back up app data before updating" is on, **then** each app is snapshotted to the default backup destination before its update (in addition to manifests with `backup.beforeUpdate: true`).
- **Given** no backup destination exists, **then** that Switch is disabled with "Needs a backup destination" linking to BackupsOverview.
- **Given** "Back up app data before updating", **then** it is hidden until phase 5 ships (D-036).
- **Given** an automatic update ran, **then** a notification lists what was updated or rolled back.

**Implementation notes**
- API: `settings.updates.setAuto` (input `{ hlabs, apps, backupBeforeUpdate }`), `settings.updates.get`.
- Data: `settings.updates`, `apps.auto_update`, `backup_destinations`, `notifications`.
- UI: Switch in ListRow.

### US-SYS-27 · View hlabs logs
**Feature:** F-SYS-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAdvanced`
**As** an admin, **I want** to read hlabs's own logs, **so that** I can see why something failed.

**Acceptance criteria**
- **Given** "hlabs logs" ("Background service, proxy and app installs"), **when** I click "View", **then** a log window shows the last 500 lines with a Segmented source filter: "Background service", "Proxy", "Installs".
- **Given** the viewer is open, **then** new lines stream in; "Pause" stops auto-scroll; search highlights matches.
- **Given** secrets appear in log lines (tokens, passwords, `Authorization` headers), **then** they are masked as `••••` in the viewer.
- **Given** no lines, **then** "No log lines yet" is shown.

**Implementation notes**
- API: `system.logs` (addition: source, since, limit) plus `events.stream` while open.
- UI: Dialog or window, Segmented, TextField (search), monospace list.
- The "Terminal" and "API tokens" rows on this screen are not built yet (see Open questions); hide them.

### US-SYS-28 · Download a diagnostics bundle
**Feature:** F-SYS-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAdvanced`
**As** an admin, **I want** a diagnostics bundle with passwords removed, **so that** I can attach it to a bug report safely.

**Acceptance criteria**
- **Given** "Diagnostics bundle" ("Logs and system info, with passwords removed"), **when** I click "Download", **then** a job builds a zip and the browser downloads `hlabs-diagnostics-<hostname>-<date>.zip`.
- **Given** the bundle, **then** it contains: system info, engine info, app list with states and versions, daemon/Caddy/job logs of the last 7 days, and container logs of the last 24 h.
- **Given** redaction, **then** values of env keys marked secret, `.env` contents, session ids, tokens, IP addresses outside the LAN, email addresses and anything matching the secret patterns list are replaced with `[redacted]`, and usernames are replaced with `user1`, `user2`…; no keychain content, database file or user files are included.
- **Given** redaction, **then** a unit test feeds known secrets through every collector and asserts none appear in the output.
- **Given** the bundle, **then** it is never sent anywhere by hlabs; it is only downloaded.

**Implementation notes**
- API: `system.diagnostics` (addition) → job; download via `GET /api/diagnostics/:jobId` (addition, admin session, expires 15 min).
- Data: `jobs` (kind `diagnostics`), `audit_log`.
- UI: Button with spinner, Toast.

### US-SYS-29 · See what hlabs connects to
**Feature:** F-SYS-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAdvanced`
**As** an admin, **I want** a list of every outside service hlabs talks to, **so that** I can trust that nothing leaves the house unless I turned it on.

**Acceptance criteria**
- **Given** the Advanced page, **then** a "What hlabs connects to" row opens a list of: store sources (each URL), container registries used by installed apps, hlabs update server, Tailscale (if on), each backup destination (if configured), the ntfy server (if configured, D-033) and the Pi-hole hlabs keeps its names in (if chosen, D-106).
- **Given** each entry, **then** it shows the host, why ("Checks for app updates every 6 hours"), and when it was last contacted.
- **Given** telemetry, **then** the list states "hlabs sends no usage data or crash reports."
- **Given** a service is off (e.g. Tailscale disconnected), **then** it is listed as "Off".

**Implementation notes**
- API: `system.connections` (addition).
- UI: Dialog, List/ListRow.
- Last-contacted times are recorded by each outbound client in memory and on shutdown in the `settings` key `connections` (04 data model).

### US-SYS-30 · Opt in to beta updates
**Feature:** F-SYS-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAdvanced`
**As** an admin, **I want** to get new versions early, **so that** I can try features before they're stable.

**Acceptance criteria**
- **Given** "Beta updates" ("Get new versions early; may be less stable"), **when** I turn it on, **then** the update channel becomes `beta` and an immediate update check runs.
- **Given** I turn it off while on a beta build, **then** hlabs stays on the current build until a stable version newer than it is released.
- **Given** the Updates page, **then** it shows "Beta" next to the version when the channel is beta.

**Implementation notes**
- API: `settings.updates.setChannel`, `settings.updates.check`.
- UI: Switch, Badge.

### US-SYS-31 · Restart hlabs
**Feature:** F-SYS-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAdvanced`
**As** an admin, **I want** to restart hlabs and all apps, **so that** I can fix a stuck state.

**Acceptance criteria**
- **Given** "Restart hlabs" ("Stops and starts every app · about 1 minute"), **when** I click "Restart", **then** the SysDialogs dialog "Restart all apps?" with "Apps will be unavailable for about a minute. Anyone watching or syncing will be disconnected." appears.
- **Given** I confirm, **then** `system.restartDaemon` stops apps, restarts the daemon via launchd/systemd, and the UI shows a full-screen "Restarting hlabs…" that reconnects when `/healthz` returns 200.
- **Given** the daemon is not back in 2 minutes, **then** the UI shows SysDaemonDown.
- **Given** an exclusive job is running, **then** Restart is disabled.

**Implementation notes**
- API: `system.restartDaemon`, `GET /healthz`.
- Data: `audit_log`.
- UI: Dialog, Button.

### US-SYS-32 · Turn on AI access
**Feature:** F-SYS-10 · **Priority:** P3 · **Phase:** 8 · **Screens:** `SettingsAI`
**As** an admin, **I want** to enable hlabs's MCP server and see its address, **so that** I can connect an assistant like Claude.

**Acceptance criteria**
- **Given** Advanced › "AI access (MCP)" ("Let AI assistants check on and restart apps"), **when** I click "Set up", **then** SettingsAI opens with the intro "hlabs includes an MCP server so assistants like Claude can check status, read logs and restart apps. They can't install apps, change settings or open your files."
- **Given** AI access is off (default), **then** `POST /mcp` returns 404 and the page shows a Switch "Allow AI access" off.
- **Given** I turn it on, **then** "Connect an assistant" shows "MCP server address" `https://<hostname>/mcp` with a copy button, and the tailnet address too when remote access is on.
- **Given** it is on, **then** every `/mcp` request without a valid, unrevoked token returns 401.
- **Given** the MCP tool list, **then** only the tools in 02 §2.13 exist (list apps, app status, start/stop/restart, read logs, usage summary, list backups); install, update, uninstall, restore, factory reset, settings, user management and file tools are never registered, whatever permissions are set (tested by listing tools with all permissions on; D-037).

**Implementation notes**
- API: `ai.get`, `ai.setEnabled`; `POST /mcp`.
- Data: `settings.ai`, `audit_log`.
- UI: Switch, TextField (read-only) with copy Button.

### US-SYS-33 · Choose what assistants may do
**Feature:** F-SYS-10 · **Priority:** P3 · **Phase:** 8 · **Screens:** `SettingsAI`
**As** an admin, **I want** to switch each permission on or off, **so that** assistants only do what I allow.

**Acceptance criteria**
- **Given** "Permissions", **then** two Switches show: "Read status and logs" ("Apps, usage, backups") and "Start, stop and restart apps".
- **Given** defaults, **then** only "Read status and logs" is on.
- **Given** a permission is off, **then** its tools are not listed to MCP clients and calls to them return a permission error.
- **Given** the page, **then** it states "Assistants can't install or update apps, change settings or open files." and offers no switch for those (D-037).

**Implementation notes**
- API: `ai.setPermissions` (addition).
- Data: `settings.ai.permissions`; effective scopes = global permissions ∩ token `scopes_json`.
- UI: Switch in ListRow.

### US-SYS-34 · Create and revoke tokens
**Feature:** F-SYS-10 · **Priority:** P3 · **Phase:** 8 · **Screens:** `SettingsAI`
**As** an admin, **I want** a separate token per assistant, **so that** I can revoke one without affecting the others.

**Acceptance criteria**
- **Given** I click "Create token", **then** a Dialog asks for a name (1–40 chars, e.g. "Claude on my laptop") and shows the token once with a copy button and "You won't see this again."
- **Given** a created token, **then** its scopes are the permissions on at creation time and only its SHA-256 hash is stored.
- **Given** "Tokens", **then** each row shows name, "Created <relative> · used <relative>" (or "never used") and "Revoke".
- **Given** I click "Revoke" and confirm, **then** the token stops working within 1 s and the row disappears.
- **Given** no tokens, **then** the section reads "No tokens yet".

**Implementation notes**
- API: `ai.tokens.create`, `ai.tokens.list`, `ai.tokens.revoke`.
- Data: `mcp_tokens`, `audit_log`.
- UI: Dialog, TextField, List/ListRow, Button.

### US-SYS-35 · Assistants can't install or update apps
**Feature:** F-SYS-10 · **Priority:** P3 · **Phase:** 8 · **Screens:** `SettingsAI`
**As** an admin, **I want** app installs and updates to stay in my hands, **so that** nothing is installed or updated by an assistant.

**Acceptance criteria**
- **Given** D-037, **then** the MCP server has no install or update tools, so there is nothing for an admin to confirm in v1.
- **Given** an assistant asks hlabs to install or update an app (for example by calling an unknown tool), **then** the call fails with the message "Installing and updating apps isn't available to assistants. Do it from the App Store in hlabs." and the attempt is written to `audit_log` as a denied `mcp.` action (shown in US-SYS-36).
- **Given** SettingsAI, **then** no approval queue or "Allow"/"Deny" notification exists.

**Implementation notes**
- API: none; there is no approval procedure in v1 (D-037).
- Data: `audit_log`.
- UI: none beyond the SettingsAI copy in US-SYS-33.

### US-SYS-36 · See recent assistant activity
**Feature:** F-SYS-10 · **Priority:** P3 · **Phase:** 8 · **Screens:** `SettingsAI`
**As** an admin, **I want** a log of what assistants did, **so that** I can spot anything unexpected.

**Acceptance criteria**
- **Given** "Recent activity", **then** it lists the last 20 MCP actions as "<action>" and "<token name> · <relative time>" (e.g. "Restarted Uptime Kuma", "Claude on my laptop · 2 hours ago"), newest first.
- **Given** more entries, **then** "Show more" loads the next 20.
- **Given** a denied or failed call, **then** it shows with a warning Badge.

**Implementation notes**
- API: `ai.activity` (addition, cursor pagination).
- Data: `audit_log` rows with action prefix `mcp.`.
- UI: List/ListRow, Badge.

### US-SYS-37 · Confirm a factory reset
**Feature:** F-SYS-11 · **Priority:** P2 · **Phase:** 7 · **Screens:** `FactoryReset`
**As** an admin, **I want** a clear confirmation that says what will be deleted, **so that** I can't reset hlabs by accident.

**Acceptance criteria**
- **Given** Danger zone › "Factory reset" ("Deletes all apps, users and settings"), **when** I click "Reset…", **then** a Dialog "Reset hlabs to factory settings?" lists "All <n> apps and their data are deleted", "All user accounts and settings are removed" and "Backups on your NAS are not touched" (destination name substituted).
- **Given** the Dialog, **then** a checkbox "Keep everyone's Home folders" (off by default), a password field "Your password" and a field "Type <hostname> to confirm" are shown.
- **Given** the typed text does not exactly equal the hostname or the password is empty, **then** "Reset hlabs" (destructive style) is disabled.
- **Given** a wrong password, **when** I click "Reset hlabs", **then** "That password isn't right" shows and failures count towards lockout.
- **Given** a member or a stale session, **then** `system.factoryReset` returns `FORBIDDEN`.

**Implementation notes**
- API: `system.factoryReset` (input: password, typedHostname, keepHomeFolders).
- Data: `audit_log`.
- UI: Dialog, Checkbox, TextField (password), TextField, Button (destructive).

### US-SYS-38 · Reset hlabs
**Feature:** F-SYS-11 · **Priority:** P2 · **Phase:** 7 · **Screens:** `FactoryReset`
**As** an admin, **I want** the reset to remove everything and return to setup, **so that** I can start fresh or hand the computer on.

**Acceptance criteria**
- **Given** confirmation, **then** a `factory_reset` job holds the exclusive lock, and all sessions are revoked at once.
- **Given** the job, **then** it runs `compose down -v` for every app, deletes `app-data/`, `shared/`, `.trash/` and (unless kept) `users/`, removes Caddy routes, mDNS names, Tailscale Serve config, keychain secrets created by hlabs and MCP tokens, and recreates an empty database.
- **Given** backup destinations, **then** their repositories are not touched (restic data remains).
- **Given** the job finishes, **then** the browser lands on OnbWelcome, and the audit entry for the reset is written to a log file in the data dir (the table itself is recreated).
- **Given** the job fails midway, **then** it continues deleting what it can, reports what was left, and still ends in onboarding.

**Implementation notes**
- API: `system.factoryReset` → job, `onboarding.status`.
- Data: all tables; `jobs` (kind `factory_reset`).
- UI: full-screen Progress "Resetting hlabs…".

### US-SYS-39 · See version and system information
**Feature:** F-SYS-12 · **Priority:** P3 · **Phase:** 8 · **Screens:** `SettingsAbout`
**As** an admin, **I want** version and system details in one place, **so that** I can report issues accurately.

**Acceptance criteria**
- **Given** Settings › About, **then** it shows Logo, "hlabs", "Version <version> · up to date" (or "· update available" linking to Updates).
- **Given** "This computer", **then** it shows model and "<chip> · <memory> memory · <OS version>" (e.g. "Apple M1 · 16 GB memory · macOS 15").
- **Given** other rows, **then** "Container engine" ("Colima · 4 CPUs and 8 GB given to apps"), "Running since" ("Today, 08:12 · 9 hours") and "Local address" are shown.
- **Given** I click "Copy system info", **then** a plain-text block with all these values (no usernames, IPs or tokens) is copied and a Toast "System info copied" appears.
- **Given** I am a member, **then** About is reduced to the version line and "Open-source licences" (US-SYS-40); "This computer", "Container engine", "Running since", "Local address" and "Copy system info" are not shown and `system.info` is not called (D-043).

- **Given** I am a member, **then** the version line shows no update status or link, and `settings.updates.get` and `system.info` are not called (D-043).

**Implementation notes**
- API: `system.info`, `settings.updates.get`.
- UI: GlassCard, Logo, List/ListRow, Button, Toast.

### US-SYS-40 · See the project and licences
**Feature:** F-SYS-12 · **Priority:** P3 · **Phase:** 8 · **Screens:** `SettingsAbout`
**As** an admin, **I want** links to the source code and the open-source licences, **so that** I know what hlabs is built on.

**Acceptance criteria**
- **Given** "Project" ("Source code and issues"), **then** the repository URL is shown and "Open" opens it in a new tab.
- **Given** "Open-source licences" ("Components hlabs is built on"), **when** I click "View", **then** a Dialog lists each bundled component (npm packages, Caddy, restic, Colima, Lima, Node) with name, version and licence, with a search field; selecting one shows its licence text.
- **Given** I am a member, **then** I see "Open-source licences" as above and nothing else from this story; the "Project" row is admin-only (members get version and licences only, D-043).
- **Given** the build, **then** the list is generated at build time into a static `licenses.json` in the web bundle and a CI check fails if a dependency has no licence.

**Implementation notes**
- API: none (static asset).
- UI: Dialog, TextField (search), List/ListRow.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
