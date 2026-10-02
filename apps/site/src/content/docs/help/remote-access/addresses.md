---
title: How to reach hlabs
description: The addresses hlabs and its apps have on your home network.
features: [F-SYS-01]
---

For admins only.

Open **Settings › Network & remote access** to see how hlabs is reached.

## On your home network

**Local address** is the name to type in a browser at home, usually `hlabs.local`. Most computers and phones find it by themselves.

Under it is a second name, `hlabs.home.arpa`. That one is for devices that ask your DNS server (such as Pi-hole or AdGuard Home) instead of finding names themselves. It works once hlabs keeps its names in that server: see [Use your own DNS server](/help/remote-access/dns-server/).

If hlabs can't announce its name on your network, the row says **Not published** and gives this computer's network address to use instead, such as `https://192.168.1.20`.

**Web ports** shows the ports hlabs listens on. If another program already uses 443 or 80, hlabs uses 8443 or 8080 instead and says so; addresses then include the port, like `https://hlabs.local:8443`.

To pick other ports, choose **Change**. Use 443 and 80, or numbers from 1024 to 65535. hlabs checks they're free first, and lists the ports your apps already use so you can avoid them. After you save, the page moves to the new address; bookmarks with the old port stop working.

## App addresses

Every installed app has its own address, such as `https://jellyfin.hlabs.local`. Choose an address to open the app in a new tab, or **Copy** to copy it. An app whose name can't be announced uses its own port on hlabs's address instead, like `https://hlabs.local:12001`.
