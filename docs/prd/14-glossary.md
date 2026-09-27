# 14 · Glossary

| Term | Meaning |
| --- | --- |
| **hlabs** | The product. Always lowercase. |
| **hlabsd** / daemon | The Node process that owns state, talks to the engine and serves the API (`apps/daemon`). |
| **Tray** | The Tauri menu-bar (macOS) / tray (Linux desktop) app (`apps/tray`). |
| **Dashboard** | The web UI (`apps/web`) at `https://hlabs.local`. |
| **Engine** | The container runtime: OrbStack, Docker Desktop, Colima or Docker Engine. Users see "engine", never "Docker daemon". |
| **App** | A self-hosted application installed from a source, run as a compose project `hlabs-<appId>`. |
| **Source** | Where apps come from: the built-in store, a git repo or an HTTPS index, each with a signed `index.json`. |
| **Manifest** | `hlabs-app.yml`, describing an app for hlabs (06). |
| **App data** | An app's private volumes under `appDataDir/<appId>`, always on this computer. |
| **Storage root** | Where Home folders, Shared and media live (this computer, an external drive or a NAS). |
| **Storage location** | A place files and app folders can live: local, external drive, SMB, NFS. |
| **Home folder** | A user's private files folder (`users/<username>`). |
| **Shared** | The household folder all allowed users can see. |
| **Admin / Member** | The two roles. Admins manage everything; members use what's shared with them. |
| **Forward auth** | Caddy asking the daemon (`/auth/verify`) whether a request to an app is allowed. |
| **Setup token** | One-time token that protects onboarding before the first admin exists. |
| **Tray token** | Local secret the tray and CLI use to talk to the daemon over loopback. |
| **Job** | Long-running work (install, update, backup, restore, move) with persisted progress. |
| **Exclusive job** | A job that must run alone (D-020). |
| **Destination** | Where backups go: drive, NAS share, S3-compatible bucket, SFTP, another hlabs. |
| **Snapshot / restore point** | One restic backup that can be restored. |
| **Glass level 1/2/3** | The three surface levels of the design system (widgets, windows, dialogs). |
| **Solid theme** | Reduce-transparency theme (`data-theme="solid"`). |
| **Help site** | The public website and user documentation in `apps/site` (D-055), not the `docs/` spec. |
| **Dock** | Desktop and web navigation at the bottom of the screen: the six areas, the person's pinned apps and Search (D-054). |
| **Lens** | The glass highlight behind the selected tab in the phone tab bar. |
| **Tailnet** | The user's Tailscale network; hlabs is reachable at `https://hlabs.<tailnet>.ts.net`. |
| **MCP** | Model Context Protocol; lets AI assistants use scoped hlabs tools (P3). |
| **P1 / P2 / P3 / Nice to have / Polish** | Priority of a screen, feature or story. |
| **Phase** | Build order step (10-phases). Phases 0–6 are the MVP. |
