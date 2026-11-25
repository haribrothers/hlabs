---
title: Make an app public
description: Share one app with people who aren't on your tailnet, at a name under your own domain, behind the hlabs login.
features: [F-APP-10, F-SYS-13]
---

For admins only.

Remote access with Tailscale is for you and your devices, and it stays private. To let other people open one app, such as a friend opening a shared album, you can make that app **public**: it gets an address on the internet, such as `https://photos.example.com`, through **Cloudflare Tunnel**.

Your files and your other apps stay private. The dashboard itself is only public if an admin chooses to make it so, with extra guards: see [Make the dashboard public](/help/remote-access/make-the-dashboard-public/). Nothing changes on your router: no ports are opened.

## What you need first

- **A domain of your own**, such as `example.com`.
- **A free Cloudflare account** with that domain added to it.

### Add your domain to Cloudflare

1. Sign up at [cloudflare.com](https://www.cloudflare.com/) if you don't have an account.
2. In Cloudflare, choose **Add a domain** and type your domain.
3. Cloudflare shows two **nameservers**. Where you bought the domain, replace its nameservers with those two.
4. Wait until Cloudflare says the domain is **Active**. This can take from a few minutes to a day.

If your domain already has a website or email, they keep working: hlabs only ever adds, changes and deletes the DNS records it made for its public apps.

### Keep it on HTTPS

Two settings in Cloudflare make sure visitors always use HTTPS. They're for the whole domain, so hlabs leaves them to you:

1. In Cloudflare, open your domain, then **SSL/TLS › Edge Certificates**.
2. Turn on **Always Use HTTPS**.
3. Set **Minimum TLS Version** to **TLS 1.2**.

Even without them, hlabs sends a page visited with `http://` to its `https://` address and refuses anything else sent that way, so a password never goes over plain HTTP. Between Cloudflare and this computer, and inside it up to hlabs, the traffic is encrypted too.

## Set up Cloudflare Tunnel

1. Open **Settings › Network & remote access**.
2. Under **Public access**, choose **Set up Cloudflare Tunnel…**.
3. Choose **Sign in to Cloudflare**. Cloudflare's page opens in a new tab: sign in, pick your domain and approve hlabs.
4. Come back to hlabs. It makes the tunnel and starts it on its own; the row then says **Connected**.

Cloudflare sees the traffic to your public apps. What hlabs gets from Cloudflare is kept in this computer's keychain, never in hlabs's database or logs.

**Use an API token instead**: if signing in doesn't work for you, make an API token in Cloudflare under **My Profile › API Tokens**, for this domain only, with **Zone · DNS · Edit** and **Account · Cloudflare Tunnel · Edit**. Type the domain, paste the token and choose **Check and set up**.

## Make an app public

1. Open the app's settings (right-click its tile on Home, or long-press it, then **App settings**).
2. In **Access**, next to **Public on the internet**, choose **Make public…**.
3. Choose its **address**: a name under your domain, such as `photos`. A name that's already in your domain's DNS can't be used.
4. Choose **who can get in** (below), then **Make public**.

The app gets a **Public** badge on its tile and in its settings, and the other admins get a notification.

Some apps can't be made public, such as tools that can control your other apps; their settings say why.

If the app is a media app, check Cloudflare's terms before sharing a media library: they limit streaming large amounts of video through Cloudflare's network.

## Who can get in

- **People with an hlabs account and access to the app** (the default). Visitors sign in to hlabs first, on the app's own address, with their username, password and two-factor code. Everyone needs **two-factor login** on to get in this way; the dialog lists anyone who hasn't turned it on yet. People the app isn't shared with see "You don't have access to this".
- **The app's own login only**, offered for apps whose phone and desktop apps need to connect directly. hlabs doesn't ask for a login, so anyone on the internet can reach the app's own sign-in page: use a strong password for every account in the app, and tick **I understand**.

To change the address or who can get in later, choose **Change…** in **Access**.

## While an app is public

- **Automatic updates stay on** for it, so it gets security fixes: the switch reads "On while *app* is public". With the hlabs login, **Require hlabs login** stays on too.
- **Stopping the app** leaves its address showing "*app* isn't running".
- **Uninstalling it** makes it private first.
- Sign-ins on its address are listed with your other sessions in **Settings › Account**, and can be signed out there.

## See who visits

Choose **Visits** in the app's **Access** section, or in **Settings › Network & remote access › Public apps**. You see the last 7 days of requests to its address: when, from which address and country, which page, and whether they signed in, were asked to sign in, were refused, or tried too many times. Use the buttons at the top to show one kind. Visits are kept for 7 days and are never in backups.

If one address gets the password wrong more than 20 times in 10 minutes, hlabs refuses it for an hour and the admins get a warning, "Someone keeps trying to sign in to *app*", with **Make private** right there.

## Make an app private

Choose **Make private** in its **Access** section, in **Visits**, or in **Settings › Network & remote access › Public apps**. Its address stops answering within seconds, and hlabs removes the name from your domain's DNS. The app keeps working at home and on your tailnet.

## Turn off all public access

In **Settings › Network & remote access**, choose **Turn off all public access…** under the list of public apps. Every app becomes private at once, and the dashboard too if it's public; Cloudflare Tunnel stays set up, so you can make them public again later.

On a Mac or Linux desktop you can do the same from the menu-bar app: when anything is public, its menu shows **Public: 2 apps** (or **Public: the dashboard and 2 apps**) with **Turn off public access…**, which asks for Touch ID or your password first.

## Remove Cloudflare Tunnel

Choose **Remove…** on the Cloudflare Tunnel row. hlabs makes every public app and the dashboard private first, then deletes the tunnel, the DNS records it made and its Cloudflare sign-in from this computer. Your domain's other DNS records aren't touched.
