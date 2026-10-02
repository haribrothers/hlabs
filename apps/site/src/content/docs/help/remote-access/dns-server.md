---
title: Use your own DNS server
description: Keep hlabs's names in Pi-hole, AdGuard Home or another DNS server, so every device finds it.
features: [F-SYS-01]
---

For admins only.

Most computers and phones find `hlabs.local` by themselves. Some don't, such as smart TVs, some Android phones and devices on another network. If your home has a DNS server, hlabs can keep its names there so every device finds hlabs at `hlabs.home.arpa`, and each app at a name like `jellyfin.hlabs.home.arpa`.

Open **Settings › Network & remote access**, then choose **Change** next to **Local DNS server**. Point your router's DNS at that server so every device uses it.

## AdGuard Home on this computer

Install **AdGuard Home** from the App Store first. Then choose **AdGuard Home on this computer** and **Save**. hlabs adds its names to AdGuard Home's DNS rewrites, and keeps them right when you install or remove apps or this computer's network address changes. Rewrites you made yourself are left alone.

## Pi-hole

This works for a Pi-hole on this computer or on another device, such as a Raspberry Pi your router already uses for DNS. It needs Pi-hole 6 or later.

1. In Pi-hole, open **Settings › Web interface / API** and make an **app password**.
2. In hlabs, choose **Pi-hole**, enter its address (such as `http://192.168.1.10`) and the app password.
3. Choose **Test** to check that hlabs can reach Pi-hole, then **Save**.

hlabs keeps the app password with its other secrets (the keychain on a Mac), never in its database. It adds one line per name to Pi-hole's DNS settings, and nothing else.

## Another DNS server

For a router or DNS server hlabs can't change itself, choose **Another DNS server**. The page lists the records to add by hand, with **Copy records**. They point at this computer's network address, so update them if that address changes. Giving this computer a fixed address in your router avoids that.

## If the server stops answering

The row shows **Pi-hole isn't answering** (or AdGuard Home). hlabs tries again whenever an app changes and every 10 minutes. Check the server is on and its address is right. If it says **Pi-hole refused the password**, make a new app password and enter it again.

## Switching off

Choose **None**, or another server. hlabs removes only the names it added.
