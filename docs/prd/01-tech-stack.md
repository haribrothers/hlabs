# 01 · Tech stack

Use the latest stable release of each item at scaffold time, within the major version given. Don't add a library that duplicates one listed here; propose it in [12-decisions](12-decisions.md) first.

## Languages and runtime
| Item | Choice | Why |
| --- | --- | --- |
| Language | TypeScript 5.x, `strict: true`, ESM everywhere | One language across daemon, web, tray UI and CLI (like umbrelOS) |
| Runtime | Node.js 22 LTS (bundled with the app) | Stable, well supported by dockerode and better-sqlite3 |
| Tray shell | Rust (stable) via Tauri 2 | Small signed native app, menu-bar/tray APIs, updater, keychain |
| Package manager | pnpm 9+ workspaces | Fast, strict, good monorepo support |
| Build orchestration | Turborepo | Cached, ordered builds and tasks across packages |

## Daemon (`apps/daemon`)
| Concern | Choice |
| --- | --- |
| HTTP server | Fastify 5 |
| API | tRPC v11 (`@trpc/server`, fetch adapter on Fastify, SSE subscriptions) |
| Validation | Zod (v4 if available at scaffold, else v3) |
| Database | SQLite via `better-sqlite3`, Drizzle ORM + `drizzle-kit` migrations |
| Docker | `dockerode` (inspect, stats, logs, events, pulls) + bundled `docker compose` CLI (stack up/down) — D-003 |
| Scheduling | `croner` |
| Logging | `pino` (JSON to file with rotation; pretty in dev) |
| Auth | `@node-rs/argon2`, `otplib` (TOTP), `qrcode` |
| System info | `systeminformation` |
| mDNS | macOS `dns-sd` child process; Linux Avahi over D-Bus (`dbus-next`) |
| Keychain | `@napi-rs/keyring` (macOS Keychain / Secret Service), file fallback on headless |
| Files | `@fastify/multipart` not used; tus-style chunked uploads implemented on Fastify routes; `archiver` for zip downloads; `sharp` for thumbnails |
| MCP (P3) | `@modelcontextprotocol/sdk` |
| Bundling | esbuild → single `hlabsd.mjs` + native modules |

## Web dashboard (`apps/web`)
| Concern | Choice |
| --- | --- |
| Framework | React 19 + Vite |
| Routing | TanStack Router (file-based, type-safe) |
| Data | tRPC client + TanStack Query (`@trpc/tanstack-react-query`) |
| Styling | Tailwind CSS 4 with the hlabs preset from `packages/ui` (tokens → CSS variables) |
| Components | shadcn/ui (Radix primitives) restyled to the hlabs design system in `packages/ui` |
| Icons | `@hlabs/icons` (Lucide re-exports + tab glyphs + logo + AppLogo); `@hlabs/icons/files` for Files (Papirus colour file and folder icons, GPL-3.0, D-053) |
| Motion | Framer Motion (`motion` values from the design system) |
| Charts | Own components from the design system (LineChart, BarChart, StackedBar, Sparkline), SVG, no chart library |
| Forms | React Hook Form + Zod resolver |
| i18n | English only in v1; all copy in `apps/web/src/copy/*.ts` so it can be translated later |
| PWA | `vite-plugin-pwa` (manifest + icons; no offline caching of data) |

## Tray (`apps/tray`)
Tauri 2 with the core `tray-icon` feature and the plugins `updater`, `shell` (sidecars), `notification`, `opener` and `single-instance`. The daemon's start-at-login is its own LaunchAgent/systemd unit, not the autostart plugin; the tray itself uses `autostart` so the icon appears at login. UI in React + `packages/ui`. macOS `LocalAuthentication` via a small Rust crate; Linux polkit via `zbus`.

## Helper binaries (bundled, pinned, checksum-verified at build)
Caddy 2, restic 0.17+, docker compose v2 plugin, Colima + Lima (macOS, downloaded on demand), Node 22.

## Tooling and quality
| Concern | Choice |
| --- | --- |
| Lint / format | ESLint (flat config, typescript-eslint) + Prettier; `cargo clippy` + `rustfmt` for Rust |
| Unit and integration tests | Vitest (daemon services with a real SQLite file and a mocked Docker API; web components with Testing Library + jsdom) |
| End-to-end | Playwright against a real daemon + Docker in CI (Linux), plus a manual macOS checklist per release |
| Accessibility | `@axe-core/playwright` on every route |
| Type-safe env | `@t3-oss/env-core` (or a small Zod parser) |
| Git hooks | `lefthook` (lint-staged format + typecheck on push) |
| Dependencies | Renovate |
| CI | GitHub Actions (Linux x64/arm64 runners, macOS arm64 runner for tray builds and notarization) |
| Releases | Changesets for versioning; GitHub Releases for artifacts and the Tauri update manifest |
