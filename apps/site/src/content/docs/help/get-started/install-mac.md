---
title: Install on a Mac
description: Install hlabs from its disk image, and what happens if you open it from somewhere other than Applications.
features: [F-INST-02]
---

For admins: the person who installs hlabs.

## What you need

A Mac with Apple silicon (an Intel build is offered when there is one) running macOS 14 or later. On an older macOS, hlabs says **hlabs needs macOS 14 or later** and quits: update macOS in System Settings › General › Software Update, then open hlabs again.

## Install

1. Open `hlabs-<version>-mac-arm64.dmg` from your Downloads.
2. In the window that opens, drag **hlabs** onto **Applications**.
3. Open hlabs from your Applications folder once. It lives in your menu bar from then on, and starts when you log in. See [Set up hlabs](../set-up/) for what happens next.

You can eject the disk image and delete the `.dmg` afterwards.

## If you open hlabs from the disk image or Downloads

hlabs runs from your Applications folder, so its background service keeps working after you eject the disk image or tidy up Downloads. Opened from anywhere else, it asks **Move hlabs to Applications?** before it sets anything up:

- **Move to Applications** copies hlabs there and opens it from there. An older copy already in Applications, and the copy you opened (unless it's on the disk image), go to the Trash.
- **Quit** closes hlabs without setting anything up.

If hlabs can't copy itself, for example because your Mac account can't add apps to Applications, it says **Couldn't move hlabs. Drag it into Applications, then open it again.**

hlabs in the Applications folder inside your home folder (`~/Applications`) works too.

## Open it again

hlabs runs once at a time. Opening it again, from Applications or Spotlight, opens the menu under the hlabs icon in the menu bar.
