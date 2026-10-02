# 02 · Onboarding

The first-run flow that turns a fresh hlabs install into a working home cloud: it checks the computer and sets up a container engine, creates the admin account with two-factor login, picks where data lives, optionally connects Tailscale and installs a few starter apps. It is used once, by the person installing hlabs, and is opened by the tray app (or the headless installer) when no users exist; it can be resumed at any point and disappears once completed.

**Screens:** `OnbWelcome` (P1), `OnbRestore` (P3), `OnbSystem` (P1), `OnbSystemFail` (P1), `OnbAccount` (P1), `OnbAccountErrors` (P2), `OnbTwoFactor` (P1), `OnbStorage` (P1), `OnbRemote` (P1), `OnbApps` (P1), `OnbDone` (P1)
**Depends on:** `01-install-tray.md`, `03-sign-in.md`, `04-home.md`, `05-app-store.md`, `06-apps.md`, `08-usage-backups.md`, `10-system-settings.md`

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-ONB-01 | First-run entry, welcome and resumable flow | P1 | 1 | `OnbWelcome` |
| F-ONB-02 | System check and container engine setup | P1 | 1 | `OnbSystem`, `OnbSystemFail` |
| F-ONB-03 | Create admin account | P1 | 1 | `OnbAccount`, `OnbAccountErrors` |
| F-ONB-04 | Two-factor login and recovery codes | P1 | 1 | `OnbTwoFactor` |
| F-ONB-05 | Storage location | P1 | 1 | `OnbStorage` |
| F-ONB-06 | Remote access with Tailscale | P1 | 3 | `OnbRemote` |
| F-ONB-07 | Starter apps | P1 | 2 | `OnbApps` |
| F-ONB-08 | All set and completion | P1 | 1 | `OnbDone` |
| F-ONB-09 | Restore from a backup | P3 | 8 | `OnbRestore` |

## User stories

### US-ONB-01 · Open onboarding automatically on first run
**Feature:** F-ONB-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbWelcome`
**As** a new user, **I want** setup to open in my browser as soon as hlabs starts for the first time, **so that** I don't have to find a URL or read instructions.

**Acceptance criteria**
- **Given** phase 1 (no tray yet), **when** the daemon starts with no users, **then** it prints the setup URL (with its token) to its log and to stdout, and `pnpm dev` shows it in the terminal; opening that URL starts onboarding (D-041).
- The tray criteria below (`tray.setupUrl`, "Open setup") apply from phase 4, and the `hlabs setup-url` command from phase 6 (D-036, D-041).
- **Given** the daemon is ready (`/healthz` 200) and `onboarding.status` returns `{ completed: false, hasUsers: false }`, **when** the tray starts, **then** it opens the default browser at the setup URL returned by `tray.setupUrl` and shows "Opening setup in your browser…" with an "Open setup" item (tray first-launch state, see `01-install-tray.md`).
- **Given** onboarding is not completed, **when** the user opens the tray menu later, **then** "Open setup" is shown and opens the same URL at the saved step.
- **Given** the setup URL contains a valid setup token, **when** the browser loads it, **then** the token is stored in `sessionStorage`, stripped from the address bar, and sent as the `x-hlabs-setup` header on every onboarding call made before an admin exists.
- **Given** a browser on another device opens `https://hlabs.local` before an admin exists and has no setup token, **when** the page loads, **then** it shows "Finish setup on the computer running hlabs." and no onboarding step is reachable; pre-admin onboarding mutations return `FORBIDDEN` with `hlabsCode` `ONBOARDING_SETUP_TOKEN_REQUIRED`.
- **Given** Linux headless (no tray), **when** the daemon starts with no users, **then** it writes the setup URL (with token) to its log and the installer prints it at the end of the install via `hlabs setup-url`, which can be run again at any time until onboarding completes.
- **Given** the daemon or the computer restarts before onboarding completes, **when** the tray calls `tray.setupUrl` or the admin runs `hlabs setup-url`, **then** the same plain token is handed out again (read from the secret store), so the earlier URL keeps working.
- **Given** onboarding is completed, **when** the tray starts, **then** it does not open the browser and "Open setup" is not shown.

**Implementation notes**
- API: `onboarding.status` (public: `{ completed, step, hasUsers }`), new `tray.setupUrl` (trayProcedure).
- Data: `settings.onboarding` (`completedAt`, `step`); setup token (32 random bytes) generated at first daemon start and stored in the secret store (keychain / Secret Service; headless: encrypted with `secret.key`), referenced by `settings.onboarding.setupTokenRef`; the daemon keeps only its hash in memory and compares the `x-hlabs-setup` header against that hash in constant time; `tray.setupUrl` / `hlabs setup-url` read the plain token from the secret store to rebuild the URL after restarts; the token and its secret-store item are deleted when `onboarding.complete` runs.
- UI: TrayMenu first-launch state (owned by tray module), Logo on the web page.
- Edge cases: daemon not ready yet (tray waits for `/healthz`, up to the tray's 10 s unreachable rule); token reuse after completion is rejected; two browser tabs open at once both work (token is not single-use until completion).

### US-ONB-02 · See the welcome screen and start setup
**Feature:** F-ONB-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbWelcome`
**As** a new user, **I want** a short welcome that tells me what hlabs is and how long setup takes, **so that** I can decide to start now.

**Acceptance criteria**
- **Given** onboarding step is `welcome`, **when** the page loads, **then** it shows the Logo, "Welcome to hlabs", "Your own cloud, running on this computer.", a primary "Get started" button and the hint "Setup takes about five minutes".
- **Given** the welcome screen, **when** the user presses "Get started" (or Enter), **then** step is saved as `system` and `OnbSystem` opens.
- **Given** the restore feature is enabled (phase 8), **when** the welcome screen shows, **then** a text link "Restore from a backup instead" opens `OnbRestore`; before phase 8 the link is not rendered.
- **Given** the welcome screen, **then** no Stepper is shown (the Stepper appears only on steps 1–6).
- **Given** a keyboard user, **when** the page loads, **then** focus is on "Get started" and the heading is the page's `h1`.

**Implementation notes**
- API: `onboarding.status`; saving the step is done by the next screen's first call (see US-ONB-03).
- UI: GlassCard over the default wallpaper, Logo, Button (primary), text link Button variant.
- Edge cases: reduced transparency setting (not yet chosen) uses the system `prefers-reduced-transparency` default.

### US-ONB-03 · Resume onboarding where I left off, and only until it's done
**Feature:** F-ONB-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbWelcome`
**As** a new user, **I want** to close the browser or restart the computer mid-setup and continue at the same step, **so that** I never have to start over or end up with a half-configured system.

**Acceptance criteria**
- **Given** `settings.onboarding.step` is `storage`, **when** the user opens the setup URL again, **then** the app routes straight to `OnbStorage` with "Step 4 of M" (M = enabled steps) and previously saved choices pre-filled.
- **Given** the user types an onboarding URL for a step later than the saved step, **when** it loads, **then** they are redirected to the saved step; earlier steps are reachable with Back.
- **Given** an admin already exists and the browser has no session, **when** the setup URL is opened, **then** the user is sent to log in (`03-sign-in.md`) and returned to the saved step after login; pre-admin procedures now require an admin session instead of the setup token.
- **Given** `settings.onboarding.completedAt` is set, **when** any `/onboarding/*` route loads, **then** it redirects to `/` (or login), and every `onboarding.*` mutation returns `FORBIDDEN` with `hlabsCode` `ONBOARDING_COMPLETE`.
- **Given** the Stepper, **when** on steps 1–6, **then** it reads "Step N of M" where M is the number of enabled steps (6 once all phases ship) and is announced by screen readers as the page's progress.
- **Given** a step changes, **then** focus moves to the new step's heading.

**Implementation notes**
- API: `onboarding.status`; each step mutation persists the next step server-side, so the server is the source of truth.
- Data: `settings.onboarding.step` ∈ `welcome | system | account | twoFactor | storage | remote | apps | done`.
- UI: Stepper. Steps are a static registry; steps whose phase has not shipped (remote in phase 3, apps in phase 2) are omitted and the Stepper total reflects the enabled steps. Every "next" moves to the next enabled step in the registry, and the step text is "Step N of M" where M is the number of enabled steps (D-041).
- Edge cases: daemon restart mid-step (Colima install job is resumed or failed per the jobs rule); `status` is public but returns only `{ completed, step, hasUsers }`, never user data.

### US-ONB-04 · Run the system check
**Feature:** F-ONB-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbSystem`
**As** a new user, **I want** hlabs to check this computer and tell me what it found, **so that** I know it can run apps.

**Acceptance criteria**
- **Given** step 1, **when** `OnbSystem` loads, **then** it shows "Step 1 of M" (M = enabled steps; 6 when all phases have shipped), "Checking this computer", "hlabs runs apps in containers. We'll set up anything that's missing." and one ListRow each for: CPU (e.g. "Apple Silicon (arm64)"), OS (e.g. "macOS 15"), "Container runtime", "Free disk space" (e.g. "142 GB") and ports ("Ports 80 and 443 · Available").
- **Given** each check is running, **then** its row shows a StatusDot in a loading state; when done it shows a success or warning or error StatusDot with its value.
- **Given** OrbStack, Docker Desktop, a Colima socket or a Docker Engine socket is found (order from 02 §2.4), **when** the check finishes, **then** "Container runtime" shows the engine name and version and passes.
- **Given** free space at the default storage root is below 10 GB, **then** the disk row is an error and Continue is disabled; between 10 and 30 GB it is a warning and Continue stays enabled.
- **Given** port 443 (or 80) is in use by another process, **then** the row reads "Port 443 · In use · will use 8443" as a warning (not blocking) and the chosen fallback port is saved for Caddy.
- **Given** all blocking checks pass, **when** the user presses "Continue", **then** `onboarding.confirmSystem` saves the start-at-login choice, the name on the network ("Name on your network", `<name>.local`, prefilled `hlabs`, D-098) and step `account`, and `OnbAccount` opens; "Back" returns to `OnbWelcome`.

**Implementation notes**
- API: `onboarding.checkSystem` (setupProcedure, needs `x-hlabs-setup`; returns `{ cpu, os, engine: { kind, version, state, install? }, disk: { freeBytes, path }, ports: { http, https } }`), new `onboarding.confirmSystem({ startAtLogin })`.
- Data: `settings.engine`, `settings.onboarding.step`; port fallback stored with the network settings used by `network.ports`.
- UI: Stepper, List, ListRow, StatusDot, Switch, Button.
- Edge cases: checkSystem re-polled every 2 s while any row is pending; Linux headless reports OS as distro + version; ports 80 and 443 both in use use 8080 and 8443.

### US-ONB-05 · Install Colima automatically when no engine is found (macOS)
**Feature:** F-ONB-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbSystem`
**As** a new user on a Mac without Docker, **I want** hlabs to install what it needs by itself, **so that** I don't have to learn about containers.

**Acceptance criteria**
- **Given** macOS and no engine socket is found, **when** the check finishes, **then** hlabs starts `onboarding.installEngine` without asking and the row shows "Installing Colima… N%" with a Progress bar and the note "No Docker found. OrbStack or Docker Desktop are used automatically when present."
- **Given** the install job runs, **then** it downloads the signed Colima and Lima into `<dataDir>/engine`, creates profile `hlabs` (4 CPU, 8 GB memory, 100 GB disk, VZ + virtiofs, capped to the host's resources) and starts it; progress reaches 100% only after `docker.ping()` succeeds.
- **Given** the install is running, **then** Continue is disabled and Back stays enabled; leaving the step does not cancel the job.
- **Given** the install succeeds, **then** the row shows "Colima" with its version and a success StatusDot, and Continue is enabled.
- **Given** the page is reloaded mid-install, **then** it shows the current progress of the same job (no second install starts).

**Implementation notes**
- API: new `onboarding.installEngine` → `{ jobId }` (macOS only; Linux returns `BAD_REQUEST` `ENGINE_INSTALL_UNSUPPORTED`); progress is read through `onboarding.checkSystem` (`engine.install { state, progress, lastLogLine }`) because `jobs.*` and `events.stream` need a session that does not exist yet.
- Data: `jobs` row kind `engine_install`; `settings.engine.preferred = colima`.
- UI: ListRow with Progress, StatusDot.
- Edge cases: user installs OrbStack while Colima is installing (next detection prefers OrbStack; Colima install finishes but is not used); insufficient memory for 8 GB (scale down to half of host memory).

### US-ONB-06 · Recover from a failed system check
**Feature:** F-ONB-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbSystemFail`
**As** a new user, **I want** a clear explanation and a retry when setup of the container runtime fails, **so that** I can fix it without being stuck.

**Acceptance criteria**
- **Given** the engine install job fails, **when** the check updates, **then** the heading changes to "Something needs attention", the lead reads "We couldn't set up the container runtime. Nothing has been changed on this computer." and the row shows "Install failed" with an error StatusDot.
- **Given** a failed install, **then** the row shows the last log line in monospace (e.g. "colima start: download timed out after 120s") and a mapped hint for its `hlabsCode` (e.g. `ENGINE_DOWNLOAD_TIMEOUT` → "Check your internet connection and try again.").
- **Given** a failed install, **then** partial files in `<dataDir>/engine` and the `hlabs` Colima profile are removed so "Nothing has been changed" is true.
- **Given** the failure state, **when** the user presses "Retry", **then** engine detection runs again first (picking up a newly installed OrbStack or Docker Desktop) and only reinstalls Colima if still nothing is found.
- **Given** the failure state, **when** the user presses "View full log", **then** a Dialog shows the full install log, scrollable, with a Copy button.
- **Given** the failure state, **then** the tip "Already use Docker? Install OrbStack or Docker Desktop and press Retry, and hlabs will use it instead." is shown and Continue is disabled until the runtime row passes.

**Implementation notes**
- API: `onboarding.checkSystem({ includeLog: true })` for the Dialog, `onboarding.installEngine` for retry.
- UI: ListRow, StatusDot, Button (Retry, View full log), Dialog.
- Edge cases: the port warning (e.g. "Port 443 · In use · will use 8443") still shows alongside the failure; retry while a previous job is still cleaning up is ignored.

### US-ONB-07 · Get Docker Engine instructions on Linux, and choose start at login
**Feature:** F-ONB-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbSystem`, `OnbSystemFail`
**As** a new user, **I want** clear next steps on Linux when Docker is missing and a choice about starting hlabs at login, **so that** the system is ready and behaves the way I expect.

**Acceptance criteria**
- **Given** Linux desktop with no engine socket, **when** the check finishes, **then** the runtime row is an error with the one-line Docker Engine install command, a Copy button and "Retry"; hlabs does not run it itself.
- **Given** the user's account lacks access to `/var/run/docker.sock`, **then** the row explains the user must be in the `docker` group and log out and in again, with Retry.
- **Given** macOS or Linux desktop, **then** a Switch "Start hlabs when I log in" with the description "Keeps your apps running in the background from the menu bar" is shown, on by default.
- **Given** the switch is off when Continue is pressed, **then** the LaunchAgent / `systemd --user` unit is disabled for login (the daemon keeps running now) and the choice is visible in Settings › Engine & startup.
- **Given** Linux headless, **then** the switch is hidden (the service always starts at boot).

**Implementation notes**
- API: `onboarding.checkSystem`, `onboarding.confirmSystem({ startAtLogin })` (same effect as `settings.startup.update`).
- UI: ListRow, Switch, Button.
- Edge cases: engine present but stopped (Docker Desktop not running) shows "Docker Desktop is not running" with Retry, not install.

### US-ONB-08 · Create the admin account
**Feature:** F-ONB-03 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbAccount`
**As** a new user, **I want** to create the admin account, **so that** I can manage apps, users and settings.

**Acceptance criteria**
- **Given** step 2, **when** `OnbAccount` loads, **then** it shows "Step 2 of M" (M = enabled steps; 6 when all phases have shipped), "Create your admin account", "The admin manages apps, users and settings. You can add family members later." and fields "Your name", "Username", "Password", "Confirm password".
- **Given** the user types a name, **then** Username is suggested as the lowercased first word with invalid characters removed (e.g. "Hari Prasad" → "hari") until the user edits Username.
- **Given** the password field, **then** a strength hint updates as the user types; with 12+ characters that are not on the common list it reads "Strong · at least 12 characters".
- **Given** valid input, **when** the user presses "Create account" (or Enter in the last field), **then** the button shows a loading state, `onboarding.createAdmin` creates the user with role `admin`, signs them in (session cookie as in 07 §7.3, not "remember"), saves step `twoFactor` and opens `OnbTwoFactor`.
- **Given** "Back", **then** `OnbSystem` opens with results kept.
- **Given** password fields, **then** each has a show/hide toggle and uses `autocomplete="new-password"`; Username uses `autocomplete="username"`.

**Implementation notes**
- API: `onboarding.createAdmin({ displayName, username, password })`.
- Data: `users` (Argon2id `m=64 MiB, t=3, p=1`), `sessions`, `audit_log` action `user.create` (actor = new user), `settings.onboarding.step`.
- UI: Stepper, TextField, Button.
- Edge cases: display name 1–40 characters, trimmed (D-044); username lowercased server-side before validation.

### US-ONB-09 · See what to fix when the account details are invalid
**Feature:** F-ONB-03 · **Priority:** P2 · **Phase:** 1 · **Screens:** `OnbAccountErrors`
**As** a new user, **I want** clear, specific errors next to each field, **so that** I can fix them quickly.

**Acceptance criteria**
- **Given** an invalid username, **when** the field loses focus or the form is submitted, **then** it shows "Use 3–32 lowercase letters, numbers and dashes, starting with a letter, e.g. hari" and is marked invalid (`aria-invalid`, error linked with `aria-describedby`).
- **Given** a password shorter than 12 characters, **then** the hint reads "Weak · use at least 12 characters" in the error style; a 12+ character password on the common-password list shows "This password is too common".
- **Given** Confirm password differs, **then** it shows "Passwords don't match".
- **Given** the user presses "Create account" with N invalid fields, **then** nothing is sent, a summary "Fix N things to continue." appears above the form (e.g. "Fix 2 things to continue."), and focus moves to the first invalid field.
- **Given** the server rejects input (`USERNAME_INVALID`, `USERNAME_TAKEN`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_COMMON`), **then** the same field errors are shown from the `hlabsCode`, never the raw message.
- **Given** the user fixes a field, **then** its error clears immediately and the summary count updates; the summary disappears at 0.

**Implementation notes**
- API: `onboarding.createAdmin` validates with the shared Zod schema; client uses the same schema plus a bundled common-password check.
- UI: TextField error state, inline summary above the form.
- Edge cases: username regex is `^[a-z][a-z0-9-]{2,31}$` (D-014: 3–32 characters, starts with a letter, no underscore); the error copy never mentions "_".

### US-ONB-10 · Only allow one admin to be created through onboarding
**Feature:** F-ONB-03 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbAccount`
**As** a new user, **I want** account creation to be impossible once an account exists, **so that** nobody else can take over my hlabs.

**Acceptance criteria**
- **Given** at least one row in `users`, **when** `onboarding.createAdmin` is called, **then** it returns `CONFLICT` with `hlabsCode` `ONBOARDING_USERS_EXIST` and creates nothing.
- **Given** two `createAdmin` calls arrive at once, **then** exactly one succeeds (user count check and insert run in one transaction).
- **Given** a user already exists and the browser is on `OnbAccount` (e.g. a stale tab), **when** it submits, **then** it shows "An admin account already exists. Log in to continue." with a "Log in" button.
- **Given** no setup token and no users, **when** `createAdmin` is called, **then** it returns `FORBIDDEN` `ONBOARDING_SETUP_TOKEN_REQUIRED`.

**Implementation notes**
- API: `onboarding.createAdmin`.
- Data: `users`; invariant 1 (at least one enabled admin) holds from this point on.
- Edge cases: unit test for the race with two concurrent transactions.

### US-ONB-11 · Turn on two-factor login
**Feature:** F-ONB-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbTwoFactor`
**As** an admin, **I want** to add an authenticator app during setup, **so that** my account is protected even if my password leaks.

**Acceptance criteria**
- **Given** step 3, **when** `OnbTwoFactor` loads, **then** it shows "Step 3 of M" (M = enabled steps; 6 when all phases have shipped), "Add two-factor login", a "Recommended" Badge, "Scan with an authenticator app, then enter the 6-digit code it shows.", a QR code, "Can't scan? Enter this key instead" revealing the base32 secret with a Copy button, and "Works with any TOTP app, such as 1Password, Google Authenticator or Authy."
- **Given** the code input, **then** it is six single-digit fields labelled "Digit 1"–"Digit 6" that accept digits only, auto-advance, support Backspace to go back, and fill all six on paste.
- **Given** six digits entered, **when** the user presses "Turn on" (or the sixth digit is typed), **then** `onboarding.confirmTotp` verifies it (RFC 6238, SHA-1, 30 s, ±1 step).
- **Given** a wrong code, **then** the fields clear, focus returns to Digit 1 and an error reads "That code didn't work. Check the time on your phone and try again."; "Turn on" is disabled until six digits are entered.
- **Given** a correct code, **then** the secret is saved to the keychain, `user_totp.enabled_at` is set and the recovery codes view opens (US-ONB-12).

**Implementation notes**
- API: `onboarding.setupTotp` → `{ secret, otpauthUrl }` (issuer `hlabs`, account = username; pending secret held in memory, replaced on reload), `onboarding.confirmTotp({ code })` → `{ recoveryCodes }`.
- Data: `user_totp` (`secret_ref`), `recovery_codes`, `audit_log` `totp.enable`.
- UI: Stepper, Badge, QR rendered client-side from `otpauthUrl`, digit inputs, Button, text link Button.
- Edge cases: 5 wrong codes in 15 minutes lock confirmation for 15 minutes (reuse login lockout counters); a reload issues a new secret, so an already-scanned one stops working.

### US-ONB-12 · Save recovery codes
**Feature:** F-ONB-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbTwoFactor`
**As** an admin, **I want** recovery codes when I turn on two-factor, **so that** I can still log in if I lose my phone.

**Acceptance criteria**
- **Given** two-factor was just turned on, **then** the step shows 10 codes in the format `xxxx-xxxx`, the warning "Save these somewhere safe. Each code works once and you won't see them again." and buttons "Download", "Copy" and "Continue".
- **Given** "Download", **then** a `hlabs-recovery-codes.txt` file is saved containing the hostname, username, date and the 10 codes.
- **Given** "Continue", **then** step `storage` is saved and `OnbStorage` opens; the codes are no longer retrievable (only `code_hash` is stored).
- **Given** the page is reloaded before Continue, **then** the codes are not shown again; the screen shows "Two-factor is on" and offers "Continue" (new codes can be made later in Account settings).

**Implementation notes**
- API: codes come from `onboarding.confirmTotp`; later regeneration is `account.recoveryCodes.regenerate`.
- Data: `recovery_codes` (10 rows, Argon2id hashes).
- UI: monospace List of codes, Button (Download, Copy, Continue), Toast "Copied".

### US-ONB-13 · Skip two-factor for now
**Feature:** F-ONB-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbTwoFactor`
**As** an admin, **I want** to skip two-factor during setup, **so that** I can finish now and add it later.

**Acceptance criteria**
- **Given** `OnbTwoFactor`, **when** the user presses "Skip for now", **then** a Dialog warns "Anyone who learns your password can manage hlabs. You can turn on two-factor later in Account." with "Skip" and "Set up now".
- **Given** the user confirms Skip, **then** the pending secret is discarded, step `storage` is saved and `OnbStorage` opens.
- **Given** two-factor was skipped, **then** `OnbDone` shows "2FA off" in the Admin account row.
- **Given** the user presses Back on `OnbStorage` after enabling two-factor, **then** `OnbTwoFactor` shows "Two-factor is on" and "Continue" instead of the QR code.

**Implementation notes**
- API: skipping has no dedicated call; step is advanced by new `onboarding.setStep({ step: "storage" })` only when leaving 2FA without enabling it (server allows only the next step).
- UI: Dialog, Button.

### US-ONB-14 · Keep data on this computer
**Feature:** F-ONB-05 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbStorage`
**As** an admin, **I want** to choose where app data and files live, with a sensible default, **so that** I can continue quickly.

**Acceptance criteria**
- **Given** step 4, **when** `OnbStorage` loads, **then** it shows "Step 4 of M" (M = enabled steps; 6 when all phases have shipped), "Where should your data live?", "Home folders, shared files and media go here. You can move them later in Settings." and a single-choice list "Storage location" with "This computer", "External drive" and "Network storage (NAS)".
- **Given** the default, **then** "This computer" is selected and shows the path and free space (e.g. "~/hlabs · 142 GB free") with a "Fastest" Badge.
- **Given** the note "App databases always stay on this computer for speed. Media libraries can point anywhere.", **then** it is always visible below the options.
- **Given** "This computer" and "Continue", **then** `onboarding.setStorage({ kind: "local" })` creates the storage root folder (`users/<username>/`, `shared/`, `.trash/`; app data lives separately in `appDataDir` on this computer, D-011), registers it as the `is_root` location, and moves to the next enabled step (D-041): `OnbRemote` once remote access is enabled from phase 3 (D-036), otherwise `OnbApps` from phase 2, otherwise `onboarding.complete` runs and `OnbDone` opens.
- **Given** "Back", **then** `OnbTwoFactor` opens (US-ONB-13 state if already on).
- **Given** the list, **then** it is keyboard operable as a radio group (arrow keys move, Space selects).

**Implementation notes**
- API: `onboarding.setStorage`.
- Data: `storage_locations` (invariant 4: exactly one `is_root`).
- UI: Stepper, List, ListRow (radio), Badge, Button.
- Edge cases: `~/hlabs` already exists with files (reuse, never delete); path not writable (`STORAGE_NOT_WRITABLE`, error on the row); Linux headless default path `/var/lib/hlabs/storage`.

### US-ONB-15 · Use an external drive
**Feature:** F-ONB-05 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbStorage`
**As** an admin, **I want** to put my files on a connected USB or Thunderbolt drive, **so that** I have more space than my internal disk.

**Acceptance criteria**
- **Given** "External drive" ("Choose a connected USB or Thunderbolt drive") is selected, **then** a list of connected, writable external volumes appears with name, free space and file system; if none, it shows "Connect a drive to see it here." and refreshes every 3 s.
- **Given** a drive is chosen and Continue is pressed, **then** `onboarding.setStorage({ kind: "external", path })` creates `<drive>/hlabs` as the storage root for `users/`, `shared/` and default media folders, while `app-data/` stays on this computer, and onboarding moves to the next enabled step, as in US-ONB-14 (D-041).
- **Given** the drive is formatted FAT32/exFAT, **then** a warning shows "This drive's format doesn't support file permissions. Some apps may not work." and Continue stays enabled.
- **Given** the drive is ejected before Continue, **then** the selection clears and an error shows on the row.

**Implementation notes**
- API: new `storage.listDrives` (admin query: connected external volumes `{ path, name, freeBytes, fsType, writable }`), `onboarding.setStorage`.
- Data: `storage_locations` kind `external`, `is_root = 1`.
- UI: ListRow, Badge, inline warning.

### US-ONB-16 · Use network storage (NAS)
**Feature:** F-ONB-05 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbStorage`
**As** an admin, **I want** to point hlabs at an SMB or NFS share, **so that** media and files live on my NAS.

**Acceptance criteria**
- **Given** "Network storage (NAS)" ("SMB or NFS share, best for media and backups") is selected, **then** fields appear: Protocol (Segmented SMB / NFS), Address (e.g. `nas.local/media`), and for SMB Username and Password.
- **Given** the fields, **when** the user presses Continue, **then** hlabs first tests the connection (spinner on Continue) and shows mapped errors for `NAS_UNREACHABLE`, `NAS_AUTH_FAILED` or `NAS_READ_ONLY` next to the relevant field.
- **Given** the test passes, **then** the share is mounted, registered as the root location for files and media, credentials are stored in the keychain, and onboarding moves to the next enabled step, as in US-ONB-14 (D-041).
- **Given** a NAS root, **then** `app-data/` stays on this computer.

**Implementation notes**
- API: `storage.locations.testNetwork`, `storage.locations.addNetwork`, then `onboarding.setStorage({ kind: "nas", locationId })`.
- Data: `storage_locations` kind `smb` | `nfs` with `secret_ref`.
- UI: Segmented, TextField, Button.
- Edge cases: share disconnects later is handled by storage status (not onboarding); Linux desktop mount via privileged helper prompts polkit.

### US-ONB-17 · Connect Tailscale for remote access
**Feature:** F-ONB-06 · **Priority:** P1 · **Phase:** 3 · **Screens:** `OnbRemote`
**As** an admin, **I want** to reach my apps from my phone outside home without exposing anything to the internet, **so that** hlabs is useful away from home.

**Acceptance criteria**
- **Given** the remote step, **when** `OnbRemote` loads, **then** it shows "Step N of M" (5 of 6 when all phases have shipped), "Reach hlabs from anywhere", "Use your apps from your phone or laptop outside home, with nothing exposed to the internet.", a "Home network" row with the dashboard address (e.g. "https://hlabs.local") and a "Ready" Badge, and an "Anywhere, with Tailscale" row ("Private HTTPS address on your tailnet") with a "Connect" button.
- **Given** Tailscale is not installed, **when** the user presses Connect, **then** hlabs opens the Tailscale download page in a new tab and the row reads "Install Tailscale, then press Connect again."
- **Given** Tailscale is installed but logged out, **when** Connect is pressed, **then** the login URL returned by `onboarding.connectRemote` opens in a new tab and the row shows "Waiting for you to log in…" while polling `network.status` every 2 s (up to 10 minutes); the node is named after the server's name for this first log-in (D-102).
- **Given** Tailscale is already logged in, **when** Connect is pressed, **then** the row names the tailnet and asks to confirm ("Publish hlabs on <tailnet>?") before anything is published; the node keeps its name (D-102). A port already served by something else, or a missing operator permission on Linux, is explained as in US-SYS-02 (D-103, D-104).
- **Given** Tailscale is connected, **then** Serve is configured for the dashboard and installed apps, the row shows "Connected" with the tailnet URL, the example line "After connecting, apps open at" with e.g. "https://<node>.[tailnet].ts.net:14001" (each app gets its own tailnet port on the dashboard's tailnet name, D-012, D-102, D-110) appears, and the secondary button changes from "Set up later" to "Continue".
- **Given** Continue, **then** step `apps` is saved and `OnbApps` opens; "Back" opens `OnbStorage`.
- **Given** any path, **then** hlabs never enables Tailscale Funnel.

**Implementation notes**
- API: `onboarding.connectRemote` → `{ state: "not_installed" | "needs_login" | "connected", url? }`, `network.status`.
- Data: `settings.remote`; `audit_log` `remote.connect`.
- UI: Stepper, ListRow, Badge, StatusDot, Button.
- Edge cases: Tailscale logged in to a tailnet without HTTPS certificates enabled (`TAILSCALE_HTTPS_DISABLED`, explain how to turn it on in the Tailscale admin); the example hostname follows decision D-012.

### US-ONB-18 · Set up remote access later
**Feature:** F-ONB-06 · **Priority:** P1 · **Phase:** 3 · **Screens:** `OnbRemote`
**As** an admin, **I want** to skip remote access, **so that** I can finish setup and use hlabs at home first.

**Acceptance criteria**
- **Given** `OnbRemote`, **when** the user presses "Set up later", **then** no Tailscale call is made, step `apps` is saved and `OnbApps` opens.
- **Given** remote access was skipped, **then** `OnbDone` shows "Remote access · Home network only" and the setting is available in Settings › Network & remote access.
- **Given** a login flow was started and the user presses "Set up later", **then** polling stops and nothing is configured.

**Implementation notes**
- API: new `onboarding.setStep({ step: "apps" })`.
- UI: Button (secondary).

### US-ONB-19 · Pick starter apps
**Feature:** F-ONB-07 · **Priority:** P1 · **Phase:** 2 · **Screens:** `OnbApps`
**As** an admin, **I want** to pick a few popular apps to install right away, **so that** hlabs is useful when I first open it.

**Acceptance criteria**
- **Given** the apps step, **when** `OnbApps` loads, **then** it shows "Step N of M" (6 of 6 when all phases have shipped; 5 of 5 before phase 3), "Pick a few apps to start", "They'll install in the background. Hundreds more are in the App Store." and a grid of 8 selectable tiles: Jellyfin, Immich, Nextcloud, Home Assistant, Vaultwarden, Paperless, Uptime Kuma, Open WebUI.
- **Given** a tile, **when** clicked or toggled with Space, **then** it shows a selected state (checkmark, `aria-pressed="true"`); none are preselected.
- **Given** N tiles selected (N ≥ 1), **then** the primary button reads "Install and finish" with a count Badge showing N; with 0 selected it is disabled and "Skip" is the way forward.
- **Given** "Install and finish", **then** `onboarding.installStarterApps({ appIds })` queues one install job per app with manifest defaults (generated secrets, default folders under the admin's Home), then `onboarding.complete` runs and `OnbDone` opens without waiting for installs.
- **Given** an app whose `requirements.memory` exceeds the engine's available memory, **then** its tile shows a warning "Needs more memory" but stays selectable.

**Implementation notes**
- API: `onboarding.installStarterApps` → `{ jobIds }` (reuses the `apps.install` pipeline), `onboarding.complete`.
- Data: `apps`, `app_mounts`, `app_env`, `jobs`; starter list is a fixed list of built-in store app ids.
- UI: Stepper, AppIcon tiles, Badge, Button.
- Edge cases: store index not yet synced or offline (use the built-in source bundled with hlabs; image pulls then fail per app and show as install failed on Home).

### US-ONB-20 · Skip starter apps
**Feature:** F-ONB-07 · **Priority:** P1 · **Phase:** 2 · **Screens:** `OnbApps`
**As** an admin, **I want** to skip installing apps, **so that** I can choose them myself in the App Store.

**Acceptance criteria**
- **Given** `OnbApps`, **when** the user presses "Skip", **then** no install jobs are created, `onboarding.complete` runs and `OnbDone` opens without the "Installing" row.
- **Given** onboarding completed with no apps, **when** the user opens the dashboard, **then** Home shows its empty state (`HomeEmpty`, see `04-home.md`).
- **Given** Back, **then** `OnbRemote` opens with its saved state.

**Implementation notes**
- API: `onboarding.complete`.
- UI: Button (secondary).

### US-ONB-21 · See a summary when setup is done
**Feature:** F-ONB-08 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbDone`
**As** an admin, **I want** a summary of what was set up, **so that** I know everything worked.

**Acceptance criteria**
- **Given** onboarding just completed, **when** `OnbDone` loads, **then** it shows "You're all set, <first word of display name>" (e.g. "You're all set, Hari") and "Your apps are installing. hlabs keeps running from the menu bar." (without the first sentence when no apps were picked).
- **Given** the summary, **then** it lists "Admin account · <username> · 2FA on|off", "Storage · This computer | <drive name> | <NAS address>", "Remote access · Tailscale connected | Home network only" and, if apps were picked, "Installing N apps" with their names (e.g. "Installing 3 apps · Jellyfin, Immich, Vaultwarden").
- The "Remote access" row is hidden until phase 3 ships and the "Installing" row until phase 2 ships (D-036).
- **Given** apps are installing, **then** the Installing row shows overall Progress from `app.installProgress` events and changes to "N apps ready" when all are running, or "N of M apps ready · 1 failed" when an install fails.
- **Given** no Stepper, **then** the page uses the same GlassCard layout as Welcome.

**Implementation notes**
- API: `auth.me`, `apps.list`, `network.status`, `events.stream` (`app.installProgress`, `app.stateChanged`).
- UI: GlassCard, List, ListRow, Progress, StatusDot, Button.
- Edge cases: on Linux headless the second sentence ends "hlabs keeps running in the background."; install failures are handled on Home, not here.

### US-ONB-22 · Finish onboarding and open the dashboard
**Feature:** F-ONB-08 · **Priority:** P1 · **Phase:** 1 · **Screens:** `OnbDone`
**As** an admin, **I want** to go to my dashboard once setup is done and never see setup again, **so that** I can start using hlabs.

**Acceptance criteria**
- **Given** `onboarding.complete` succeeds, **then** `settings.onboarding.completedAt` is set, step is `done`, the setup token is invalidated and `audit_log` records `onboarding.complete`.
- **Given** `onboarding.complete` is called while a required step is missing (no admin or no root storage location), **then** it returns `PRECONDITION_FAILED` with `hlabsCode` `ONBOARDING_INCOMPLETE` and the UI routes to the missing step.
- **Given** `OnbDone`, **when** the user presses "Open dashboard", **then** Home (`Main`) opens with the admin still signed in.
- **Given** the user reloads `/onboarding/done` after completion, **then** they are redirected to Home.
- **Given** completion, **then** the tray switches from its first-launch state to its normal running state within 5 s.

**Implementation notes**
- API: `onboarding.complete`.
- Data: `settings.onboarding`, `audit_log`.
- UI: Button (primary).

### US-ONB-23 · Find a backup to restore from
**Feature:** F-ONB-09 · **Priority:** P3 · **Phase:** 8 · **Screens:** `OnbRestore`
**As** a new user moving to a new computer, **I want** to point hlabs at my existing backup, **so that** I can bring back my apps, users and settings instead of setting up from scratch.

**Acceptance criteria**
- **Given** `OnbRestore`, **then** it shows "Back", "Restore from a backup", "Bring back your apps, users and settings, for example when moving to a new computer." and a single-choice list "Where is the backup" with any discovered locations first, then "External drive · Plug in the drive that has your backup" and "Cloud storage · S3-compatible bucket".
- **Given** hlabs finds an hlabs restic repository on an SMB share on the local network, **then** it appears as a row with its address and summary (e.g. "nas.local/Backups · Found on your network · 42 restore points · latest today 03:00").
- **Given** "External drive", **then** connected drives are listed as in US-ONB-15 and scanned for a repository; given "Cloud storage", **then** fields for endpoint, bucket, access key and secret key appear.
- **Given** a location is chosen, **then** the "Backup encryption password" field ("The password you set when adding this destination") is required and "Find restore points" is enabled.
- **Given** "Back", **then** `OnbWelcome` opens.

**Implementation notes**
- API: new `onboarding.findBackups` (query: discovered repositories on the LAN and connected drives with snapshot count and latest time; the count is only known when the repo can be read, otherwise shown as "Found on your network").
- Data: nothing is written until a restore starts.
- UI: List, ListRow (radio), TextField (password), Button.
- Edge cases: discovery takes up to 10 s and shows a loading row; SMB share that needs credentials asks for username and password.

### US-ONB-24 · Open the backup and continue to restore
**Feature:** F-ONB-09 · **Priority:** P3 · **Phase:** 8 · **Screens:** `OnbRestore`
**As** a new user, **I want** to unlock the backup with its password and pick a restore point, **so that** my old hlabs comes back on this computer.

**Acceptance criteria**
- **Given** a location and password, **when** the user presses "Find restore points", **then** hlabs opens the repository and, on success, continues to the restore flow (`RestoreFlow`, see `08-usage-backups.md`) scoped to "whole system".
- **Given** a wrong password, **then** the password field shows "That password doesn't unlock this backup." (`BACKUP_REPO_PASSWORD_WRONG`).
- **Given** the location is unreachable, **then** an error shows on the location row (`BACKUP_DEST_UNREACHABLE`).
- **Given** the chosen restore point, **then** it must include the backup's system part (tag `system`, 02 §2.9: the database copy, `<dataDir>/apps/*` and the secrets bundle); restore points without it are not offered for whole-system restore.
- **Given** a whole-system restore finishes, **then** app data and the system part (database, app config folders, secrets bundle decrypted with the repo password) have been restored, the daemon has restarted (02 §2.9), and users, apps and settings come from the backup, `settings.onboarding.completedAt` is set, and the browser goes to log in; the restored admin password and 2FA apply.
- **Given** the system check has not passed yet (no engine), **then** "Find restore points" first routes through `OnbSystem` and returns here after Continue.

**Implementation notes**
- API: new `onboarding.listRestorePoints({ destination, password })` → snapshots; `onboarding.restoreFromBackup({ destination, password, snapshotId })` → `{ jobId }`; allowed only before any user exists (setup token).
- Data: `backup_destinations` (the source is added as a destination after restore), `restores`, `jobs` kind `restore` (exclusive, invariant 5).
- Edge cases: restoring onto a different CPU architecture (apps without an image for it fail per app and show on Home); restore password is kept in the keychain for the new destination.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
