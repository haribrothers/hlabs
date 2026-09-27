# 03 · Sign in

Sign in is how every person in the household gets into hlabs and into the apps behind it: pick or type an account, enter a password, confirm a two-factor code, and land back where they were going. It also covers the moments around logging in: too many attempts, a forgotten password in a product that has no email, joining through an invite link, staying signed in, and being told plainly when an app hasn't been shared with you.

**Screens:** `LoginUsers` (P1), `LoginUsername` (P1), `Login` (P1), `Login2FA` (P1), `LoginLocked` (P2), `ForgotPassword` (P2), `AcceptInvite` (P2), `ResetLink` (P2).
**Depends on:** 01-install-tray.md (tray password reset), 02-onboarding.md (first admin, 2FA setup), 04-home.md (`Main`, `MemberHome` after login), 09-account-people.md (user list setting, invites, reset links, signed-in devices, log out button, 2FA management), 11-system-states.md (404 page, "You don't have access to this" page US-STATE-20, daemon down states)

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-AUTH-01 | Choose who's logging in | P1 | 1 | `LoginUsers` |
| F-AUTH-02 | Log in with username and password | P1 | 1 | `LoginUsername` |
| F-AUTH-03 | Remembered user | P1 | 1 | `Login` |
| F-AUTH-04 | Two-factor code and recovery code | P1 | 1 | `Login2FA` |
| F-AUTH-05 | Lockout after too many attempts | P2 | 1 | `LoginLocked` |
| F-AUTH-06 | Sessions, remember me and log out | P1 | 1 | `LoginUsername`, `Login` |
| F-AUTH-07 | App sign-in redirect and app access | P1 | 1 | `LoginUsername`, `Login`, `Login2FA` |
| F-AUTH-08 | Forgot password | P2 | 4 | `ForgotPassword`, `ResetLink` |
| F-AUTH-09 | Accept invite | P2 | 3 | `AcceptInvite` |

## User stories

### US-AUTH-01 · Pick my account from the user list
**Feature:** F-AUTH-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `LoginUsers`
**As** a family member, **I want** to tap my name instead of typing a username, **so that** logging in on a shared computer is quick.

**Acceptance criteria**
- **Given** the "Show the list of users" setting is on and no user is remembered on this device, **when** I open `https://hlabs.local/login`, **then** I see "Who's using hlabs?" and "Choose your account to log in" with one row per enabled user.
- **Given** the list is shown, **then** each row shows the user's initial on their avatar color, their display name and a role label ("Admin" or "Member"); admins are listed first, then members, each group sorted by display name.
- **Given** a user is disabled (`users.disabled_at` set), **then** they do not appear in the list.
- **Given** I click or tap a user row, or focus it and press Enter, **then** I go to the `Login` screen with that user preselected ("Welcome back, <display name>", "@<username> · <role>") and the password field focused.
- **Given** the list is loading, **then** three skeleton rows show; **given** the request fails, **then** the page falls back to `LoginUsername` so login still works.
- **Given** any user row, **then** it is a focusable button with an accessible name "<display name>, <role>", and arrow keys move focus between rows.

**Implementation notes**
- API: `auth.listLoginUsers` (public) returns `{ id, username, displayName, role, avatarColor }[]` for enabled users only; nothing else (no last active, no 2FA state).
- Data: `users`; `settings` key for the user-list toggle (owned by 09-account-people.md, default on).
- UI: GlassCard, List, ListRow, Badge (role), Logo. Footer text "Admins can hide this list in Settings › Users".
- Edge: a user list of one admin still shows the list (plus "Other user"); display names are escaped, never rendered as HTML.

### US-AUTH-02 · Log in as another user or with the list hidden
**Feature:** F-AUTH-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `LoginUsers`, `LoginUsername`
**As** anyone signing in, **I want** to type a username when my name isn't listed or the list is hidden, **so that** I can always reach the login form.

**Acceptance criteria**
- **Given** the list is shown, **when** I choose "Other user · Enter username", **then** I go to `LoginUsername` with the Username field focused and empty.
- **Given** an admin has turned "Show the list of users" off, **when** anyone opens `/login`, **then** `auth.listLoginUsers` returns an empty list, `LoginUsers` is never shown and `LoginUsername` opens directly.
- **Given** the list is hidden, **then** `LoginUsername` does not show the "All users" back link.
- **Given** the list is shown and I am on `LoginUsername`, **when** I choose "All users", **then** I return to `LoginUsers`.
- **Given** the list is hidden, **when** I call `auth.listLoginUsers` directly, **then** the response is `[]` (the server enforces hiding, not the UI).

**Implementation notes**
- API: `auth.listLoginUsers`.
- Data: `settings` (user-list toggle).
- UI: ListRow for "Other user"; routing in TanStack Router `/login` route decides which screen to show (see US-AUTH-05).
- Edge: toggling the setting while the login page is open takes effect on next load; no live update needed.

### US-AUTH-03 · Log in with username and password
**Feature:** F-AUTH-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `LoginUsername`
**As** anyone with an account, **I want** to log in with my username and password, **so that** I can reach my Home screen and apps.

**Acceptance criteria**
- **Given** I am on `LoginUsername`, **then** I see "Log in to hlabs", "Use the username your admin gave you", a Username field (placeholder "e.g. hari"), a Password field, a "Remember me on this device" switch (off by default), a "Log in" button and a "Forgot password?" link.
- **Given** either field is empty, **then** "Log in" is disabled; pressing Enter in the Password field submits when both are filled.
- **Given** I type "Hari " as username, **when** I submit, **then** it is trimmed and lowercased to "hari" before lookup.
- **Given** the username and password are correct and the user has no two-factor, **when** I submit, **then** a session is created and I land on `Main` (admin) or `MemberHome` (member), or on the `next` destination (US-AUTH-18).
- **Given** the user has two-factor on, **when** the password is correct, **then** I go to `Login2FA` and no session exists yet.
- **Given** "Log in" is pressed, **then** the button shows a spinner and both fields are read-only until the response arrives.
- **Given** the page footer, **then** it shows the host I reached hlabs on (e.g. "hlabs.local · secured with HTTPS", or the tailnet name when on Tailscale).

**Implementation notes**
- API: `auth.login` `{ username, password, remember }` → `{ status: 'ok' }` or `{ status: 'totp_required', challengeId }`.
- Data: `users`, `sessions`, `login_attempts`, `audit_log` (`auth.login.succeeded`).
- UI: GlassCard, TextField (username: `autocomplete="username"`, `autocapitalize="none"`; password: `autocomplete="current-password"`), Switch, Button, Logo.
- A new random session id is issued on every successful login (no session fixation). `auth.login` requires `Origin` to be a dashboard host; the CSRF header applies once a session exists.

### US-AUTH-04 · See a clear error when login fails
**Feature:** F-AUTH-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `LoginUsername`
**As** anyone signing in, **I want** a clear message when my details are wrong, **so that** I know to try again without the page revealing which accounts exist.

**Acceptance criteria**
- **Given** the username doesn't exist, the password is wrong, or the account is disabled, **when** I submit, **then** I see the same inline error "Username or password is incorrect." under the Password field, the password is cleared and focused, and the username is kept.
- **Given** an unknown username, **then** the server still runs an Argon2id verify against a dummy hash so response time matches a wrong password.
- **Given** any failed attempt, **then** a `login_attempts` row (`success = 0`) and an `audit_log` row are written with the username as typed and the client IP.
- **Given** the fifth failure in 15 minutes for the same username and IP, **then** the response is `AUTH_LOCKED` and I go to `LoginLocked` (US-AUTH-12).
- **Given** the daemon can't be reached, **then** the form shows "Can't reach hlabs right now. Try again in a moment." and keeps what I typed.
- **Given** the error appears, **then** it is announced to screen readers (`aria-live="polite"`) and linked to the Password field with `aria-describedby`.

**Implementation notes**
- API: `auth.login`; `hlabsCode` values `AUTH_INVALID_CREDENTIALS`, `AUTH_LOCKED`.
- Data: `login_attempts`, `audit_log`.
- Client IP comes from `X-Forwarded-For` set by Caddy; the daemon trusts it only on loopback connections.

### US-AUTH-05 · Open the right login screen
**Feature:** F-AUTH-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `LoginUsername`, `LoginUsers`, `Login`
**As** anyone signing in, **I want** `/login` to open the screen that fits this device, **so that** I take the fewest steps.

**Acceptance criteria**
- **Given** a remembered user is stored on this device, **when** I open `/login`, **then** `Login` opens for that user.
- **Given** no remembered user and the user list is shown, **then** `LoginUsers` opens.
- **Given** no remembered user and the list is hidden (or empty), **then** `LoginUsername` opens.
- **Given** I already have a valid session, **when** I open `/login`, **then** I am sent to the valid `next` destination or to Home without seeing a form.
- **Given** onboarding is not complete (`onboarding.status`), **when** I open `/login`, **then** I am sent to onboarding instead.
- **Given** any of these screens, **then** the `next` query parameter is kept on every link between them (All users, Other user, Use another account, Back).

**Implementation notes**
- API: `auth.me` (session check), `auth.listLoginUsers`, `onboarding.status`.
- UI: route `/login` with child views `users`, `username`, `remembered`, `code`, `locked`, `forgot`.
- Edge: `PhoneLogin` (12-phone.md) uses the same procedures and rules at < 768px.

### US-AUTH-06 · Log back in as the remembered user
**Feature:** F-AUTH-03 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Login`
**As** a returning user, **I want** hlabs to greet me by name and ask only for my password, **so that** logging in again is one step.

**Acceptance criteria**
- **Given** I logged in successfully on this device before, **when** I open `/login`, **then** I see my initial on my avatar color, "Welcome back, <display name>", "@<username> · <role>", a focused Password field, "Log in", "Not <display name>? Use another account" and "Forgot password?".
- **Given** I enter the right password, **then** the same flow as US-AUTH-03 applies (two-factor if on, then Home or `next`).
- **Given** I enter a wrong password, **then** I see "Password is incorrect." and the password is cleared.
- **Given** the list of users is shown, **then** an "All users" link returns to `LoginUsers`; when hidden, the link is not shown.
- **Given** the remembered user no longer exists or has been disabled, **when** I submit, **then** I get the same error as a wrong password (no account-state leak) and the remembered user is kept until I choose "Use another account".

**Implementation notes**
- The remembered user is stored client-side only: `localStorage` key `hlabs.lastUser` = `{ username, displayName, role, avatarColor }`, written after every successful login (password, 2FA or recovery code). It holds no secret.
- API: `auth.login` with the stored username.
- UI: GlassCard, TextField, Button, Badge. Role shown is the one saved at last login; it refreshes on next login.

### US-AUTH-07 · Switch to another account
**Feature:** F-AUTH-03 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Login`, `LoginUsers`, `LoginUsername`
**As** someone using a shared device, **I want** to choose "Use another account", **so that** I can log in as myself instead of the last person.

**Acceptance criteria**
- **Given** I am on `Login`, **when** I choose "Not Hari? Use another account", **then** `hlabs.lastUser` is removed from this device.
- **Given** the user list is shown, **then** I go to `LoginUsers`; **given** it is hidden, **then** I go to `LoginUsername` with empty fields.
- **Given** I then log in as a different user, **then** that user becomes the remembered user.
- **Given** `localStorage` is unavailable (private window), **then** `Login` is never shown and the flow starts at `LoginUsers` or `LoginUsername`.

**Implementation notes**
- No API call; client-only.
- Edge: log out (US-AUTH-16) keeps the remembered user so the next login is one step; only "Use another account" clears it.

### US-AUTH-08 · Enter my two-factor code
**Feature:** F-AUTH-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Login2FA`
**As** a user with two-factor on, **I want** to type the 6-digit code from my authenticator app, **so that** someone with only my password can't get in.

**Acceptance criteria**
- **Given** my password was correct and two-factor is on, **then** I see "Enter your code", "Open your authenticator app and type the 6-digit code for hlabs.", six digit boxes, "Verify", "Back" and "Use a recovery code"; the first box is focused.
- **Given** I type a digit, **then** focus moves to the next box; Backspace in an empty box moves back; non-digits are ignored; pasting "123456" or "123 456" fills all six boxes.
- **Given** all six digits are filled, **then** the code is submitted automatically; "Verify" is enabled only when six digits are present.
- **Given** a correct code (RFC 6238, 30 s, ±1 step), **then** the session is created and I go to Home or `next`.
- **Given** a wrong code, **then** I see "That code didn't work. Check the time on your phone and try again.", the boxes clear and the first is focused; the failure counts toward lockout (US-AUTH-12).
- **Given** a code that was already accepted in the same 30 s step, **then** it is rejected (no replay).
- **Given** the challenge is older than 5 minutes, **when** I submit, **then** I go back to the password screen with "Your login timed out. Enter your password again."
- **Given** I choose "Back", **then** I return to the password screen (`Login` or `LoginUsername`) and the challenge is discarded.

**Implementation notes**
- API: `auth.verifyTotp` `{ challengeId, code }`; `hlabsCode` `AUTH_TOTP_INVALID`, `AUTH_CHALLENGE_EXPIRED`, `AUTH_LOCKED`.
- Data: `user_totp` (`secret_ref` read from the keychain), `login_attempts`, `audit_log`. Challenges are held in daemon memory (id, userId, remember, createdAt), max 5 minutes; the last used TOTP step per user is kept in memory for replay protection.
- UI: six TextField inputs (`inputmode="numeric"`, first has `autocomplete="one-time-code"`), group label "6-digit code", each box labelled "Digit 1" to "Digit 6"; Button.

### US-AUTH-09 · Log in with a recovery code
**Feature:** F-AUTH-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Login2FA`
**As** a user who lost my phone, **I want** to use one of my saved recovery codes, **so that** I can still get in.

**Acceptance criteria**
- **Given** I am on `Login2FA`, **when** I choose "Use a recovery code", **then** the digit boxes are replaced by one "Recovery code" field (placeholder "xxxx-xxxx") and the link changes to "Use my authenticator app".
- **Given** I type the code with or without the dash, in any case, **then** it is normalised to lowercase `xxxx-xxxx` before checking.
- **Given** an unused code that matches, **then** it is marked used (`recovery_codes.used_at`), I am logged in, and a Toast says "Recovery code used. You have <n> left." where n is the unused count.
- **Given** 2 or fewer codes are left after use, **then** the Toast adds "Make new codes in Settings › Account." with an action to `TwoFactorManage`.
- **Given** a used or wrong code, **then** I see "That recovery code didn't work." and the failure counts toward lockout.
- **Given** a recovery-code login, **then** an `audit_log` entry `auth.login.recovery_code` is written and a `notifications` row (severity `warning`) is created for the user.

**Implementation notes**
- API: `auth.useRecoveryCode` `{ challengeId, code }`.
- Data: `recovery_codes` (Argon2id-hashed; compare against each unused hash), `audit_log`, `notifications`.
- UI: TextField, Toast.
- Edge: two tabs using the same code at once: only one succeeds (update `WHERE used_at IS NULL`).

### US-AUTH-10 · Set up two-factor when an admin requires it
**Feature:** F-AUTH-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Login2FA`, `LoginUsername`
**As** a member whose admin turned on "Require two-factor for everyone", **I want** to be taken to two-factor setup right after logging in, **so that** my account meets the household rule.

**Acceptance criteria**
- The "Require two-factor for everyone" policy is hidden until phase 3 ships (D-036), and the criteria that depend on it apply from phase 3. The `/auth/verify` part (302 to the setup flow when `mustSetupTotp` is true) applies from phase 2, when forward auth and app hostnames arrive (US-AUTH-17).
- **Given** 2FA is required and my account has no two-factor, **when** my password is correct, **then** a session is created but `auth.me` returns `mustSetupTotp: true`.
- **Given** `mustSetupTotp` is true, **then** every route except two-factor setup and log out redirects to the setup flow in 09-account-people.md, and `/auth/verify` returns 302 to that flow for app hostnames.
- **Given** I finish setup, **then** `mustSetupTotp` becomes false and I continue to `next` or Home.

**Implementation notes**
- API: `auth.me` (adds `mustSetupTotp`), `account.totp.begin` / `account.totp.confirm` (owned by 09).
- Data: `user_totp`, `settings` (require-2FA flag, owned by 09).
- Edge: admins are subject to the same rule.

### US-AUTH-11 · Keep two-factor codes in step with the server clock
**Feature:** F-AUTH-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Login2FA`
**As** a user with two-factor on, **I want** codes to work even if my phone clock is slightly off, **so that** I'm not locked out by a few seconds.

**Acceptance criteria**
- **Given** my code is from the previous or next 30 s step, **then** it is accepted.
- **Given** my code is two or more steps away, **then** it is rejected as wrong.
- **Given** the TOTP secret can't be read from the keychain, **then** I see "hlabs can't check codes right now. Use a recovery code or ask your admin." and the attempt does not count toward lockout.

**Implementation notes**
- `hlabsCode` `AUTH_SECRET_UNAVAILABLE`; logged to `audit_log`.
- Unit-test the ±1 window with a fixed clock.

### US-AUTH-12 · Pause logins after too many attempts
**Feature:** F-AUTH-05 · **Priority:** P2 · **Phase:** 1 · **Screens:** `LoginLocked`
**As** an admin, **I want** hlabs to pause logins for an account after repeated failures, **so that** nobody can guess passwords or codes.

**Acceptance criteria**
- **Given** 5 failed attempts (password, two-factor code or recovery code) in 15 minutes for the same username and IP, **then** that username+IP pair is locked for 15 minutes and I see `LoginLocked`: "Too many attempts", "For your security, logging in as @<username> is paused.", a countdown and "Try again in <m:ss>".
- **Given** the lock is active, **then** the countdown ticks every second from the server's `retryAfter`; the "Try again" button is disabled until it reaches 0:00, then it returns me to the password screen.
- **Given** the lock is active, **when** any login for that username from that IP arrives, **then** it returns `AUTH_LOCKED` without checking the password and does not extend the lock.
- **Given** the same username from a different IP, or a different username from the same IP, **then** login works normally.
- **Given** I choose "Use another account", **then** I go to `LoginUsers` (or `LoginUsername` if hidden) and the remembered user is cleared; **given** I choose "Forgot password?", **then** I go to `ForgotPassword`.
- **Given** a successful login, **then** earlier failures for that username+IP no longer count.
- **Given** the lock applies to a username that doesn't exist, **then** it behaves the same (no account-existence leak).

**Implementation notes**
- API: `auth.login`, `auth.verifyTotp`, `auth.useRecoveryCode` all return `TRPCError` `TOO_MANY_REQUESTS` with `hlabsCode` `AUTH_LOCKED` and `cause.retryAfterSeconds`.
- Data: `login_attempts` (count failures `at > now - 15 min` after the last success); prune rows older than 30 days in the scheduler.
- UI: GlassCard, Button (disabled with countdown), countdown text in `role="timer"`, announced only on arrival, not every tick.

### US-AUTH-13 · Tell the admin about repeated failed logins
**Feature:** F-AUTH-05 · **Priority:** P2 · **Phase:** 1 · **Screens:** `LoginLocked`
**As** an admin, **I want** a notification when an account gets locked, **so that** I notice someone trying to get in.

**Acceptance criteria**
- **Given** a lock starts, **then** one `notifications` row is created for all admins (`user_id = null`, severity `warning`) with title "Repeated failed logins" and body "5 failed logins for @<username> from <ip>. Logging in as @<username> is paused for 15 minutes." (D-045).
- **Given** further attempts during the same lock, **then** no additional notification is created.
- **Given** `LoginLocked`, **then** it shows "The admin gets a notification about repeated failed logins."
- **Given** a lock, **then** an `audit_log` row `auth.locked` with username and IP is written.

**Implementation notes**
- Data: `notifications`, `audit_log`; event `notification.created` on the bus.
- UI: shown in HomeNotifications (04-home.md).

### US-AUTH-14 · Stay signed in, or not
**Feature:** F-AUTH-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `LoginUsername`, `Login`
**As** anyone signed in, **I want** to choose whether this device keeps me signed in, **so that** my own laptop stays logged in but a shared one doesn't.

**Acceptance criteria**
- **Given** "Remember me on this device" is off, **then** the `hlabs_session` cookie has no `Max-Age` (ends with the browser session) and the server session expires after 12 hours without activity.
- **Given** it is on, **then** the cookie has `Max-Age` of 30 days and the server session slides to 30 days from last activity.
- **Given** any request with a valid session, **then** `last_seen_at` and `expires_at` are updated at most once per minute.
- **Given** the cookie, **then** it is `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, with `Domain=.hlabs.local` (or the dashboard's current host when reached by tailnet name or fallback port).
- **Given** the `Login` screen (remembered user), **then** it has no remember switch and uses the choice from that user's last login on this device.
- **Given** a session is expired or revoked, **when** I make any request, **then** tRPC returns `UNAUTHORIZED` and the app goes to `/login?next=<current path>`.

**Implementation notes**
- API: `auth.login` (`remember`), `auth.me`.
- Data: `sessions` (id stored as SHA-256 hash; `remember`, `user_agent`, `ip`).
- The last remember choice is stored in `hlabs.lastUser.remember` (client) so `Login` can send it.

### US-AUTH-15 · Get signed out when my session is revoked
**Feature:** F-AUTH-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Login`
**As** anyone signed in, **I want** a device to be signed out right away when I revoke it or change my password, **so that** a lost phone can't keep access.

**Acceptance criteria**
- **Given** my session is revoked (from Signed-in devices, a password change, turning off 2FA, being disabled, or an admin revoking it), **then** a `session.revoked` event reaches that client within 5 seconds.
- **Given** the client receives `session.revoked`, **then** it goes to `/login` and shows a Toast "You were logged out on this device."
- **Given** a revoked session cookie, **when** it reaches `/auth/verify`, **then** the app request is redirected to login.

**Implementation notes**
- API: `events.stream` (`session.revoked`), `auth.revokeSession` (09).
- Data: `sessions.revoked_at`.

### US-AUTH-16 · Log out
**Feature:** F-AUTH-06 · **Priority:** P1 · **Phase:** 1 · **Screens:** `Login`
**As** anyone signed in, **I want** to log out, **so that** the next person on this device can't use my account.

**Acceptance criteria**
- **Given** I choose "Log out" (Settings › Account, 09-account-people.md), **then** the current session is revoked, the cookie is cleared on the same domain it was set on, and I land on `Login` with my name shown.
- **Given** I log out, **then** other sessions of mine stay active.
- **Given** logout succeeds, **then** open app tabs on `*.hlabs.local` fail their next forward-auth check and redirect to login.
- **Given** the request fails (daemon down), **then** the cookie is still cleared client-side where possible and I land on `/login`.
- **Given** a logout, **then** `audit_log` gets `auth.logout`.

**Implementation notes**
- API: `auth.logout` (authed mutation, requires the CSRF header).
- Data: `sessions`, `audit_log`.
- Since the cookie is `HttpOnly`, clearing happens by the server's `Set-Cookie` with `Max-Age=0`.

### US-AUTH-17 · Protect every app with forward auth
**Feature:** F-AUTH-07 · **Priority:** P1 · **Phase:** 2 · **Screens:** `LoginUsername`, `Login`
**As** an admin, **I want** every app hostname to check the hlabs session, **so that** nobody reaches household apps without logging in.

**Acceptance criteria**
- **Given** a request to `https://<app>.hlabs.local` with a valid session and access to that app, **then** `/auth/verify` returns 200 with `X-Hlabs-User` (username) and `X-Hlabs-Role`, and Caddy proxies the request.
- **Given** no or invalid session and a top-level browser navigation (`GET`, `Accept` includes `text/html`), **then** it returns 302 to `https://<dashboard host>/login?next=<original URL, URL-encoded>`.
- **Given** no session and any other request (XHR, API, non-GET), **then** it returns 401 with no body so apps don't follow a redirect into HTML.
- **Given** an app with `auth_mode = none`, **then** Caddy does not call `/auth/verify` for it.
- **Given** a host that matches no installed app, **then** it returns 404 with the 404 page (11-system-states.md); this is an unknown URL, not an access denial.
- **Given** 100 requests per second from one browser, **then** `/auth/verify` answers in under 5 ms p95 (session lookup and access check cached in memory for 10 seconds, cache cleared on revoke or access change).

**Implementation notes**
- Endpoint: `GET /auth/verify` (non-tRPC); reads `hlabs_session` and `X-Forwarded-Host`, `X-Forwarded-Method`, `X-Forwarded-Uri`.
- Data: `sessions`, `apps`, `app_access`.
- Strip any incoming `X-Hlabs-*` headers from client requests in Caddy config so apps can trust them.
- Phase 2: app hostnames and their Caddy routes arrive with apps in phase 2, so this story ships then.

### US-AUTH-18 · Return to the app I was opening after login
**Feature:** F-AUTH-07 · **Priority:** P1 · **Phase:** 1 · **Screens:** `LoginUsername`, `Login`, `Login2FA`
**As** anyone signing in, **I want** to land on the app I was trying to open, **so that** a bookmark to Immich takes me to Immich, not the Home screen.

**Acceptance criteria**
- **Given** `/login?next=https://immich.hlabs.local/photos`, **when** I log in (including two-factor), **then** the browser navigates to that URL.
- **Given** `next` is a path starting with a single `/` (e.g. `/files`), **then** I go to that dashboard route.
- **Given** `next` is an `https` URL whose host is the dashboard host, an installed app's hostname, the tailnet host (`hlabs.<tailnet>.ts.net`) or an installed app's tailnet port address (`https://hlabs.<tailnet>.ts.net:<port>`, D-012), **then** it is allowed.
- **Given** `next` is anything else (other domains, `//evil.com`, `javascript:`, `http:`, longer than 2048 characters), **then** it is ignored and I go to Home.
- **Given** `next` is kept through `LoginUsers`, `Login`, `Login2FA`, `LoginLocked` and "Use another account", **then** it is still applied after the final successful step.

**Implementation notes**
- Validate `next` on the server in `auth.login` / `auth.verifyTotp` / `auth.useRecoveryCode` and return `{ redirectTo }`; the client only follows `redirectTo`.
- Unit-test the allow-list with the cases above.

### US-AUTH-19 · See a "no access" page for apps not shared with me
**Feature:** F-AUTH-07 · **Priority:** P1 · **Phase:** 2 · **Screens:** none (server-rendered page, see Open questions)
**As** a family member, **I want** a friendly page when I open an app the admin hasn't shared with me, **so that** I know who to ask instead of seeing a broken page.

**Acceptance criteria**
- **Given** I am a member and the app is not in my `app_access`, **when** I open its hostname, **then** `/auth/verify` returns 403 with the "You don't have access to this" page (US-STATE-20): heading "You don't have access to this", "<app name> hasn't been shared with you. Ask <admin display name> to share it with you.", and a "Go to Home" button linking to the dashboard. There is no redirect and no 404.
- **Given** I am an admin, **then** I never get this page (admins can open every app).
- **Given** the request is not a browser navigation, **then** 403 is returned with no body.
- **Given** the admin later grants access, **then** reloading the app works within 10 seconds (verify cache).
- **Given** the page, **then** it uses the hlabs look (logo, glass card) in light and dark, works at 360px width and has no external requests.

**Implementation notes**
- Rendered by the daemon from a static template (no SPA) that matches the US-STATE-20 page, with escaped app and admin names; admin name is the oldest enabled admin. Inside the dashboard, a signed-in user who opens a page they can't use gets the same US-STATE-20 page from the SPA (07 §7.4).
- Phase 2: app hostnames arrive with apps in phase 2, so this story ships then.
- Data: `apps`, `app_access`, `users`.

### US-AUTH-20 · Understand how to reset a forgotten password
**Feature:** F-AUTH-08 · **Priority:** P2 · **Phase:** 4 · **Screens:** `ForgotPassword`
**As** anyone who forgot their password, **I want** to be told exactly how resets work without email, **so that** I know what to do next.

**Acceptance criteria**
- **Given** I choose "Forgot password?" on `LoginUsername`, `Login` or `LoginLocked`, **then** I see "Reset your password" and "hlabs doesn't use email, so resets happen at home." with three options: "Ask your admin", "Admin on a Mac or Linux desktop", "Admin on a Linux server".
- **Given** the options, **then** they read: "Family members: your admin can make a reset link for you from Settings › Users."; "On the computer running hlabs, open the hlabs menu-bar icon and choose Reset password…. You'll confirm with that computer's own login."; "Connect to the server and run `sudo hlabs reset-password <username>`".
- **Given** I came from a screen with a known username, **then** the command shows that username; otherwise it shows `<username>`. The command has a copy button.
- **Given** "Back to log in", **then** I return to the screen I came from with `next` kept.
- **Given** the screen, **then** there is no way to reset a password with a recovery code (see US-AUTH-21 and decision D-009); the "Have a recovery code?" link from the design is not shown.

**Implementation notes**
- No API call to render. The tray reset (`tray.resetPassword`) and CLI belong to 01-install-tray.md; the CLI talks to the daemon with the tray token.
- UI: GlassCard, List, ListRow, Button; command in a monospace block.

### US-AUTH-21 · Recovery codes never reset a password
**Feature:** F-AUTH-08 · **Priority:** P2 · **Phase:** 4 · **Screens:** `ForgotPassword`, `Login2FA`
**As** an admin, **I want** recovery codes to only replace the two-factor step, **so that** a leaked recovery code alone can't take over an account.

**Acceptance criteria**
- **Given** `ForgotPassword`, **when** it renders, **then** it offers only the admin reset link, the tray reset and the server command; there is no recovery-code form.
- **Given** a user who knows their password but lost their authenticator, **when** they reach `Login2FA`, **then** "Use a recovery code" is how they get in (US-AUTH-09), after which they can turn two-factor off and on again in Settings › Account.
- **Given** any API call to `auth.resetPassword`, **when** the input has no valid admin reset token, **then** it fails with `hlabsCode` `AUTH_RESET_EXPIRED` and changes nothing.

**Implementation notes**
- API: `auth.resetPassword` accepts only `{ token, newPassword }` (the union form suggested earlier is dropped).
- Decision: D-009 in docs/prd/12-decisions.md.

### US-AUTH-22 · Set a new password from an admin's reset link
**Feature:** F-AUTH-08 · **Priority:** P2 · **Phase:** 4 · **Screens:** `ForgotPassword`, `ResetLink`
**As** a family member, **I want** to open the reset link my admin gave me and choose a new password, **so that** I can log in again.

**Acceptance criteria**
- **Given** an admin created a link in Settings › Users (`users.resetPasswordLink`), **when** I open `https://hlabs.local/reset/<token>`, **then** I see "Choose a new password", a New password field and a "Set password" button, in the same card layout as `ForgotPassword`.
- **Given** a valid token (unused, under 15 minutes old), **when** I submit a valid password, **then** it is saved, the token is marked used, my other sessions are revoked, I am logged in and sent to Home.
- **Given** an expired, used or unknown token, **when** I submit, **then** I see "This link has expired. Ask your admin for a new one." and a "Back to log in" link.
- **Given** password rules, **then** a password under 12 characters shows "Use at least 12 characters." and a common one shows "This password is too common. Try a longer phrase."

**Implementation notes**
- API: `auth.resetPassword` `{ token, newPassword }`; `hlabsCode` `AUTH_RESET_EXPIRED`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_COMMON`.
- Data: `password_resets` (`created_via = admin`, token stored hashed), `users`, `sessions`, `audit_log`.

### US-AUTH-23 · Open an invite link
**Feature:** F-AUTH-09 · **Priority:** P2 · **Phase:** 3 · **Screens:** `AcceptInvite`
**As** a new user, **I want** the invite link to show who invited me and what I'll get, **so that** I trust it before creating an account.

**Acceptance criteria**
- **Given** a valid invite, **when** I open `https://hlabs.local/invite/<token>`, **then** I see the inviter's initial, "<inviter> invited you to hlabs · home cloud", "Create your account", and "You'll get your own Home screen and a private Files folder. <inviter> has shared <n> apps with you."
- **Given** the invite shares 0 apps, **then** the sentence about shared apps is left out; **given** 1 app, **then** it reads "1 app".
- **Given** the invite is for an admin, **then** the apps sentence is replaced with "You'll be an admin and can open every app."
- **Given** the invite is expired, used or revoked, **then** the form is not shown and I see "This invite doesn't work anymore" with "Ask <inviter> for a new link." and a "Go to log in" link.
- **Given** I am already signed in, **then** I see "You're logged in as @<username>." with "Log out and continue" before the form.

**Implementation notes**
- API: `invites.inspect` `{ token }` (public) → `{ status: 'valid' | 'expired' | 'used' | 'revoked', inviterName, displayName, role, appCount }`; unknown tokens return `expired` shape without inviter.
- Data: `invites`, `invite_app_access`, `users`.
- UI: GlassCard, Logo, Badge.

### US-AUTH-24 · Create my account from an invite
**Feature:** F-AUTH-09 · **Priority:** P2 · **Phase:** 3 · **Screens:** `AcceptInvite`
**As** a new user, **I want** to choose my name, username and password, **so that** I have my own account.

**Acceptance criteria**
- **Given** the form, **then** it has "Your name" (prefilled from the invite name, placeholder "First name"), "Username" (placeholder "lowercase, e.g. anu"), "Password" (placeholder "At least 12 characters"), a "Join hlabs" button and "This invite link works once and expires in 7 days."
- **Given** I type a username with capitals, **then** it is lowercased as I type; **given** it doesn't match `^[a-z][a-z0-9-]{2,31}$` (D-014), **then** I see "Use 3–32 lowercase letters, numbers and dashes, starting with a letter."
- **Given** the username is taken, **when** I submit, **then** I see "That username is taken." under the field (`USERNAME_TAKEN`).
- **Given** the password is too short or common (`PASSWORD_TOO_SHORT`, `PASSWORD_TOO_COMMON`), **then** the same messages as US-AUTH-22 appear.
- **Given** valid input, **when** I choose "Join hlabs", **then** in one transaction the user is created with the invite's role, `app_access` rows are copied from `invite_app_access` (members only), the invite gets `used_at`, and `users/<username>/` Home folder is created.
- **Given** two people submit the same invite at once, **then** only one account is created; the other sees "This invite doesn't work anymore".
- **Given** success, **then** a session is created (not remembered), `hlabs.lastUser` is set, and I go to `MemberHome` (member) or `Main` (admin); if two-factor is required for everyone, US-AUTH-10 applies first.
- **Given** acceptance, **then** `audit_log` gets `invite.accepted` and the inviter gets a `notifications` row "<name> joined hlabs".

**Implementation notes**
- API: `invites.accept` `{ token, displayName, username, password }` → `{ redirectTo }`.
- Data: `invites` (update `WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now`), `users`, `app_access`, `audit_log`, `notifications`.
- UI: TextField (`autocomplete="name"`, `"username"`, `"new-password"`), Button.
- Edge: invite accept attempts are rate-limited like logins (5 failures per IP per 15 minutes) to stop token guessing.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
