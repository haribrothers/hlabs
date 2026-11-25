---
title: Make the dashboard public
description: Reach hlabs itself from any browser, without Tailscale, at a name under your own domain, with two-factor for everyone and the riskiest changes kept for home.
features: [F-SYS-14]
---

For admins: turning it on and off. For everyone with an account: [signing in there](#sign-in-from-the-internet).

Tailscale is the private way to reach hlabs from anywhere. If someone in your household can't use Tailscale on a device, an admin can make the **dashboard itself** reachable from the internet, at a name of its own under your domain, such as `https://hlabs.example.com`, through the same **Cloudflare Tunnel** as [public apps](/help/remote-access/make-an-app-public/).

It's off on every install until an admin turns it on. Because the dashboard can reach every app and file, hlabs guards it more than a public app:

- **Every admin needs two-factor login** before it can be turned on, and **everyone signs in there with two-factor**.
- The sign-in there **never lists who uses hlabs** and has no "Remember me".
- A session there **works only at that address and ends after 12 hours**, however active you are.
- A **sign-in from a new place** sends that person a notification, with **Sign out everywhere**.
- After more than 20 wrong passwords in 10 minutes from one address, hlabs refuses that address for an hour and warns the admins.
- **The riskiest changes only work at home or on your tailnet** (below).
- First-run setup, invites and reset links never open there.

## What you need first

- **Cloudflare Tunnel set up**, as for public apps: see [Set up Cloudflare Tunnel](/help/remote-access/make-an-app-public/#set-up-cloudflare-tunnel).
- **Two-factor login on for every admin.** Each admin turns it on in **Settings › Account** at home. Members without it don't stop you, but they can't sign in from the internet until they turn it on.

## Make it public

1. Open **Settings › Network & remote access**.
2. Under **Public access**, next to **Dashboard**, choose **Make public…**.
3. Choose its **address**: a name under your domain, `hlabs` to start with. A name that's already in your domain's DNS can't be used.
4. Read what changes and what only works at home. If an admin hasn't turned on two-factor login yet, the dialog says who, and the button stays off until they do.
5. Leave **Add Cloudflare's sign-in in front** on and type the email addresses allowed (recommended, see [below](#add-cloudflares-sign-in-in-front)), or turn it off.
6. Type your password and choose **Make the dashboard public**.

The row then reads **Public at https://hlabs.example.com · since** *date* **by** *you*, with an amber **Public** badge, and the other admins get a notification. hlabs adds the name to your domain's DNS and takes it out again when the dashboard is private.

## Add Cloudflare's sign-in in front

Cloudflare can check who someone is before they even see hlabs's sign-in: it sends a code to an email address on your list, and only then shows the page. Bots and strangers never reach hlabs. It's free for up to 50 people.

- Add it while making the dashboard public, or later with **Add Cloudflare's sign-in…** on the Dashboard row. Type each email address and press Return.
- The row then reads **Cloudflare's sign-in in front · 3 email addresses**. Choose **Change…** to change the list, or **Remove** there to take it away.
- hlabs makes this in **Cloudflare Zero Trust** for the dashboard's name, and removes it when the dashboard is private. It never changes Cloudflare sign-ins it didn't make.
- Only admins see the list. It's kept in hlabs's settings, never in logs or diagnostics.

If your Cloudflare sign-in can't manage this, hlabs asks for an **API token**: in Cloudflare, under **My Profile › API Tokens**, make one with **Account · Access: Apps and Policies · Edit** and paste it. It's kept in this computer's keychain with your other Cloudflare sign-in.

## Sign in from the internet

For everyone with an hlabs account.

1. Open the dashboard's address, such as `https://hlabs.example.com`.
2. Type your **username** and **password**, then **Continue**.
3. Type the 6-digit code from your authenticator app, or a recovery code.

If you haven't turned on two-factor login, hlabs says "Turn on two-factor login first". Turn it on in hlabs at home, under **Settings › Account**.

The session there ends after 12 hours. It's listed in **Settings › Account** as **Public dashboard at** *the address*, where you can sign it out. If you get "New sign-in to hlabs from…" and it wasn't you, choose **Sign out everywhere** in the notification, then change your password at home.

## What only works at home

From the internet, a banner says "You're using hlabs from the internet. Some changes only work at home or on your tailnet." These controls still show, with a house and **At home only**, and choosing one explains why instead of doing it, for everyone, admins too:

- Factory reset.
- Public access and the network: setting up or removing Cloudflare Tunnel, making an app or the dashboard public or changing how, Tailscale, ports, DNS and the server's name.
- App sources and libraries, deploying your own apps, an app's settings, permissions, **Require hlabs login** and secrets.
- AI access tokens.
- People: inviting, changing roles, deleting, turning an account back on, reset links, who can open which app, and what members can do.
- Your password, turning two-factor on or off, and new recovery codes.
- Restoring a backup, and adding, changing or removing a backup destination, or showing its password.
- Moving where data lives, and switching the container engine.

Stopping exposure always works there: making an app or the dashboard private, **Turn off all public access** and signing out everywhere.

On Home there, a public app's tile opens its public address. Any other app says it opens at home or on your tailnet. Files, Usage, Backups and Notifications work as at home.

## Make it private

Choose **Make private** on the Dashboard row. The address stops answering within seconds, everyone signed in there is signed out, and hlabs removes the name from your domain's DNS and Cloudflare's sign-in in front. You can do this from the internet too; it signs you out there.

**Turn off all public access** makes the dashboard private along with every app, and so does the menu-bar app's **Turn off public access…**, whose card reads **Public: the dashboard and 2 apps** while it's on. Removing Cloudflare Tunnel makes the dashboard private first.
