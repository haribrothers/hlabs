# 08 · Non-functional requirements

Each requirement has an id so tests and reviews can point at it.

## Performance
| ID | Requirement |
| --- | --- |
| NFR-PERF-01 | Dashboard to interactive ≤ 1.5 s on LAN (Mac mini M1, warm daemon); JS for the first route ≤ 250 KB gzip; routes code-split. |
| NFR-PERF-02 | tRPC queries used on Home return in ≤ 100 ms p95 with 30 installed apps. |
| NFR-PERF-03 | Daemon idle: ≤ 150 MB RSS and ≤ 1% of one core averaged over 5 minutes (usage sampling included). |
| NFR-PERF-04 | Live usage updates every 5 s with ≤ 500 ms latency from sample to screen. |
| NFR-PERF-05 | Files lists 5,000 entries in ≤ 1 s (virtualised list; thumbnails lazy). |
| NFR-PERF-06 | Uploads sustain ≥ 80% of LAN throughput for large files; resumable after network loss. |
| NFR-PERF-07 | Tray dropdown opens in ≤ 150 ms. |

## Reliability
| ID | Requirement |
| --- | --- |
| NFR-REL-01 | Daemon crash → restarted by launchd/systemd within 5 s; in-flight jobs resume or end as `failed` with a clear message; no job stuck in `running` after restart. |
| NFR-REL-02 | Power loss never corrupts the DB (SQLite WAL, `synchronous=NORMAL`, migrations in transactions). |
| NFR-REL-03 | An app update that fails its health check is rolled back automatically (02 §2.5); the app is running again within 2 minutes. |
| NFR-REL-04 | hlabs self-update failure rolls back to the previous version and keeps apps running. |
| NFR-REL-05 | Apps keep running if the tray quits, the browser closes or the daemon restarts (containers have `restart: unless-stopped`). |
| NFR-REL-06 | Backups (D-046): network operations inside a run retry twice, 5 s apart; a failed run is retried once after 30 minutes; three consecutive failed runs raise a critical notification. |
| NFR-REL-07 | Engine restarts (Colima VM, Docker Desktop updates) are detected within 10 s and apps are reconciled when it's back. |

## Compatibility
| ID | Requirement |
| --- | --- |
| NFR-COMP-01 | macOS 14 Sonoma and later, Apple Silicon first-class; Intel supported if the engine runs. |
| NFR-COMP-02 | Linux: Ubuntu 22.04+/Debian 12+, Fedora 40+ (x86_64, arm64); systemd required. Desktop tray on GNOME (AppIndicator extension) and KDE Plasma. |
| NFR-COMP-03 | Engines: OrbStack, Docker Desktop 4.30+, Colima 0.8+, Docker Engine 24+. |
| NFR-COMP-04 | Browsers: last two versions of Safari (macOS and iOS), Chrome, Firefox, Edge. |
| NFR-COMP-05 | Screen sizes: phone ≥ 360px wide, desktop ≥ 1024px; the desktop design frame is 1440×900 (windows 1240px wide). |

## Accessibility
| ID | Requirement |
| --- | --- |
| NFR-A11Y-01 | WCAG 2.2 AA. Text contrast ≥ 4.5:1 (3:1 at 24px+), non-text UI ≥ 3:1, in both the glass and solid themes. |
| NFR-A11Y-02 | Every interactive element reachable and operable by keyboard with a visible 2px accent focus ring; logical focus order; dialogs trap focus and restore it. |
| NFR-A11Y-03 | Reduce motion and Reduce transparency honoured (OS setting and in-app setting). |
| NFR-A11Y-04 | State is never colour alone (status dots have words, failures have icons). Charts have a data table for screen readers and arrow-key stepping. |
| NFR-A11Y-05 | Touch targets ≥ 44px on phone. |
| NFR-A11Y-06 | axe-core reports zero serious/critical violations on every route in CI. |

## Security and privacy
See [07-security](07-security.md). In addition: NFR-SEC-01 no outbound network calls other than those listed in 07 §7.1 (tested by running the e2e suite with an egress allow-list); NFR-SEC-02 every mutation writes to `audit_log` when it changes users, roles, access, apps, network, backups or system state.

## Observability
| ID | Requirement |
| --- | --- |
| NFR-OBS-01 | Daemon logs JSON with pino to `<dataDir>/logs/hlabsd.log`, rotated at 10 MB × 5; secrets redacted by key name. |
| NFR-OBS-02 | Every job and every API error carries a correlation id shown in the UI's error details ("Copy details"). |
| NFR-OBS-03 | Diagnostics export (Settings › Advanced) bundles logs, versions, engine info and settings with secrets and usernames redacted. |

## Maintainability
| ID | Requirement |
| --- | --- |
| NFR-MAINT-01 | `pnpm typecheck`, `pnpm lint` and `pnpm test` pass on every commit to main; no `any` without a comment. |
| NFR-MAINT-02 | Services have unit tests for their invariants (04 §Invariants) and state machines (02 §2.5). |
| NFR-MAINT-03 | Every user story has at least one automated test named after its id (Vitest or Playwright) unless it's marked manual in the story. |
| NFR-MAINT-04 | All user-facing copy lives in `src/copy/` and follows the voice in [09-design-system](09-design-system.md). |
