---
title: The App Store
description: Find apps for your hlabs, see what each one does, and install it.
features: [F-STORE-01, F-STORE-02, F-STORE-03, F-STORE-04, F-STORE-10, F-STORE-05, F-STORE-06, F-STORE-07, F-STORE-13, F-FILE-13]
---

For admins, and for members when an admin has turned on **Members can install apps**.

## Browse

Open **App Store** to see featured apps at the top and rows of apps picked for you below them. Choose **See all** next to a row to see every app in it.

Each app shows its name, what it's for and one button:

- **Install** takes you to the app's page first, so you always see what it can access before anything is installed.
- **Open** opens an installed app in a new tab.
- **Installing… 42%** shows how far an install has got. It updates by itself; you don't need to reload.

Select an app's name or card to see its page.

## Categories

The list on the left starts with **Discover** (the store's front page) and has one entry for each kind of app the store has, such as **Files & photos**, **Security** or **Monitoring**. Choose one to see every app of that kind. On a phone the categories are a row you can swipe along above the apps.

Above a category's apps, **Popular**, **New** and **A–Z** change the order. Popular is the order the hlabs store recommends (hlabs doesn't count who installs what); New puts the apps added to the store most recently first. Your choice is remembered in this browser. Beside it, the category says how many apps it has; on a Mac with Apple Silicon, apps that run on it come first. Long lists load more apps as you scroll.

You can move through the list with the Tab key and open an entry with Enter.

## Search

The search field at the top says how many apps you can search. Start typing: after a moment the results appear, matching app names first and then what the apps do. Type at least two letters. The search looks at app names, what they do, their tags and descriptions, and doesn't mind capital letters or accents. The chips above the results say how many apps matched and how many of those you've installed; choose **Installed** to see only those or, on a Mac with Apple Silicon, **Apple Silicon only** for apps that have a version for it. Press Enter to search straight away, and Escape (or clear the field) to go back to where you were. On a computer, press **/** anywhere in the App Store to jump to the search field.

## An app's page

Every app has a page with its screenshots (select one to see it large, then use the arrow keys to move between them), what it does, what's new in this version, and a few facts:

- **Version**: the version you'd install.
- **Runs as**: how many containers it uses and what they are, such as "3 containers · server, database, cache".
- **Opens at**: the address it will have, such as `immich.hlabs.local`.
- **Needs access to**: the folders it asks for. You'll see where they go before you install.

## What an app can access

Before you install, an app's page lists what it can reach:

- **Network**: "Internet", "Your home network only" or "No network".
- **Folders**: each folder it asks for, and whether it can change what's in it ("Read and write") or only look ("Read only").
- **Ports**: some apps (like a DNS server) open a port on this computer to your network. These are marked **Risky**.
- **Graphics card**: apps that use it to run faster.
- **Control of your other apps (Docker)**: the app can start, stop and change every app on hlabs. This is marked **Risky**; install it only if you trust it.

If an app recommends more memory than hlabs has left, its page says so; you can still install it, but it may be slow. If there isn't enough disk space, or it needs another app installed first, **Install** is turned off and the page says what to do.

**hlabs official** means the app comes from the store that ships with hlabs. **App Store** at the top takes you back to where you were, scrolled to the same place.

## Install an app

Choose **Install** on an app's page. Before anything happens, a sheet shows:

- **Folder access**: where each folder the app asks for will be, such as **Home › Photos**, and whether the app can change what's in it or only look. A folder the app can do without has a switch, so you can leave it out. If a folder is on a network drive that's offline, **Install** stays off until the drive is back.

### Choose a different folder

Press **Change** beside a folder to pick where the app keeps it, for example the photos you already have on a network drive.

- **Places** lists your Home, Shared (if you can see it) and each network drive that has **Let apps use this drive** on. A drive that's offline is listed but can't be opened until it's back.
- Only folders are shown. Click a folder to select it, double-click it (or press **Enter**) to open it, and use the path at the top to go back up. On a phone, tap a folder to open it.
- **Use** gives the app the selected folder, or the folder that's open if none is selected. **+ New folder** makes one inside the open folder.
- A folder the app needs to change can't be on a drive or folder that's read only: **Use** stays off and says so. A folder the app only reads can be anywhere, and the app still only reads it.
- If an admin lets members install apps, a member can only choose folders in their own Home, and Shared if they can see it.

Choosing a folder doesn't move or copy anything. The app uses the files that are already there.
- **Includes**: what runs, such as "Immich server · web app" and "PostgreSQL · database · private to this app".
- **Address**: where the app will open, such as `https://immich.hlabs.local`. You can change the part before `.hlabs.local` (lowercase letters, numbers and dashes). **Login required** means people sign in with their hlabs account first; some apps also have their own login.
- **Settings**: questions the app needs answered, such as an email address. Passwords the app needs for itself are made for you and never shown.
- If the app asks for risky access (see above), a red box explains it and you tick **I understand** before you can install.

Choose **Install**, and the app's install page opens. **Cancel** (or Escape) closes the sheet without changing anything.

Members who may install apps can install apps from the built-in store that ask for nothing risky; for anything else they see "Ask an admin to install this app".

## Watch an install

The install page shows how far it has got ("Installing… 42%"), about how long is left once hlabs can tell, and each step: checking the app runs on this computer, downloading it, creating its folders, starting it and setting up its address. If another app is installing, this one waits its turn and says so.

You can leave the page: the install carries on, and the app appears on your Home screen when it's ready, with a notification. Its tile on Home shows the progress; select it to come back to this page.

## When an install fails

The page says **Install failed** and "Nothing else was changed". The step that failed says why, in plain words, with a way to fix it:

- **A port is already used** by another program on this computer: choose **Use a different port**. hlabs suggests a free one; choose **Try again**.
- **No internet**, or **the app didn't start in time**: choose **Try again**. What was already downloaded isn't downloaded again.
- **No Apple Silicon (or ARM64) version**: go **Back to App Store**.
- **The container engine stopped**: **Open Engine settings**.
- **Not enough free space**: free some space, then try again.

**Remove partial install** deletes whatever the install created (its containers and its own data) after you confirm. Folders you chose, like your Photos, stay as they are. The app then shows **Install** in the store again.

A failed install also sends a notification that brings you back to this page, and its Home tile shows **Error**.

## App sources

Admins see **App sources** at the bottom of the list on the left (on a phone, under **Manage apps**). A source is where apps come from: the App Store's own apps (**hlabs official**, which can't be removed), a git repository someone shares, or a folder of your own apps (see [Make your own app library](../your-own-library/)).

Each source shows where it is, how many apps it has and when hlabs last checked it. hlabs checks every source by itself every few hours; **Check now** checks one straight away. If a check fails, the row says why, such as **Couldn't reach the repository**, and the apps it had stay in the App Store. **Signed** means hlabs can tell the apps haven't been changed since their author published them; **Not signed** means it can't.

**Remove** takes a source's apps out of the App Store. Apps you installed from it stay installed and keep working, but they don't get updates; their settings say **Source removed · no updates**.

### Add a source

Under **Add a source**, choose **Git repository** and paste its address, such as `https://github.com/you/your-app-store`, or **Folder on this computer** and type the folder's path. Select **Add**. hlabs looks at it first and asks **Trust this source?** with its name, how many apps it has and, when it's signed, its signing key. Only add sources you trust. Apps from any source still ask for your approval before they get access to folders or devices.

When you add a signed source, hlabs remembers its key. If the source is later signed with another key, hlabs stops using it and says **Signature doesn't match the saved key**: someone may have changed its apps. Remove it, and add it again only if you trust the new key.

If there's nothing hlabs can use at the address, it says **No hlabs apps found at this address**. Sources have to be in hlabs's own app format.

## Updates

Admins see **Updates** at the bottom of the list on the left (on a phone, under **Manage apps**), with the number of apps that have a newer version. The App Store's icon in the Dock shows the same number.

Each app shows the version you have, the new one and when it reached your App Store, for example **1.2 → 1.3 · released 2 days ago**. Choose **What's new** to read what changed and **Hide notes** to close it. **Update** installs it: the row shows how far it has got, and when it's done the app moves to **Recently updated**. **Update all** updates every app in the list, one after another; the button counts them, such as **Updating 1 of 3…**, and if one doesn't work the others still update.

If a new version asks for more than the one you have, such as another folder, a port or the internet, the row says **Needs your approval: asks for new access**. Choose **Review** to see only what's new. Such an app never updates by itself; update it when you're happy with it.

**Recently updated** lists the updates of the last two weeks, and says which ones hlabs did by itself overnight. When there's nothing to update, the page says **All apps are up to date** and when hlabs last looked; **Check now** looks again. hlabs looks by itself every 6 hours and sends admins a notification when it finds updates.

hlabs backs up an app's data before updating it. If you have no backup destination yet, the update still happens and says **Not backed up: no backup destination**. You can turn this off in Settings › Updates.

## Apple Silicon and ARM64

On a Mac with Apple Silicon, apps that have a version for it are tagged **Apple Silicon** (**ARM64** on an ARM Linux computer). Apps without one are tagged **x86 only**: they're listed after the others and never featured, and their page says there's no version for your computer yet (they run on computers with an Intel or AMD chip) instead of offering to install.

## Where the apps come from

The hlabs team packages every app in the App Store and tests that it installs, opens, restarts and uninstalls. Some were packaged with help from other home-server app stores; their page says so under **About**, for example **Packaged with help from the Runtipi app store (GPL-3.0)**. Each app's logo and software belong to its own project.

Choose **Back to Home** to close the App Store.
