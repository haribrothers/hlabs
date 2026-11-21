---
title: Out of disk space
description: What happens when the disk hlabs uses is full, and how to make room.
features: [F-USE-01]
---

For admins.

When the disk with your hlabs files and app data is full, apps can't save, installs and backups stop, and the dashboard says **This computer is out of space**. Nothing is deleted.

## What to try, in order

1. See what uses the space in **Live usage** › Storage.
2. Empty the Trash in **Files**: deleted files keep their space for 30 days until then. See [Get something back from the Trash](../../files/files/#get-something-back-from-the-trash).
3. Uninstall apps you don't use, choosing to delete their data if you don't need it. See [Uninstall an app](../../apps/manage-apps/#uninstall-an-app).
4. Free up space outside hlabs on the same disk.

## Collect diagnostics

- **Mac or Linux desktop:** click the hlabs icon in the menu bar and choose **Copy diagnostics**.
- **Linux server:** run `sudo hlabs status` and `sudo hlabs logs`.
- **In the dashboard:** Settings › Advanced has the logs.

## Still stuck?

Copy the diagnostics (above), then [open an issue on GitHub](https://github.com/haribrothers/hlabs/issues/new?template=bug_report.yml) and paste them in. They contain no passwords or file names.
