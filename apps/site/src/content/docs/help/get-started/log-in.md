---
title: Log in
description: Choose your account or type your username, then enter your password.
features: [F-AUTH-01, F-AUTH-02, F-AUTH-03, F-AUTH-04]
---

For everyone who uses hlabs.

hlabs remembers the last account used on this device and greets it by name next time ("Welcome back, …"), asking only for its password. No password is stored on the device. If the password is wrong you'll see "Password is incorrect."

On a shared computer, choose **Not <name>? Use another account** to log in as yourself: hlabs forgets the remembered account on this device and shows the list (or the username form). Logging out keeps the remembered account; only this link clears it. In a private window nothing is remembered.

## Choose your account

When you open hlabs, **Who's using hlabs?** shows everyone who can log in. Choose your name, then enter your password. You can also use the arrow keys to move between names and press Enter.

Not listed? Choose **Other user** and type your username instead.

## Type your username

If your name isn't listed, or your admin has hidden the list, type the username your admin gave you and your password. Choose **All users** to go back to the list when it's shown.

Usernames don't care about capital letters or spaces at the ends: "Hari " works as "hari".

## Stay signed in

**Remember me on this device** keeps you signed in for 30 days while you keep using hlabs. Leave it off on a computer other people use; you're then signed out after 12 hours without using hlabs.

When hlabs greets you by name, it uses the choice you made the last time you logged in on this device, so there's no switch on that screen. If you're signed out while using hlabs, you're asked to log in and then taken back to the page you were on.

When a device is signed out from somewhere else, for example after a password change, it goes to the log-in screen within a few seconds and says "You were logged out on this device."

## Enter your two-factor code

If two-factor login is on for your account, hlabs asks for a code after your password. Open your authenticator app and type the 6-digit code for hlabs; it's checked as soon as you type the sixth digit.

- **"That code didn't work."**: codes change every 30 seconds, and each one works only once. Wait for the next code and check that the time on your phone is set automatically.
- A code from just before or just after the current one still works, so a phone clock a few seconds out is fine.
- **"hlabs can't check codes right now."**: hlabs couldn't read your two-factor key from this computer's keychain. This doesn't count as a wrong try. Use a recovery code, or ask your admin.
- **"Your login timed out."**: you have 5 minutes to enter the code. Enter your password again to get a new chance.
- Wrong codes count toward the same limit as wrong passwords: after 5 in 15 minutes, logging in is paused for 15 minutes.
- **Back** returns to the password screen.

## Use a recovery code

Lost your phone? Choose **Use a recovery code** and type one of the codes you saved when you turned on two-factor login. Capital letters and the dash don't matter: `ABCD2345` works as `abcd-2345`.

Each code works once. After you use one, hlabs tells you how many are left and adds a notice to your notifications, so you'd notice if someone else used one. When 2 or fewer are left, make new codes in **Settings › Account**. A code that was already used, or mistyped, counts as a wrong try toward the pause after 5.

## Log out

Choose **Log out** in **Settings**. hlabs signs out this device only; your other devices stay signed in. The next time you open hlabs here it greets you by name and asks for your password. If hlabs can't be reached when you log out, this browser still forgets your session and shows the log-in screen.

## If you can't log in

- **"Username or password is incorrect."**: check both and try again. hlabs doesn't say which one is wrong, so nobody can find out which accounts exist.
- **Too many attempts**: after 5 wrong passwords or codes in 15 minutes, logging in as that user from this device is paused for 15 minutes. The page counts down, and **Try again** takes you back to the password when the time is up. Trying again before then doesn't make the wait longer. Other people, and the same person on another device, can still log in. Choose **Use another account** to log in as someone else. Your admin gets a notification saying which username was paused and from which address, so they can check it wasn't someone trying to get in.
- **"Can't reach hlabs right now."**: the computer running hlabs may be off, restarting or updating. Try again in a moment; what you typed is kept.
