---
title: Back up and restore
description: Keep encrypted copies of your apps and files somewhere else, and bring them back when something goes wrong.
features: [F-BKP-01, F-BKP-02, F-BKP-03, F-BKP-06]
---

For admins.

hlabs copies your apps' data and your Home folders to a place you choose, every night at 03:00. Every copy is encrypted before it leaves this computer. Backups is for admins: choose **Backups** in the Dock, or **Settings › Backups**.

## Add a place for backups

Choose **+ Add a destination** and pick where the copies go:

- **Cloud storage:** any S3-compatible service, such as Backblaze B2. Enter its endpoint (an `https://` address), the bucket, and your access key and secret key.
- **Network drive:** a NAS or another computer's shared folder. Pick one you already connected in Files, or enter its address (`smb://nas.local/Backups` or `nfs://nas.local/volume1/backups`) with a username and password.
- **External drive:** a USB or Thunderbolt drive plugged into this computer. hlabs keeps backups in a folder on it, `hlabs-backups` unless you name another. It has to be a different disk from the one hlabs keeps its data on.

Choose **Test connection** to check hlabs can reach the place and write there, then **Add destination**. The first backup to it runs at the next scheduled time, or choose **Back up now**.

An off-site copy, such as cloud storage, keeps your data safe if this computer is stolen or the house floods. You can add more than one destination: each backup goes to all of them.

### The encryption password

When you add a destination, hlabs makes a password of six words, such as `maple-orbit-tundra-cobalt-ferry-quill`. **Save it somewhere safe**, for example in your password manager. Without it, nobody can restore these backups, not even you, if this computer is lost.

To see it again later, choose **Edit** on the destination, then **Show encryption password**, and enter your hlabs password.

If a place already has backups from hlabs (say you set up hlabs again), hlabs asks for their encryption password instead of making a new one.

## What gets backed up

Choose the **11 apps and 3 Home folders** line under the last backup to choose:

- **Apps:** each installed app's data. Some apps leave out things they can make again, such as Jellyfin's library; the list says what.
- **Files:** each person's Home folder, and Shared.
- **Include new apps automatically:** apps you install later, and people you add, are backed up too.

hlabs's own settings, the people who can sign in and each app's setup are always included, so you can bring back the whole system on a new computer.

Apps that need it pause for a few seconds while their data is copied, so the copy is consistent. They carry on by themselves.

## When a backup fails

The top of Backups says **Last backup failed** and a notification tells you why, for example that your NAS wasn't reachable (it may have been asleep). hlabs tries again 30 minutes later; after that, at the next scheduled time. After three failures in a row, the notification turns red.

**Overdue** means there hasn't been a successful backup for more than two scheduled times.

Old copies are tidied up after each backup: hlabs keeps 7 daily, 4 weekly and 6 monthly restore points.

## Restore

Choose **Restore…**, then:

1. **Where from:** pick the destination (skipped when there's only one).
2. **What and when:** pick a restore point (the newest is chosen for you), then the apps and folders you want back, and how:
   - **Replace current data:** the app stops, gets the data from that point and starts again.
   - **Restore as a copy:** the files go in your Home, in **Restored**, and nothing else changes.
3. **Confirm** with your hlabs password.

Before replacing anything, hlabs keeps a safety copy of the data that's there now. If anything goes wrong (the destination stops answering, or the app won't start with the restored data), hlabs puts the safety copy back and starts the app again. Until the restored data is moved in, you can choose **Cancel restore**; after that, the restore finishes by itself.

You can choose **Hide** and keep using hlabs: a notification says when the restore is done.

Restoring everything with **Replace current data** also brings back hlabs's settings and restarts hlabs at the end.
