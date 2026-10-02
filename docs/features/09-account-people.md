# 09 · Settings · account & people

The Settings window, the pages everyone uses to look after their own account (profile, password, two-factor login, signed-in devices, appearance), and the admin pages for the people in the household (users, invites, what each member can open, notification preferences). Admins see every Settings section; family members see only Account, Appearance, Notifications and About (07 §7.4).

**Screens:** `SettingsAccount` (P1), `ChangePassword` (P1), `TwoFactorManage` (P1), `SettingsUsers` (P2), `InviteDialog` (P1), `AppsAccess` (P1), `MemberSettings` (P1), `SettingsNotifications` (Nice to have), `SettingsAppearance` (P2)
**Depends on:** [02-onboarding](02-onboarding.md) (admin account, first 2FA), [03-sign-in](03-sign-in.md) (log in, accept invite, reset links), [04-home](04-home.md) (Home, bell, wallpaper, solid theme), [06-apps](06-apps.md) (apps and their access), [08-usage-backups](08-usage-backups.md) (live usage), [10-system-settings](10-system-settings.md) (the other Settings sections).

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-ACCT-01 | Settings window shell | P1 | 1 | `SettingsAccount`, `MemberSettings` |
| F-ACCT-02 | Account profile and signed-in devices | P1 | 1 | `SettingsAccount` |
| F-ACCT-03 | Change password | P1 | 1 | `ChangePassword` |
| F-ACCT-04 | Two-factor login and recovery codes | P1 | 1 | `TwoFactorManage`, `SettingsAccount` |
| F-ACCT-05 | People list and user management | P2 | 3 | `SettingsUsers` |
| F-ACCT-06 | Log-in screen and member policies | P2 | 3 | `SettingsUsers` |
| F-ACCT-07 | Invite someone | P1 | 3 | `InviteDialog` |
| F-ACCT-08 | Apps access per member | P1 | 3 | `AppsAccess` |
| F-ACCT-09 | Family member's Settings | P1 | 3 | `MemberSettings` |
| F-ACCT-10 | Notification preferences | Nice to have | 9 | `SettingsNotifications` |
| F-ACCT-11 | Appearance | P2 | 7 | `SettingsAppearance` |

## User stories

### US-ACCT-01 · Settings sections depend on role
**Feature:** F-ACCT-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsAccount`, `MemberSettings`
**As** anyone signed in, **I want** the Settings window to list only the sections I can use, **so that** I never land on a page that refuses me.

**Acceptance criteria**
- **Given** I am an admin, **when** I open Settings, **then** the sidebar ("Settings sections") lists, in this order: Account, Users, Appearance, Notifications, Network & remote access, Storage, Engine & startup, Backups, Updates, Advanced, About.
- **Given** I am a member, **when** I open Settings, **then** the sidebar lists only Account, Appearance, Notifications, About (07 §7.4).
- **Given** a section depends on a feature from a later phase (Users and people policies phase 3, Backups phase 5, Appearance phase 7, Notifications phase 9, and so on), **then** it is hidden until that phase ships (D-036).
- **Given** I open Settings with no section in the URL, **when** it loads, **then** Account is selected and the URL is `/settings/account`.
- **Given** I am a member, **when** I type `/settings/users` (or any admin-only section) into the address bar, **then** I see the "You don't have access to this" page (US-STATE-20), with no redirect, and no admin data is requested. An unknown section URL shows the 404 page.
- **Given** a member calls any `adminProcedure` directly, **when** the request arrives, **then** the daemon returns `FORBIDDEN` regardless of what the UI shows.
- **Given** my role is changed by an admin while Settings is open, **when** the `auth.me` query is refetched (on window focus or next navigation), **then** the sidebar updates to the new role's sections.

**Implementation notes**
- API: `auth.me` (role drives the section list). Section routes are TanStack Router file routes under `/settings/$section`.
- UI: GlassCard window, List + ListRow for the sidebar, selected row uses the accent colour. Section list is a single typed array in `apps/web` with an `adminOnly` flag; the router guard and the sidebar both read it.
- Edge: Admin-only sections are enforced by `adminProcedure` (07 §7.4); the UI guard is convenience only.

### US-ACCT-02 · Moving around Settings on desktop, phone and keyboard
**Feature:** F-ACCT-01 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsAccount`, `MemberSettings`
**As** anyone signed in, **I want** Settings to work well with a mouse, a keyboard and a phone, **so that** I can change things from any device.

**Acceptance criteria**
- **Given** a window width of 1024px or more, **when** Settings is open, **then** it shows as a window over the wallpaper with the sidebar on the left and the selected section on the right.
- **Given** a width under 768px, **when** I open Settings, **then** I see the list of sections first, tapping one pushes that section as a sheet with a back control labelled "Settings".
- **Given** focus is in the sidebar, **when** I press Up/Down, **then** focus moves between sections; Enter opens the focused section and moves focus to its heading.
- **Given** any section is open, **when** I press Escape with no dialog open, **then** the Settings window closes and focus returns to where it was on Home.
- **Given** the Dock (or phone tab bar) is visible, **when** I look at it, **then** Settings is shown as the current area.

**Implementation notes**
- UI: GlassCard, List, ListRow, Dock (TabBar on phone). Sidebar uses `role="navigation"` with `aria-current="page"` on the selected row.
- Edge: deep link to a section on phone opens straight to that section with the back control present.

### US-ACCT-03 · See and edit my profile
**Feature:** F-ACCT-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsAccount`
**As** anyone signed in, **I want** to see my name and role and change how I appear, **so that** others in the house recognise me.

**Acceptance criteria**
- **Given** I open Account, **when** it loads, **then** I see my avatar (first letter of my display name on my avatar colour), my display name, and "<username> · Admin" or "<username> · Member".
- **Given** I click "Edit profile", **when** the Dialog opens, **then** I can change display name (1–40 characters, trimmed), avatar colour (one of the design-system avatar colours) and language; username is shown read-only.
- **Given** I save a valid profile, **when** the mutation succeeds, **then** the Dialog closes, a Toast says "Profile updated", and my name updates in Account, the Home greeting and the Users list without a reload.
- **Given** I clear the display name, **when** I try to save, **then** Save is disabled and the field shows "Enter a name".
- **Given** the save fails, **when** the error returns, **then** the Dialog stays open with my edits and shows the mapped error message.

**Implementation notes**
- API: `account.get` (new, see API additions), `account.update`.
- Data: `users.display_name`, `users.avatar_color`, `users.locale`; write `audit_log` action `account.update`.
- UI: ListRow, Dialog, TextField, Button, Toast.

### US-ACCT-04 · See the devices I am signed in on
**Feature:** F-ACCT-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsAccount`
**As** anyone signed in, **I want** a list of my signed-in devices, **so that** I can spot one I don't recognise.

**Acceptance criteria**
- **Given** I have active sessions, **when** I open Account, **then** "Signed-in devices" lists each non-revoked, non-expired session as "<device> · <browser>" over "<network> · <last seen>", newest activity first.
- **Given** a session is the one I am using, **when** it is listed, **then** it is first, shows "This device" instead of a Sign out button.
- **Given** a session was seen in the last 5 minutes, **when** it is listed, **then** its last-seen text is "active now"; otherwise relative time ("2 hours ago", "3 days ago").
- **Given** a session's IP is in `100.64.0.0/10` or on the tailnet host, **when** listed, **then** network reads "Tailscale"; a private LAN address reads "Home network".
- **Given** the device or browser can't be parsed from the user agent, **when** listed, **then** it shows "Unknown device" / "Browser".

**Implementation notes**
- API: `auth.listSessions` (returns only the caller's sessions, with a `current` flag).
- Data: `sessions` (`user_agent`, `ip`, `last_seen_at`, `expires_at`, `revoked_at`).
- UI: List, ListRow, Badge for "This device".
- Device name comes from user-agent parsing only (e.g. "Mac", "iPhone", "iPad", "Windows PC", "Linux PC"); hlabs does not know machine names. Unit-test the UA and IP classification with a fixture table.

### US-ACCT-05 · Sign out a device, or log out
**Feature:** F-ACCT-02 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsAccount`
**As** anyone signed in, **I want** to sign out another device or log out here, **so that** a lost phone or a shared laptop can't reach my things.

**Acceptance criteria**
- **Given** another session is listed, **when** I click its "Sign out", **then** the session is revoked, the row disappears, and a Toast says "Signed out <device>".
- **Given** a session was revoked, **when** that device makes its next request (dashboard or any app host), **then** it gets 401 / the `/auth/verify` 302 and lands on Login; an open dashboard on that device receives `session.revoked` and goes to Login within 2 seconds.
- **Given** I click "Log out", **when** it completes, **then** my current session is revoked, the cookie is cleared and I see Login.
- **Given** the revoke fails, **when** the error returns, **then** the row stays and an error Toast shows.

**Implementation notes**
- API: `auth.revokeSession`, `auth.logout`; event `session.revoked`.
- Data: `sessions.revoked_at`; `audit_log` action `session.revoke`.
- UI: Button (secondary, small), Toast.
- Edge: revoking an already expired session returns success (idempotent).

### US-ACCT-06 · Change my password
**Feature:** F-ACCT-03 · **Priority:** P1 · **Phase:** 1 · **Screens:** `ChangePassword`, `SettingsAccount`
**As** anyone signed in, **I want** to change my password, **so that** I can replace a weak or shared one.

**Acceptance criteria**
- **Given** Account › Security, **when** I look at Password, **then** it reads "Changed when you set up hlabs" if never changed, else "Changed <relative date>", with a "Change" button.
- **Given** I click "Change", **when** the Dialog opens, **then** it has "Current password", "New password" (with a strength hint), "Confirm new password", a checked and disabled "Sign out my other devices" checkbox, "Cancel" and "Change password".
- **Given** the new password is typed, **when** it has 12 or more characters and is not in the common list, **then** the hint reads "Strong · at least 12 characters"; under 12 it reads "Too short · at least 12 characters".
- **Given** all fields are valid and match, **when** I click "Change password", **then** the password is updated, every other session of mine is revoked, my current session stays, the Dialog closes and a Toast says "Password changed. Your other devices are signed out."
- **Given** focus is in the Dialog, **when** I press Enter in the last field, **then** it submits; Escape or "Cancel" closes without changes.

**Implementation notes**
- API: `account.changePassword` (`currentPassword`, `newPassword`); emits `session.revoked` for each revoked session.
- Data: `users.password_hash` (Argon2id per 07 §7.2), `users.password_changed_at` (new column), `sessions.revoked_at`; `audit_log` action `account.changePassword`.
- UI: Dialog, TextField (type password, show/hide toggle), Button.
- The checkbox reflects 07 §7.3 (always revoke others); see Open questions.

### US-ACCT-07 · Password change errors
**Feature:** F-ACCT-03 · **Priority:** P1 · **Phase:** 1 · **Screens:** `ChangePassword`
**As** anyone signed in, **I want** clear errors when a password change can't happen, **so that** I know what to fix.

**Acceptance criteria**
- **Given** the current password is wrong, **when** I submit, **then** "Current password" shows "That's not your current password" and no other field is cleared.
- **Given** the new password is in the bundled common-password list, **when** I submit, **then** "New password" shows "This password is too common. Try a longer phrase."
- **Given** confirm does not match, **when** I leave the confirm field or submit, **then** it shows "Passwords don't match" and "Change password" stays disabled.
- **Given** the new password equals the current one, **when** I submit, **then** "New password" shows "Choose a password you haven't used here".
- **Given** 5 wrong current passwords in 15 minutes, **when** I try again, **then** I see "Too many attempts. Try again in <n> minutes." and the attempt counts toward the login lockout for my username and IP.

**Implementation notes**
- API: `account.changePassword`; hlabsCodes `AUTH_INVALID_PASSWORD`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_COMMON`, `PASSWORD_UNCHANGED`, `AUTH_LOCKED`.
- Data: `login_attempts` for wrong current passwords.
- Test: validation runs on the server; the client check is a hint only.

### US-ACCT-08 · See my two-factor and recovery code status
**Feature:** F-ACCT-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `SettingsAccount`, `TwoFactorManage`
**As** anyone signed in, **I want** to see whether two-factor login is on and how many recovery codes I have left, **so that** I don't get locked out.

**Acceptance criteria**
- **Given** 2FA is on, **when** I view Account › Security, **then** "Two-factor login" reads "On · authenticator app" with "Manage", and "Recovery codes" reads "<n> of 10 unused" with "View".
- **Given** 2FA is off, **when** I view Security, **then** "Two-factor login" reads "Off" with a "Turn on" button and the Recovery codes row is hidden.
- **Given** 3 or fewer recovery codes are unused, **when** I view Security, **then** the Recovery codes row shows a warning Badge "Running low".
- **Given** I click "Manage" or "View", **when** TwoFactorManage opens, **then** it shows "Two-factor login", an "On" status, "Authenticator app" with "Added when you set up hlabs" (or "Added <date>"), and the recovery codes block titled "Recovery codes · <n> of 10 unused".
- **Given** I click "Done", **when** the dialog closes, **then** focus returns to the button that opened it.

**Implementation notes**
- API: `account.get` (returns `totpEnabledAt`, `recoveryCodesUnused`).
- Data: `user_totp.enabled_at`, `recovery_codes.used_at`.
- UI: ListRow, Badge, StatusDot, Dialog.

### US-ACCT-09 · View, download and print recovery codes
**Feature:** F-ACCT-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `TwoFactorManage`
**As** anyone signed in, **I want** to keep my recovery codes somewhere safe, **so that** I can log in if I lose my phone.

**Acceptance criteria**
- **Given** codes are stored hashed, **when** I open TwoFactorManage normally, **then** the 10 code slots show masked (`••••-••••`), used ones struck through with "Used", and the help text "Each code works once if you lose your phone. Keep them somewhere safe, like a password manager."
- **Given** I have just made new codes (US-ACCT-10) or just turned on 2FA, **when** the dialog shows them, **then** all 10 appear in plain text in `xxxx-xxxx` format, in a monospace grid, and "Download" and "Print" are enabled.
- **Given** codes are visible, **when** I click "Download", **then** a text file `hlabs-recovery-codes-<username>.txt` downloads containing the hostname, username, date and the 10 codes, one per line.
- **Given** codes are visible, **when** I click "Print", **then** the browser print dialog opens with a print stylesheet showing only the codes block.
- **Given** codes are masked, **when** I look at Download and Print, **then** they are disabled with the tooltip "Make new codes to see them again".

**Implementation notes**
- API: `account.recoveryCodes.regenerate` returns plain codes once; nothing returns them afterwards.
- Data: `recovery_codes` (Argon2id `code_hash`, `used_at`).
- UI: Dialog, Button. Plain codes live only in component state; clear them when the dialog closes.
- See Open questions (screen shows codes on "View").

### US-ACCT-10 · Make new recovery codes
**Feature:** F-ACCT-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `TwoFactorManage`
**As** anyone signed in, **I want** to replace my recovery codes, **so that** lost or used codes stop working.

**Acceptance criteria**
- **Given** 2FA is on, **when** I click "Make new codes", **then** a confirmation Dialog says "Your old codes will stop working." and asks for my password.
- **Given** I confirm with the right password, **when** it succeeds, **then** 10 new codes are shown in plain text (US-ACCT-09), all old codes are deleted, and the count reads "10 of 10 unused".
- **Given** a wrong password, **when** I confirm, **then** the field shows "That's not your password" and the old codes still work.
- **Given** new codes were made, **when** I use an old code at login, **then** it is rejected.

**Implementation notes**
- API: `account.recoveryCodes.regenerate` (`password`). Replace in one transaction.
- Data: `recovery_codes`; `audit_log` action `account.recoveryCodes.regenerate`.
- UI: Dialog, TextField, Button.

### US-ACCT-11 · Move two-factor to a new phone
**Feature:** F-ACCT-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `TwoFactorManage`
**As** anyone signed in, **I want** to move my authenticator to a new phone, **so that** I can keep logging in after changing phones.

**Acceptance criteria**
- **Given** 2FA is on, **when** I click "Move to a new phone" and enter my password, **then** I see a QR code, the secret as text for manual entry, and a 6-digit code field.
- **Given** I enter a valid code from the new app, **when** I confirm, **then** the new secret replaces the old one, a Toast says "Two-factor moved to your new phone", and codes from the old app stop working.
- **Given** I enter a wrong code, **when** I confirm, **then** the field shows "That code didn't work. Check the time on your phone and try again." and the old secret still works.
- **Given** I cancel midway, **when** the dialog closes, **then** the pending secret is discarded and nothing changes.

**Implementation notes**
- API: `account.totp.begin` (`password`; returns `otpauth://` URI and secret; pending secret held in memory for 10 minutes), `account.totp.confirm` (`code`).
- Data: `user_totp.secret_ref` swapped in the keychain on confirm, `enabled_at` updated; `audit_log`.
- TOTP per 07 §7.2 (SHA-1, 6 digits, 30 s, ±1 step). Recovery codes are kept.

### US-ACCT-12 · Turn two-factor on or off
**Feature:** F-ACCT-04 · **Priority:** P1 · **Phase:** 1 · **Screens:** `TwoFactorManage`, `SettingsAccount`
**As** anyone signed in, **I want** to turn two-factor login on or off, **so that** I choose how my account is protected.

**Acceptance criteria**
- **Given** 2FA is off, **when** I click "Turn on" on Account, **then** the same QR and confirm flow as US-ACCT-11 runs, and on success I am shown 10 new recovery codes (US-ACCT-09).
- **Given** 2FA is on, **when** I click "Turn off two-factor…", **then** a Dialog warns "Anyone with your password will be able to log in." and asks for my password and a current 6-digit code (or a recovery code).
- **Given** I confirm correctly, **when** it succeeds, **then** the TOTP secret and all recovery codes are deleted, all my other sessions are revoked, and Account shows "Off".
- **Given** an admin has turned on "Require two-factor for everyone", **when** I view TwoFactorManage, **then** "Turn off two-factor…" is disabled with "Your admin requires two-factor login." (admins included).

**Implementation notes**
- API: `account.totp.begin`, `account.totp.confirm`, `account.totp.disable` (`password`, `code`); hlabsCodes `TOTP_INVALID_CODE`, `TOTP_REQUIRED_BY_ADMIN`.
- Data: `user_totp`, `recovery_codes`, `sessions`; `audit_log`.
- UI: Dialog, TextField, Button (destructive for turn off).

### US-ACCT-13 · See everyone who uses hlabs
**Feature:** F-ACCT-05 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsUsers`
**As** an admin, **I want** a list of people and pending invites, **so that** I know who has access.

**Acceptance criteria**
- **Given** I open Users, **when** it loads, **then** the header reads "People · <n>" where n counts users plus pending invites, with an "Invite someone" button.
- **Given** each user row, **when** shown, **then** it has the avatar, display name ("(you)" after my own), "@<username> · <2FA on | 2FA off> · last active <relative> · <k> apps" (app count only for members), and a role Badge "Admin" or "Member".
- **Given** a member row, **when** shown, **then** it has "Apps access", "Reset password" and a "More options" menu (•••); my own row has no action buttons.
- **Given** a user is disabled, **when** shown, **then** the row is dimmed with a "Disabled" Badge and "Enable" in its menu.
- **Given** the list is loading or fails, **when** shown, **then** skeleton rows appear, or an inline error with "Try again".

**Implementation notes**
- API: `users.list`, `invites.list`.
- Data: `users`, `user_totp`, `app_access` (count), `invites`.
- UI: List, ListRow, Badge, Menu, Button.

### US-ACCT-14 · Give a member a reset-password link
**Feature:** F-ACCT-05 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsUsers`
**As** an admin, **I want** to create a one-time reset link for a member, **so that** they can get back in without email.

**Acceptance criteria**
- **Given** a member row, **when** I click "Reset password", **then** a Dialog shows a link `https://<hostname>/reset/<token>` with "Copy" and the note "Works once · expires in 15 minutes"; while remote access is connected the link uses the tailnet address, with the home-network link as "At home" (D-109).
- **Given** the link is created, **when** I create another for the same member, **then** the earlier unused link stops working.
- **Given** the member opens the link within 15 minutes, **when** they set a new password, **then** all their sessions are revoked and the link cannot be used again.
- **Given** the link is older than 15 minutes, **when** opened, **then** the reset page says the link has expired and to ask an admin for a new one.

**Implementation notes**
- API: `users.resetPasswordLink` (returns URL once), `auth.resetPassword`.
- Data: `password_resets` (`created_via = admin`, 15 min expiry); `audit_log` action `users.resetPasswordLink`.
- UI: Dialog, TextField (read-only), Button, Toast "Link copied".

### US-ACCT-15 · Change role, disable or enable someone
**Feature:** F-ACCT-05 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsUsers`
**As** an admin, **I want** to change someone's role or temporarily block them, **so that** access matches who they are now.

**Acceptance criteria**
- **Given** the More options menu of another user, **when** opened, **then** it offers "Make admin" or "Make member", "Disable" or "Enable", and "Delete…".
- **Given** I choose "Make admin", **when** I confirm "<name> will be able to change everything.", **then** the role Badge changes and their `app_access` rows are kept but ignored.
- **Given** I choose "Disable", **when** I confirm, **then** `disabled_at` is set, all their sessions are revoked, and they cannot log in (Login shows the invalid credentials message).
- **Given** the change would leave no enabled admin, **when** attempted, **then** it is refused with "hlabs needs at least one admin."
- **Given** I choose "Enable" on a disabled user, **when** it succeeds, **then** they can log in again with their old password.

**Implementation notes**
- API: `users.updateRole`, `users.disable`, `users.enable`; hlabsCode `LAST_ADMIN`.
- Data: `users.role`, `users.disabled_at`, `sessions`; invariant 1 in 04; `audit_log`.
- UI: Menu, Dialog, Toast.

### US-ACCT-16 · Delete someone
**Feature:** F-ACCT-05 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsUsers`
**As** an admin, **I want** to delete a user, **so that** people who have left don't keep an account.

**Acceptance criteria**
- **Given** I choose "Delete…", **when** the Dialog opens, **then** it names the person, has a "Also delete their Home folder (<size>)" checkbox, unchecked by default, and a destructive "Delete <name>" button.
- **Given** I confirm with the checkbox off, **when** it succeeds, **then** the user, their sessions, 2FA, recovery codes and app access are removed, and their Home folder is kept, renamed `users/<username>-deleted-<yyyy-mm-dd>/` (D-101), visible to admins in Files.
- **Given** I confirm with the checkbox on, **when** it succeeds, **then** their Home folder is moved to the trash (30-day auto-empty) as a job.
- **Given** the user is the last enabled admin, **when** I try, **then** it is refused with "hlabs needs at least one admin."
- **Given** a deleted username, **when** someone later accepts an invite, **then** that username can be reused.

**Implementation notes**
- API: `users.delete` (`userId`, `deleteHomeFolder`) → returns `{ jobId }` when deleting the folder.
- Data: cascading delete of `sessions`, `user_totp`, `recovery_codes`, `app_access`, `home_layout`; `trash_items`; `audit_log`.
- UI: Dialog, Button (destructive).

### US-ACCT-17 · Manage pending invites
**Feature:** F-ACCT-05 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsUsers`
**As** an admin, **I want** to copy or cancel an invite that hasn't been used, **so that** I can resend it or stop it.

**Acceptance criteria**
- **Given** an unused, unexpired invite, **when** listed, **then** it shows "Invite pending" and "Link created <relative> · expires in <n> days · <Role>" with "Copy link" and "Revoke".
- **Given** I click "Copy link", **when** it succeeds, **then** the same URL that was first created is copied and a Toast says "Link copied".
- **Given** I click "Revoke", **when** I confirm, **then** the invite is removed from the list and the link shows "This invite is no longer valid".
- **Given** an invite has expired or been used, **when** Users loads, **then** it is not listed.

**Implementation notes**
- API: `invites.list` (includes `url` for pending invites, admin only), `invites.revoke`.
- Data: `invites` with a new `token_ref` column (token stored encrypted in the secret store, alongside `token_hash` for lookup).
- UI: ListRow, Button, Toast.

### US-ACCT-18 · Choose what the log-in screen shows
**Feature:** F-ACCT-06 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsUsers`
**As** an admin, **I want** to hide the list of users on the log-in screen, **so that** strangers on the tailnet can't see who lives here.

**Acceptance criteria**
- **Given** the "Log-in screen" group, **when** shown, **then** it has a Switch "Show the list of users" with the help text "Off: everyone types a username. Recommended when hlabs is reachable over Tailscale."
- **Given** I turn it off, **when** it saves, **then** `auth.listLoginUsers` returns an empty list and Login shows a username field.
- **Given** I turn it on, **when** it saves, **then** Login lists enabled users (avatar and display name only).
- **Given** remote access is on and the switch is on, **when** I view the group, **then** a warning hint reads "hlabs is reachable over Tailscale."

**Implementation notes**
- API: `users.getPolicy`, `users.updatePolicy` (new), `auth.listLoginUsers`, `network.status`.
- Data: `settings` key `people` (`showUserList`, default on); `audit_log`.
- UI: Switch, ListRow. Save on toggle, optimistic, revert with an error Toast on failure.

### US-ACCT-19 · Require two-factor for everyone
**Feature:** F-ACCT-06 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsUsers`
**As** an admin, **I want** to require two-factor login for all users, **so that** a leaked password alone isn't enough.

**Acceptance criteria**
- **Given** the Switch "Require two-factor for everyone" with help text "Members set it up the next time they log in", **when** I turn it on and have 2FA myself, **then** it saves.
- **Given** I don't have 2FA on, **when** I try to turn it on, **then** the Switch stays off and a Dialog says "Turn on two-factor for your own account first." with a button to TwoFactorManage.
- **Given** the rule is on, **when** a user without 2FA logs in, **then** they must finish TOTP setup before reaching Home (handled in 03-sign-in.md).
- **Given** the rule is on, **when** any user views TwoFactorManage, **then** "Turn off two-factor…" is disabled (US-ACCT-12).

**Implementation notes**
- API: `users.updatePolicy` (`requireTotp`); hlabsCode `TOTP_REQUIRED_SELF_FIRST`.
- Data: `settings.people.requireTotp`; `audit_log`.
- UI: Switch, Dialog.

### US-ACCT-20 · Decide what members can do
**Feature:** F-ACCT-06 · **Priority:** P2 · **Phase:** 3 · **Screens:** `SettingsUsers`
**As** an admin, **I want** to allow or block members from installing apps and seeing live usage, **so that** I control the machine.

**Acceptance criteria**
- **Given** "What members can do", **when** shown, **then** it has Switches "Install apps from the App Store" (help "Otherwise they can only open apps you share") and "See live usage", both off by default.
- **Given** install is on, **when** a member opens the App Store, **then** they can install apps from the built-in source only; apps they install are added to their own app access.
- **Given** install is off, **when** a member calls `apps.install`, **then** it returns `FORBIDDEN`.
- **Given** "See live usage" is off, **when** any member opens Usage or calls `usage.*`, **then** it is refused and the Usage tab is hidden; the per-member switch in AppsAccess is disabled with "Turned off for all members in Users".
- **Given** "See live usage" is on, **when** a member has their per-member switch on (US-ACCT-25), **then** they can open Usage.

**Implementation notes**
- API: `users.updatePolicy` (`membersCanInstall`, `membersCanSeeUsage`).
- Data: `settings.people`; `users.can_see_usage` (new column).
- Enforce in procedure middleware for `apps.install` and `usage.*` (07 §7.4).

### US-ACCT-21 · Create an invite link
**Feature:** F-ACCT-07 · **Priority:** P1 · **Phase:** 3 · **Screens:** `InviteDialog`
**As** an admin, **I want** a one-time link to invite someone, **so that** they can make their own account without me typing their password.

**Acceptance criteria**
- **Given** I click "Invite someone", **when** the Dialog opens, **then** an invite is created with role Member and no apps, and the link `https://<hostname>/invite/<token>` is shown with "Copy" and "Works once · expires in 7 days ·".
- **Given** remote access is connected, **when** the Dialog shows the link, **then** it uses the tailnet address (`https://<node>.<tailnet>.ts.net/invite/<token>`), shows the home-network link under it labelled "At home", and links the help page on adding family to the tailnet (D-108, D-109).
- **Given** I type "Their name (optional)", **when** I stop typing for 500 ms, **then** it is saved; it is shown on the invite page and pre-fills their display name.
- **Given** I click "Copy", **when** it succeeds, **then** the link is on the clipboard and the button reads "Copied" for 2 seconds.
- **Given** I click "Done", **when** the Dialog closes, **then** the invite appears as pending in Users (US-ACCT-17).
- **Given** I click "Close" without having copied the link, **when** the Dialog closes, **then** the invite is revoked; if I copied it, it is kept.

**Implementation notes**
- API: `invites.create`, `invites.update` (new), `invites.revoke`.
- Data: `invites` (`expires_at` = created + 7 days, single use), `invite_app_access`; `audit_log` action `invites.create`.
- UI: Dialog, TextField, Button, Toast.
- Token: 32 random bytes base64url; only the hash is used for lookup.

### US-ACCT-22 · Choose the invitee's role and apps
**Feature:** F-ACCT-07 · **Priority:** P1 · **Phase:** 3 · **Screens:** `InviteDialog`
**As** an admin, **I want** to set the role and the apps before sending the link, **so that** the new person starts with the right access.

**Acceptance criteria**
- **Given** the "Role" Segmented control, **when** shown, **then** the options are "Member" ("Uses the apps you share") and "Admin" ("Can change everything"); Member is selected.
- **Given** Member is selected, **when** I look at "Apps they can open", **then** every installed app is listed with its AppIcon and a Switch, all off.
- **Given** I select Admin, **when** the role changes, **then** the apps list is replaced by "Admins can open every app."
- **Given** I change role or apps, **when** the change saves, **then** the same link stays valid and reflects the new choices.
- **Given** the invitee accepts, **when** their account is created, **then** they get exactly the role and apps set at the time of accepting.

**Implementation notes**
- API: `invites.update` (`role`, `appIds`, `displayName`), `apps.list`, `invites.accept`.
- Data: `invites.role`, `invite_app_access` → copied to `app_access` on accept.
- UI: Segmented, List, ListRow, AppIcon, Switch.

### US-ACCT-23 · Preview the invite page
**Feature:** F-ACCT-07 · **Priority:** P1 · **Phase:** 3 · **Screens:** `InviteDialog`
**As** an admin, **I want** to see what the invited person sees, **so that** I know the invite looks right before I send it.

**Acceptance criteria**
- **Given** the Dialog, **when** I click "Preview what they see", **then** AcceptInvite opens in a new tab in preview mode with a banner "Preview. This won't use up the invite."
- **Given** preview mode, **when** the page renders, **then** the form fields are disabled and submitting is impossible.
- **Given** preview was opened, **when** the real invitee opens the link, **then** it still works.
- **Given** the invite expired or was revoked, **when** the link is opened, **then** AcceptInvite shows it is no longer valid (03-sign-in.md).

**Implementation notes**
- API: `invites.inspect` (public, read only; does not mark used).
- Preview URL: `/invite/<token>?preview=1`; preview only affects the UI, `invites.accept` is never called.

### US-ACCT-24 · Choose which apps a member can open
**Feature:** F-ACCT-08 · **Priority:** P1 · **Phase:** 3 · **Screens:** `AppsAccess`
**As** an admin, **I want** to pick the apps a member can open, **so that** each person sees only what is meant for them.

**Acceptance criteria**
- **Given** I click "Apps access" on a member, **when** the Dialog opens, **then** its title is "What <name> can open" with "Apps not shared don't appear on their Home screen", and every installed app is listed with AppIcon, name and a Switch showing current access.
- **Given** an app has its own login (manifest field `ownLogin: true`), **when** listed, **then** it shows the hint "Uses its own login too".
- **Given** I change switches, **when** I click "Save", **then** access is replaced in one transaction, the Dialog closes, the row's "<k> apps" count updates, and a Toast says "Saved".
- **Given** I change switches, **when** I click "Cancel" or press Escape, **then** nothing is saved.
- **Given** no apps are installed, **when** the Dialog opens, **then** it shows "No apps installed yet" with a link to the App Store.

**Implementation notes**
- API: `users.get`, `apps.list`, `users.setAppAccess`.
- Data: `app_access`; `audit_log` action `users.setAppAccess`.
- UI: Dialog, List, ListRow, AppIcon, Switch, Button.

### US-ACCT-25 · Shared folder and live usage for a member
**Feature:** F-ACCT-08 · **Priority:** P1 · **Phase:** 3 · **Screens:** `AppsAccess`
**As** an admin, **I want** to decide whether a member sees the Shared folder and live usage, **so that** I can keep some things private.

**Acceptance criteria**
- **Given** the Dialog, **when** shown, **then** below the apps it has Switches "See the Shared folder in Files" (help "Their own Home folder is always private") and "See live usage".
- **Given** Shared is off, **when** that member opens Files, **then** `/shared` is not listed and any `files.*` call on `/shared` returns `FORBIDDEN`.
- **Given** "See live usage" is on for the member and allowed in Users (US-ACCT-20), **when** they open Home, **then** the Usage tab is shown.
- **Given** changes, **when** I click "Save", **then** they are saved with the app access in the same request.

**Implementation notes**
- API: `users.setAppAccess` (input extended with `canSeeShared`, `canSeeUsage`).
- Data: `users.can_see_shared`, `users.can_see_usage` (new columns, default off).
- Admin Home folders are never visible to members; not configurable here.

### US-ACCT-26 · Access changes apply straight away
**Feature:** F-ACCT-08 · **Priority:** P1 · **Phase:** 3 · **Screens:** `AppsAccess`
**As** an admin, **I want** access changes to work immediately, **so that** taking away an app really takes it away.

**Acceptance criteria**
- **Given** I remove an app from a member, **when** their browser next requests that app's host, **then** `/auth/verify` returns 403 and they see the "You don't have access to this" page (US-STATE-20).
- **Given** the member has Home open, **when** access changes, **then** within 2 seconds the app tile appears or disappears without a reload.
- **Given** I add an app, **when** they open its URL, **then** it loads without logging in again.
- **Given** the user is an admin, **when** `/auth/verify` checks access, **then** `app_access` is ignored and access is granted.

**Implementation notes**
- API: `/auth/verify`, `users.setAppAccess`; emit the new `access.changed` event on `events.stream` to the affected user so their Home refetches `apps.list` (see API additions).
- Data: `app_access`; invariant 2 in 04. Do not cache access decisions in Caddy.

### US-ACCT-27 · Member sees a limited Settings
**Feature:** F-ACCT-09 · **Priority:** P1 · **Phase:** 3 · **Screens:** `MemberSettings`
**As** a family member, **I want** Settings to show only what I can change and who manages the rest, **so that** I'm not confused by things I can't do.

**Acceptance criteria**
- **Given** I am a member, **when** I open Settings, **then** the sidebar has Account, Appearance, Notifications, About (07 §7.4; Appearance hidden until phase 7 and Notifications until phase 9 ship, D-036), and above the Account page a note reads "Apps, users and system settings are managed by <admin name> (admin)."
- **Given** there are several admins, **when** the note renders, **then** it names the earliest-created enabled admin.
- **Given** I am a member, **when** I see the Dock (or phone tab bar), **then** it shows Home, Files, Settings, plus Usage only if both the global and my own "See live usage" switches are on (D-029, US-ACCT-20 and US-ACCT-25) and App Store only if "Install apps from the App Store" is on (07 §7.4).
- **Given** I am a member, **when** I open Notifications, **then** I see only my own per-user switches for which in-app notifications I see (US-ACCT-30, member variant); "Where to send them" (tray, ntfy) and quiet hours are not shown, because channel setup is admin-only (D-043).
- **Given** I am a member, **when** I open About, **then** it shows only the hlabs version and "Open-source licences"; no system details (host, engine, storage, data folder) are shown (D-043).
- **Given** I am a member, **when** I search with Spotlight, **then** admin-only Settings results are not returned.
- **Given** I am a member, **when** I open an admin-only Settings page by URL, **then** I see the "You don't have access to this" page (US-STATE-20), not a redirect.

**Implementation notes**
- API: `account.get` (`adminName`), `home.searchEverything` filtered by role; `settings.notifications.update` accepts the member's own event switches only (see US-ACCT-30).
- UI: GlassCard note, List, Dock / TabBar.

### US-ACCT-28 · Member's account page
**Feature:** F-ACCT-09 · **Priority:** P1 · **Phase:** 3 · **Screens:** `MemberSettings`
**As** a family member, **I want** the same account controls as an admin, **so that** I can keep my own account safe.

**Acceptance criteria**
- **Given** I open Account, **when** it loads, **then** under my name it reads "<username> · Member · <size> in Home folder" (e.g. "4.2 GB"), with "Edit profile".
- **Given** the Security group, **when** shown, **then** Password, Two-factor login and Recovery codes behave as in US-ACCT-06 to US-ACCT-12.
- **Given** Signed-in devices, **when** shown, **then** I can sign out my other devices and log out as in US-ACCT-04 and US-ACCT-05.
- The Home folder size is hidden until phase 5 (Files) ships (D-036).
- **Given** the Home folder size is still being computed, **when** the page loads, **then** the size shows "Calculating…" and fills in when ready, without blocking the page.

**Implementation notes**
- API: `account.get` (`homeFolderBytes`, cached for 10 minutes), `account.*`, `auth.listSessions`, `auth.revokeSession`, `auth.logout`.
- Size format: decimal units, one decimal place (4.2 GB).

### US-ACCT-29 · Choose where notifications go
**Feature:** F-ACCT-10 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `SettingsNotifications`
**As** an admin, **I want** to get alerts on my phone, **so that** I hear about problems when I'm away from the dashboard.

**Acceptance criteria**
- **Given** "Where to send them", **when** shown, **then** it lists "In hlabs" ("The bell on Home", always on), "Menu-bar app" ("Notifications from your computer's system", always on where the tray runs) and "Push to your phone" ("Via an ntfy server you run or already use", optional) with "Set up" until configured. There is no email option (D-033).
- **Given** I set up push, **when** I enter an ntfy server URL and topic and click "Send test", **then** a test message is sent and success or the error is shown inline.
- **Given** push is configured, **when** shown, **then** its row reads "On" with "Edit" and "Remove".

**Implementation notes**
- API: `settings.get`, `settings.notifications.update`, `settings.notifications.test` (new).
- Data: `settings.notifications` (ntfy server URL and topic); an ntfy access token, if given, goes in the secret store (`secret_ref`), never in SQLite.
- The ntfy server is an outbound connection; list them in Settings › Advanced › "What hlabs connects to" (07 §7.1).

### US-ACCT-30 · Choose what to be told about
**Feature:** F-ACCT-10 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `SettingsNotifications`
**As** an admin, **I want** to pick which events alert me and where, **so that** I only get alerts I care about.

**Acceptance criteria**
- **Given** "What to tell you about", **when** shown, **then** a table with columns Event, hlabs, Phone lists: An app stops or fails to start; Updates are available; A backup fails; A backup succeeds; Repeated failed logins; Disk space is running low; Someone accepts an invite, each with a Switch per column.
- **Given** defaults, **when** first shown, **then** every hlabs Switch is on except "A backup succeeds", and Phone is on for app failures, backup failures, failed logins and low disk.
- **Given** push is not configured, **when** shown, **then** the Phone column Switches are disabled with the hint "Set up push first".
- **Given** a Phone Switch is on, **when** that event happens, **then** it is sent to the configured ntfy topic.
- **Given** each Switch has an accessible name, **when** read by a screen reader, **then** it announces e.g. "A backup fails on phone".
- **Given** I am a member (member variant, D-043), **when** I open Notifications, **then** "What to tell you about" shows only an hlabs column with one Switch per event that can reach me (for example "An app is shared with me" and "An app I can open stops or fails to start"), all on by default; there is no Phone column, no "Where to send them" and no quiet hours.
- **Given** I am a member and turn an event Switch off, **when** that event happens, **then** it does not appear in my bell; other users' notifications are not affected.

**Implementation notes**
- API: `settings.notifications.update` (`events: Record<eventKey, { hlabs: boolean, phone: boolean }>`). For members the same procedure accepts only `events` with `hlabs` values and writes them to the member's own key; channel fields (ntfy, quiet hours) are rejected with `FORBIDDEN`.
- Data: `settings.notifications`; the `notifications` table rows are still written for the bell when hlabs is on. Per-user in-app switches are stored in `settings` under key `notifications:<userId>` (D-043).
- "Disk space is running low" fires under 10% free on the storage root (simplest threshold).

### US-ACCT-31 · Quiet hours
**Feature:** F-ACCT-10 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `SettingsNotifications`
**As** an admin, **I want** no phone alerts at night, **so that** hlabs doesn't wake me.

**Acceptance criteria**
- **Given** the "Quiet hours" Switch, **when** on, **then** the row reads "No phone alerts 22:00–07:00, except failed backups and security" and the start and end times can be edited (24-hour, 15-minute steps).
- **Given** quiet hours are on, **when** an event other than a failed backup or repeated failed logins occurs inside the window, **then** no phone alert is sent; the in-hlabs notification is still created.
- **Given** a failed backup occurs in the window, **when** it happens, **then** the phone alert is sent.
- **Given** the window crosses midnight, **when** evaluated, **then** it uses the machine's local time zone.

**Implementation notes**
- API: `settings.notifications.update` (`quietHours: { enabled, start: "22:00", end: "07:00" }`).
- Test: boundary times (21:59, 22:00, 06:59, 07:00).

### US-ACCT-32 · Choose a wallpaper
**Feature:** F-ACCT-11 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAppearance`
**As** anyone signed in, **I want** to pick a wallpaper, **so that** hlabs feels like mine.

**Acceptance criteria**
- **Given** "Wallpaper", **when** shown, **then** there are thumbnails Dusk, Ocean, Forest and "+ Upload photo"; the current one has an accent ring and `aria-pressed="true"`.
- **Given** I click a thumbnail, **when** selected, **then** the wallpaper behind all windows changes immediately and is saved for my account on every device.
- **Given** I click "+ Upload photo", **when** I choose a JPEG, PNG or WebP up to 10 MB, **then** it is uploaded, a "Your own" thumbnail appears and is selected.
- **Given** the file is too big or not an image, **when** I choose it, **then** an error Toast says "Choose a JPEG, PNG or WebP under 10 MB" and the wallpaper doesn't change.

**Implementation notes**
- API: `settings.appearance.update` (`wallpaper: "dusk" | "ocean" | "forest" | "custom"`), `POST /api/appearance/wallpaper` (new); appearance returned in `auth.me`.
- Data: per-user appearance stored in `settings` under key `appearance:<userId>`; custom image at `<dataDir>/wallpapers/<userId>.<ext>`, resized to max 3840px.
- UI: Segmented-style thumbnail group, Toast. Default wallpaper Dusk.

### US-ACCT-33 · Choose an accent colour
**Feature:** F-ACCT-11 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAppearance`
**As** anyone signed in, **I want** to pick an accent colour, **so that** buttons and highlights match my taste.

**Acceptance criteria**
- **Given** "Accent colour", **when** shown, **then** there are swatches Violet, Mint, Amber, Rose as a radio group, each with an accessible name.
- **Given** I pick a swatch, **when** selected, **then** `<html data-accent="violet|mint|amber|rose">` updates at once and all accent-coloured components (Button primary, Switch on, selected ListRow, focus rings) change without a reload.
- **Given** I reload or log in on another device, **when** the app starts, **then** `data-accent` is set before first paint from the value in `auth.me` (cached in `localStorage` to avoid a flash).
- **Given** arrow keys in the swatch group, **when** pressed, **then** selection moves between swatches.

**Implementation notes**
- API: `settings.appearance.update` (`accent`).
- UI: accent tokens come from `packages/ui` keyed by `data-accent`; default `violet`.

### US-ACCT-34 · Home screen options
**Feature:** F-ACCT-11 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAppearance`
**As** anyone signed in, **I want** to turn widgets and the greeting on or off, **so that** Home shows only what I want.

**Acceptance criteria**
- **Given** "Home screen", **when** shown, **then** it has Switches "Show widgets" and "Show greeting" (with the example "Good evening, <name>"), both on by default.
- **Given** "Show widgets" is off, **when** I go to Home, **then** no widgets render and only app icons show.
- **Given** "Show greeting" is off, **when** I go to Home, **then** the greeting line is hidden.
- **Given** the greeting is on, **when** the local time is 05:00–11:59, 12:00–17:59 or 18:00–04:59, **then** it reads "Good morning", "Good afternoon" or "Good evening", followed by my display name.

**Implementation notes**
- API: `settings.appearance.update` (`showWidgets`, `showGreeting`).
- Data: per-user appearance value (see US-ACCT-32).
- UI: Switch, ListRow.

### US-ACCT-35 · Reduce transparency and motion
**Feature:** F-ACCT-11 · **Priority:** P2 · **Phase:** 7 · **Screens:** `SettingsAppearance`
**As** anyone signed in, **I want** solid backgrounds and less animation, **so that** hlabs is easier to read and comfortable to use.

**Acceptance criteria**
- **Given** the Switch "Reduce transparency" ("Solid backgrounds instead of glass, easier to read"), **when** on, **then** `<html data-theme="solid">` is set (the design system's solid theme) and every glass surface renders as a solid surface (MainSolid look) with no backdrop blur.
- **Given** the Switch "Reduce motion" ("Turns off icon bounce and window animations"), **when** on, **then** `<html data-motion="reduced">` is set and Framer Motion transitions become instant (opacity fades up to 150 ms allowed).
- **Given** I have never set Reduce motion, **when** my OS reports `prefers-reduced-motion: reduce`, **then** Reduce motion starts on; once I change it, my choice wins.
- **Given** either Switch changes, **when** toggled, **then** the effect applies immediately and is saved for my account.

**Implementation notes**
- API: `settings.appearance.update` (`reduceTransparency`, `reduceMotion`).
- Data: per-user appearance value; `reduceMotion` is a new field alongside `reduceTransparency`.
- UI: Switch; `MotionConfig reducedMotion="always"` when reduced.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
