---
title: Your files
description: Browse, find and open the files you keep on hlabs, from any computer or phone.
features: [F-FILE-01]
---

Choose **Files** in the Dock (or the tab bar on a phone) to see the files you keep on hlabs. Everyone with an hlabs account has a private **Home** folder that only they can open.

## Your places

The list on the left has every place you can open. On a phone, the same places are a row of buttons above your files.

- **Recents:** the 50 files you changed most recently, newest first, with the folder each one is in.
- **Home:** your own folder. The first time you open Files, hlabs makes **Photos**, **Documents** and **Downloads** in it for you; folders you already have are left as they are.
- **Photos** and **Downloads:** those folders in your Home.
- **Shared with me:** the Shared folder everyone in the household can use. Admins always see it; family members see it if their admin turned on **See the Shared folder in Files** for them.

Admins also see:

- **This computer:** every person's Home folder (by their name) and Shared. A Home that was kept when someone was removed shows here with "deleted" and the date in its name.
- One row for each network drive you've connected. A drive that can't be reached has a grey dot; you can still choose it to try again.
- **App data:** the folder each installed app keeps its data in. You can look and download, but not change anything here, so running apps stay safe.
- How much of this computer's disk is used, at the bottom.

## Browse a folder

The open folder shows its folders first, then its files, each from A to Z. Under each folder is how many items it holds; under each file, its size. Photos and videos show a small picture of themselves; other files show an icon for their kind (a PDF, a spreadsheet, a zip file and so on).

- **Open a folder:** double-click it, or select it and press Return. On a phone, tap it.
- **Go back up:** choose a folder in the path at the top, for example **Home** in **Home › Documents**. Deep folders fold the middle of the path into **…**; choose it to pick one of them. Your browser's Back and Forward buttons move between the folders you opened too.
- **Use the keyboard:** the arrow keys move between items; Return opens the one you're on.

At the bottom, hlabs says how many items the folder holds and how much space its files take, and who can see it: **Private to you** in your Home, or **Everyone who can see Shared can open this** in Shared.

If someone removes a folder while you have it open, Files says **This folder no longer exists**; choose **Go to Home** to carry on.

## Make a folder

Choose **New folder** at the top, type a name (or keep **Untitled folder**) and choose **Create**, or press Return. The new folder is selected so you can open it straight away.

A name can't be empty, contain "/" or be very long, and there can't already be a file or folder with that name in the same place; Files tells you which one it is so you can choose another name. In places you can't change, such as App data, **New folder** and **Upload** are greyed out and say **This folder is read only**.

## Find a file

Type at least two letters of its name in **Search** at the top. Files looks in the folder you have open and every folder inside it, and shows what it finds with the folder each one is in, for example **Home › Documents › Bills**. Upper and lower case don't matter.

Files shows up to 200 results; if there are more, it says **Showing the first 200 results**, so type a little more of the name. A very large folder may say **Showing the first results** when it couldn't look everywhere in time. Press Esc, or clear the search, to go back to the folder.

## Upload files

Open the folder you want them in, choose **Upload** and pick one or more files, or drag files from your computer onto the folder (Files says **Drop to upload to** and the folder's name). Folders can't be uploaded yet: pick the files inside instead.

The **Uploads** panel shows each file: **Waiting**, how far along it is (for example **62% · 1.1 of 1.8 GB**) or **Done**, and about how long is left. Files go one at a time, in the order you chose them. When they're all done, the panel closes after a few seconds and says how many were uploaded. If there isn't enough space on the disk for a file (hlabs keeps 1 GB free), it says **Not enough space** and goes on to the next.

- **Pause** stops after the piece being sent; **Resume** carries on from where it stopped.
- If the connection drops, hlabs keeps trying for about half a minute. If it still can't, the upload pauses with **Paused · connection lost**; choose **Resume** when you're back online.
- **Cancel all** stops every upload that hasn't finished and removes what was sent of them. Files already uploaded stay.
- If you close the page or it reloads during an upload, Files says the uploads were interrupted. Choose **Choose files again** and pick the same files: they carry on where they stopped. Unfinished uploads are removed after a day.

### When a file with the same name is already there

Files asks what to do: **Skip** leaves the file that's there and doesn't upload yours; **Keep both** saves yours with a number, for example **Report (2).pdf**; **Replace** puts yours in its place and moves the old one to the Trash. Tick **Do this for every conflict** to use the same answer for the rest of the files you're uploading.

## Look at a file

Open a file to see it without downloading it. Photos show at the size of the window, videos play with the usual controls, PDFs open in your browser's own viewer (on a phone, use **Download** instead), and text files such as notes, lists and code show their first 1 MB. Other kinds of file, such as spreadsheets, zip files and iPhone HEIC photos, show their icon with **Download**.

If an app you can use keeps its files in that folder (for example Immich for your Photos), **Open with** lists it under Details; choose it to open the app in a new tab.

Use the arrows at the sides, or the Left and Right arrow keys, to see the previous or next file in the folder. **Details** shows the file's size, its width and height for photos and videos, when it last changed and where it is; choose the location to open that folder. Press Esc or choose **×** to close.

## Download a file

Open the file and choose **Download** at the top. The file keeps its name. Big downloads, such as videos, can pick up where they stopped if the connection drops.

## Connect a network drive

For admins. A NAS or another computer that shares folders on your network (SMB or NFS) can show up in Files, and apps can keep their files on it.

1. In Files, choose **+ Connect a drive** under Locations.
2. Under **Found on your network**, choose your NAS and then the share you want, for example **Media**. If it isn't listed, type its address under **Or enter an address**: `smb://nas.local/Media`, `\\nas.local\Media` or `nfs://nas.local/volume1/media`.
3. For SMB, type the username and password you use for the NAS. NFS doesn't need them.
4. Leave **Let apps use this drive** on if apps should be able to keep folders on it (you choose which ones), and **Reconnect automatically after restart** on so hlabs connects it again by itself.
5. Choose **Connect**. hlabs tries the drive first and says what went wrong if it can't: **Wrong username or password**, **Can't reach** the NAS (check it's on and on the same network), or that there's no share with that name.

The drive then shows under Locations, for example **NAS · Media**. The password is kept in your computer's keychain, never in hlabs's database.

### When a drive can't be reached

If the NAS is off or the network drops, the drive's row gets a grey dot and opening it says **Can't reach** and its name. Choose **Try again** once it's back. With **Reconnect automatically** on, hlabs also tries every minute by itself.

### Disconnect a drive

Right-click the drive in the list (or press and hold on a touch screen) and choose **Disconnect**. The files on the drive aren't deleted; hlabs just stops using it and forgets its password. If an app keeps folders on the drive, Files says which one: choose another folder for that app first.
