# CLAUDE.md — hlabs

hlabs is a home cloud OS for macOS and Linux (umbrelOS-like): a Node daemon that runs self-hosted apps in Docker, a React dashboard, and a Tauri menu-bar app. The full product spec is in `docs/`. This file is the short version of the rules; the docs are the detail.

## Before you start any task
1. Read `docs/README.md` once per session, then only the docs the task needs.
2. For a story: read the story in `docs/features/<module>.md`, its screens in `docs/design/screens.md` (look at the images in `docs/design/screens/`), and the contracts it names in `docs/prd/04-data-model.md` and `docs/prd/05-api.md` (including "Contract additions from the feature files").
3. For a phase: read `docs/prd/10-phases.md` for that phase and work through its stories in order.
4. Check `docs/prd/12-decisions.md` before choosing a library, a pattern or behaviour that isn't spelled out.

## How to work
- Work one story at a time. Say which story (e.g. `US-STORE-05`) you're implementing.
- A story is done only when every acceptance criterion passes with an automated test named after the story id (`us-store-05.spec.ts` or `describe('US-STORE-05', …)`), plus the definition of done in `docs/prd/11-testing-release.md`.
- Tick the story in `docs/progress.md` when it's done.
- If you change a contract (API procedure, table, column, manifest field, event, error code), update `docs/prd/05-api.md`, `04-data-model.md` or `06-app-manifest.md` in the same change.
- If a story, a screen and the architecture disagree: the story wins over the screen; the architecture and decisions win over the story. If it's still unclear, stop and ask; add the question to `docs/prd/13-risks-open-questions.md`.
- Controls that depend on a later phase are hidden behind flags in `packages/shared/src/features.ts` until that phase ships (D-036).
- Don't build beyond the story. Non-goals in `docs/prd/00-overview.md` are out of scope.

## Stack (don't substitute)
pnpm + Turborepo · TypeScript strict, ESM · Node 22 · Fastify + tRPC v11 (SSE subscriptions) · Zod · SQLite (better-sqlite3) + Drizzle · dockerode + bundled `docker compose` CLI · Caddy (admin API) · Tailscale LocalAPI · restic · React 19 + Vite + TanStack Router + TanStack Query · Tailwind 4 + shadcn/ui themed by `packages/ui` · Framer Motion · `@hlabs/icons` (Lucide; `/files` = Papirus file icons) · Tauri 2 · Vitest + Playwright + axe.

## Architecture rules
- The daemon binds `127.0.0.1:7474` only. Everything external goes through Caddy.
- Routers are thin: validate with Zod, check role, call a service. Business logic lives in services. Services never import routers.
- Long work (install, update, uninstall, backup, restore, moves) is a **job**: return `{ jobId }`, report progress with `job.progress` events, persist state in `jobs`.
- App state changes only through `AppService` and follow the state machine in `docs/prd/02-architecture.md` §2.5.
- All external systems (engine, Caddy, Tailscale, restic, mDNS, keychain, mounts, OS paths) sit behind interfaces with fakes for tests. Only e2e touches real Docker.
- Use dockerode for inspect/stats/logs/events/pulls and the compose CLI for stack up/down. Never shell out to `docker` for anything else.
- Errors: throw `TRPCError` with an `hlabsCode` from `packages/api/src/errors.ts`; the UI maps codes to copy. Never show raw error text to users.
- Respect the dependency rules in `docs/prd/03-monorepo.md` (`packages/api` has no server code; `packages/ui` has no data fetching; only the daemon imports `packages/db`).

## Security rules (never break)
- No telemetry, analytics or outbound calls beyond `docs/prd/07-security.md` §7.1.
- Passwords: Argon2id. Sessions: hashed ids, HttpOnly + Secure + SameSite=Lax cookie. CSRF header on mutations.
- Every procedure declares its access (`publicProcedure`, `authedProcedure`, `adminProcedure`, `trayProcedure`). Members only ever see their own data and apps shared with them — enforce in the service, not just the UI.
- Secrets go in the OS keychain (or the encrypted file on headless Linux), never in SQLite or logs.
- Recovery codes never reset a password. There is no email.
- Destructive actions need the confirmations in §7.8 and write `audit_log`.
- Compose files from sources must pass `packages/app-manifest` validation (no privileged, no host network, no docker socket unless declared).

## UI rules
- Values come from `docs/design/tokens.json` via CSS variables in `packages/ui`. No hex values or magic numbers in components.
- Use the design-system components (`docs/design/components/`); port behaviour from `docs/design/reference/`.
- Glass levels, the Dock (desktop) and tab bar (phone) (D-054), one white primary button per view, charts rules, icons (Lucide via `@hlabs/icons`, stroke 2), `AppLogo` for app tiles, `FileIcon` from `@hlabs/icons/files` for files and folders (D-053), `LogoMark`/`LogoLockup` for the brand: see `docs/prd/09-design-system.md`.
- Copy: sentence case, verbs on buttons, say what happens to people's data, errors say what to do next. All strings in `apps/web/src/copy/`.
- Accessibility is required: keyboard, focus rings, 4.5:1 text contrast in glass and solid themes, reduce motion, no colour-only state, 44px touch targets on phone.

## Commands
`pnpm dev` · `pnpm dev:full` (with Caddy/mDNS) · `pnpm dev:tray` · `pnpm test` · `pnpm test:e2e` · `pnpm lint` · `pnpm typecheck` · `pnpm db:generate` · `pnpm store:lint` · `pnpm build`

## Where things are
`apps/daemon` hlabsd · `apps/web` dashboard · `apps/tray` Tauri · `apps/cli` `hlabs` command · `packages/{api,db,app-manifest,ui,icons,shared,config}` · `store/` built-in apps · `scripts/` install and release · `docs/` spec.
