---
title: A network drive can't be reached
description: When hlabs can't reach a NAS or network drive, for files or backups, and how to get it back.
features: [F-FILE-04]
---

For admins.

When a network drive doesn't answer, its row in Files gets a grey dot and opening it says **Can't reach** and its name, and backups to it fail with **Can't reach the NAS**. The files on it are untouched.

## What to try, in order

1. Check the NAS is on and on the same network as hlabs.
2. In Files, open the drive and choose **Try again**. With **Reconnect automatically after restart** on, hlabs also tries every minute by itself.
3. If its address or password changed, choose **Disconnect** and connect it again: see [Connect a network drive](../../files/files/#connect-a-network-drive). Files on the drive are not deleted.
4. For a backup destination, editing it in Backups and choosing **Test connection** says what's wrong.

## Collect diagnostics

- **Mac or Linux desktop:** click the hlabs icon in the menu bar and choose **Copy diagnostics**.
- **Linux server:** run `sudo hlabs status` and `sudo hlabs logs`.
- **In the dashboard:** Settings › Advanced has the logs.

## Still stuck?

Copy the diagnostics (above), then [open an issue on GitHub](https://github.com/haribrothers/hlabs/issues/new?template=bug_report.yml) and paste them in. They contain no passwords or file names.
