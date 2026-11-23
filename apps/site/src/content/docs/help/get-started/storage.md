---
title: Storage
description: See what fills the disk, where hlabs keeps your data, connect and disconnect drives, and free up space.
features: [F-SYS-04]
---

For admins.

**Settings › Storage** shows the disk hlabs keeps its data on, the drives it uses, and two ways to make room.

## What is using the disk

The top of the page names the disk, for example **This computer · internal SSD**, and how much is free ("142 GB free of 256 GB"). The bar under it splits what's in use:

- **Apps**: your apps' data and the programs they run (their images).
- **Files**: everyone's Home folders, Shared and the trash.
- **Backup cache**: what hlabs keeps on this computer to make backups faster.
- **hlabs**: hlabs itself and its settings.
- **Other**: everything else on the disk, such as the system and your other programs.

Sizes are in decimal units (1 GB is 1,000,000,000 bytes), as macOS and Linux show them. hlabs counts folders in the background, so a new file can take up to 10 minutes to show. When less than a tenth of the disk, or less than 10 GB, is free, the page says **Low disk space**. See [Out of disk space](/help/troubleshooting/disk-full/).

## Where your data lives

**Data location** shows the folder with everyone's Home folders, Shared and media (on a Mac, `~/hlabs` to begin with), and the folder where apps keep their own data.

## Drives

**Drives** lists the network drives and external drives hlabs knows about: each one's address, which apps use it, and **Connected** or **Offline**. An external drive that isn't plugged in reads "External drive · not plugged in". The list follows drives coming and going within about 10 seconds.

- **+ Connect a drive** connects a network drive (a NAS), as in Files. See [Files](/help/files/files/).
- **Disconnect** on a connected network drive stops the apps that use it (hlabs names them first), then disconnects the drive. Nothing on the drive is deleted, and hlabs remembers it: to use it again, open it in Files and choose **Try again**, then start its apps from Home.

## Free space

- **Unused app images**: when an app is updated or uninstalled, the program it ran before can stay on the disk. **Free** removes those, and says how much space came back. hlabs only removes programs it downloaded for an app itself, never one that any app or other program on this computer still uses, and keeps an app's previous version for 7 days after an update so it can go back. Programs you downloaded yourself are never touched. With nothing to remove, the button reads **Nothing to clean up**.
- **Trash**: deleted files stay in the trash for 30 days, then go for good. **Empty now** deletes everything in everyone's trash straight away, after you confirm. This can't be undone. Each person can empty just their own trash in Files.
