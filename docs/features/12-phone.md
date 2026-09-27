# 12 · Phone

The phone layout of the hlabs dashboard: the same React SPA as the desktop, rendered for viewports narrower than 768px, with a bottom tab bar, single-column pages and bottom sheets instead of windows. It is used by every household member who reaches hlabs from a phone, usually over Tailscale (`https://hlabs.<tailnet>.ts.net`), and it can be added to the home screen as an installable web app. Behaviour is shared with the desktop feature files; this file only specifies what is different on a phone.

**Screens:** `PhoneLogin` (P2), `PhoneHome` (P2), `PhoneAppSettings` (Polish), `PhoneStore` (P2), `PhoneAppDetails` (P2), `PhoneFiles` (Polish), `PhoneSettings` (Polish), `PhoneBackups` (Polish), `PhoneUpdates` (P2).
**Depends on:** 03-sign-in.md, 04-home.md, 05-app-store.md, 06-apps.md, 07-files.md, 08-usage-backups.md, 09-account-people.md, 10-system-settings.md, 11-system-states.md

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-PHONE-01 | Phone layout, tab bar and sheets | P2 | 7 | `PhoneHome`, `PhoneStore`, `PhoneFiles`, `PhoneSettings` |
| F-PHONE-02 | Phone log in | P2 | 7 | `PhoneLogin` |
| F-PHONE-03 | Phone Home | P2 | 7 | `PhoneHome` |
| F-PHONE-04 | Phone App Store and app details | P2 | 7 | `PhoneStore`, `PhoneAppDetails`, `PhoneUpdates` |
| F-PHONE-05 | App settings sheet | Polish | 9 | `PhoneAppSettings` |
| F-PHONE-06 | Phone Files | Polish | 9 | `PhoneFiles` |
| F-PHONE-07 | Phone Settings | Polish | 9 | `PhoneSettings` |
| F-PHONE-08 | Phone Backups | Polish | 9 | `PhoneBackups` |
| F-PHONE-09 | Installable web app (PWA) | P2 | 7 | `PhoneLogin`, `PhoneHome` |

## User stories

### US-PHONE-01 · Switch to the phone layout with a bottom tab bar
**Feature:** F-PHONE-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneHome`, `PhoneStore`, `PhoneFiles`, `PhoneSettings`
**As** anyone signed in, **I want** the dashboard to turn into a phone layout with a tab bar when I open it on my phone, **so that** I can reach every part of hlabs with one thumb.

**Acceptance criteria**
- **Given** a viewport narrower than 768px, **when** any signed-in route renders, **then** the phone layout is used: no wallpaper windows, no Dock (D-054), a single-column page and a fixed bottom tab bar; resizing across 768px switches layouts without a reload and keeps the current route.
- **Given** the phone layout, **when** the tab bar renders for an admin, **then** it shows five tabs in this order: "Home", "Apps", "Files", "Usage", "Settings", each with an icon and label; there is no search circle in the tab bar.
- **Given** the tab bar, **when** I tap a tab, **then** it navigates to Home (`PhoneHome`), App Store (`PhoneStore`), Files (`PhoneFiles`), Live usage (same content as `LiveUsage` in 08-usage-backups.md, single column) or Settings (`PhoneSettings`), and the active tab has `aria-current="page"` and the accent colour.
- **Given** an admin and 2 app updates available, **when** the tab bar renders, **then** the "Apps" tab shows a Badge "2" with accessible label "2 updates"; with 0 updates no badge is shown.
- **Given** a member, **when** the tab bar renders, **then** it shows "Home", "Files" and "Settings"; "Apps" is added only if "Members can install apps" is on, and "Usage" only if both the global `people.membersCanSeeUsage` switch and the member's own `users.can_see_usage` switch are on (D-029); tabs keep the admin order, and the Apps badge is never shown (navigation per 07-security.md §7.4, "What members see").
- **Given** a member opens the URL of a tab they don't have (for example `/usage`), **then** the "You don't have access to this" page (US-STATE-20) is shown, with no redirect.
- **Given** I tap the tab of the page I am already on, **when** the page is scrolled down, **then** it scrolls to the top (and in Files, returns to the root of the current location).

**Implementation notes**
- API: `store.listUpdates` (count, admin only), `auth.me` (role), `settings.get` (member permissions).
- UI: TabBar (phone variant: 5 slots, no search slot), Badge. Breakpoint from the hlabs Tailwind preset (`< 768px` = phone). Layout component `PhoneShell` wraps phone routes; desktop layout is untouched.
- Between 768px and 1023px the layout is out of scope here (see 02-architecture.md §2.2).
- Edge case: badge count updates live from the `update.available` event without a reload.

### US-PHONE-02 · Touch targets, safe areas and phone-friendly inputs
**Feature:** F-PHONE-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneHome`, `PhoneStore`, `PhoneFiles`, `PhoneSettings`
**As** anyone signed in, **I want** controls sized for fingers and kept clear of the notch and home indicator, **so that** I never mis-tap or have content hidden under system UI.

**Acceptance criteria**
- **Given** the phone layout, **when** any interactive element renders (tab, ListRow, Button, Switch, ••• button, sheet close), **then** its hit area is at least 44 × 44 CSS px, with at least 8px between adjacent hit areas.
- **Given** a device with a notch or home indicator, **when** a page renders, **then** the header is padded by `env(safe-area-inset-top)`, the tab bar and bottom sheets by `env(safe-area-inset-bottom)`, and landscape content by the left and right insets; nothing interactive sits inside an inset.
- **Given** the page `<head>`, **when** it loads, **then** the viewport meta is `width=device-width, initial-scale=1, viewport-fit=cover` and pinch zoom is not disabled.
- **Given** any text field on phone, **when** it renders, **then** its font size is at least 16px so iOS does not zoom on focus, and it sets the right `inputmode`, `autocomplete` and `enterkeyhint` for its content.
- **Given** the on-screen keyboard opens, **when** a field near the bottom is focused, **then** the field scrolls into view above the keyboard and the tab bar is hidden while the keyboard is open.
- **Given** no hover is available (`@media (hover: none)`), **when** an action is hover-only on desktop (for example row actions), **then** it is always visible on phone or reachable from a ••• button.

**Implementation notes**
- UI: all design-system components expose a `size="touch"` variant used by the phone layout; ListRow min height 52px.
- Keyboard detection uses `visualViewport` resize.
- Test with Playwright on iPhone 15 and Pixel 7 device profiles; assert hit-area sizes with bounding boxes.

### US-PHONE-03 · Bottom sheets with soft spring and drag to dismiss
**Feature:** F-PHONE-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneHome`, `PhoneStore`, `PhoneFiles`, `PhoneSettings`
**As** anyone signed in, **I want** secondary panels (app settings, install, file actions, notifications) to open as bottom sheets I can swipe away, **so that** they feel native and stay within thumb reach.

**Acceptance criteria**
- **Given** the phone layout, **when** a component that is a Dialog, popover or side panel on desktop opens (InstallSheet, app settings, FilesContextMenu, HomeNotifications, confirmation dialogs), **then** it renders as a bottom sheet with a grab handle, a dimmed backdrop and the `motion.springSoft` transition.
- **Given** an open sheet whose content is scrolled to the top, **when** I drag it down more than 30% of its height or release with a downward velocity above 500 px/s, **then** it dismisses; otherwise it springs back.
- **Given** an open sheet, **when** I tap the backdrop, tap the close button ("✕", label "Close") or press Escape on a hardware keyboard, **then** it dismisses; for a sheet with unsaved input or a running destructive confirmation, drag and backdrop dismiss are disabled and only the explicit buttons close it.
- **Given** a sheet opens, **when** it is shown, **then** focus moves into it and is trapped, the page behind does not scroll, and on close focus returns to the element that opened it.
- **Given** `prefers-reduced-motion: reduce`, **when** a sheet opens or closes, **then** it fades in 150 ms instead of sliding.
- **Given** a sheet taller than the viewport, **when** it renders, **then** its maximum height is 92% of the visual viewport and its body scrolls internally.

**Implementation notes**
- UI: `Sheet` wrapper in `packages/ui` built on the Dialog primitive plus Framer Motion `drag="y"`; uses the `motion.springSoft` token. Desktop Dialog usage is swapped by a `useIsPhone()` hook, not by duplicating components.
- Opening a sheet pushes a history entry (see US-PHONE-04).
- Edge case: dragging inside a horizontally scrolling area (screenshots) must not dismiss the sheet.

### US-PHONE-04 · Back navigation and resuming after the phone sleeps
**Feature:** F-PHONE-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneHome`, `PhoneStore`, `PhoneFiles`, `PhoneSettings`
**As** anyone signed in, **I want** the browser back gesture to work everywhere and the dashboard to be current when I come back to it, **so that** I never get stuck or see stale state.

**Acceptance criteria**
- **Given** I opened a sub-page (app details, a settings page, a folder) or a sheet, **when** I use the browser back button or the edge swipe-back gesture, **then** the sheet closes or the previous page shows, with its scroll position restored.
- **Given** a sub-page, **when** it renders, **then** its header shows a back control labelled with the parent page ("‹ Settings", "App Store") that does the same as browser back, or navigates to the parent if there is no history (deep link).
- **Given** the tab was hidden (phone locked or app switched), **when** it becomes visible again, **then** the `events.stream` subscription reconnects within 2 s and active queries refetch.
- **Given** the SSE connection cannot reconnect, **when** 10 s pass, **then** the relevant system state from 11-system-states.md is shown in phone layout (full-screen, single column).
- **Given** my session expired or was revoked while the phone slept, **when** the page becomes visible, **then** I am sent to `PhoneLogin` with `next` set to the current route.

**Implementation notes**
- API: `events.stream` (reconnect on `visibilitychange`), `auth.me`.
- UI: TanStack Router routes for every page and sheet (sheets as search params, e.g. `?sheet=app:vaultwarden`), so deep links and back work.
- Edge case: iOS bfcache restore (`pageshow` with `persisted`) must trigger the same refetch.

### US-PHONE-05 · Log in on a phone
**Feature:** F-PHONE-02 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneLogin`
**As** a family member, **I want** a simple phone log-in form, **so that** I can sign in to hlabs from my phone over Tailscale.

**Acceptance criteria**
- **Given** I am signed out on a phone, **when** I open the dashboard, **then** `PhoneLogin` picks its first view with the same rules as desktop login (US-AUTH-05): a remembered user on this phone opens that user with only a "Password" field; otherwise, if the user list is shown, it opens the user list (one full-width row per user); otherwise it opens the username form.
- **Given** the username form, **when** it renders, **then** it shows the Logo, "Log in to hlabs", "Username" and "Password" fields, a "Remember this phone" Switch (off by default), a full-width "Log in" Button and a "Forgot password?" link; the remembered-user and user-list views show the same Switch, Button and link under the password field.
- **Given** the page is served on a `*.ts.net` host, **when** it renders, **then** the footer reads "via Tailscale · " followed by the current host; on any other host the footer shows only the current host.
- **Given** valid credentials, **when** I tap "Log in" or press the keyboard's Go key, **then** I am signed in and taken to `next` or `PhoneHome`; with "Remember this phone" on, the session is remembered for 30 days sliding, otherwise 12 h idle.
- **Given** the "Log in" button is tapped, **when** the request is in flight, **then** the button shows a spinner and is disabled; errors (wrong password, locked) show the same copy as 03-sign-in.md below the password field.
- **Given** the fields, **when** they render, **then** Username has `autocapitalize="none"`, `autocorrect="off"`, `autocomplete="username"`; Password has `autocomplete="current-password"` and a show/hide toggle, so password managers can fill them.

**Implementation notes**
- API: `auth.login` (`remember` flag), `auth.me`, `auth.listLoginUsers` (same procedures and rules as US-AUTH-05).
- Data: `sessions.remember`, `login_attempts`.
- UI: Logo, TextField, Switch, Button.
- Behaviour otherwise same as 03-sign-in.md (lockout, audit log).

### US-PHONE-06 · Two-factor, lockout and forgot password on phone
**Feature:** F-PHONE-02 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneLogin`
**As** a family member, **I want** the second step and recovery screens to fit my phone, **so that** I can finish signing in without zooming.

**Acceptance criteria**
- **Given** my account has 2FA, **when** my password is accepted, **then** the `Login2FA` step renders full-screen in phone layout with a 6-digit field using `inputmode="numeric"` and `autocomplete="one-time-code"` so the OS can suggest the code.
- **Given** 6 digits are entered, **when** the last digit is typed, **then** the code is submitted automatically; "Use a recovery code" works as in 03-sign-in.md.
- **Given** the username+IP pair is locked, **when** I try to log in, **then** the `LoginLocked` state renders full-screen with the remaining time of the 15-minute lockout counting down (D-039).
- **Given** I tap "Forgot password?", **when** `ForgotPassword` opens, **then** it renders as a full-screen page with a back control to `PhoneLogin` and the same copy as 03-sign-in.md (reset from the tray app or ask an admin; no email).

**Implementation notes**
- API: `auth.verifyTotp`, `auth.useRecoveryCode`.
- UI: TextField, Button.
- Edge case: pasting a code with a space (`123 456`) is accepted.

### US-PHONE-07 · Phone Home header and stacked widgets
**Feature:** F-PHONE-03 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneHome`
**As** anyone signed in, **I want** Home on my phone to greet me and show my widgets in one column, **so that** I can check on hlabs at a glance.

**Acceptance criteria**
- **Given** I open `PhoneHome`, **when** it renders, **then** the header shows the greeting ("Good evening, Hari", same time-of-day rule as 04-home.md and D-039), a notifications button and a "Search" button.
- **Given** 3 unread notifications, **when** the header renders, **then** the notifications button shows a dot and has the label "Notifications, 3 new"; tapping it opens `HomeNotifications` as a bottom sheet.
- **Given** my saved layout has widgets, **when** Home renders, **then** widgets are stacked full-width in one column, in layout order, above the app grid.
- **Given** the "Live usage" widget, **when** it renders for an admin (or a member for whom both `people.membersCanSeeUsage` and `users.can_see_usage` are on, D-029), **then** it shows "CPU" %, "Memory" % and "Storage" as free space ("142 GB left of 256 GB"), updating from `usage.sample`; tapping it opens the Usage tab.
- **Given** a member for whom either switch is off, **when** Home renders, **then** the Live usage widget is not shown.
- **Given** phone layout, **when** I long-press on empty space, **then** nothing happens: editing the Home layout is desktop-only in v1, and phone shows the layout saved on desktop.

**Implementation notes**
- API: `home.getLayout`, `home.listWidgets`, `usage.current`, `storage.summary`, `notifications.list`, `auth.me`.
- Data: `home_layout`, `notifications`.
- UI: GlassCard, StatusDot, Sparkline. Loading and empty states same as 04-home.md (`HomeStates`, `HomeEmpty`) in one column.

### US-PHONE-08 · App grid and opening apps on phone
**Feature:** F-PHONE-03 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneHome`
**As** anyone signed in, **I want** my apps in a phone-sized grid, **so that** I can open Jellyfin or Immich with one tap.

**Acceptance criteria**
- **Given** installed apps I can access, **when** Home renders, **then** they show as a 4-column grid of AppIcon tiles with one-line labels truncated with an ellipsis, in layout order, followed by an "Install app" tile (admins, or members allowed to install).
- **Given** a running app, **when** I tap its tile, **then** the app opens at its URL for the host I am on, taken from the app's `urls` (`urls.tailnet`, e.g. `https://hlabs.<tailnet>.ts.net:<port>`, when on `*.ts.net` (D-012), else `urls.lan`, e.g. `https://<appId>.hlabs.local`) in a new browser tab; the dashboard stays open.
- **Given** an app that is not running (stopped, error, installing), **when** the grid renders, **then** its tile shows the state with a StatusDot as in 04-home.md; for an admin, tapping it opens the app's settings instead of the app; for a member, tapping it shows the same Toast as US-HOME-08 ("<App> isn't running right now. Ask <admin name> to start it.") with no action button.
- **Given** I am an admin, **when** I long-press a tile for 500 ms, **then** the phone vibrates once (if supported) and the app's settings open for that app; the OS context menu is suppressed on tiles.
- **Given** the `PhoneAppSettings` sheet, **then** it is hidden until phase 9 ships (D-036); before that, the app's settings open full-screen in one column (`AppSettings` from 06-apps.md) with a back control to Home.
- **Given** I tap "Install app", **when** it is tapped, **then** the Apps tab (`PhoneStore`) opens.

**Implementation notes**
- API: `apps.list` / `apps.get` (`urls { lan, tailnet? }`, available to any signed-in user with access). Do not call `network.status` here; it is admin-only.
- UI: AppIcon, StatusDot. Tiles at least 64px wide with a 44px minimum icon hit area.
- Edge case: 20+ apps scroll with the page; the tab bar never overlaps the last row (bottom padding = tab bar + safe area).

### US-PHONE-09 · Search from Home on phone
**Feature:** F-PHONE-03 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneHome`
**As** anyone signed in, **I want** to search apps, files and settings from Home, **so that** I can jump anywhere without a keyboard shortcut.

**Acceptance criteria**
- **Given** `PhoneHome`, **when** I tap "Search", **then** `Spotlight` opens full-screen with the field focused and the keyboard up.
- **Given** Spotlight is open, **when** I type, **then** results group and behave as in 04-home.md; each result row is at least 52px tall.
- **Given** Spotlight is open, **when** I tap "Cancel" or swipe back, **then** it closes and returns to Home with the previous scroll position.

**Implementation notes**
- API: `home.searchEverything` (debounce 150 ms).
- UI: TextField, List, ListRow.
- The tab bar has no search slot; this button and the fields in App Store and Files are the only search entry points on phone.

### US-PHONE-10 · Browse the App Store on phone
**Feature:** F-PHONE-04 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneStore`, `PhoneUpdates`
**As** an admin, **I want** a phone-sized App Store, **so that** I can find apps from my phone.

**Acceptance criteria**
- **Given** I open the Apps tab, **when** `PhoneStore` renders, **then** it shows the title "App Store", a search field "Search apps" with placeholder "Search N apps" (N = catalog count), a horizontally scrolling row of category chips starting with "Discover", a "Featured" card and a list section such as "Popular on Apple Silicon".
- **Given** I type in the search field, **when** 200 ms pass without typing, **then** results replace the sections as a single list (same results and empty state as `StoreSearch` in 05-app-store.md); clearing the field restores the sections.
- **Given** I tap a category chip, **when** it is selected, **then** the list below filters to that category (same content as `StoreCategory`) and the chip is marked selected.
- **Given** a list row, **when** it renders, **then** it shows AppIcon, name, tagline and one Button: "Install" if not installed, "Open" if installed and running, or the state label if installing or updating.
- **Given** the Featured card, **when** I tap "View" or the card, **then** `PhoneAppDetails` opens for that app.
- **Given** 2 updates are available, **when** the store renders for an admin, **then** a ListRow "2 updates" appears above the sections and opens the `StoreUpdates` list full-screen (same behaviour as 05-app-store.md).

**Implementation notes**
- API: `store.listApps` (category, query), `store.listCategories`, `store.listUpdates`, `apps.list`.
- UI: TextField, Segmented or chip row, GlassCard, List, ListRow, AppIcon, Button. Loading state same as `StoreLoading`, single column.
- Sections and their order come from the same source as 05-app-store.md; phone only changes layout.

### US-PHONE-11 · App details on phone
**Feature:** F-PHONE-04 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneAppDetails`
**As** an admin, **I want** a readable app details page on my phone, **so that** I can decide whether to install an app.

**Acceptance criteria**
- **Given** I open an app from the store, **when** `PhoneAppDetails` renders, **then** it shows a back control "App Store", the AppIcon, name, tagline (for example "Photo and video backup") and a primary "Install" Button.
- **Given** the app's manifest, **when** the chips row renders, **then** it shows the category ("Files & photos"), "Apple Silicon" if tagged `apple-silicon`, and "hlabs official" if it comes from the built-in source.
- **Given** the app has screenshots, **when** they render, **then** they scroll horizontally with snap, one per 85% of screen width, each with alt text "Screenshot N"; tapping one opens it full-screen.
- **Given** the details, **when** the info list renders, **then** it shows "Version" (manifest version), "Runs as" ("3 containers", counted from compose services) and "Needs access to" (folder labels from `folders`, for example "Photos folder").
- **Given** the app is already installed, **when** the page renders, **then** the primary button reads "Open" and opens the app as in US-PHONE-08.

**Implementation notes**
- API: `store.getApp`.
- Data: `catalog_apps.manifest_json`.
- UI: AppIcon, Badge, Button, List, ListRow. Content and rules otherwise same as `AppDetails` in 05-app-store.md.

### US-PHONE-12 · Install an app from the phone
**Feature:** F-PHONE-04 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneStore`, `PhoneAppDetails`
**As** an admin, **I want** to install an app from my phone, **so that** I can add apps while away from the computer.

**Acceptance criteria**
- **Given** I tap "Install" in `PhoneStore` or `PhoneAppDetails`, **when** the app needs no input, **then** `InstallSheet` opens as a bottom sheet with the same steps, prompts, folder choices and warnings as 05-app-store.md.
- **Given** the InstallSheet is open with changed fields, **when** I drag it down, **then** it does not dismiss (US-PHONE-03) and "Cancel" is required.
- **Given** I confirm the install, **when** the job starts, **then** the sheet closes and the row button and Home tile show install progress from `app.installProgress`.
- **Given** the install fails, **when** the job finishes with an error, **then** `InstallFailed` shows as a bottom sheet with the same copy and retry as 05-app-store.md.

**Implementation notes**
- API: `apps.install` → job, `events.stream` (`app.installProgress`, `job.finished`).
- UI: Sheet, Stepper, Progress, Button.
- Edge case: leaving the store during install keeps progress on the Home tile.

### US-PHONE-13 · Open the app settings sheet
**Feature:** F-PHONE-05 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneAppSettings`
**As** an admin, **I want** an app's controls in a bottom sheet over Home, **so that** I can manage an app without leaving Home.

**Acceptance criteria**
- **Given** I long-press an app on Home (or tap a stopped app), **when** `PhoneAppSettings` opens, **then** it shows the AppIcon, name ("Vaultwarden"), status line with StatusDot ("Running · up 6 days") and a close button "✕".
- **Given** the sheet, **when** it renders, **then** a row of actions shows "Open", "Restart", "Stop", "Logs", "Share"; for a stopped app "Stop" becomes "Start" and "Restart" is disabled.
- **Given** I tap "Restart" or "Stop", **when** the mutation runs, **then** the status line updates live from `app.stateChanged` and the sheet stays open; failures show a Toast with copy mapped from `hlabsCode`.
- **Given** I tap "Logs", **when** it is tapped, **then** the logs view from 06-apps.md (`AppLogs`) opens full-screen with a back control to the sheet.
- **Given** the "Using now" row, **when** the app is running, **then** it shows "CPU 1% · 64 MB" updating every 5 s; when stopped it shows "Not running".
- **Given** a member long-presses a tile, **when** the sheet opens, **then** it shows only "Open" and "Share"; no settings rows.

**Implementation notes**
- API: `apps.get`, `apps.start`, `apps.stop`, `apps.restart`, `apps.logs`, `usage.current` + `usage.sample` events.
- Data: `apps.state`, `apps.updated_at`.
- UI: Sheet, AppIcon, StatusDot, Button, List, ListRow, Toast. Same behaviour as `AppSettings` in 06-apps.md.

### US-PHONE-14 · Toggle app options in the sheet
**Feature:** F-PHONE-05 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneAppSettings`
**As** an admin, **I want** the common app switches in the sheet, **so that** I can change them in one tap.

**Acceptance criteria**
- **Given** the sheet, **when** it renders, **then** it shows Switches "Start automatically", "Include in backups" and "Require hlabs login" reflecting current values.
- **Given** I flip a Switch, **when** the change is saved, **then** the Switch updates optimistically and reverts with a Toast if the call fails.
- **Given** I turn off "Require hlabs login", **when** it is flipped, **then** a confirmation sheet explains the app will rely on its own login (same copy as `AppPermissions` in 06-apps.md) before saving.
- **Given** the app's manifest sets `web.auth: none` and cannot use forward auth, **when** the sheet renders, **then** "Require hlabs login" is off and disabled with helper text "This app has its own login".

**Implementation notes**
- API: `apps.setAutostart`, `apps.setAuthMode`, `backups.plan.get` / `backups.plan.update` (app id in `include_json`).
- Data: `apps.autostart`, `apps.auth_mode`, `backup_plan.include_json`.
- UI: Switch, ListRow.

### US-PHONE-15 · Share, configure and uninstall from the sheet
**Feature:** F-PHONE-05 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneAppSettings`
**As** an admin, **I want** to share an app's link and reach its deeper settings from the sheet, **so that** I can do everything an app needs from my phone.

**Acceptance criteria**
- **Given** I tap "Share", **when** the Web Share API is available, **then** the OS share sheet opens with the app name and its URL for the current host; otherwise the URL is copied and a Toast shows "Link copied".
- **Given** I tap "Configuration & permissions ›", **when** it is tapped, **then** `AppConfig` opens full-screen in single column with a back control, same fields and save rules as 06-apps.md.
- **Given** I tap "Uninstall…", **when** it is tapped, **then** `UninstallConfirm` opens as a bottom sheet (drag-dismiss disabled) with the same keep/delete data choice and copy as 06-apps.md; confirming starts the job and closes both sheets.
- **Given** "Uninstall…", **when** it renders, **then** it is the last row, styled destructive, separated from other rows.

**Implementation notes**
- API: `apps.setConfig`, `apps.setMounts`, `apps.uninstall` → job.
- Data: `audit_log` (uninstall).
- UI: ListRow, Button (destructive), Sheet, Toast.

### US-PHONE-16 · Browse files on phone
**Feature:** F-PHONE-06 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneFiles`
**As** anyone signed in, **I want** to browse my files as a phone list, **so that** I can find a document on the go.

**Acceptance criteria**
- **Given** I open the Files tab, **when** `PhoneFiles` renders, **then** it shows the title "Files", an upload button "+" (label "Upload"), a search field, a horizontally scrolling location row ("Home", "Photos", "NAS", "Trash") and a breadcrumb ("Home › Documents").
- **Given** a folder, **when** it lists, **then** folders come first, each row showing FileItem icon, name and item count ("24 items"); files show their Papirus file icon (D-053) or, for photos and videos, a thumbnail, then name and "size · date" ("1.2 MB · 12 Sep").
- **Given** I tap a folder, **when** it opens, **then** it pushes a new page and the breadcrumb updates; tapping a breadcrumb segment jumps to that folder.
- **Given** I tap a file, **when** it is previewable, **then** `FilePreview` opens full-screen (07-files.md); other files download via the browser.
- **Given** a member, **when** the locations render, **then** only locations they can access show (own Home, Shared if allowed), per 07-security.md §7.4.
- **Given** an empty folder or a load in progress, **when** the list renders, **then** the empty and loading states of 07-files.md are shown in single column.

**Implementation notes**
- API: `files.list`, `files.preview`, `storage.locations.list`, `GET /api/files/download`.
- UI: FileItem, List, ListRow, Segmented (locations), Badge.
- Paging: `files.list` cursor, load more on scroll.

### US-PHONE-17 · Upload from the phone
**Feature:** F-PHONE-06 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneFiles`
**As** anyone signed in, **I want** to upload photos and files from my phone into the current folder, **so that** I can save things to hlabs quickly.

**Acceptance criteria**
- **Given** I tap "+", **when** it is tapped, **then** the OS picker opens (`<input type="file" multiple>`), which on phones offers photo library, camera and files.
- **Given** I choose files, **when** the upload starts, **then** each file uploads into the current folder in resumable 8 MB chunks and a progress sheet shows per-file Progress, same as `FilesUpload` in 07-files.md.
- **Given** the phone sleeps or the connection drops mid-upload, **when** the page is visible again, **then** the upload resumes from the last received chunk without restarting.
- **Given** a file with the same name exists, **when** it uploads, **then** the conflict rule of 07-files.md applies.

**Implementation notes**
- API: `POST /api/files/upload`, `files.list` refetch on completion.
- Data: `upload_sessions`.
- UI: Sheet, Progress, Toast.
- Edge case: iOS HEIC photos upload as-is (no conversion).

### US-PHONE-18 · Search and file actions on phone
**Feature:** F-PHONE-06 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneFiles`
**As** anyone signed in, **I want** to search a folder and act on a file with one button, **so that** I can manage files without a right-click.

**Acceptance criteria**
- **Given** I am in a folder, **when** the search field renders, **then** its placeholder reads "Search in <folder name>" (for example "Search in Documents") and results are scoped to that folder and below.
- **Given** a row, **when** I tap its "•••" button (label "More for <name>"), **then** the actions of `FilesContextMenu` (07-files.md) open as a bottom sheet: open, download, share, rename, move, trash.
- **Given** "Share" in the action sheet, **when** the Web Share API supports files, **then** the file is shared through the OS share sheet; otherwise it downloads.
- **Given** I choose "Move", **when** it is tapped, **then** `FilesMove` opens full-screen as a folder picker; "Rename" opens `FilesRename` as a sheet with the name selected minus the extension.
- **Given** the Trash location, **when** it lists, **then** row actions are "Restore" and "Delete forever", and "Empty trash" is available as in `FilesTrash`.

**Implementation notes**
- API: `files.search`, `files.rename`, `files.move`, `files.copy`, `files.trash`, `files.restoreFromTrash`, `files.emptyTrash`.
- UI: Sheet, Menu (rendered as sheet), TextField, Dialog.
- Long-press on a row opens the same action sheet.

### US-PHONE-19 · Settings list on phone
**Feature:** F-PHONE-07 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneSettings`
**As** an admin, **I want** all settings as one grouped list on my phone, **so that** I can reach any setting in two taps.

**Acceptance criteria**
- **Given** I open the Settings tab, **when** `PhoneSettings` renders, **then** the first row shows my avatar initial ("H"), display name ("Hari") and "Admin · password, two-factor, devices", opening `SettingsAccount`.
- **Given** an admin, **when** the list renders, **then** it shows rows in this order: "Users", "Notifications", "Appearance", "Backups", "Live usage", "Network & remote access", "Storage", "Engine & startup", "Updates", "Advanced", "About", each with a "›".
- **Given** row values, **when** they render, **then** "Users" shows the user count ("3"), "Backups" the time since the last successful run ("2h ago"), "Storage" free space ("142 GB free") and "Updates" a Badge with the number of available updates ("1") when above 0.
- **Given** a member, **when** the list renders, **then** only these sections show, in this order: the account row ("Member · password, two-factor, devices", opening Account with password and 2FA), "Appearance" (including wallpaper, D-010), "Notifications" and "About", matching 07-security.md §7.4 and `MemberSettings` in 09-account-people.md.
- **Given** a member opens an admin settings URL directly, **then** the "You don't have access to this" page (US-STATE-20) is shown, with no redirect.

**Implementation notes**
- API: `auth.me`, `users.list` (count), `backups.overview`, `storage.summary`, `settings.updates.get`.
- UI: List, ListRow, Badge.

### US-PHONE-20 · Settings pages on phone
**Feature:** F-PHONE-07 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneSettings`
**As** an admin, **I want** each settings page to open full-screen in one column, **so that** I can change settings from my phone.

**Acceptance criteria**
- **Given** I tap a settings row, **when** the page opens, **then** it pushes full-screen with a back control "‹ Settings" and the content of the matching desktop page (09-account-people.md, 10-system-settings.md, 08-usage-backups.md) laid out in one column.
- **Given** a settings page has a two-column desktop layout, **when** it renders on phone, **then** columns stack in reading order and tables become List rows.
- **Given** a destructive action (factory reset, engine switch, move all data), **when** it is started on phone, **then** its confirmation renders as a bottom sheet with drag-dismiss disabled and the same confirmation rules as 07-security.md §7.8.
- **Given** "Backups", **when** it is tapped, **then** `PhoneBackups` opens (US-PHONE-21).

**Implementation notes**
- API: existing `settings.*`, `users.*`, `network.*`, `storage.*` procedures used by the desktop pages.
- UI: same page components with a `layout="stack"` prop; no phone-only forks of setting logic.

### US-PHONE-21 · Backup status and back up now on phone
**Feature:** F-PHONE-08 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneBackups`
**As** an admin, **I want** to see backup health and start a backup from my phone, **so that** I know my data is safe wherever I am.

**Acceptance criteria**
- **Given** I open Backups, **when** `PhoneBackups` renders, **then** it shows a back control "‹ Settings", the title "Backups", the last successful run ("2 hours ago"), the next run ("Next: tonight at 03:00") and a full-width "Back up now" Button.
- **Given** I tap "Back up now", **when** the job starts, **then** the button is replaced by a Progress bar with percentage from `job.progress`, and a new "Running" row appears at the top of RECENT.
- **Given** a backup is already running, **when** the page renders, **then** "Back up now" is disabled and progress is shown.
- **Given** destinations, **when** they render, **then** each shows name and host ("NAS · nas.local") and a status Badge ("Healthy", or the warning/error states from 08-usage-backups.md); tapping one opens its detail (`BackupsOverview` content for that destination).
- **Given** no destination is configured, **when** the page renders, **then** the empty state of 08-usage-backups.md is shown with its add-destination action as a full-screen page.

**Implementation notes**
- API: `backups.overview`, `backups.destinations.list`, `backups.runNow` → job, `events.stream` (`backup.run`, `job.progress`).
- Data: `backup_runs`, `backup_destinations`, `backup_plan`.
- UI: Button, Progress, List, ListRow, Badge, StatusDot.

### US-PHONE-22 · Schedule, restore and recent runs on phone
**Feature:** F-PHONE-08 · **Priority:** Polish · **Phase:** 9 · **Screens:** `PhoneBackups`
**As** an admin, **I want** to check recent runs and reach schedule and restore from my phone, **so that** I can fix a failed backup quickly.

**Acceptance criteria**
- **Given** the Backups page, **when** it renders, **then** it shows a "Schedule" row with the current plan ("Daily 03:00") opening `BackupSchedule` full-screen, and a "Restore…" row opening `RestoreFlow` full-screen.
- **Given** the RECENT section, **when** it renders, **then** it lists the latest 10 runs, each with a date label ("Today, 03:00", "Yesterday, 03:00", "24 Sep, 03:00") and a status ("Succeeded", "Failed" in the critical colour, "Running", "Cancelled"); tapping a run opens `BackupRunDetail` full-screen.
- **Given** I start a restore on phone, **when** I confirm, **then** the password re-entry and confirmation of 07-security.md §7.8 appear as a bottom sheet with drag-dismiss disabled.
- **Given** more than 10 runs, **when** I scroll to the end, **then** the next page loads via cursor.

**Implementation notes**
- API: `backups.plan.get`, `backups.listRuns` (cursor, limit 10), `backups.getRun`, `backups.listSnapshots`, `backups.restore` → job.
- UI: List, ListRow, Badge.
- Date labels use the device locale and time zone.

### US-PHONE-23 · Add hlabs to the home screen
**Feature:** F-PHONE-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneLogin`, `PhoneHome`
**As** anyone signed in, **I want** to add hlabs to my phone's home screen with the hlabs icon, **so that** it opens like an app over Tailscale.

**Acceptance criteria**
- **Given** the dashboard is loaded on any host, **when** the browser reads `<head>`, **then** it links `/manifest.webmanifest` with `name` "hlabs", `short_name` "hlabs", `start_url` "/", `scope` "/", `display` "standalone", and `theme_color` / `background_color` from the design tokens.
- **Given** the manifest, **when** it is served, **then** it lists PNG icons generated at build time from the hlabs Logo at 192px and 512px, plus a 512px `maskable` icon with safe-zone padding; the page also links a 180px `apple-touch-icon` and sets `apple-mobile-web-app-capable` and `apple-mobile-web-app-title` "hlabs".
- **Given** a signed-out user, **when** the manifest, icons or service worker are requested, **then** they are served without authentication.
- **Given** Chrome on Android over HTTPS (tailnet host), **when** the install criteria are checked, **then** the page is installable (Lighthouse "Installable" passes); on iOS Safari "Add to Home Screen" uses the hlabs icon and title.
- **Given** the dashboard, **when** it registers a service worker (`/sw.js`, scope `/`), **then** the worker only caches the built app shell (HTML, JS, CSS, icons) and never caches `/trpc`, `/api` or `/auth` responses.
- **Given** a signed-in user on iOS Safari who is not in standalone mode, **when** `PhoneHome` renders for the first time, **then** a one-time hint card shows "Add hlabs to your Home Screen: tap Share, then Add to Home Screen." with a "Dismiss" button (D-030).
- **Given** the hint was dismissed, or hlabs runs in standalone mode, or the browser is not iOS Safari, **then** the hint is not shown; the dismissal is remembered per browser (in `localStorage`, wrapped in try/catch; if storage is unavailable the hint may show again on a later visit, never more than once per session).

**Implementation notes**
- Static files in `apps/web/public` (manifest) and a Vite build step for icons and `sw.js`; served by the daemon with the rest of `apps/web/dist`. No new API.
- `theme-color` meta has light and dark variants via `media`.
- Edge case: `hlabs.local` uses the Caddy local CA; installation there needs the CA trusted (CertGuide in 10-system-settings.md). The tailnet host uses a Tailscale certificate and works without extra steps.

### US-PHONE-24 · Run as a standalone web app
**Feature:** F-PHONE-09 · **Priority:** P2 · **Phase:** 7 · **Screens:** `PhoneLogin`, `PhoneHome`
**As** anyone signed in, **I want** the home-screen hlabs to behave like an app, **so that** it feels native and I stay signed in.

**Acceptance criteria**
- **Given** hlabs is launched from the home screen, **when** it opens (`display-mode: standalone`), **then** there is no browser chrome, the status bar area uses the theme colour, and content respects safe areas (US-PHONE-02).
- **Given** standalone mode, **when** I open an app from Home, **then** it opens outside the hlabs window (system browser or in-app browser view), so hlabs stays on Home.
- **Given** standalone mode on iOS (separate cookie store from Safari), **when** I launch it for the first time, **then** `PhoneLogin` shows and "Remember this phone" is on by default in standalone mode only.
- **Given** the phone is offline or the tailnet is unreachable, **when** hlabs launches, **then** the cached shell shows a full-screen message "Can't reach hlabs" with a "Try again" Button, instead of a browser error page.
- **Given** a new hlabs version was deployed, **when** the standalone app next launches online, **then** the service worker updates the shell and the page reloads once to the new version.

**Implementation notes**
- API: `auth.login`, `system.health` (reachability check), `GET /healthz`.
- UI: Button, Logo. Standalone detection via `matchMedia('(display-mode: standalone)')` and `navigator.standalone` (iOS).
- Edge case: the session cookie must be set on the tailnet host as well as `.hlabs.local` (07-security.md §7.3), since an installed app keeps the host it was installed from.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
