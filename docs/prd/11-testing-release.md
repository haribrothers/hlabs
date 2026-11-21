# 11 · Testing, CI and release

## Test pyramid
| Layer | Tool | What | Where |
| --- | --- | --- | --- |
| Unit | Vitest | Pure logic: manifest validation and compose rendering, state machines, permission checks, formatters, token generation | next to source, `*.test.ts` |
| Service / integration | Vitest | Daemon services with a real SQLite file in a temp dir, a **fake engine** (in-memory implementation of the engine interface) and fake Caddy/Tailscale/restic adapters | `apps/daemon/test/` |
| Router | Vitest + tRPC caller | Auth, roles and input validation for every procedure (admin-only procedures reject members; members can't see other users' data) | `apps/daemon/test/routers/` |
| Component | Vitest + Testing Library | `packages/ui` components: keyboard, ARIA, states | `packages/ui/src/**/*.test.tsx` |
| End-to-end | Playwright | User stories through the real UI against a real daemon + real Docker (Linux CI) | `apps/web/e2e/us-<code>-<nn>.spec.ts` |
| Accessibility | `@axe-core/playwright` | Every route, glass and solid themes | inside e2e |
| Store matrix | Playwright + daemon | Install → open → restart → uninstall for every app in `store/` on linux/amd64 and linux/arm64 | nightly workflow |
| Manual | Checklist | macOS install/tray/Keychain/LocalAuthentication/notarization, Linux desktop tray on GNOME and KDE, phone Safari/Chrome | `docs/qa/release-checklist.md` (create in phase 6) |

Rules:
- Every story gets at least one automated test named with its id, unless the story says it's manual.
- Adapters for external systems (engine, Caddy, Tailscale, restic, mDNS, keychain, mounts) sit behind interfaces in `apps/daemon/src/platform` or the relevant folder, with fakes in tests. Only the e2e and store-matrix suites touch real Docker.
- Tests never reach the internet except the store matrix (image pulls), which uses a pull-through cache.

## CI (GitHub Actions)
| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `ci.yml` | PR, push to main | install (pnpm cache) → lint → typecheck → unit/integration → build → e2e (Linux, Docker) → axe; `store:lint`; boundaries check |
| `tray.yml` | PR touching `apps/tray` | `cargo clippy`, `cargo test`, `tauri build` (macOS arm64 and Linux x64, unsigned) |
| `store.yml` | nightly, PR touching `store/` | store matrix; sign `index.json` on main |
| `site.yml` | PR or push touching `apps/site`, `store/`, `packages/ui` or `packages/icons`; after `release.yml`; after a shots PR merges | `site:build` (with the latest releases from GitHub) → `site:check` (help slugs, error pages, feature coverage, links, release-note sections, store group names) → `site:e2e` (the website's stories against a build from fixtures, with axe on every page template in both themes) → deploy (preview on PRs, production on `main`) |
| `release.yml` | tag `v*`; by hand for a rehearsal | check the release notes exist → build all targets → sign → notarize → one signed `SHA256SUMS` → GitHub release with the update manifest (`stable` or `beta` by tag; draft without the update key) → trigger `site.yml` (D-146) |

## Release artifacts
| Target | Artifact | Notes |
| --- | --- | --- |
| macOS arm64 (Intel x64 best-effort) | `hlabs-<v>-mac-arm64.dmg` (and `hlabs-<v>-mac-x64.dmg`) | Developer ID signed, notarized, stapled; contains tray, daemon bundle, node, caddy, restic, compose |
| Linux desktop | `.deb`, `.rpm`, `.AppImage` (x64, arm64) | Tray + daemon + systemd user unit |
| Linux headless | `hlabs-<v>-linux-<arch>.tar.gz` + `install.sh` | System unit, `hlabs` user, CLI; script verifies checksums and signature |
| Updates | `latest.json` per channel, `hlabs-<v>-mac-<arch>.app.tar.gz` | Tauri updater signature; hlabsd's entries for headless Linux (D-118) |
| Checks | `SHA256SUMS` and a `.sig` for every file | The hlabs update key (D-141) |

## Versioning
- One product version for everything (`hlabs 1.2.3`): the release tag (`v1.2.3`, or `v1.2.3-beta.1` for beta), given to every build; release notes are written by hand in `apps/site/src/content/releases/<version>.md` before tagging (D-146). The daemon refuses to run with a DB schema newer than it knows (downgrade protection).
- Channels: `stable` and `beta`. Default `stable`.

## Definition of done (every story)
1. Acceptance criteria pass, with automated tests named after the story id.
2. Copy matches the story/screen and lives in `src/copy/`.
3. Works in glass and solid themes, with reduce motion, keyboard only, and on phone width where the screen applies.
4. No new lint or type errors; boundaries respected.
5. Audit log entries written where 08 NFR-SEC-02 requires.
6. `docs/progress.md` ticked; any contract change reflected in `05-api.md` / `04-data-model.md` in the same PR.
