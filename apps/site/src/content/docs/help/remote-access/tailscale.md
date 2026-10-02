---
title: Reach hlabs from anywhere
description: Connect remote access with Tailscale, so hlabs and its apps work away from home with nothing exposed to the internet.
features: [F-SYS-01, F-ONB-06]
---

For admins only.

hlabs uses **Tailscale**, a free private network between your own devices, so you can open hlabs and its apps from your phone or laptop away from home. Nothing is opened up to the internet: only devices on your tailnet can reach it.

## Connect

1. Install Tailscale on this computer from [tailscale.com/download](https://tailscale.com/download), and on each phone or laptop you'll use.
2. In **Settings › Network & remote access**, choose **Connect** next to Tailscale.
3. If Tailscale isn't signed in yet, its log-in page opens in a new tab. Sign in there; hlabs notices within a few seconds. This computer joins your tailnet with the name of your server, such as `hlabs`.
4. If Tailscale is already signed in on this computer, hlabs asks before publishing anything and names the tailnet. If that's a work tailnet, cancel and sign Tailscale in to a personal one first. The computer keeps the name it already has on the tailnet.

When it's connected, the dashboard is at `https://<name>.<tailnet>.ts.net` and each app at that address with its own port, such as `https://hlabs.tail1234.ts.net:12001`. Settings › Network & remote access lists them all, with **Copy**; apps you install or remove later are added or taken away within a few seconds. Tailscale gives these addresses real certificates, so there are no browser warnings. Getting a certificate publishes the computer's tailnet name in public certificate logs; the name says nothing about what's on it.

## If something's in the way

- **Tailscale isn't running:** open the Tailscale app on this computer, then choose Connect again.
- **HTTPS is off:** turn on HTTPS certificates in the DNS page of your Tailscale admin console, then try again.
- **Port 443 is already served:** something else on this computer already uses Tailscale Serve on that port. hlabs never replaces it, and offers to put the dashboard on port 8443 instead.
- **Tailscale needs permission (Linux):** run `sudo tailscale set --operator=hlabs` once on the server, then try again.
- **Sign-in timed out:** the log-in wasn't finished within 10 minutes. Choose Connect to start again.

hlabs never turns on Tailscale Funnel, which would put hlabs on the public internet, and never changes Serve settings it didn't make.

## Disconnect

Choose **Disconnect** next to Tailscale. People away from home can't open hlabs or its apps until you connect again, and anyone using hlabs over Tailscale is logged out. If you're using it over Tailscale yourself, the page stops working. Tailscale itself stays signed in, and anything else you serve with it is left as it was. Tailscale needs to be running for hlabs to remove its addresses.

