---
title: Questions people ask
description: Short answers about what hlabs is, what it costs, where your data lives and who can see it.
---

For everyone.

## What is hlabs?

A home cloud: it runs apps like photo libraries, media servers and password managers on your own Mac or Linux computer, with your files, backups and access from anywhere in one dashboard.

## Does it cost anything?

No. hlabs is free and open source (AGPL-3.0). The apps it installs are open source too.

## Where does my data live?

On the computer running hlabs: your apps' data and your files are in `~/hlabs` on a Mac or Linux desktop and in `/var/lib/hlabs` on a Linux server, or on a drive you chose. Backups go where you send them: a drive, a NAS or cloud storage you pick.

## Does hlabs send anything to the internet?

Only what it needs: checking for updates of hlabs and its apps, downloading apps you install, and Tailscale if you turn on access from anywhere. No analytics, no telemetry, no account with us.

## Who can see my files?

People you invite only see their own Home folder, what's shared with them and the apps you let them open. Admins manage hlabs; they don't get a view of everyone's files in the dashboard.

## Can I use it away from home?

Yes, with Tailscale. See [Reach hlabs from anywhere](../remote-access/tailscale/).

## What happens if the computer running hlabs breaks?

Restore from a backup on another computer. See [Back up and restore](../backups/backups/).

## Can I remove it?

Yes, keeping your data or deleting everything. See [Uninstall hlabs](../install/uninstall/).
