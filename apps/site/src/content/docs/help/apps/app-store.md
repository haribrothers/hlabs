---
title: The App Store
description: Find apps for your hlabs, see what each one does, and install it.
features: [F-STORE-01, F-STORE-04]
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

You can move through the list with the Tab key and open an entry with Enter.

## Search

The search field at the top says how many apps you can search. Start typing: after a moment the results appear, matching app names first and then what the apps do. Press Enter to search straight away, and Escape (or clear the field) to go back to where you were. On a computer, press **/** anywhere in the App Store to jump to the search field.

## An app's page

Every app has a page with its screenshots (select one to see it large, then use the arrow keys to move between them), what it does, what's new in this version, and a few facts:

- **Version**: the version you'd install.
- **Runs as**: how many containers it uses and what they are, such as "3 containers · server, database, cache".
- **Opens at**: the address it will have, such as `immich.hlabs.local`.
- **Needs access to**: the folders it asks for. You choose where they are when you install.

## What an app can access

Before you install, an app's page lists what it can reach:

- **Network**: "Internet", "Your home network only" or "No network".
- **Folders**: each folder it asks for, and whether it can change what's in it ("Read and write") or only look ("Read only").
- **Ports**: some apps (like a DNS server) open a port on this computer to your network. These are marked **Risky**.
- **Graphics card**: apps that use it to run faster.
- **Control of your other apps (Docker)**: the app can start, stop and change every app on hlabs. This is marked **Risky**; install it only if you trust it.

If an app recommends more memory than hlabs has left, its page says so; you can still install it, but it may be slow. If there isn't enough disk space, or it needs another app installed first, **Install** is turned off and the page says what to do.

**hlabs official** means the app comes from the store that ships with hlabs. **App Store** at the top takes you back to where you were, scrolled to the same place.

## Apple Silicon and ARM64

On a Mac with Apple Silicon, apps that have a version for it are tagged **Apple Silicon** (**ARM64** on an ARM Linux computer). Apps without one are listed after the others and are never featured, and their page says there's no version for your computer yet instead of offering to install.

Choose **Back to Home** to close the App Store.
