---
title: Make your own app library
description: Keep apps the App Store doesn't have in your own library, and install and update them like the store's.
features: [F-STORE-14]
---

For admins. A library is a folder of apps in hlabs's own format. Once you add it in App sources, its apps are in the App Store under their categories, with **From My apps** (or your library's name) on their page, and they install and update like the store's own.

## Start a library

The `hlabs` command makes one for you (see [The hlabs command](../../reference/cli/)):

1. `hlabs library init ~/hlabs/users/<you>/my-apps` makes the folder with a README, an `apps/` folder with an example app, and a workflow for GitHub. Keep it in your Home folder in hlabs: a library has to be inside hlabs's storage, and not in Shared or someone else's Home folder, where others could change your apps.
2. `hlabs library add wiki` adds `apps/wiki/` with a manifest (`hlabs-app.yml`) and a compose file (`docker-compose.yml`) to fill in. Each `TODO` says what goes there.
3. `hlabs library check` checks every app with the App Store's own rules and lists each problem with its file and line, such as `apps/wiki/docker-compose.yml:12 Host networking isn't allowed.`
4. In hlabs, open **App Store › App sources**, choose **Add a source › Folder on this computer**, type the folder's path and select **Add**.

hlabs reads the folder again every few hours, and when you select **Check now**. An app with a problem shows on the library's row (**1 app has a problem**, with the file and line) and is left out until it's fixed; the other apps still sync.

## Share it as a git repository

Put the folder in a git repository, for example on GitHub, and run `hlabs library index` to write `index.json`, the list of apps hlabs reads. The workflow `hlabs library init` made checks the apps and rebuilds `index.json` on every push. Others add it with the repository's address under **Git repository**.

## Sign it

Signing lets hlabs on other computers tell your library hasn't been changed by someone else:

1. `hlabs library keygen` makes a signing key and prints its fingerprint. The private key stays in hlabs's keychain on this computer.
2. `hlabs library sign` writes `index.json.sig` and `hlabs-library.pub`. Sign again after each `hlabs library index`.

When someone adds your library, **Trust this source?** shows the key's fingerprint; tell them what it is so they can compare. A library that isn't signed can still be added, but it shows **This source isn't signed. Updates can't be verified.** and its apps say **Not signed**.

## Copy an App Store app into your library

To run an App Store app set up differently, open its page, select **…** and **Copy to my library…**. Choose the library and a name (`<app>-custom` to begin with). hlabs copies its manifest, compose file and logo into `apps/<name>/` of a folder library, with a README saying where it came from, and the copy appears in the App Store at once. It's a separate app: you can install it next to the original, and its updates come only from your library. For a git library, the copy downloads as a zip to add to the repository.
