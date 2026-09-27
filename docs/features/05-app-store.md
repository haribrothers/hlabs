# 05 · App Store & installing

The App Store is where people find self-hosted apps, see what each one needs and can access, and install it on their hlabs with one sheet of choices. It also covers everything after install that comes from the store: updates with automatic rollback, the sources apps come from, and (later) deploying your own app. Admins use all of it; members see the App Store only if an admin turns on "Members can install apps" (07 §7.4), and then can browse and install from the built-in source.

**Screens:** `AppStore` (P1), `StoreCategory` (P2), `StoreSearch` (P2), `AppDetails` (P1), `InstallSheet` (P1), `InstallProgress` (P1), `InstallFailed` (P1), `StoreUpdates` (P2), `UpdateRolledBack` (P1), `StoreSources` (P2), `DeployCustom` (P3), `StoreLoading` (Nice to have).
**Depends on:** the feature files covering Home (`Main`, Spotlight), installed-app management (`AppSettings`, `AppConfig`, `AppLogs`, `AppPermissions`), Files (`FilesBrowser`, folder picker, storage locations), Settings › Updates (`SettingsUpdates`), Users & roles (member permissions), and Notifications. Architecture: docs/prd/02-architecture.md §2.5, §2.10; docs/prd/06-app-manifest.md.

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-STORE-01 | Store home | P1 | 2 | `AppStore` |
| F-STORE-02 | Category pages | P2 | 7 | `StoreCategory` |
| F-STORE-03 | Store search | P2 | 7 | `StoreSearch` |
| F-STORE-04 | App details | P1 | 2 | `AppDetails` |
| F-STORE-05 | Install options | P1 | 2 | `InstallSheet` |
| F-STORE-06 | Install job and progress | P1 | 2 | `InstallProgress` |
| F-STORE-07 | Install failure and recovery | P1 | 2 | `InstallFailed` |
| F-STORE-08 | App updates | P2 | 7 | `StoreUpdates` |
| F-STORE-09 | Update rollback | P1 | 2 | `UpdateRolledBack` |
| F-STORE-10 | App sources | P2 | 7 | `StoreSources`, `StoreSearch` |
| F-STORE-11 | Deploy your own app | P3 | 8 | `DeployCustom` |
| F-STORE-12 | Loading states | Nice to have | 9 | `StoreLoading` |

## User stories

### US-STORE-01 · Browse the store home
**Feature:** F-STORE-01 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppStore`
**As** anyone signed in, **I want** a store home with featured apps and themed rows, **so that** I can discover useful apps without knowing their names.

**Acceptance criteria**
- **Given** the catalogue is synced, **when** I open App Store, **then** I see a "Featured" section with large cards (logo, name, one-line description, platform tags such as "Apple Silicon" and "Local AI", and an action button), followed by at least one row such as "Popular on Apple Silicon" with a "See all" link.
- **Given** a row, **when** I select "See all", **then** I land on a list view (the `StoreCategory` layout) filtered to that row's apps.
- **Given** an app card, **when** the app is not installed, **then** its button reads "Install"; **when** installed and running it reads "Open"; **when** an install is in progress it reads "Installing…" with the percent, and it updates live from events without a reload.
- **Given** the host is arm64, **when** an app's manifest `platforms` includes `linux/arm64`, **then** the card shows the "Apple Silicon" tag (macOS) or "ARM64" (Linux); apps without an arm64 image are shown after compatible ones in every row and never featured.
- **Given** I click a card body (not its button), **when** the click lands, **then** `AppDetails` opens for that app; "Install" on a card also goes to `AppDetails` first so I always see access before installing.
- **Given** I press "Back to Home", **when** on the desktop layout, **then** the store window closes and Home is shown.
- **Given** I am a member, **when** "Members can install apps" is off, **then** the App Store tab is not shown and opening any store URL shows the "You don't have access to this" page (US-STATE-20); when it is on, I can browse the store (07 §7.4). This rule applies to US-STORE-01 to US-STORE-06.

**Implementation notes**
- API: `store.getHome` (new, returns `featured` and `collections` from the enabled sources' indexes), `store.listApps`, `apps.list` (to merge install state), `events.stream` for `app.stateChanged` and `app.installProgress`.
- Data: `catalog_apps`, `apps`.
- UI: GlassCard for featured, List + ListRow or card grid for rows, AppIcon (manifest `icon.gradient` / `fallback` when the logo fails), Badge for tags, Button, TabBar on phone (< 768px).
- Featured and collections come from optional `featured: [id]` and `collections: [{ title, appIds }]` fields in the built-in source's `index.json`; other sources' apps appear in rows only if their index defines collections. If no collections exist, show one row "All apps" A–Z.
- Edge: an app present in two sources appears once, preferring the built-in source.

### US-STORE-02 · Navigate with the categories sidebar
**Feature:** F-STORE-01 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppStore`
**As** anyone signed in, **I want** a sidebar with categories and store management links, **so that** I can move around the store quickly.

**Acceptance criteria**
- **Given** the store is open on desktop, **when** it renders, **then** the sidebar lists every category that has at least one app (from `store.listCategories`, manifest categories mapped to labels, e.g. `photos` and `files` → "Files & photos"), in a fixed order, with the current one highlighted.
- **Given** I am an admin, **when** the sidebar renders, **then** a "Manage apps" group shows "Updates" with a count Badge (e.g. "2"), "App sources" and "Deploy your own app"; members do not see this group.
- **Given** there are pending updates, **when** I am an admin, **then** the App Store item in the tab bar (phone) and dock shows the same count, and it changes live on `update.available`.
- **Given** the phone layout, **when** I open App Store, **then** categories are a horizontally scrolling Segmented/chip row above the content and "Manage apps" items appear in a Menu.
- **Given** keyboard use, **when** I tab through the sidebar, **then** each item is focusable, has a visible focus ring, and Enter activates it.
- **Given** phase 7 (updates list and app sources) has not shipped, **when** the sidebar renders, **then** "Updates", its count and "App sources" are hidden, and so is the updates count on the Dock and phone tab bar (D-036).
- **Given** I am a member, **when** "Members can install apps" is off, **then** I can't reach the store at all (see US-STORE-01).

**Implementation notes**
- API: `store.listCategories`, `store.listUpdates` (count only for the badge).
- UI: List + ListRow for sidebar, Badge, Segmented on phone, Menu, TabBar.
- Edge: "Deploy your own app" is hidden until P3 ships (feature flag), not shown disabled.

### US-STORE-03 · Search from the store home
**Feature:** F-STORE-01 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppStore`
**As** anyone signed in, **I want** a search field that says how many apps I can search, **so that** I can jump straight to an app I already know.

**Acceptance criteria**
- **Given** the catalogue has N apps across enabled sources, **when** the store opens, **then** the search field placeholder reads "Search N apps" (e.g. "Search 240 apps").
- **Given** I type in the field, **when** I pause for 200 ms or press Enter, **then** `StoreSearch` opens with my query; clearing the field returns to the view I came from.
- **Given** anywhere in the store on desktop, **when** I press `/`, **then** focus moves to the search field.
- **Given** the field has a query, **when** I press Escape, **then** the query clears.
- **Given** I am a member, **when** "Members can install apps" is off, **then** store search is not available to me (see US-STORE-01).

**Implementation notes**
- API: `store.listApps` (`query`), count from `store.getHome` (`totalApps`).
- UI: TextField with search icon and accessible label "Search apps".

### US-STORE-04 · Browse a category
**Feature:** F-STORE-02 · **Priority:** P2 · **Phase:** 7 · **Screens:** `StoreCategory`
**As** anyone signed in, **I want** to see every app in a category with sorting, **so that** I can compare the options for one need.

**Acceptance criteria**
- **Given** I pick "Media", **when** the page loads, **then** the title is "Media" and a summary line reads "18 apps · showing Apple Silicon compatible first" (count is live; the second clause appears only on arm64 hosts).
- **Given** the sort control shows "Popular", "New", "A–Z", **when** I pick one, **then** the list re-sorts immediately and the choice is remembered for this browser.
- **Given** "Popular", **when** sorting, **then** order follows the source index's curated rank (hlabs collects no usage data); "New" sorts by the catalogue entry's first-seen date, newest first; "A–Z" by name, case-insensitive.
- **Given** a row, **when** the app is installed, **then** its button reads "Open" and opens the app's address in a new tab; otherwise "Install" opens `AppDetails`.
- **Given** more than 50 apps, **when** I scroll to the end, **then** the next page loads (cursor pagination) without a visible jump.

**Implementation notes**
- API: `store.listApps` (`category`, `sort`, `cursor`, `limit: 50`), `apps.list`.
- Data: `catalog_apps` (add a `first_seen_at` column; see Open questions), `apps`.
- UI: List + ListRow with AppIcon, name, tagline, Button; Segmented for sort.
- Edge: members reach this page only when "Members can install apps" is on (US-STORE-01); otherwise it shows the "You don't have access to this" page. A member sees "Open" only for apps they have access to.

### US-STORE-05 · Search results with filters
**Feature:** F-STORE-03 · **Priority:** P2 · **Phase:** 7 · **Screens:** `StoreSearch`
**As** anyone signed in, **I want** search results I can narrow down, **so that** I find the right app among similar ones.

**Acceptance criteria**
- **Given** I searched "photo", **when** results load, **then** the title reads "Results for “photo”" and each row shows name, tagline, " · " and category label, and an "Install" or "Installed" Badge plus "Open".
- **Given** results, **when** they render, **then** filter chips show counts: "All · 5", "Installed · 1", and a toggle "Apple Silicon only" (arm64 hosts only).
- **Given** the query, **when** matching, **then** it matches name, id, tagline, tags and description, case- and accent-insensitive; name matches rank above description matches.
- **Given** no results, **when** the list is empty, **then** I see "No apps match “<query>”" and, for admins, "Can't find an app? Add another app source" linking to `StoreSources`.
- **Given** results exist, **when** I am an admin, **then** the "Can't find an app?" footer still appears below the list.
- **Given** I am a member, **when** "Members can install apps" is off, **then** this page shows the "You don't have access to this" page (see US-STORE-01).

**Implementation notes**
- API: `store.listApps` (`query`, `installedOnly`, `arm64Only`), `apps.list`.
- UI: Segmented or chips for filters, Switch for "Apple Silicon only", List + ListRow, Badge.
- Edge: query of 1 character shows nothing and no request; queries are trimmed and capped at 100 characters.

### US-STORE-06 · See an app's details before installing
**Feature:** F-STORE-04 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppDetails`
**As** anyone signed in, **I want** a details page with screenshots, description and facts, **so that** I know what the app does before I install it.

**Acceptance criteria**
- **Given** I open Immich, **when** the page loads, **then** I see logo, name, tagline ("Photo and video backup from your phone"), category ("Files & photos"), platform tag ("Apple Silicon"), source Badge ("hlabs official" for the built-in source, otherwise the source name), and a primary "Install" button (or "Open" if installed).
- **Given** the manifest has screenshots, **when** the page renders, **then** up to 5 are shown in a horizontal strip at 16:10; selecting one opens it in a Dialog viewer with arrow-key navigation and Escape to close; with no screenshots the strip is omitted.
- **Given** the page, **when** it renders, **then** an "About" section shows the manifest `description` (or README.md rendered as sanitized markdown), and "What's new" shows the release notes for the catalogue version, collapsed after 6 lines with "More".
- **Given** the facts list, **when** it renders, **then** it shows "Version" (manifest `version`), "Runs as" ("3 containers · server, database, cache", derived from compose services and their roles), "Opens at" (`<appId>.hlabs.local`), and "Needs access to" (folder labels, e.g. "Your Photos folder").
- **Given** the host is arm64 and the app has no `linux/arm64` platform, **when** the page renders, **then** "Install" is disabled and a note reads "There's no Apple Silicon version of this app yet."
- **Given** I press "App Store" (back), **when** on the page, **then** I return to the exact list and scroll position I came from.
- **Given** I am a member, **when** "Members can install apps" is off, **then** app details pages show the "You don't have access to this" page (see US-STORE-01).

**Implementation notes**
- API: `store.getApp` (manifest, screenshots URLs, release notes, service summary, source), `apps.get` when installed.
- Data: `catalog_apps.manifest_json`, `app_sources`.
- UI: AppIcon, Badge, Button, GlassCard, Dialog; facts as List + ListRow.
- Service roles for "Runs as": from compose service names, using the manifest `web.service` as "server" and recognizing images like postgres/mariadb as "database", redis/valkey as "cache"; others use the service name.
- Edge: markdown is sanitized (no raw HTML, no scripts); external links open in a new tab with `rel="noopener"`.

### US-STORE-07 · See requirements and what an app can access
**Feature:** F-STORE-04 · **Priority:** P1 · **Phase:** 2 · **Screens:** `AppDetails`
**As** an admin, **I want** the details page to show requirements and access in plain words, **so that** I can judge whether the app is safe and fits my machine.

**Acceptance criteria**
- **Given** the manifest `requirements.memory` exceeds the engine's free memory, **when** the page renders, **then** a warning reads "Recommends <X> GB of memory. hlabs has <Y> GB free." (install still allowed).
- **Given** `requirements.disk` exceeds free space on the `appDataDir` volume or on the engine's image disk (not the storage root, D-011), **when** the page renders, **then** a warning reads "Needs <X> GB of free space. You have <Y> GB." and "Install" is disabled.
- **Given** `permissions`, **when** the page renders, **then** an access list shows network ("No network", "Your home network only", or "Internet"), each folder request with read/write mode, raw ports (e.g. "DNS on port 53"), GPU, and Docker access; Docker access and raw ports are marked with a red warning Badge.
- **Given** `dependsOn` lists apps not installed, **when** the page renders, **then** a note reads "Needs <App> installed first" with a link to that app's details, and "Install" is disabled.

**Implementation notes**
- API: `store.getApp`, `system.info` (engine memory), `storage.summary` (free space).
- UI: Badge (warning/critical), List + ListRow, Button.
- Edge: requirements missing from the manifest show no warning.

### US-STORE-08 · Choose folder access in the install sheet
**Feature:** F-STORE-05 · **Priority:** P1 · **Phase:** 2 · **Screens:** `InstallSheet`
**As** an admin, **I want** to review and change which folders an app gets, **so that** it only touches the data I choose.

**Acceptance criteria**
- **Given** I press "Install" on `AppDetails`, **when** the sheet opens, **then** its title is "Install Immich" with subtitle "Review what it can access", as a Dialog on desktop and a bottom sheet on phone.
- **Given** the manifest `folders`, **when** the sheet renders, **then** each shows its resolved location (e.g. "Home › Photos"), mode and description ("Read and write · where your library is stored"; "Read only · import existing photos"), with a "Change" action opening the folder picker over Home, Shared and storage locations (NAS, external drives).
- **Given** a `required: false` folder, **when** the sheet renders, **then** it has a Switch that is off by default unless a default location exists; turning it off omits the mount.
- **Given** a `required: true` folder whose default doesn't exist (e.g. `home:Photos`), **when** I install, **then** the folder is created in the admin's Home; if the chosen location is an offline NAS, "Install" is disabled with "NAS › Photos archive is offline".
- **Given** a folder picker, **when** I choose a location, **then** the mode can't be raised above the manifest's `mode` (a `ro` request can't be made `rw`).

**Implementation notes**
- API: `store.getApp`, `storage.locations.list`, `files.list` (picker), then `apps.install` with `mounts: [{ key, storageLocationId, subpath, mode }]`.
- Data: `app_mounts`, `storage_locations`.
- UI: Dialog, List + ListRow, FileItem in the picker, Switch, Button.
- Edge: paths are validated server-side and jailed to the chosen storage location; `..` is rejected.

### US-STORE-09 · Review included services, address and login
**Feature:** F-STORE-05 · **Priority:** P1 · **Phase:** 2 · **Screens:** `InstallSheet`
**As** an admin, **I want** to see what will run and where the app will open, **so that** there are no surprises after install.

**Acceptance criteria**
- **Given** the sheet, **when** it renders, **then** "Includes" lists each compose service with a role ("Immich server · web app", "PostgreSQL · database · private to this app", "Redis · cache · private to this app").
- **Given** the "Address" row, **when** it renders, **then** it shows "https://immich.hlabs.local" and is editable as the hostname part only, validated against `^[a-z0-9-]{1,40}$` and uniqueness; invalid input shows "Use lowercase letters, numbers and dashes" or "Another app already uses this address" and disables "Install".
- **Given** manifest `web.auth` is `hlabs`, **when** the sheet renders, **then** the row reads "Login required" (hlabs login protects the app); if `none`, it reads "No hlabs login"; if the manifest sets `ownLogin: true`, the row adds "Uses its own login too".
- **Given** "Cancel", **when** pressed or Escape is hit, **then** the sheet closes and nothing is created.
- **Given** "Install", **when** pressed with valid inputs, **then** the sheet closes and `InstallProgress` opens for the new job within 1 s.

**Implementation notes**
- API: `apps.install` (appId, env, mounts, hostname) → `{ jobId }`.
- Data: `apps.hostname`, `apps.auth_mode`.
- UI: Dialog, List + ListRow, TextField, Button.
- Edge: hostnames `hlabs`, `www` and the dashboard's own name are reserved.

### US-STORE-10 · Fill in app settings and accept risky permissions
**Feature:** F-STORE-05 · **Priority:** P1 · **Phase:** 2 · **Screens:** `InstallSheet`
**As** an admin, **I want** to answer an app's setup questions and be warned about risky access, **so that** the app starts correctly and I consent to anything dangerous.

**Acceptance criteria**
- **Given** manifest `env` prompts that are not `hidden`, **when** the sheet renders, **then** each appears under "Settings" using its `type`: string/number → TextField, secret → password TextField with reveal, boolean → Switch, select → Segmented or Menu; defaults pre-filled.
- **Given** `generate: true` secrets, **when** installing, **then** the daemon generates a 32-byte random value and never shows it in the sheet.
- **Given** a required prompt (no default) is empty, **when** I press "Install", **then** the field shows "Required" and focus moves to it.
- **Given** the manifest requests `dockerSocket: true`, raw host ports, or GPU, **when** the sheet renders, **then** a red warning block explains each in plain words and an "I understand" checkbox must be ticked before "Install" is enabled.
- **Given** a member with "Members can install apps" on, **when** they open the sheet for a built-in-source app without risky permissions, **then** they can install; apps from other sources or with risky permissions show "Ask an admin to install this app" instead of "Install". Members can install only from the built-in source, only apps without risky permissions, and only while "Members can install apps" is on (`membersCanInstall`, 05-api); `apps.install` enforces the same rule server-side.

**Implementation notes**
- API: `apps.install` validates env against the manifest's Zod schema server-side; error `APP_ENV_INVALID` maps to field errors.
- Data: `app_env` (secrets via `secret_ref` or the 0600 `.env`, per 07 §7.7).
- UI: TextField, Switch, Segmented, Menu, Button, Badge (critical).
- Edge: acknowledgement of risky permissions is written to `audit_log` with the list of permissions.

### US-STORE-11 · Run an install as a job
**Feature:** F-STORE-06 · **Priority:** P1 · **Phase:** 2 · **Screens:** `InstallProgress`
**As** an admin, **I want** installs to run in the background reliably, **so that** closing the browser or a restart doesn't leave a half-broken app.

**Acceptance criteria**
- **Given** `apps.install` is called, **when** accepted, **then** an `apps` row is created in state `installing`, a `jobs` row of kind `app_install` is queued, and `{ jobId }` returns within 500 ms.
- **Given** the job runs, **when** it executes, **then** steps run in order: check compatibility (platform + disk) → pull images → create data folders under `app-data/<appId>` and requested folders → `compose up -d` → wait for health (manifest `health`, default 120 s) → register Caddy route and mDNS name → state `running`.
- **Given** another app job is running, **when** a new install is requested, **then** it waits in `queued` and the progress page shows "Waiting for another app to finish…"; installs are refused with `JOB_EXCLUSIVE_RUNNING` while a restore, move, system update or factory reset runs.
- **Given** the daemon restarts mid-install, **when** it comes back, **then** the job resumes from the last completed step or, if it cannot, moves to `install_failed` with reason "hlabs restarted during install".
- **Given** the install succeeds, **when** the app is `running`, **then** it appears on the installer's Home screen, a success notification "Immich is ready" is created, and `job.finished` is emitted.

**Implementation notes**
- API: `apps.install`, `jobs.get`, `events.stream` (`job.progress`, `app.installProgress`, `app.stateChanged`, `job.finished`).
- Data: `apps`, `jobs`, `app_env`, `app_mounts`, `notifications`, `home_layout` (append app id), `audit_log`.
- Tests: fake engine adapter for pull/up/health; assert state transitions follow 02 §2.5 exactly.

### US-STORE-12 · Watch install progress
**Feature:** F-STORE-06 · **Priority:** P1 · **Phase:** 2 · **Screens:** `InstallProgress`
**As** an admin, **I want** to see how far an install is and how long is left, **so that** I know it's working.

**Acceptance criteria**
- **Given** an install job, **when** the page renders, **then** the header shows the app (logo, name, tagline, category, platform tag) and "Installing… 42%" with a Progress bar.
- **Given** the step list, **when** steps complete, **then** each shows past-tense text and detail: "Checked compatibility · arm64 images found", "Downloading images · 2 of 3", "Creating data folders", "Starting containers", "Setting up immich.hlabs.local"; the current step shows a spinner, later steps are muted.
- **Given** image pulls, **when** progress events arrive, **then** percent is weighted by bytes across all images (pull = 0–80%, remaining steps share 80–100%) and never goes backwards.
- **Given** at least 5 s of download data, **when** the remaining time is estimated, **then** it reads "About N minutes left" (rounded up), "Less than a minute left" under 60 s, and is hidden before that.
- **Given** the note "You can leave this page. Immich appears on your Home screen when it's ready.", **when** I leave and return, **then** the page restores current state from `jobs.get` and continues live.
- **Given** a screen reader, **when** a step completes, **then** it is announced via a polite live region (percent is not announced on every change).

**Implementation notes**
- API: `jobs.get`, `events.stream` (`app.installProgress` payload `{ appId, jobId, step, progress, stepDetail, etaSeconds }`).
- UI: Stepper, Progress, AppIcon, Badge.
- Edge: SSE disconnect → fall back to polling `jobs.get` every 2 s until reconnected.

### US-STORE-13 · Understand why an install failed
**Feature:** F-STORE-07 · **Priority:** P1 · **Phase:** 2 · **Screens:** `InstallFailed`
**As** an admin, **I want** a clear reason and a fix when an install fails, **so that** I can get the app running without reading logs.

**Acceptance criteria**
- **Given** the job fails, **when** the page shows, **then** the title reads "Install failed" with "Nothing else was changed", completed steps keep their check marks, and the failing step shows "Failed" with the plain-language reason.
- **Given** error `APP_PORT_IN_USE`, **when** shown, **then** the reason reads "Port 2283 is already used by another program on this computer." with a primary "Use a different port" action.
- **Given** other errors, **when** shown, **then** each has its own copy and fix: `APP_NO_PLATFORM` ("There's no Apple Silicon version of this app."; action "Back to App Store"), `APP_DISK_FULL` ("Not enough free space. Needs <X> GB."; action "Free up space" → Storage), `APP_NETWORK_UNREACHABLE` ("hlabs couldn't reach the internet to download the app."; action "Try again"), `APP_HEALTH_TIMEOUT` ("Immich didn't start within <N> seconds."; actions "Try again", "View log"), `ENGINE_UNAVAILABLE` ("The container engine stopped."; action "Open Engine settings").
- **Given** any failure, **when** shown, **then** "View log" opens `AppLogs` for the app (admin only) and the app's state is `install_failed`.
- **Given** a failure notification, **when** I was away from the page, **then** a critical notification "Immich couldn't be installed" links back to this page.

**Implementation notes**
- API: `jobs.get` (error `hlabsCode` + params), `apps.get`, `apps.logs`.
- Data: `apps.state = install_failed`, `apps.state_detail` (hlabsCode + params JSON), `jobs.message`.
- UI: Stepper with error state, Button, Toast on retry.
- Edge: unknown errors show "Something went wrong while installing." with "View log"; never the raw message.

### US-STORE-14 · Retry or remove a failed install
**Feature:** F-STORE-07 · **Priority:** P1 · **Phase:** 2 · **Screens:** `InstallFailed`
**As** an admin, **I want** to retry with a fix or clean up a failed install, **so that** I'm never stuck with a broken app.

**Acceptance criteria**
- **Given** `APP_PORT_IN_USE`, **when** I press "Use a different port", **then** a Dialog proposes the next free port in 12000–12999 (editable, validated free) and "Try again" retries the install with that host port.
- **Given** a retryable failure, **when** I retry, **then** state goes `install_failed → installing`, already-pulled images are reused, and the page returns to `InstallProgress`.
- **Given** "Remove partial install", **when** confirmed in a Dialog ("Remove Immich? Any containers and data it created are deleted."), **then** `compose down`, the app folder and `app-data/<appId>` are removed, and the app returns to "Install" in the store.
- **Given** a failed install left untouched, **when** Home renders, **then** the app tile shows an error StatusDot and opens this page.

**Implementation notes**
- API: `apps.retryInstall` (new: `appId`, optional `portOverrides`) → `{ jobId }`; `apps.uninstall` (`keepData: false`) for removal.
- Data: `apps`, `jobs`, `audit_log`.
- UI: Dialog, TextField, Button, StatusDot.
- Edge: user-chosen folders (e.g. Home › Photos) are never deleted by "Remove partial install", only `app-data/<appId>`.

### US-STORE-15 · See and apply available updates
**Feature:** F-STORE-08 · **Priority:** P2 · **Phase:** 7 · **Screens:** `StoreUpdates`
**As** an admin, **I want** a list of apps with updates and their notes, **so that** I can update when it suits me.

**Acceptance criteria**
- **Given** updates exist, **when** I open Updates, **then** each row shows the app, "<old> → <new> · released 2 days ago", a "What's new" toggle (label changes to "Hide notes" when open) and an "Update" button.
- **Given** "Update", **when** pressed, **then** an `app_update` job starts, the row shows Progress and "Updating…", and on success the row moves to "Recently updated".
- **Given** "Update all (2)", **when** pressed, **then** all listed apps are queued and updated one at a time in list order; the button shows "Updating 1 of 2…"; one failure doesn't stop the rest.
- **Given** no updates, **when** the page renders, **then** it reads "All apps are up to date" with "Checked <time> ago" and a "Check now" button.
- **Given** "Recently updated", **when** it renders, **then** it lists updates from the last 14 days with "Updated yesterday · automatically" or "Updated 6 days ago" and the version.
- **Given** the footer, **when** it renders, **then** it reads "hlabs backs up an app's data before updating it. Change this in Settings › Updates." with the link to `SettingsUpdates`.

**Implementation notes**
- API: `store.listUpdates` (pending + recent + last check time), `apps.update` → job, `apps.updateAll` (new) → `{ jobIds }`, `settings.updates.check`.
- Data: `apps.version`, `apps.previous_version`, `apps.updated_at`, `jobs` (trigger manual/auto in `payload_json`), `catalog_apps`.
- UI: List + ListRow, Button, Progress, Badge.
- Edge: custom apps never appear in Updates; a member never sees this page.

### US-STORE-16 · Check for updates and auto-update in the background
**Feature:** F-STORE-08 · **Priority:** P2 · **Phase:** 7 · **Screens:** `StoreUpdates`
**As** an admin, **I want** hlabs to find updates on its own and apply them for apps I chose, **so that** apps stay current without effort.

**Acceptance criteria**
- **Given** the scheduler, **when** 6 h pass since the last sync, **then** all enabled sources are synced and a newer `version` or `revision` than installed creates an `update.available` event and one info notification per sync listing the apps.
- **Given** an app with `auto_update` on, **when** an update is found, **then** it is updated in the next 03:00–05:00 local window, after that night's backups finish, following the same rollback rule.
- **Given** an update whose manifest changes `folders`, `permissions` or `ports`, **when** it would auto-update, **then** it is skipped and shown in Updates with "Needs your approval: asks for new access" and "Review" opens a sheet listing only the new access.
- **Given** `backup.beforeUpdate: true` (or the Settings › Updates default), **when** updating, **then** a `pre_update` backup run completes before pull starts; if no backup destination exists, the update continues and the row notes "Not backed up: no backup destination".

**Implementation notes**
- API: `store.sources.sync` (scheduled), `apps.update`, `apps.setAutoUpdate`, `backups.runNow` internally.
- Data: `apps.auto_update`, `backup_runs.trigger = pre_update`, `notifications`.
- Tests: fake clock for the 6 h interval and the night window.

### US-STORE-17 · Roll back an update that doesn't start
**Feature:** F-STORE-09 · **Priority:** P1 · **Phase:** 2 · **Screens:** `UpdateRolledBack`
**As** an admin, **I want** hlabs to restore the previous version when an update fails, **so that** an update never leaves my app broken.

**Acceptance criteria**
- **Given** an update job, **when** it starts, **then** previous `docker-compose.yml`, `.env` and image digests are snapshotted before pulling.
- **Given** the new version fails its health check within the timeout, **when** detected, **then** state goes `updating → rolling_back`, the previous config and images are restored (and app data from the pre-update backup if the manifest marks migrations irreversible), and state returns to `running` on the old version.
- **Given** rollback completes, **when** I open Updates, **then** a banner reads "Home Assistant's update didn't start, so hlabs rolled it back" / "It's running <old version> again with the data backed up just before the update. Nothing was lost." with "View log" and "Try again"; the app still appears in the pending list.
- **Given** "Try again", **when** pressed, **then** a new update job starts; "View log" opens `AppLogs` scrolled to the failed update's time.
- **Given** rollback itself fails, **when** detected, **then** state is `error`, a critical notification "Home Assistant couldn't be restored" is created, and the banner offers "Restore from backup" (to Backups) instead of "Try again".
- **Given** a rollback happened, **when** I dismiss the banner, **then** it doesn't return for that update; an `UpdateRolledBack` notification is also created.
- **Given** earlier phases, **when** these screens render, **then** controls that need later phases are hidden until they ship (D-036): data restore from the pre-update backup and "Restore from backup" until phase 5, and the Updates page placement of the banner until phase 7 (before that, the banner shows on the app's details page).

**Implementation notes**
- API: `apps.update`, `store.listUpdates` (includes `rolledBack: [{ appId, fromVersion, toVersion, jobId, at }]`), `notifications.dismiss`, `apps.logs`.
- Data: `apps.previous_version`, `jobs.payload_json` (snapshot paths, digests), `notifications`, `audit_log`.
- UI: GlassCard banner with warning Badge, Button.
- Tests: fake health failure asserts old digests are running afterwards and no data files changed.

### US-STORE-18 · See and manage app sources
**Feature:** F-STORE-10 · **Priority:** P2 · **Phase:** 7 · **Screens:** `StoreSources`
**As** an admin, **I want** to see where apps come from and when each source was last checked, **so that** I control what my store offers.

**Acceptance criteria**
- **Given** the page, **when** it renders, **then** the intro reads "A source is a git repository of app manifests. hlabs checks each one for new apps and updates every few hours." and each source row shows name, URL, app count and last check ("Built in · 240 apps · checked 2 hours ago").
- **Given** the built-in source, **when** shown, **then** it reads "Can't be removed" and has no Remove action.
- **Given** a git or index source, **when** I press "Check now", **then** it syncs, the row shows a spinner, and on success the count and time update; on failure the row shows the error in plain words (e.g. "Couldn't reach the repository", "Signature doesn't match the saved key") and keeps the previous catalogue.
- **Given** "Remove", **when** confirmed in a Dialog, **then** the source and its catalogue entries are deleted; installed apps from it stay installed, keep working and show "Source removed · no updates" on their details page.
- **Given** a local folder source ("My apps · ~/hlabs/my-apps · 2 apps · local folder"), **when** shown, **then** it offers "Open folder" (opens it in Files) instead of "Check now", and changes in the folder are picked up on the next sync.

**Implementation notes**
- API: `store.sources.list`, `store.sources.sync`, `store.sources.remove`.
- Data: `app_sources` (`last_synced_at`, `last_error`), `catalog_apps`.
- UI: List + ListRow, Button, Dialog, Badge, Toast.
- Edge: a sync never partially replaces a catalogue; it is swapped in one transaction.

### US-STORE-19 · Add a source with a pinned signing key
**Feature:** F-STORE-10 · **Priority:** P2 · **Phase:** 7 · **Screens:** `StoreSources`, `StoreSearch`
**As** an admin, **I want** to add a community store safely, **so that** I get more apps without trusting tampered updates.

**Acceptance criteria**
- **Given** the "Add a source" field (placeholder "https://github.com/you/your-app-store") and the note "Only add sources you trust. Apps from any source still ask for your approval before they get access to folders or devices.", **when** I paste a URL and press "Add", **then** hlabs fetches the source and shows a Dialog with its name, app count and signing key fingerprint, asking "Trust this source?" with "Add source" and "Cancel".
- **Given** I confirm, **when** added, **then** the key is pinned; every later sync must verify `index.json` against it, and a mismatch disables the source with "Signature doesn't match the saved key" until removed and re-added.
- **Given** a source without a signed index (e.g. a plain git repo of manifests), **when** inspected, **then** the Dialog warns "This source isn't signed. Updates can't be verified." and still allows adding.
- **Given** a URL that isn't reachable or has no manifests, **when** I press "Add", **then** the field shows "No hlabs apps found at this address" and nothing is saved. Only sources in the hlabs app format are supported; other stores' formats are not imported or converted (D-002, D-040).
- **Given** `StoreSearch` with no good match, **when** I pick "Add another app source", **then** `StoreSources` opens with the add field focused.

**Implementation notes**
- API: `store.sources.inspect` (new: url → `{ kind, name, appCount, keyFingerprint, signed }`), `store.sources.add` (url, expected fingerprint).
- Data: `app_sources` (add `public_key` column, see Open questions), `catalog_apps`.
- UI: TextField, Button, Dialog, Toast.
- Edge: duplicate URLs are rejected with "This source is already added"; only `https://` URLs and local paths under the storage root are accepted.

### US-STORE-20 · Deploy a custom app from a compose file
**Feature:** F-STORE-11 · **Priority:** P3 · **Phase:** 8 · **Screens:** `DeployCustom`
**As** an admin, **I want** to run my own compose file, **so that** I can host things not in any store.

**Acceptance criteria**
- **Given** `DeployCustom`, **when** it renders, **then** it offers one source only, a compose file: I paste YAML, it is validated against the compose rules in 06 (digests optional) and errors show inline with line numbers, e.g. "Line 12: host networking isn't allowed". There is no Docker image or git repository option (D-031).
- **Given** "App listens on port" and "Address", **when** I fill them, **then** the service/port choice populates `web.service`/`web.port` and the hostname follows the same validation as installs.
- **Given** "Add environment variables", **when** I add rows, **then** each has key, value and a "Secret" Switch.
- **Given** "Deploy", **when** pressed, **then** a `deployCustom` job runs with the same progress steps as installs, the app is labelled "Custom" everywhere, and it is never auto-updated.

**Implementation notes**
- API: `apps.deployCustom` (compose YAML + meta) → `{ jobId }`.
- Data: `apps.custom = true`, `app_env`, `jobs`; the pasted compose file is kept in `<dataDir>/apps/<appId>/`.
- UI: TextField (monospace multiline for YAML), Switch, Button, Stepper.

### US-STORE-21 · Edit and redeploy a custom app
**Feature:** F-STORE-11 · **Priority:** P3 · **Phase:** 8 · **Screens:** `DeployCustom`
**As** an admin, **I want** to edit the compose file of a custom app I deployed and redeploy it, **so that** I can change it without removing and re-adding it.

**Acceptance criteria**
- **Given** a custom app, **when** I choose "Edit compose file" from its settings, **then** `DeployCustom` opens pre-filled with the saved compose file, port, address and environment variables.
- **Given** I change the YAML, **when** I edit, **then** validation against the compose rules in 06 re-runs and errors show inline with line numbers; "Redeploy" is disabled while there are errors.
- **Given** "Redeploy", **when** pressed, **then** a `deployCustom` job runs with the same progress steps as installs (pull, `compose up -d`, health check); if the new version fails its health check, the previous compose file is restored and the app keeps running on it, as with store updates.
- **Given** a redeploy finishes, **when** I open "View log", **then** `AppLogs` shows the app's container logs from `apps.logs`.
- **Given** a custom app, **when** anything changes outside hlabs, **then** nothing is redeployed automatically: there is no git source, no Dockerfile build and no auto-redeploy (D-031).

**Implementation notes**
- API: `apps.deployCustom` (appId of the existing custom app, compose YAML + meta) → `{ jobId }`; `apps.logs`; `events.stream` (`job.progress`, `app.stateChanged`).
- Data: `apps.custom`, `jobs`; the previous compose file is kept until the redeploy is healthy.
- Edge: env values marked "Secret" are shown masked and kept unless replaced.

### US-STORE-22 · Show skeletons while the store loads
**Feature:** F-STORE-12 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `StoreLoading`
**As** anyone signed in, **I want** a calm placeholder while apps load, **so that** the store doesn't jump or look broken.

**Acceptance criteria**
- **Given** catalogue data isn't cached, **when** the store opens, **then** the chrome (sidebar, title, search field) renders immediately and content areas show skeleton cards matching the final layout, with accessible label "Loading apps".
- **Given** data arrives within 150 ms, **when** rendering, **then** no skeleton flashes.
- **Given** reduced motion is on, **when** skeletons show, **then** the shimmer is replaced by a static tint.
- **Given** loading fails, **when** the request errors, **then** skeletons are replaced by "Couldn't load the App Store" with "Try again"; if the catalogue is empty because the first sync hasn't finished, it reads "Getting the app list…" and refreshes when the sync ends.

**Implementation notes**
- API: `store.getHome`, `store.listApps` (TanStack Query cache, stale time 5 min).
- UI: GlassCard skeletons, Button.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
