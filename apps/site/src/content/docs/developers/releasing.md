---
title: Releasing
description: Tag a release, what the release workflow builds and signs, and the secrets it needs.
---

`.github/workflows/release.yml` builds every download, signs what it can, and publishes the GitHub release with the update manifest (D-146).

## Make a release

1. Write the release notes in `apps/site/src/content/releases/<version>.md`: a `date`, an optional `title`, and the sections New, Improved, Fixed and Before you update (`apps/site/src/content/releases/README.md` has an example). People read them in Settings › Updates and at `/releases/` on the website. Commit them on `main`.
2. Tag that commit and push the tag:

   ```sh
   git tag v1.2.3 && git push origin v1.2.3          # stable
   git tag v1.3.0-beta.1 && git push origin v1.3.0-beta.1   # beta
   ```

The tag is the version: every build gets it. A tag without release notes stops at the first step.

## What it builds

| Job | Runner | Files |
| --- | --- | --- |
| mac (arm64) | `macos-latest` | `hlabs-<v>-mac-arm64.dmg`, and with the update key `hlabs-<v>-mac-arm64.app.tar.gz` |
| mac (x64), best-effort | `macos-15-intel` | the same for Intel |
| linux (x86_64), linux (aarch64) | `ubuntu-22.04`, `ubuntu-22.04-arm` | `.deb`, `.rpm`, `.AppImage` and the server tarball `hlabs-<v>-linux-<arch>.tar.gz` |

When the release is published, `release.yml` starts the website's build through its deploy hook (the secret `CLOUDFLARE_SITE_DEPLOY_HOOK`, see [Publishing the website](../publishing-the-website/)), so `/download/` offers it and the site serves its `install.sh` within minutes; the site only takes an `install.sh` that matches the release's `SHA256SUMS`.

The last job signs every file (`<file>.sig`), adds `install.sh` with the key written in, writes `SHA256SUMS` (signed) and `latest.json`, and creates the release `v<version>`. A beta tag makes a prerelease. Every signed release also replaces `latest.json` on the rolling `beta` release, so the beta channel never lags stable.

## Secrets and variables

Without them the workflow still builds; it just signs less.

| Name | Kind | What it's for |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secrets | The hlabs update key: signs updates, every download and `install.sh`. Without it, the release is a draft with no `latest.json`, so nothing updates to it. |
| `HLABS_UPDATE_PUBLIC_KEY` | variable | Its public half, written into `install.sh`. |
| `APPLE_CERTIFICATE` (base64 `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` | secrets | The Developer ID certificate the Mac builds are signed with. Needs the paid Apple Developer Program. |
| `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password), `APPLE_TEAM_ID` | secrets | Notarizing and stapling the Mac builds. |
| `CLOUDFLARE_SITE_DEPLOY_HOOK` | secret | The website's deploy hook: rebuilds the site so `/download/` offers the release. Without it, the site shows the release at its next build. |

### The release key

Make it once and keep the private half safe. Lose it, and installs can't be updated any more.

```sh
cd apps/tray
pnpm exec tauri signer generate -w ~/.tauri/hlabs-release.key    # asks for a password
```

Then, in one change: put the private key and its password in the secrets above, the public key (`~/.tauri/hlabs-release.key.pub`) in the variable, and the same public key in `apps/daemon/src/updates/key.ts` (`UPDATE_PUBLIC_KEY`) and `apps/tray/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`), in place of the development key. See [Updates and signing](../updates-and-signing/) for testing an update locally.

## Rehearse

A rehearsal builds and signs everything but publishes nothing; the files stay as the run's `release-rehearsal` artifact for a week. It runs on every pull request that changes the workflow, the build scripts or the Tauri config, and by hand from the Actions tab (Run workflow, with a version like `0.6.0-rehearsal.1`).
