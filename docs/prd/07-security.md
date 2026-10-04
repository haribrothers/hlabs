# 07 · Security and privacy

hlabs holds a household's photos, passwords and documents. Security rules here are requirements, not guidance.

## 7.1 Principles
1. **Nothing leaves the house unless the user turns it on.** No telemetry, no analytics, no crash reporting by default. The only outbound calls are: store index sync, image pulls, hlabs update checks, Tailscale (if enabled), backup destinations (if configured), an ntfy server for push notifications (only if the admin configures one, D-033), the API of a Pi-hole on another device (only if chosen as the local DNS server, D-106), and on macOS the container engine download when no engine is found (pinned and checksum-verified, D-057). Each is listed in Settings › Advanced › "What hlabs connects to".
2. **The daemon is never directly exposed.** It binds to `127.0.0.1`; Caddy is the only listener on the network.
3. **Least privilege.** The daemon runs as the logged-in user (macOS, Linux desktop) or a dedicated `hlabs` user (headless). Privileged operations (binding 80/443 on Linux, mounting SMB on Linux) go through a minimal helper with an allow-list of commands.
4. **Public internet exposure is out of scope.** No port forwarding, no Tailscale Funnel, no dynamic DNS in v1.

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
- Built-in store images are pinned by digest; source indexes are signed (ed25519).
- Every app is behind forward auth by default. Opting out (`auth: none`) shows "This app has its own login" in AppPermissions.
- Container logs may contain secrets: logs are admin-only and never included in diagnostics exports without redaction.

## 7.7 Secrets
- macOS Keychain / Linux Secret Service for TOTP secrets, backup repo passwords, NAS credentials, S3 keys, tray token. Headless Linux: AES-256-GCM with a 0600 key file, **except the tray token**, which is a plain 0640 file readable by the `hlabs` group (D-035).
- Generated app secrets (e.g. DB passwords) go into the app's `.env` (0600) inside `<dataDir>/apps/<id>/`.
- Backup repositories are always encrypted (restic). The repo password is shown once with a "Save this somewhere safe" warning and can be exported later by an admin after re-entering their password.

## 7.8 Destructive actions
Uninstall with data deletion, restore, move all data, engine switch and factory reset require: an explicit confirmation dialog naming the thing; for factory reset and restore, re-entering the admin password; factory reset also requires typing the hostname. All are written to `audit_log`.

## 7.9 Supply chain
- pnpm with a lockfile and `pnpm audit` in CI; Renovate for updates.
- Bundled binaries are downloaded at build time from pinned URLs with checksum verification and are code-signed with the app (macOS notarized).
- Releases are signed (Tauri updater key; macOS Developer ID; Linux packages with a GPG key); checksums published.
