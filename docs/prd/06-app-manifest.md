# 06 · App manifest (`hlabs-app.yml`)

An app in the App Store is a folder in a **source** (the built-in `store/` directory, a git repo, or an HTTPS index):

```
store/apps/immich/
  hlabs-app.yml        # this spec
  docker-compose.yml   # standard compose, with ${HLABS_*} placeholders
  logo.svg             # square, ≥ 256px (PNG also accepted)
  screenshots/1.webp   # optional, 16:10, ≤ 5
  README.md            # optional long description (markdown)
```

The schema lives in `packages/app-manifest` (Zod) and is the single source of truth for validation in the daemon, the store CI and `pnpm store:lint`.

## Example

```yaml
schema: 1
id: immich                       # ^[a-z0-9][a-z0-9-]{1,38}$, unique within a source
name: Immich
version: "1.135.3"               # the upstream app version shown to users
revision: 2                      # bump when only packaging changes
tagline: Back up every photo from your phone
description: |
  Self-hosted photo and video backup with albums, faces and search.
category: photos                 # one of: photos, media, files, productivity, home, network,
                                 # security, developer, ai, finance, books, monitoring, other
developer: { name: Immich, url: https://immich.app }
source: https://github.com/immich-app/immich
license: AGPL-3.0
icon:
  logo: logo.svg
  gradient: ["#fb923c", "#c2410c"]   # fallback tile (see @hlabs/icons AppLogo)
  fallback: images                   # Lucide icon name
platforms: [linux/arm64, linux/amd64]
tags: [apple-silicon, local-ai]
requirements:
  memory: 2048                   # MB recommended; install warns if the engine has less free
  disk: 10240                    # MB
web:
  service: immich-server         # compose service that serves the UI
  port: 2283                     # container port Caddy proxies to
  path: /                        # optional
  auth: hlabs                    # hlabs (forward auth, default) | none
health:
  service: immich-server
  http: /api/server/ping         # or: tcp: 2283, or: container (use compose healthcheck)
  timeout: 180                   # seconds, default 120
env:                             # prompts shown in InstallSheet / AppConfig
  - key: IMMICH_LOG_LEVEL
    label: Log level
    type: select                 # string | secret | number | boolean | select
    options: [log, warn, error]
    default: log
  - key: DB_PASSWORD
    type: secret
    generate: true               # generated once, never shown unless revealed by an admin
    hidden: true
folders:                         # folder access requests (InstallSheet, AppPermissions)
  - key: library
    label: Photo library
    description: Where your library is stored
    target: /usr/src/app/upload  # container path
    default: home:Photos         # home:<dir> | shared:<dir> | appdata:<dir>
    mode: rw
    required: true
  - key: import
    label: Existing photos to import
    target: /mnt/import
    mode: ro
    required: false
ports:                           # raw host ports (only for non-HTTP protocols)
  - { service: pihole, container: 53, protocol: udp, host: 53, label: DNS }
backup:
  pause: [immich-server, immich-machine-learning]   # stopped during backup
  preHook: { service: database, command: "pg_dumpall -U postgres > /backup/dump.sql" }
  exclude: [thumbs/, encoded-video/]
  beforeUpdate: true
dependsOn: []                    # other hlabs apps (ids) that must be installed
permissions:                     # shown to the user; enforced where possible
  network: lan                   # none | lan | internet (default internet)
  gpu: false
  dockerSocket: false            # true requires an admin warning at install
```

## Optional fields added in schema 1
```yaml
releaseNotes: |                  # markdown for "What's new" in StoreUpdates (or ship CHANGELOG.md)
  - Faster face detection
ownLogin: true                   # the app has its own accounts too; shows "Uses its own login too"
web:
  embed: false                   # default false = open in a new tab; true only if the app works inside the hlabs app window (iframe)
widgets:                         # Home widgets the app can provide
  - id: library
    name: Photo library
    template: stat               # stat | twoStat | list
    endpoint: { service: immich-server, path: /api/server/statistics }
    refresh: 60                  # seconds
```
The index may also carry optional `featured: [appId]`, `collections: [{ title, appIds }]` and per-app `rank` for the store home (D-019).

## Compose rules (enforced by the validator)
- Use `${HLABS_APP_DATA}/<dir>` for app-private volumes and `${HLABS_FOLDER_<key>}` for folder requests. No other host bind mounts.
- No `ports:` except those declared under `ports` above. No `privileged: true`, no `network_mode: host`, no `pid: host`, no `/var/run/docker.sock` unless `permissions.dockerSocket: true`.
- Images must be pinned by tag **and** digest in the built-in store (`image: ghcr.io/…:v1.135.3@sha256:…`).
- hlabs injects: a loopback port mapping `127.0.0.1:<port>:<web.port>` for the web service (D-049), network `hlabs` (external), labels `dev.hlabs.app=<id>`, `restart: unless-stopped`, log options (json-file, 10 MB × 3), and `TZ`.
- Named and anonymous volumes are not allowed: everything an app keeps goes under `${HLABS_APP_DATA}` or a declared folder, so backups include it. `build`, `container_name` and `env_file` are not allowed either (hlabs names the project `hlabs-<id>` and writes the variables to the project's `.env`).
- Only the web service joins the external `hlabs` network (with the project's `default` network); databases and workers stay on the project network. Every service gets the labels `dev.hlabs.app=<id>` and `dev.hlabs.service=<service>`.
- Validator issue codes (used by `pnpm store:lint` and install errors): `COMPOSE_INVALID`, `SERVICE_BUILD`, `IMAGE_NOT_PINNED`, `PRIVILEGED`, `HOST_NETWORK`, `HOST_PID`, `HOST_IPC`, `CONTAINER_NAME`, `ENV_FILE`, `PORT_NOT_DECLARED`, `BIND_MOUNT_NOT_ALLOWED`, `DOCKER_SOCKET`, `NAMED_VOLUME`, `UNKNOWN_FOLDER`, `MANIFEST_SERVICE_MISSING`.

## Variables available to compose
`HLABS_APP_ID`, `HLABS_APP_DATA`, `HLABS_FOLDER_<KEY>`, `HLABS_HOSTNAME` (e.g. `immich.hlabs.local`), `HLABS_URL` (https URL), `HLABS_TAILNET_URL` (if remote access on), `TZ` (this computer's time zone by its current IANA name, e.g. `Asia/Kolkata`, never a legacy alias), `PUID`, `PGID`, plus every `env` key.

## Store index
A source publishes `index.json` (generated by `pnpm store:build`): `{ schema: 1, source: { id, name }, apps: [{ id, version, revision, manifestUrl, composeUrl, logoUrl, digest, rank? }], featured?: [appId], collections?: [{ id, title, appIds }] }`. In the built-in store, `featured`, `collections` and `rank` come from `store/curation.yml` (`featured`, `collections: [{ id, title, appIds }]`, `rank: [appId]`, most popular first); `pnpm store:lint` checks that every id in it is an app in the store. `featured` and `collections` are the store home's Featured cards and rows (US-STORE-01); `rank` orders "Popular" (US-STORE-04). The daemon verifies the index signature (ed25519, source public key pinned when the source is added; the built-in source's key ships with hlabs).

## Custom apps (DeployCustom, P3)
Admins can paste a compose file (building from a git repo or Dockerfile is out of scope for v1). hlabs wraps it with a generated minimal manifest (name, icon gradient, web service/port chosen from a dropdown) and applies the same compose rules, except image digests are optional. Custom apps are labelled "Custom" and are never auto-updated.
