# 07 · Security and privacy

hlabs holds a household's photos, passwords and documents. Security rules here are requirements, not guidance.

## 7.1 Principles
1. **Nothing leaves the house unless the user turns it on.** No telemetry, no analytics, no crash reporting by default. The only outbound calls are: store index sync, image pulls, hlabs update checks, Tailscale (if enabled), backup destinations (if configured), an ntfy server for push notifications (only if the admin configures one, D-033), the API of a Pi-hole on another device (only if chosen as the local DNS server, D-106), on macOS the container engine download when no engine is found (pinned and checksum-verified, D-057), app libraries an admin adds (D-149), and for apps an admin makes public, Cloudflare (its API and the tunnel, D-150, D-171). Each is listed in Settings › Advanced › "What hlabs connects to".
2. **The daemon is never directly exposed.** It binds to `127.0.0.1`; Caddy is the only listener on the network.
3. **Least privilege.** The daemon runs as the logged-in user (macOS, Linux desktop) or a dedicated `hlabs` user (headless). Privileged operations (binding 80/443 on Linux, mounting SMB on Linux) go through a minimal helper with an allow-list of commands.
4. **Only what an admin chooses goes public, and only through hlabs** (D-150, D-182, §7.10, §7.11): single apps, and the dashboard itself when an admin turns it on (off by default). The daemon never does (it stays on `127.0.0.1`). No port forwarding, UPnP or dynamic DNS.

## 7.2 Authentication
- Passwords: min 12 characters, checked against a bundled list of the 100k most common passwords; Argon2id (`m=64 MiB, t=3, p=1`).
- Usernames: lowercase letters, numbers and dashes, starting with a letter: `^[a-z][a-z0-9-]{2,31}$`.
- TOTP: RFC 6238, SHA-1, 6 digits, 30 s, ±1 step; setup requires confirming one code. 10 single-use recovery codes (format `xxxx-xxxx`), shown once, downloadable as text.
- Admin 2FA is strongly recommended in onboarding (skippable with a warning); admins can require 2FA for everyone (SettingsUsers).
- Lockout: 5 failed attempts in 15 minutes per username+IP locks that pair for 15 minutes (LoginLocked). Failures are logged to `audit_log`.
- Password reset: there is **no email**. Resets happen (a) from the tray app on the machine itself, which proves physical/local access, (b) with `sudo hlabs reset-password` on a headless server, or (c) by an admin generating a one-time reset link for a member. **Recovery codes replace the two-factor step only; they never reset a password** (D-009). ForgotPassword explains the options.
- The login screen's user list can be hidden (recommended when reachable over Tailscale).

## 7.2a First run (before any user exists)
- While onboarding is incomplete, the daemon generates a one-time **setup token** (32 bytes, base64url). The tray opens the browser at `http://127.0.0.1:7474/setup?token=…`; on headless Linux the install script prints the setup URL with the token.
- Every `onboarding.*` procedure except `status` requires that token (header `x-hlabs-setup`), so another device on the LAN can't create the first admin. `onboarding.status` stays public.
- During onboarding only, Caddy also serves the dashboard over plain HTTP on the LAN (the local CA isn't trusted yet). Once onboarding completes, port 80 only redirects to HTTPS and serves `GET /ca.crt` (see CertGuide); the dashboard also serves `GET /ca.crt` over HTTPS (D-097). The CA certificate is public; its key never leaves Caddy's storage. Decision D-013.

## 7.3 Sessions
- Session id: 32 random bytes, stored as SHA-256 hash. Cookie `hlabs_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Domain=.hlabs.local` (plus the tailnet host), `Path=/`.
- Idle timeout 12 h; "Remember me on this device" extends to 30 days sliding.
- Changing a password or disabling 2FA revokes all other sessions. Admins can revoke any session.
- CSRF: tRPC mutations require the `x-hlabs-csrf` header (double-submit token from `auth.me`) and `Origin` must be the dashboard: `HLABS_DASHBOARD_URL`, `https://<hostname>.local[:port]` as the name and ports are now (also `http://` while setup runs) or the tailnet address (D-098).

## 7.4 Authorization
| Capability | Admin | Member |
| --- | --- | --- |
| Open apps | All | Only apps in `app_access` |
| Install / update / uninstall apps, app settings, logs | Yes | No (unless "Members can install apps" is on: install only, from the built-in source) |
| Files | All Home folders, Shared, drives | Own Home folder; Shared if allowed |
| Users, invites, network, storage, backups, updates, engine, advanced, factory reset | Yes | No |
| Live usage | Yes | If "Members can see live usage" is on |
| Own account, password, 2FA, appearance | Yes | Yes |

### What members see (navigation)
| Place | Admin | Member |
| --- | --- | --- |
| Dock / tab bar | Home, App Store, Files, Usage, Backups, Settings (+ pinned apps and Search in the desktop Dock) | Home, Files, Settings; **Usage** only if D-029 allows; **App Store** only if "Members can install apps" is on; own pinned apps (only apps shared with them) |
| Settings sections | All | Account (incl. password, 2FA), Appearance (incl. wallpaper, D-010), Notifications, About |
| Home widgets | All | My files, Shared with you, app status of shared apps; Live usage only if D-029 allows |
| Admin-only page or app not shared | — | "You don't have access to this" page (US-STATE-20) |

Enforced in the daemon (procedure middleware + service checks) **and** at Caddy via `/auth/verify` for app hostnames. The UI hides what a user can't do but never relies on hiding.

## 7.5 Tray and local access
- The tray token is 32 random bytes, generated at first run, stored in the OS keychain (on headless Linux, the plain file of D-035; on a Linux desktop without Secret Service, the same 0600 file in the user's data dir), sent as `Authorization: Bearer` and accepted only from loopback on `/trpc` `tray.*` procedures (in development, `.dev-data/tray.token`; details in D-112).
- Password reset from the tray requires the OS to confirm the local user (macOS: `LocalAuthentication` / Touch ID or the account password; Linux: polkit prompt).

## 7.6 Apps and containers
- Manifest rules (06) forbid privileged containers, host networking and Docker socket access unless explicitly declared; such permissions show a red warning in InstallSheet and require an admin to tick "I understand".
- Devices and Linux capabilities count as risky access too (D-163): an app declares them (`permissions.devices`, `permissions.capabilities` from an allow-list of `NET_ADMIN`), the install sheet and an update's Review list them, and the validator refuses any it doesn't declare, along with other host namespaces and security options. Host networking stays forbidden: it would put an app on the network without Caddy and the hlabs login.
- Built-in store images are pinned by digest; source indexes are signed (ed25519).
- Every app is behind forward auth by default. Opting out (`auth: none`) shows "This app has its own login" in AppPermissions.
- Container logs may contain secrets: logs are admin-only and never included in diagnostics exports without redaction.

## 7.7 Secrets
- macOS Keychain / Linux Secret Service for TOTP secrets, backup repo passwords, NAS credentials, S3 keys, tray token, the API keys admins add for app widgets (`widget-key:<appId>`, US-HOME-20, D-157; never sent back to the browser), and the Cloudflare credential for public apps (`cloudflare-credential`, US-SYS-43, D-179; the tunnel's own credentials file is `<dataDir>/cloudflare/tunnel.json`, 0600). Headless Linux: AES-256-GCM with a 0600 key file, **except the tray token**, which is a plain 0640 file readable by the `hlabs` group (D-035).
- Generated app secrets (e.g. DB passwords) go into the app's `.env` (0600) inside `<dataDir>/apps/<id>/`.
- On Linux an app's data is backed up and restored by restic in a throwaway helper container, as hlabs's user with only the capabilities it needs (D-190); the repository password and keys go into that container's environment only, and the container is removed when restic ends.
- Backup repositories are always encrypted (restic). The repo password is shown once with a "Save this somewhere safe" warning and can be exported later by an admin after re-entering their password.

## 7.8 Destructive actions
Uninstall with data deletion, restore, move all data, engine switch and factory reset require: an explicit confirmation dialog naming the thing; for factory reset and restore, re-entering the admin password; factory reset also requires typing the hostname. All are written to `audit_log`.

## 7.9 Supply chain
- pnpm with a lockfile and `pnpm audit` in CI; Renovate for updates.
- Bundled binaries are downloaded at build time from pinned URLs with checksum verification and are code-signed with the app (macOS notarized).
- Releases are signed (macOS Developer ID; the hlabs update key, a minisign key, for updates and for every Linux download and `install.sh`, D-141); checksums published. A GPG key comes only with an apt or dnf package repository.

## 7.10 Public apps (D-150, D-171)
An admin can make an app reachable from the internet, one app at a time, through Cloudflare Tunnel at a name under a domain on their own Cloudflare account. Tailscale stays private: hlabs never turns on Funnel (D-007).

**What we protect against**
- Strangers finding the address and trying passwords, or exploiting a bug in the app (the address is public and scanned).
- A public app becoming a way into the rest of hlabs: the dashboard, other apps, the files.
- Admins making something public without meaning to, or forgetting that it is.
- A stolen or leaked Cloudflare token.

**Controls**
1. **Never public**: the daemon (`127.0.0.1` only), the dashboard unless an admin makes it public (§7.11) and apps whose manifest says `public.allowed: false` (Portainer and other admin tools). Only the app's own web service is reachable, at its own address; other apps and the dashboard's paths answer 404 there.
2. **Admins only, one app at a time**: a confirmation names the app and its public address; the change is in `audit_log` and every other admin gets a notification. Members can't make anything public.
3. **A login in front**: Caddy's forward auth (US-APP-19) with hlabs's login, signed in at `/.hlabs/sign-in` on the public address itself with a host-only cookie for that address (D-178), and two-factor required for everyone allowed into that app; people without access to the app get 403. "<App>'s own login only" is offered only when the manifest says `public.ownLoginSafe: true`, with a warning naming who can then reach the sign-in page.
4. **Hardening at Caddy** for public addresses: HTTPS on every leg (D-181: a page visited over plain HTTP is sent to its `https://` address, anything else sent that way is refused; cloudflared reaches Caddy's public listener over TLS with a certificate from hlabs's local CA, trusting only that CA), HSTS, the headers of the dashboard, a rate limit on login paths (and hlabs's lockout, §7.2), a request size limit unless the app's manifest asks for more (uploads), `Referrer-Policy: strict-origin-when-cross-origin`, the visitor's address from `CF-Connecting-IP` with cloudflared as the only trusted proxy, and hlabs's own cookies never sent to the app (D-178).
5. **Visible and easy to stop**: a "Public" badge on the app everywhere it appears; Settings › Network › Public access lists every public app with its provider, address, who can get in and its access log (time, address, path, status; kept 7 days, admins only); **Turn off all public access** there and in the menu-bar app.
6. **Kept current**: automatic updates can't be turned off for a public app while it's public.
7. **Secrets and the domain**: the Cloudflare credential (from signing in to Cloudflare, or an API token scoped to the one zone's tunnel and DNS) is in the keychain, never in SQLite or logs; removing Cloudflare Tunnel deletes it, the tunnel and its records. hlabs only ever changes the DNS records it made, never the domain's other records (D-171).

**Tests**: e2e makes an app public with fake providers and checks the login in front, two-factor, 403 for others, the 404s, the headers, the rate limit and turning it all off; the prototype (D-171) checks the real tunnel by hand, from outside the home network, before the stories are built.

## 7.11 The public dashboard (D-182)
An admin can make the dashboard itself reachable from the internet, through the same Cloudflare Tunnel, at a name of its own. It's off by default.

**What we protect against**
- A stolen password and two-factor code (phishing, a shared computer) used to take over the household's data or the computer.
- Strangers trying passwords on the sign-in page, and learning who uses hlabs from it.
- A session from home or the tailnet replayed on the public address, or a public session kept for weeks.
- Someone turning it on without meaning to, or forgetting it's on.

**Controls**
1. **Off by default**: only an admin turns it on, with their password; audited; the other admins are notified; listed in Public access with the apps, and included in Turn off all public access and the menu-bar item.
2. **Two-factor for everyone there**: it can't be turned on while an admin has no two-factor; anyone without it can't sign in there.
3. **A plain sign-in**: username and password typed, never a list of users; no "Remember this phone"; the lockout of §7.2 and the public apps' limit per address (more than 20 failures in 10 minutes refuse it for an hour and warn the admins).
4. **Sessions bound to the address**: a session made there works only there (`sessions.public_host`, and `X-Hlabs-Via: public`, which only the public listener sets and every other server deletes), ends after 12 hours, and a sign-in from a new place notifies the person.
5. **Home-only changes** (US-SYS-47): factory reset, public access and the network, app sources and libraries, deploying your own apps, app configuration, permissions, "Require hlabs login" and secrets, AI access tokens (D-184), people and roles (including enabling an account, who can open which app, and the people policy, D-183), passwords and two-factor, restores, backup destinations and backup passwords (D-184), data moves and the engine are refused there with `HOME_ONLY`, enforced in the daemon for every procedure from one list (`HOME_ONLY_PROCEDURES`) and recorded when tried; stopping exposure always works.
6. **Never there**: first-run setup, invites and reset links.
7. **Cloudflare's sign-in in front**: recommended, set up by hlabs (an Access application with an email allow list) when the admin adds it.
8. Everything in §7.10 control 4 (HTTPS on every leg, the headers, the request size limit, 20 MB for the dashboard, the visitor's address from Cloudflare); forward auth, the public apps' sign-in and the development routes (`/auth/*`, `/.hlabs/*`, `/dev/*`) are never passed on there.

**Tests**: e2e with the pretend Cloudflare checks the dashboard on its public address: two-factor required, no user list, a home session refused there, the 12-hour end, every home-only procedure refused with `HOME_ONLY` (a contract test makes every procedure declare whether it is), the app tiles, and turning it off ending its sessions; checked by hand through Hari's domain (Q-25).

