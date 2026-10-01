# 04 · Home

Home is the first screen every signed-in person sees: a greeting over the wallpaper, a row of glanceable widgets, the grid of apps they can open, and the Dock (the Liquid Glass tab bar on phones) that reaches every other part of hlabs. Admins use it to see at a glance that the box is healthy and to act on apps (open, restart, stop, update); family members use it as a simple launcher for the apps shared with them. Search (⌘K), notifications, editing the layout and adding widgets all start here.

**Screens:** `Main` (P1), `DockHome` (P1), `DockStates` (P1), `HomeStates` (P1), `Spotlight` (P1), `MemberHome` (P1), `HomeNotifications` (P2), `HomeEmpty` (P2), `HomeEdit` (P2), `WidgetPicker` (P2), `MainSolid` (Polish).
**Depends on:** `03-sign-in.md` (session, `auth.me`), `05-app-store.md` (App Store, updates, install progress), `06-apps.md` (AppWindow, AppSettings, AppLogs, UninstallConfirm), `07-files.md` (FilesBrowser), `08-usage-backups.md` (LiveUsage, BackupsOverview), `09-account-people.md` (SettingsAccount, SettingsAppearance, AppsAccess, members), `10-system-settings.md` (SettingsNetwork, SettingsUpdates), `11-system-states.md` (engine stopped, daemon down, updating overlays), `12-phone.md` (phone layout of Home).

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-HOME-01 | Home screen: greeting, wallpaper, widgets row, app grid | P1 | 1 | `Main` |
| F-HOME-02 | Dock: areas, pinned apps, badges and Search (D-054) | P1 | 1 | `Main`, `MemberHome`, `DockHome`, `DockStates` |
| F-HOME-03 | App tile states and app menu | P1 | 2 | `HomeStates` |
| F-HOME-04 | Search (⌘K) | P1 | 2 | `Spotlight`, `Main` |
| F-HOME-05 | Family member's Home | P1 | 3 | `MemberHome` |
| F-HOME-06 | Notifications panel | P2 | 7 | `HomeNotifications` |
| F-HOME-07 | Empty home | P2 | 7 | `HomeEmpty` |
| F-HOME-08 | Edit mode | P2 | 7 | `HomeEdit` |
| F-HOME-09 | Add a widget | P2 | 7 | `WidgetPicker` |
| F-HOME-10 | Reduce transparency (solid) variant | Polish | 9 | `MainSolid` |

## User stories

### US-HOME-01 · See a greeting over my wallpaper
**Feature:** F-HOME-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Main`
**As** anyone signed in, **I want** Home to greet me by name over my chosen wallpaper and accent, **so that** hlabs feels like my own home screen and not an admin console.

**Acceptance criteria**
- **Given** I am signed in with display name "Hari", **when** Home loads between 18:00 and 04:59 local browser time, **then** the heading reads "Good evening, Hari"; 05:00–11:59 reads "Good morning, Hari"; 12:00–17:59 reads "Good afternoon, Hari" (D-039).
- **Given** Home stays open across a boundary (e.g. 11:59 to 12:00), **when** the minute changes, **then** the greeting updates without a reload (checked at least once per minute).
- **Given** my appearance wallpaper (`appearance:<userId>`, returned by `auth.me`) is "Dusk" (the default), **when** Home renders, **then** the Dusk wallpaper fills the viewport behind all glass surfaces with no layout shift once loaded, and a solid colour sampled from the wallpaper shows while the image loads.
- **Given** I change my wallpaper or accent in Settings › Appearance, **when** the `settings.appearance.update` mutation succeeds, **then** Home reflects the new wallpaper and accent on the next render without a reload.
- **Given** the page title, **when** Home is shown, **then** the document title is "hlabs — Home".
- **Given** the display name is missing, **when** Home renders, **then** the greeting uses the username instead.

**Implementation notes**
- API: `auth.me` (display name, role, appearance).
- Data: `users.display_name`, `settings` key `appearance:<userId>` (wallpaper, accent, reduceTransparency, reduceMotion, showWidgets, showGreeting).
- UI: wallpaper layer + accent CSS variable from `packages/ui` tokens; heading uses the display type style. Greeting logic is a pure function `greetingFor(date)` with unit tests at 04:59, 05:00, 11:59, 12:00, 17:59, 18:00.
- Edge: appearance is per user (D-010); a new member starts with the defaults (Dusk, Violet).

### US-HOME-02 · Glance at system widgets
**Feature:** F-HOME-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Main`
**As** an admin, **I want** a row of live widgets for usage, storage, remote access and backups, **so that** I can tell the box is healthy without opening anything.

**Acceptance criteria**
- **Given** a new admin Home with no saved layout, **when** it loads, **then** the widgets row shows, in order: "Live usage", "Storage", "Remote access", "Backups".
- **Given** the Live usage widget, **when** `usage.sample` events arrive (every 5 s), **then** it shows "CPU" as a whole percent (e.g. "18%") and "Memory" as used / total in GB with one decimal for used (e.g. "9.4 / 16 GB"), updating in place.
- **Given** the Storage widget, **when** it renders, **then** it shows free space as the big figure ("142 GB" with "left of 256 GB") and a StackedBar with "Apps 77 GB" and "System 37 GB" segments.
- **Given** the Remote access widget and Tailscale is connected, **when** it renders, **then** it shows "Connected", the tailnet address (e.g. "hlabs.<tailnet>.ts.net", D-012), "Tailscale · N devices online" and chips for enabled services ("Pi-hole DNS", "HTTPS"); when Tailscale is off it shows "Off" and "Set up remote access".
- **Given** the Backups widget, **when** it renders, **then** it shows the relative time of the last successful run ("2 hours ago") and "N apps → <destination name> · restic"; if the last run failed it shows "Last backup failed" with a critical StatusDot; if no destination exists it shows "Not set up".
- **Given** I click a widget, **when** it is Live usage or Storage, **then** the Usage tab (`LiveUsage`) opens; Backups opens `BackupsOverview`; Remote access opens Settings › Network.
- **Given** a widget's query fails, **when** it renders, **then** it shows "Couldn't load" with a retry icon button, and the other widgets are unaffected.
- **Given** a widget depends on a later phase, **when** Home renders before that phase ships, **then** the widget is hidden (not disabled): Live usage is hidden until phase 4 ships, Remote access until phase 3, Backups until phase 5 (D-036). Until then the row shows only the widgets that are available (in phase 1, "Storage").

**Implementation notes**
- API: `usage.current` for the first paint, then `events.stream` `usage.sample`; `storage.summary`; `network.status`; `backups.overview`; `home.getLayout` for which widgets and in what order.
- Data: `home_layout.items_json`, `backup_runs`, `backup_destinations`, `settings.remote`.
- UI: GlassCard per widget, StackedBar, StatusDot; numbers use tabular figures so they don't jitter.
- Edge: no more than 4 widgets are shown (see US-HOME-19). Loading state is a skeleton the size of the final widget.

### US-HOME-03 · Open my apps from the grid
**Feature:** F-HOME-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Main`
**As** anyone signed in, **I want** a grid of my apps with their real logos, **so that** I can open any of them in one click.

**Acceptance criteria**
- **Given** installed apps I can see, **when** Home loads, **then** each app appears as an AppIcon tile with its manifest logo and the manifest `name` below it (e.g. "Jellyfin", "Pi-hole", "Nextcloud"), in my saved layout order.
- **Given** an app's `logo.svg` fails to load or is missing, **when** the tile renders, **then** it shows the `AppLogo` fallback: the manifest `icon.gradient` with the `icon.fallback` Lucide glyph; if neither exists, a neutral gradient with the first letter of the name.
- **Given** a running app, **when** I click or press Enter on its tile, **then** it opens at `https://<appId>.hlabs.local` (or `https://hlabs.<tailnet>.ts.net:<port>` when I'm on the tailnet, D-012): in a new browser tab by default, or in `AppWindow` only when its manifest sets `web.embed: true` (D-038, US-APP-01).
- **Given** I am an admin, **when** the grid ends, **then** the last tile is "Install app" and opens the App Store. The "Install app" tile is hidden until phase 2 ships (D-036).
- **Given** a newly installed app not yet in my saved layout, **when** Home loads or `app.stateChanged` reports it, **then** the tile is appended at the end (before "Install app").
- **Given** an app is uninstalled, **when** `app.stateChanged` reports it gone, **then** its tile disappears without a reload.
- **Given** keyboard use, **when** I Tab into the grid, **then** arrow keys move focus between tiles and each tile has an accessible name "Open <App name>".

**Implementation notes**
- API: `apps.list`, `home.getLayout`, `events.stream` (`app.stateChanged`).
- Data: `apps`, `home_layout` (ids no longer installed are dropped on read; missing ids appended).
- UI: AppIcon wrapping `AppLogo` from `@hlabs/icons`; logo served from the catalog cache.
- Edge: grid reflows from 6 columns at ≥ 1280px down to 4 below 1024px; phone layout is covered in `12-phone.md`.

### US-HOME-04 · Move between sections with the Dock
**Feature:** F-HOME-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Main`, `DockHome`, `DockStates`
**As** an admin, **I want** a Dock at the bottom of the screen with Home, App Store, Files, Usage, Backups and Settings, my pinned apps and Search, **so that** every section and my favourite apps are one click away.

**Acceptance criteria**
- **Given** I am an admin on a screen at least 768px wide, **when** any signed-in screen renders, **then** the Dock shows, centred 14px above the bottom edge: six area tiles in order "Home", "App Store", "Files", "Usage", "Backups", "Settings", a divider, my pinned apps and a "+" tile, a divider, and "Search" (D-054). Below 768px the phone tab bar is used instead (US-PHONE-01).
- **Given** I am on a section, **when** the Dock renders, **then** that area's tile has a dot under it and `aria-current="page"`.
- **Given** I hover a tile, **when** the pointer is over it, **then** the tile grows to 1.35× and its neighbours to 1.14× without overlapping, and its name ("Files") appears in a tooltip above; with Reduce motion on, the tile doesn't grow but the name still appears.
- **Given** keyboard use, **when** Tab reaches the Dock, **then** Left/Right move between tiles, Home/End jump to the ends, Enter activates, and the focused tile shows a white focus ring and its name; each tile's accessible name is its label (e.g. "App Store, 2 updates", "Jellyfin, open").
- **Given** I click "Search", **when** it opens, **then** the Search (⌘K) panel appears with focus in the input.
- **Given** a window (e.g. AppWindow) is open over Home, **when** I click the Home tile, **then** the window closes and Home shows.
- **Given** a section's phase has not shipped, **when** the Dock renders, **then** its tile is hidden until that phase ships (D-036): App Store until phase 2, Usage until phase 4, Files and Backups until phase 5; pinned apps and "+" appear from phase 7 (US-HOME-22).
- **Given** a window narrower than 1280px, **when** the Dock renders, **then** pinned app tiles are 48px; area tiles stay 56px.

**Implementation notes**
- UI: `Dock` from `packages/ui` (ported from `docs/design/reference`), Badge; routes via TanStack Router. Layout switch at the Tailwind `md` breakpoint (768px): `Dock` at `md` and up, `TabBar` below.
- Area tile colours are fixed (not the accent); Home is the hlabs app icon.
- Edge: the Dock stays above windows and panels; the notifications panel, menus and Spotlight sit above it. Windows leave at least 16px clear above the Dock.

### US-HOME-05 · See badge counts in the Dock
**Feature:** F-HOME-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Main`, `MemberHome`
**As** an admin, **I want** the App Store tile to show how many app updates are waiting, **so that** I notice updates without checking.

**Acceptance criteria**
- **Given** 2 app updates are available, **when** the Dock renders, **then** the App Store tile shows a red count "2" at its top-right corner and its accessible name is "App Store, 2 updates"; on phone the App Store tab shows the same badge.
- **Given** 0 updates, **when** the Dock renders, **then** no badge shows.
- **Given** the App Store updates list (F-STORE-08) has not shipped yet, **when** the Dock renders, **then** the update badge is hidden until phase 7 ships (D-036); these badge criteria apply from that phase.
- **Given** more than 9 updates, **when** the badge renders, **then** it reads "9+".
- **Given** an `update.available` event or an app finishes updating (`app.stateChanged`), **when** it arrives, **then** the count refreshes within 2 s.
- **Given** I am a member, **when** my Dock renders, **then** its areas follow 07 §7.4 "What members see (navigation)": "Home", "Files", "Settings", plus "Usage" only if both "Members can see live usage" (`people.membersCanSeeUsage`) and my own `users.can_see_usage` switch are on (D-029), plus "App Store" only if "Members can install apps" is on; then my own pinned apps, "+" and "Search"; members never see an update badge.

**Implementation notes**
- API: `store.listUpdates` (admin), `events.stream` (`update.available`, `app.stateChanged`).
- Data: `apps.version` vs `catalog_apps.version`.
- UI: badge on the Dock tile (and TabBar item on phone).
- Edge: members never call `store.listUpdates` (it's admin-only in practice; a FORBIDDEN is a bug).

### US-HOME-06 · Recognise each app's state on its tile
**Feature:** F-HOME-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `HomeStates`
**As** an admin, **I want** each tile to show whether the app is running, installing, stopped, broken or has an update, **so that** I can spot problems from Home.

**Acceptance criteria**
- **Given** `apps.state` is `running` and no update, **when** the tile renders, **then** it shows the logo and name only.
- **Given** `installing`, **when** `app.installProgress` events arrive, **then** the tile shows a Progress ring over the logo and the label "Installing… 64%" (whole percent), updating live; `starting` shows "Starting…".
- **Given** `stopped`, **when** the tile renders, **then** the logo is desaturated at 50% opacity and the label is "Stopped".
- **Given** `error` or `install_failed`, **when** the tile renders, **then** a critical StatusDot sits on the tile and the label is "Error".
- **Given** a newer version exists in the catalog, **when** the tile renders, **then** a small "Update" Badge shows on the tile; `updating` shows a Progress ring and "Updating…"; `restarting` shows "Restarting…"; `uninstalling` shows "Removing…".
- **Given** a state changes, **when** `app.stateChanged` arrives, **then** the tile updates within 1 s without a reload.
- **Given** screen readers, **when** focus lands on a tile, **then** the accessible name includes the state (e.g. "Nextcloud, installing, 64%").

**Implementation notes**
- API: `apps.list`, `store.listUpdates`, `events.stream` (`app.stateChanged`, `app.installProgress`, `job.progress`).
- Data: `apps.state`, `apps.state_detail`, `jobs.progress`.
- UI: AppIcon with state overlay, Progress (ring), StatusDot, Badge.
- Edge: map every state in 02 §2.5 to exactly one tile style; unit-test the mapping. Clicking an installing tile opens the install progress (App Store module).

### US-HOME-07 · Act on an app from its menu
**Feature:** F-HOME-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `HomeStates`
**As** an admin, **I want** to right-click (or long-press) an app tile to open, configure, see logs, restart, stop or uninstall it, **so that** I don't have to open settings for common actions.

**Acceptance criteria**
- **Given** I right-click a running app tile (or long-press 500 ms on touch, or press Shift+F10 / the Menu key when focused), **when** the menu opens, **then** it shows a header with the app name and items "Open", "Settings", "View logs", "Restart", "Stop", "Uninstall…" (Uninstall in destructive colour, separated).
- **Given** the app is stopped, **when** the menu opens, **then** "Stop" is replaced by "Start" and "Restart" is hidden.
- **Given** the app is installing, updating or uninstalling, **when** the menu opens, **then** only "Open" (disabled) and "View logs" are enabled.
- **Given** I choose "Restart" or "Stop"/"Start", **when** the mutation succeeds, **then** the tile goes to `restarting`/`stopping`/`starting` immediately and a Toast confirms ("Vaultwarden restarted"); on failure a Toast shows the mapped `hlabsCode` copy.
- **Given** I choose "Settings", "View logs" or "Uninstall…", **when** chosen, **then** `AppSettings`, `AppLogs` or `UninstallConfirm` opens for that app.
- **Given** Escape or a click outside, **when** the menu is open, **then** it closes and focus returns to the tile.
- **Given** I am a member, **when** I right-click a tile, **then** the menu shows only "Open" (plus "Edit Home" below).
- **Given** any user, **when** the menu opens, **then** it ends with "Edit Home", which starts edit mode (US-HOME-16); this item is hidden until phase 7 ships (D-036).

**Implementation notes**
- API: `apps.start`, `apps.stop`, `apps.restart` (admin); uninstall is handed to `UninstallConfirm` (`06-apps.md`).
- UI: Menu (glass), Toast.
- Edge: the browser's own context menu is suppressed only on tiles; the server rejects member calls regardless of UI.

### US-HOME-08 · Recover a stopped or broken app from its tile
**Feature:** F-HOME-03 · **Priority:** P1 · **Phase:** 2 · **Screens:** `HomeStates`
**As** an admin, **I want** clicking a stopped or error tile to tell me what's wrong and offer the fix, **so that** I don't land on a dead page.

**Acceptance criteria**
- **Given** a stopped app, **when** I click its tile, **then** a Toast "Pi-hole is stopped" appears with a "Start" button that calls `apps.start`; the app is not opened.
- **Given** an app in `error`, **when** I click its tile, **then** `AppLogs` opens for that app with `apps.state_detail` shown as the reason (e.g. mapped copy for `APP_PORT_IN_USE`).
- **Given** a member clicks a stopped or error tile, **when** it's clicked, **then** a Toast reads "<App> isn't running right now. Ask <admin name> to start it." and no action button is shown.
- **Given** a tile with an "Update" badge, **when** I click the badge, **then** the App Store updates view opens scrolled to that app; clicking the rest of the tile opens the app as usual. The tile "Update" badge is hidden until phase 7 ships the updates list (D-036).

**Implementation notes**
- API: `apps.start`, `apps.get` (state_detail).
- UI: Toast with action.
- Edge: rapid double-click on "Start" sends one mutation (button disabled while pending).

### US-HOME-09 · Open search from anywhere
**Feature:** F-HOME-04 · **Priority:** P1 · **Phase:** 2 · **Screens:** `Spotlight`, `Main`
**As** anyone signed in, **I want** to press ⌘K (Ctrl+K on Linux) or click the search pill to open search, **so that** I can jump to anything without the mouse.

**Acceptance criteria**
- **Given** any dashboard screen, **when** I press ⌘K on macOS or Ctrl+K elsewhere, **then** the Search panel opens centred with focus in the input and placeholder "Search"; pressing the shortcut again or Escape closes it.
- **Given** Home, **when** I click the pill "Search apps, files, settings" (which shows a "⌘K" hint, "Ctrl K" on non-Mac), **then** the same panel opens.
- **Given** the panel is open with an empty query, **when** it renders, **then** it shows my installed apps (up to 8, layout order) under "Installed".
- **Given** the panel footer, **when** it renders, **then** it shows the hints "↑ ↓ to move", "↵ to open", "⌘ K to close".
- **Given** the panel closes, **when** it closes, **then** focus returns to the element that had it before.

**Implementation notes**
- UI: Dialog (glass) with a TextField and List; global key handler registered once at the app root; the shortcut is ignored while typing in an app iframe.
- Edge: the shortcut must not trigger inside a text field that already uses ⌘K (none today; keep a allow-list hook).

### US-HOME-10 · Find apps, actions, files, settings and store apps in one list
**Feature:** F-HOME-04 · **Priority:** P1 · **Phase:** 2 · **Screens:** `Spotlight`
**As** anyone signed in, **I want** one search that returns my apps, quick actions, files, settings pages and App Store apps, **so that** I don't need to know where something lives.

**Acceptance criteria**
- **Given** I type "jelly", **when** results arrive (debounced 150 ms), **then** they are grouped in this order: "Installed" (e.g. Jellyfin with "Open ↵"), "Actions" ("Jellyfin settings", "Restart Jellyfin", "View Jellyfin logs"), "App Store" (e.g. "Jellyseerr · Media requests · Install"), "Files" (e.g. "Jellyfin config" with breadcrumb "Home › Apps"), "Settings".
- **Given** limits, **when** results render, **then** each group shows at most 5 items (App Store at most 3) and the App Store group ends with "See all App Store results", which opens `StoreSearch` with the query.
- **Given** results, **when** I press ↑/↓, **then** the highlight moves across all groups (wrapping), and ↵ runs the highlighted result: an app opens the same way as from its tile (new tab, or `AppWindow` when `web.embed: true`), an action runs or opens its screen, a file opens `FilesBrowser` at its folder with the file selected, a store app opens `AppDetails`, a setting opens that settings page.
- **Given** "Restart Jellyfin" is chosen, **when** it runs, **then** `apps.restart` is called and a Toast confirms; no confirmation dialog (restart is not destructive).
- **Given** no matches, **when** results return empty, **then** the panel shows "No results for “<query>”" and the "See all App Store results" link.
- **Given** I am a member, **when** I search, **then** results include only apps in my `app_access`, my own files, and settings I can open; no Actions for restart/stop/logs and no App Store group unless "Members can install apps" is on.
- **Given** phase 5 (files search) has not shipped, **when** results render, **then** the "Files" group is hidden until phase 5 ships (D-036).
- **Given** the search fails, **when** the error returns, **then** the panel shows "Search isn't available right now" and keeps the typed query.

**Implementation notes**
- API: `home.searchEverything` (query, limitPerGroup) returning typed groups; results filtered server-side by role and `app_access`. File hits come from `files.search`; store hits from `store.listApps` with `query`.
- Data: `apps`, `app_access`, `catalog_apps`; settings pages are a static index in `packages/api`.
- UI: List, ListRow, AppIcon (AppLogo), FileItem, keyboard hints.
- Edge: stale responses are discarded (only the latest query's response renders). Matching is case- and accent-insensitive, prefix-weighted.

### US-HOME-11 · See only my shared apps on a member Home
**Feature:** F-HOME-05 · **Priority:** P1 · **Phase:** 3 · **Screens:** `MemberHome`
**As** a family member, **I want** Home to show only the apps shared with me and nothing about running the server, **so that** it's simple and I can't break anything.

**Acceptance criteria**
- **Given** I am a member with access to Jellyfin, Immich, Nextcloud and Home Assistant, **when** Home loads, **then** the greeting reads "Good evening, <my name>" and the grid shows exactly those 4 apps, with no "Install app" tile (unless "Members can install apps" is on).
- **Given** my Home, **when** it renders, **then** the admin system widgets (Storage, Remote access, Backups) are not shown; Live usage shows only if both "Members can see live usage" and my own `users.can_see_usage` switch are on (D-029, 07 §7.4) and phase 4 has shipped (D-036).
- **Given** the admin removes my access to an app, **when** the change is saved, **then** its tile disappears from my Home within 5 s (via `app.stateChanged` / access-changed refresh), and opening its URL shows the "You don't have access to this" page (US-STATE-20) via `/auth/verify`, not a redirect or a 404.
- **Given** the admin shares a new app with me, **when** it's saved, **then** its tile is appended to my grid.
- **Given** I call `apps.list`, **when** the response returns, **then** it contains only apps in `app_access` for my user (server-enforced).

**Implementation notes**
- API: `apps.list` (filtered), `home.getLayout`, `auth.me`.
- Data: `app_access`, `home_layout` (per user).
- UI: same grid and AppIcon as admin Home; Dock per US-HOME-05.
- Edge: invariant 2 in 04-data-model; test that a member's `home.saveLayout` with an app id they can't access is rejected (`FORBIDDEN`).

### US-HOME-12 · See my files and shared-apps summary
**Feature:** F-HOME-05 · **Priority:** P1 · **Phase:** 3 · **Screens:** `MemberHome`
**As** a family member, **I want** two small widgets about my own files and the apps shared with me, **so that** I know my stuff is safe and who to ask for more.

**Acceptance criteria**
- **Given** my Home, **when** it loads, **then** the widgets row shows "My files" with the size of my Home folder (e.g. "4.2 GB" / "in your Home folder") and "Shared with you by <admin name>".
- **Given** I have Immich access and Immich reports a last upload from my phone, **when** "My files" renders, **then** it adds the line "Last photo backup from your phone: 20 min ago"; otherwise the line is hidden.
- **Given** 4 shared apps all running, **when** the shared widget renders, **then** it reads "4 apps · all running"; if some are not running it reads "3 of 4 running".
- **Given** the shared widget, **when** it renders, **then** it ends with "Ask <admin name> if you need another app" (no button); if "Members can install apps" is on, it reads "Browse the App Store" and opens the App Store instead.
- **Given** I click "My files", **when** clicked, **then** `FilesBrowser` opens at `/home`.

**Implementation notes**
- API: `home.getWidgetData` for `myFiles` and `sharedApps` (see API additions); `apps.list`.
- Data: `users` (the admin name is the display name of the first-created enabled admin), `app_access`, `apps.state`.
- UI: GlassCard widgets.
- Edge: Home folder size is computed by the daemon and cached for 10 minutes so Home doesn't walk the disk on each load.

### US-HOME-13 · Open the notifications panel
**Feature:** F-HOME-06 · **Priority:** P2 · **Phase:** 7 · **Screens:** `HomeNotifications`
**As** anyone signed in, **I want** a bell on Home that shows how many new notifications I have and opens a panel listing them, **so that** I see what needs attention.

**Acceptance criteria**
- **Given** 3 unread notifications, **when** Home renders, **then** the bell shows a Badge "3" and its accessible name is "Notifications, 3 new"; with 0 unread no badge shows and the name is "Notifications".
- **Given** I click the bell, **when** the panel opens, **then** it slides in from the top-right as a glass panel titled "Notifications" with "Mark all read" and groups "Today" (since local midnight) and "Earlier".
- **Given** each item, **when** it renders, **then** it shows a severity icon, title (e.g. "Uptime Kuma couldn't start"), body ("Port 3001 is in use by another program."), relative time ("5 min ago", "1 hour ago", "Yesterday, 03:12") and its action link if any; unread items have an accent dot.
- **Given** a `notification.created` event, **when** it arrives, **then** the badge increments and, if the panel is open, the item appears at the top of "Today".
- **Given** no notifications, **when** the panel opens, **then** it shows "You're all caught up".
- **Given** Escape or a click outside, **when** the panel is open, **then** it closes and focus returns to the bell.

**Implementation notes**
- API: `notifications.list` (cursor, 50 per page), `notifications.unreadCount` (see API additions), `events.stream` (`notification.created`).
- Data: `notifications` — a user sees rows with their `user_id`, plus rows with `user_id` null only if admin.
- UI: Badge, GlassCard panel, List, ListRow.
- Edge: relative time: < 1 min "Just now", < 60 min "N min ago", same day "N hours ago", yesterday "Yesterday, HH:mm", older "D MMM, HH:mm" (24-hour clock).

### US-HOME-14 · Act on and clear notifications
**Feature:** F-HOME-06 · **Priority:** P2 · **Phase:** 7 · **Screens:** `HomeNotifications`
**As** an admin, **I want** each notification to take me to the fix and to mark things read, **so that** the list reflects what still needs doing.

**Acceptance criteria**
- **Given** "Uptime Kuma couldn't start", **when** I click "View logs", **then** `AppLogs` opens for Uptime Kuma and the item is marked read.
- **Given** "2 app updates available" ("Home Assistant and Immich."), **when** I click "Review", **then** the App Store updates view opens and the item is marked read.
- **Given** the lock notification titled "Repeated failed logins" ("5 failed logins for @hari from 100.101.3.7. Logging in as @hari is paused for 15 minutes.", D-045, US-AUTH-13), **when** I click the item, **then** Settings › Account (sessions) opens and the item is marked read.
- **Given** unread items, **when** I click "Mark all read", **then** all dots clear, the bell badge disappears and `notifications.markAllRead` is called once; the button is disabled when nothing is unread.
- **Given** I hover an item (or focus it), **when** I click its dismiss (×) button, **then** it's removed from the list via `notifications.dismiss`.
- **Given** the action target no longer exists (e.g. app uninstalled), **when** I click the action, **then** a Toast reads "That app is no longer installed" and the item is marked read.

**Implementation notes**
- API: `notifications.markRead`, `notifications.markAllRead`, `notifications.dismiss`.
- Data: `notifications.read_at`, `action_json` (`{ kind: 'navigate', to, params? } | { kind: 'mutation', procedure, input, label }`).
- UI: ListRow with inline action Button (link style), Toast.
- Edge: marking read is optimistic; roll back on error. Member notification kinds exist (e.g. "Immich is ready" when an app is shared) but never include admin actions.

### US-HOME-15 · See a friendly empty Home
**Feature:** F-HOME-07 · **Priority:** P2 · **Phase:** 7 · **Screens:** `HomeEmpty`
**As** a new user, **I want** an empty Home to tell me what to do next, **so that** I'm not staring at a blank screen after setup.

**Acceptance criteria**
- **Given** I am an admin and no apps are installed, **when** Home loads, **then** the greeting reads "Welcome to hlabs, Hari" and the grid area shows "No apps yet", "Your apps appear here once they're installed. Most people start with a photo library, a media server and a password manager." and a primary Button "Browse the App Store".
- **Given** the empty state, **when** I click "Browse the App Store", **then** the App Store opens.
- **Given** the empty state, **when** it renders, **then** the widgets row and the "Install app" tile are still shown.
- **Given** the first app starts installing, **when** `app.stateChanged` arrives, **then** the empty state is replaced by the grid with the installing tile, and the greeting returns to the time-of-day greeting.
- **Given** I am a member with no shared apps, **when** Home loads, **then** it shows "No apps yet" and "Ask <admin name> to share an app with you." with no button.

**Implementation notes**
- API: `apps.list`.
- UI: GlassCard empty state, Button (primary, accent).
- Edge: "empty" means the visible app list is empty, not the layout; an app removed from Home only (US-HOME-18) does not count as uninstalled.

### US-HOME-16 · Enter and leave edit mode
**Feature:** F-HOME-08 · **Priority:** P2 · **Phase:** 7 · **Screens:** `HomeEdit`
**As** anyone signed in, **I want** an edit mode for Home, **so that** I can arrange it the way I like.

**Acceptance criteria**
- **Given** Home, **when** I choose "Edit Home" (in an app tile's menu, US-HOME-07, or in the Home context menu that opens when I right-click an empty area of the wallpaper), or long-press (500 ms) an empty area of Home, **then** edit mode starts (D-045).
- **Given** Home outside edit mode, **when** I long-press an app tile, **then** the app menu opens (US-HOME-07); a long-press on a tile never starts edit mode.
- **Given** edit mode, **when** it renders, **then** the greeting is replaced by "Drag to rearrange", each widget and app tile shows a "–" remove button, and a glass toolbar "Editing Home" shows "Add widget", "Wallpaper" and "Done".
- **Given** edit mode, **when** I click a tile, **then** it does not open the app.
- **Given** I click "Done", **when** `home.saveLayout` succeeds, **then** edit mode ends and the new layout persists across reloads and devices.
- **Given** the save fails, **when** the error returns, **then** a Toast reads "Couldn't save your Home. Try again." and edit mode stays open with my changes.
- **Given** I press Escape, **when** in edit mode, **then** all changes since entering are discarded and edit mode ends.
- **Given** I click "Wallpaper", **when** clicked, **then** Settings › Appearance opens, for admins and members alike (everyone can change their own wallpaper, D-010).

**Implementation notes**
- API: `home.getLayout`, `home.saveLayout` (full ordered list of app ids and widget ids).
- Data: `home_layout.items_json` per user.
- UI: toolbar as GlassCard with Buttons; "Done" is primary.
- Edge: if an app is installed or uninstalled during edit mode, merge on save (server drops unknown ids and appends missing ones).

### US-HOME-17 · Rearrange apps and widgets
**Feature:** F-HOME-08 · **Priority:** P2 · **Phase:** 7 · **Screens:** `HomeEdit`
**As** anyone signed in, **I want** to drag apps and widgets into a new order, **so that** the things I use most come first.

**Acceptance criteria**
- **Given** edit mode, **when** I drag an app tile to a new position, **then** other tiles shift to make room (animated ≤ 200 ms) and the tile drops in the new place.
- **Given** edit mode, **when** I drag a widget, **then** it can only be reordered within the widgets row; apps can only be reordered within the grid.
- **Given** keyboard use, **when** a tile is focused and I press Space, **then** it is picked up; arrow keys move it; Space drops it; Escape cancels the move; each step is announced ("Jellyfin, position 3 of 11").
- **Given** touch, **when** I long-press and drag, **then** the same reordering works.
- **Given** the "Install app" tile, **when** in edit mode, **then** it is hidden (it always stays last and can't be moved).

**Implementation notes**
- UI: dnd-kit (or equivalent) sortable grid; respects reduced motion (no shift animation).
- Edge: dragging past the viewport edge auto-scrolls.

### US-HOME-18 · Remove an app or widget from Home
**Feature:** F-HOME-08 · **Priority:** P2 · **Phase:** 7 · **Screens:** `HomeEdit`
**As** anyone signed in, **I want** to remove apps and widgets from my Home without uninstalling anything, **so that** Home only shows what I care about.

**Acceptance criteria**
- **Given** edit mode, **when** I click "–" on a widget (accessible name "Remove widget"), **then** it disappears from the row and becomes available again in "Add a widget".
- **Given** edit mode, **when** I click "–" on an app tile (accessible name "Remove <App> from Home"), **then** the tile disappears from my Home only; the app keeps running and stays installed.
- **Given** an app removed from Home, **when** I search for it with ⌘K, **then** it still appears under "Installed", with an extra action "Add <App> to Home".
- **Given** I choose "Add <App> to Home", **when** the layout saves, **then** the tile is appended to the end of my grid.
- **Given** removal, **when** it happens, **then** no uninstall, stop or confirmation dialog occurs.

**Implementation notes**
- API: `home.saveLayout` (layout stores `hidden` app ids so they aren't re-appended as "missing").
- Data: `home_layout.items_json` shape: `{ widgets: string[], apps: string[], hidden: string[] }`.
- UI: small circular Button "–" at the tile's top-left.
- Edge: removing all widgets leaves no widgets row (the grid moves up).

### US-HOME-19 · Add a widget from the picker
**Feature:** F-HOME-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `WidgetPicker`
**As** anyone signed in, **I want** to pick widgets from hlabs and from my apps, **so that** Home shows the information I care about.

**Acceptance criteria**
- **Given** edit mode, **when** I click "Add widget", **then** a Dialog "Add a widget" opens with a close button and two groups: "System" and "From your apps".
- **Given** I am an admin, **when** "System" renders, **then** it lists "Live usage", "Storage", "Remote access", "Backups", "App status" (e.g. "11 running · 1 stopped") and "Updates" (e.g. "2 app updates"), each with a live preview and an "Add" button, or "Added" (disabled) if already on Home.
- **Given** "From your apps", **when** it renders, **then** it lists widgets declared in the manifests of installed apps I can open (e.g. "Jellyfin · Now playing", "Immich · Library", "Uptime Kuma · Monitors") with previews from the app's data.
- **Given** I click "Add", **when** the widget is added, **then** the button changes to "Added" and the widget appears at the end of the widgets row (saved with the rest of edit mode on "Done").
- **Given** 4 widgets are already on Home, **when** the picker renders, **then** every "Add" button is disabled and the hint reads "Home is full. Remove a widget to add another."; the footer always reads "Apps can offer widgets through their manifest. Up to 4 widgets fit on Home."
- **Given** I am a member, **when** the picker opens, **then** "System" lists only "My files" and "Shared apps" (plus "Live usage" only if D-029 allows), and "From your apps" lists widgets of apps shared with me.

**Implementation notes**
- API: `home.listWidgets` (role-filtered catalog: system + manifest widgets of visible apps), `home.getWidgetData` for previews.
- UI: Dialog, GlassCard previews, Button.
- Edge: if an app with a widget on Home is uninstalled or unshared, its widget is removed from the layout on next read.

### US-HOME-20 · Show app widgets with live data
**Feature:** F-HOME-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `WidgetPicker`
**As** anyone signed in, **I want** app widgets on Home to show current data from the app, **so that** I get useful info without opening it.

**Acceptance criteria**
- **Given** an app widget on Home (e.g. "Uptime Kuma · Monitors"), **when** Home is visible, **then** it refreshes every 60 s and shows the widget's fields (e.g. "<up> up · <down> down").
- **Given** the app is stopped or in error, **when** the widget renders, **then** it shows "<App> isn't running" and no data.
- **Given** the app's widget endpoint times out (5 s) or fails, **when** the widget renders, **then** it shows "Couldn't load" and keeps the last good value greyed if one exists.
- **Given** I click an app widget, **when** clicked, **then** the app opens as from its tile (new tab by default, `AppWindow` when `web.embed: true`, D-038).
- **Given** the tab is hidden, **when** it's in the background, **then** widget refresh pauses.

**Implementation notes**
- API: `home.getWidgetData` (the daemon calls the app's declared endpoint over the `hlabs` network, with a 5 s timeout, and returns a typed payload; the browser never calls the app directly).
- Data: widget declarations from `catalog_apps.manifest_json` (manifest field proposed in Open questions).
- UI: GlassCard with a fixed set of widget templates (stat, two-stat, list of up to 3 rows) so apps can't inject markup.
- Edge: payload values are rendered as text only; strings over 60 characters are truncated.

### US-HOME-21 · Use Home with Reduce transparency on
**Feature:** F-HOME-10 · **Priority:** Polish · **Phase:** 9 · **Screens:** `MainSolid`
**As** anyone signed in, **I want** Home to use solid surfaces when Reduce transparency is on, **so that** text is easy to read over any wallpaper.

**Acceptance criteria**
- **Given** my `reduceTransparency` appearance setting is true, **when** Home renders, **then** widgets, the Dock (or phone tab bar), the search pill, menus, the notifications panel and dialogs use opaque surface colours with no backdrop blur.
- **Given** the solid variant, **when** measured, **then** all text on these surfaces has a contrast ratio of at least 4.5:1 in both light and dark mode.
- **Given** the setting is toggled in Settings › Appearance, **when** it saves, **then** Home switches variant without a reload.
- **Given** the setting has never been set and the browser reports `prefers-reduced-transparency: reduce`, **when** Home renders, **then** the solid variant is used.
- **Given** the solid variant, **when** Home renders, **then** layout, sizes and positions are identical to the glass version (only fills and blur change).

**Implementation notes**
- API: `settings.get`, `settings.appearance.update`.
- Data: `settings` key `appearance:<userId>` (`reduceTransparency`).
- UI: `data-theme="solid"` on `<html>` (the design system's solid theme) switches `packages/ui` glass tokens to solid tokens; no per-component forks.
- Edge: the wallpaper still shows behind the grid; only surfaces become solid.

### US-HOME-22 · Pin my favourite apps to the Dock
**Feature:** F-HOME-02 · **Priority:** P2 · **Phase:** 7 · **Screens:** `DockStates`, `DockHome`
**As** anyone signed in, **I want** to keep the apps I use most in the Dock, **so that** I can open them from any screen.

**Acceptance criteria**
- **Given** a new account, **when** its Dock first renders, **then** it has no pinned apps and shows the dashed "+" tile ("Add to Dock").
- **Given** I click "+", **when** the popover opens, **then** it is titled "Add to Dock" and lists the installed apps I can open that aren't pinned yet, each with an "Add" button, plus the hint "Or drag an app from Home onto the Dock. Up to 8 apps."; clicking "Add" pins the app at the end.
- **Given** Home is showing, **when** I drag an app tile from the grid onto the Dock, **then** a gap opens where it will land and dropping pins it there (the app stays on Home too).
- **Given** 8 apps are pinned, **when** I open "+", **then** the list is replaced by "Your Dock is full. Remove an app to add another." and dragging onto the Dock doesn't pin.
- **Given** a pinned app, **when** I right-click or long-press it, **then** a Menu opens with "Open", "Open in a new tab", "App settings" (admins only) and "Remove from Dock"; "Remove from Dock" unpins it immediately (Home is unchanged). Area tiles and Search have no menu.
- **Given** pinned apps, **when** I drag one sideways within the Dock, **then** the others slide aside and the new order is kept.
- **Given** an app is uninstalled or my access to it is removed, **when** my Dock next renders, **then** it is no longer pinned.
- **Given** keyboard use, **when** a pinned app has focus, **then** Shift+F10 or the context-menu key opens its Menu, and Alt+Left/Right moves it.
- **Given** two people, **when** each pins apps, **then** each sees only their own pinned apps (per user, synced across their devices).

**Implementation notes**
- API: `home.getLayout` returns `{ items, dock }`; `home.saveDock({ appIds: string[] })` (max 8, ids must be installed apps the caller can open; others are dropped silently).
- Data: `home_layout.dock_json` (ordered app ids, per user).
- UI: Dock, Menu, a GlassCard popover for "Add to Dock" (glass level 3); drag with `@dnd-kit` (same as Home edit mode).
- Edge: pinned apps are hidden on phone (the tab bar has no app slots).

### US-HOME-23 · See which apps are open in the Dock
**Feature:** F-HOME-02 · **Priority:** P2 · **Phase:** 2 · **Screens:** `DockHome`, `AppWindow`
**As** anyone signed in, **I want** a dot under apps whose window is open, **so that** I can jump back to them.

**Acceptance criteria**
- **Given** I open an app in a window (US-APP-01), **when** the Dock renders, **then** that app's tile shows the white dot and its accessible name ends with ", open"; if the app isn't pinned, it appears after the pinned apps (without being pinned) until its window closes.
- **Given** an open app's window is behind another window or minimised, **when** I click its Dock tile, **then** its window comes to the front. The Dock stays visible below an app window on desktop (D-096).
- **Given** I close the window, **when** the Dock renders, **then** the dot disappears within 300 ms (and an unpinned app leaves the Dock).
- **Given** apps opened in a new browser tab, **then** they don't get a dot (hlabs can't see other tabs).

**Implementation notes**
- UI: Dock `apps[].open`; open windows come from the window manager store in `apps/web`.
- Edge: the current-area dot and open-app dots look the same (as in macOS); the area dot moves, app dots don't.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
