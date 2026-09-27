# 13 · Risks and open questions

## Risks
| ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-01 | **Docker on macOS is a VM.** Colima/OrbStack/Docker Desktop each behave differently (sockets, file sharing speed, networking, resource limits). | Install failures, slow app data, apps unreachable from Caddy. | Engine abstraction with per-engine tests; Colima profile tuned (VZ + virtiofs); Caddy reaches apps through loopback-published ports on every engine (D-049). |
| R-02 | **Docker Desktop licensing** for larger organisations. | Some users can't use it. | Prefer OrbStack/Colima; never install Docker Desktop ourselves. |
| R-03 | **macOS signing and notarization** need an Apple Developer account (paid) and a notarization pipeline for the app and every bundled binary. | Can't ship a trusted `.dmg` without it. | Set up in phase 6; until then, dev builds only. |
| R-04 | **mDNS and `.local` hostnames** are unreliable on some networks, on Android, and with VPNs. | "Can't open hlabs.local". | IP-based fallback addresses always shown; Tailscale MagicDNS for remote; CertGuide explains. |
| R-05 | **Local CA trust** on every device is a hurdle; untrusted certs scare people. | Browser warnings on LAN. | CertGuide per OS; recommend Tailscale (real certificates) for phones. |
| R-06 | **App store maintenance**: images change, apps break, digests need bumping. | Broken installs. | Nightly store matrix, Renovate for image digests, start with a small curated set (10 apps). |
| R-07 | **Backups that don't restore.** | Data loss. | Restore is tested in e2e; monthly optional `restic check`; failures are loud (critical notification after 3 failures). |
| R-08 | **Scope.** 336 stories is a lot for one person. | Never ships. | Phases 0–6 are the MVP; 7 is 1.0; 8–9 only when wanted. |
| R-09 | **Tailscale dependency** (account, app installed separately). | Remote access needs a third-party account. | Clearly optional; LAN works without it. |
| R-10 | **SMB on macOS** needs port 445, which conflicts with macOS File Sharing (P3 FilesShare). | Feature may not work alongside built-in sharing. | Use macOS File Sharing itself on Mac (D-051). |

## Open questions for Hari
All answered on 27 Sep 2026:

| ID | Question | Answer |
| --- | --- | --- |
| Q-01 | Apple Developer account and bundle id | Get an account before phase 6; bundle id `dev.hlabs.app` (D-050) |
| Q-02 | How Caddy reaches app containers on macOS | Loopback-published ports on every engine (D-049) |
| Q-03 | Network shares | macOS File Sharing via `sharing` on Mac, Samba container on Linux, separate share password (D-051) |
| Q-04 | Seed apps for the store | 14 apps (D-048) |
| Q-05 | Licence and visibility | AGPL-3.0, public repository (D-047) |
| Q-06 | Pages without a design | Designed: `NoAccess`, `ResetLink`, `RestoreChooseDest`, `BackupIncluded`, `PhoneUpdates` (D-052) |

| ID | Question | Status |
| --- | --- | --- |
| Q-07 | Website domain (used for `SITE_URL`, the install command and help links). The bundle id `dev.hlabs.app` suggests `hlabs.dev`. | Open: needed before phase 6 |
| Q-08 | Page designs for the website (home, download, app catalogue, help theme). | Open: design before phase 6; until then follow the design system and Starlight defaults |

New questions found during the build go here with the next free id (Q-09 onward).

| ID | Question | Status |
| --- | --- | --- |
| Q-09 | D-036 hides controls whose phase hasn't shipped. Phase 0's Dock and tab bar show all areas as placeholder windows so the "working Dock" can be checked. From phase 1, should areas whose features haven't shipped (App Store until phase 2, Usage 4, Backups and Files 5) be hidden, leaving Home and Settings? | Open: before phase 1 |
| Q-10 | D-055 names Astro 5; the current releases are Astro 7 and Starlight 0.42. Phase 0 pins Astro 5.18 and Starlight 0.37.7, the last Starlight that supports Astro 5. Move to Astro 7 before the site is built in phase 6? | Open: before phase 6 |

## Design follow-ups (copy changes already decided)
- `ForgotPassword`: remove "Have a recovery code?"; admin line reads "your admin can make a reset link for you from Settings › Users" (D-009).
- `FactoryReset`: "Type RESET to confirm" → "Type <hostname> to confirm" (D-025).
- `ChangePassword`: "Sign out my other devices" shown checked and disabled (D-021).
- `RestoreProgress`: step order Stop → Safety copy → Restore → Start; add "Cancel restore" until swap-in (D-024).
- `SysDaemonDown`: command reads `systemctl status hlabsd` (D-017).
- `LinuxInstall`: service `hlabsd`, dashboard `hlabs.local` (D-017).
- Accent picker shows Violet, Mint, Amber, Rose (D-023).
