---
title: Publishing the website
description: How hlabs.h4loom.com is built and published by Cloudflare from GitHub, and how to set it up.
---

The website (this site: the home page, downloads, apps, release notes and the help) is one Cloudflare **Worker with static assets** called `hlabs-site`, built by **Workers Builds**, Cloudflare's GitHub integration (D-147). It's set up the same way as Spine's site. There's no deploy workflow and no Cloudflare token in GitHub:

- A push to `main` that changes the site builds it and publishes it at `https://hlabs.h4loom.com`.
- A push to any other branch builds a preview at its own address, listed on the commit in GitHub.
- Publishing a release (`release.yml`) starts a build through a deploy hook, so `/download/` offers the new version within minutes.
- A failed build leaves the live site as it was.

`wrangler.jsonc` at the repo root tells Cloudflare what to serve: the folder `apps/site/dist`, the nearest `404.html` for a page that doesn't exist, previews for branches, and no Wrangler telemetry. `apps/site/public/_headers` sets the security headers and how long files are cached.

CI (`site.yml`) still builds and checks every change to the site: `site:check`, the website's stories (`site:e2e`) and Lighthouse. Cloudflare's build doesn't wait for it, but `main` only takes pull requests that pass.

## Set it up

You need to be able to change the Cloudflare account that holds `h4loom.com`, and to change the GitHub repo's settings. In Cloudflare's dashboard, Workers and Pages share one place, and **Create** makes a Worker: that's what this setup expects, so don't look for a Pages option.

### 1. A GitHub token for the build

The build reads the latest releases from GitHub's API. Without a token, GitHub allows only a few requests an hour from each address, and Cloudflare's build machines are shared, so give the build a token that can only read public repositories.

1. On GitHub: your picture › **Settings** › **Developer settings** › **Personal access tokens** › **Fine-grained tokens** › **Generate new token**.
2. Name it `hlabs site build`, give it an expiry (a year), and under **Repository access** choose **Public repositories**. Add no permissions.
3. **Generate token** and copy it. You'll paste it into Cloudflare in step 3; don't keep it anywhere else.

### 2. Create the Worker from the repo

1. In the Cloudflare dashboard, open **Workers & Pages** (under **Compute** in the sidebar) › **Create application**.
2. Choose **Continue with GitHub** (or **Import a repository**), let the Cloudflare app see `haribrothers/hlabs`, and select the repo.
3. Fill in the form with the settings in step 3, then **Create and deploy**. The first build publishes to `hlabs-site.<your-subdomain>.workers.dev`.

### 3. Build settings

For a Worker that already exists: **Workers & Pages** › `hlabs-site` › **Settings** › **Build**. Each part has its own edit (pencil) button, and changes apply to the next build.

| Where in Settings › Build | Field | Value |
| --- | --- | --- |
| Git repository | Repository | `haribrothers/hlabs` |
| Build configuration | Build command | `pnpm install --frozen-lockfile --filter "@hlabs/site..." --filter hlabs && pnpm site:build` |
| Build configuration | Deploy command | `npx wrangler deploy` (the default) |
| Build configuration | Preview command | the default, `npx wrangler preview` (older screens: `npx wrangler versions upload`) |
| Build configuration | Root directory | `/` (leave empty) |
| Build variables and secrets | Variables | `NODE_VERSION` = `22.23.4`, `PNPM_VERSION` = `9.15.9`, `HLABS_SITE_RELEASES_REQUIRED` = `1` |
| Build variables and secrets | Secret | `GITHUB_TOKEN` = the token from step 1 (choose **Secret**, not Text) |
| Branch control | Production branch | `main` |
| Branch control | Enable Preview Builds | On |
| Build watch paths | Include paths | `apps/site/*`, `store/*`, `packages/ui/*`, `packages/icons/*`, `packages/shared/*`, `packages/app-manifest/*`, `scripts/site-releases*`, `package.json`, `pnpm-lock.yaml`, `turbo.json`, `wrangler.jsonc` |
| Build watch paths | Exclude paths | none |

- **Node:** Astro 7 needs Node 22.23.4 or newer. `NODE_VERSION` may be newer, but not 23 or later.
- **Releases:** `HLABS_SITE_RELEASES_REQUIRED` makes the build stop when it can't read the releases, instead of publishing a download page that says there's no release.
- **Only the build:** the variables and the secret apply only to the build. Nothing goes under **Settings › Variables and secrets** (the Worker's runtime): the site has no code.

These settings live only in Cloudflare's dashboard. `wrangler.jsonc` can't hold them: Workers Builds ignores Wrangler's `build` block.

#### Build watch paths

A new Worker builds on any change (Include paths `*`). Until the paths are set, a pull request that only changes the daemon still gets a site build.

1. **Settings** › **Build** › **Build watch paths** › edit (pencil).
2. Replace `*` with the include paths from the table, one per field. A trailing `*` matches everything under that folder.
3. The **Production** and **Previews Base** tabs at the top of Builds each have their own paths: set and save both.

The paths outside `apps/site` are what the site is built from: the store's apps, the packages that draw tiles, icons and the catalogue, and the script that reads releases. If the site starts reading another file, add it here, or a change to it won't publish. Cloudflare builds regardless of the paths when a push has no file changes, 3,000 files or more, or 20 commits or more.

### 4. The deploy hook for releases

1. **Settings** › **Build** › **Deploy Hooks** › **Add deploy hook**.
2. Name it `release.yml`, branch `main`, and **Create**. Copy the hook's address.
3. In GitHub: the repo › **Settings** › **Secrets and variables** › **Actions** › **New repository secret**. Name it `CLOUDFLARE_SITE_DEPLOY_HOOK` and paste the address.

Anyone with the address can start a build, so keep it only in that secret. If it ever leaks, delete the hook, make a new one and replace the secret. Without the secret, `release.yml` skips this step and the site shows the release at its next build.

### 5. The domain and HTTPS

**Settings** › **Domains & Routes**:

- **Custom domain:** **Add** › **Custom domain** › `hlabs.h4loom.com` › **Add Custom Domain**. `h4loom.com` has to be a zone on this Cloudflare account. Cloudflare creates the DNS record and the certificate. It refuses a name that already has a CNAME record, so delete any `hlabs` CNAME first.
- **workers.dev** and **Preview URLs:** on (`wrangler.jsonc` sets both).
- Leave **Observability** (Workers Logs) off.

In the `h4loom.com` zone › **SSL/TLS** › **Edge Certificates**, check that **Always Use HTTPS** is on, **Minimum TLS Version** is TLS 1.2 and **Automatic HTTPS Rewrites** is on. If you set these up for Spine, they already apply. The site sends `Strict-Transport-Security` for `hlabs.h4loom.com` only; leave the zone's own HSTS setting as it is.

### 6. Check it

1. Retry the latest build (**Deployments**), or push a commit that changes the site. The log ends with `pnpm site:build`'s "releases.json: stable …" line, the Astro build and Wrangler's upload.
2. Open `https://hlabs.h4loom.com/`: the home page. `/download/` shows the latest release (or says there isn't one yet), and `/help/` the help.
3. `curl -sI https://hlabs.h4loom.com/install.sh` answers `content-type: text/plain` and `cache-control: public, max-age=300` once there's a signed release.
4. `curl -sI https://hlabs.h4loom.com/` shows the `content-security-policy` and `strict-transport-security` headers.

## When something goes wrong

- **The build fails reading the releases:** the token has expired or was revoked. Make a new one (step 1) and replace the `GITHUB_TOKEN` secret, then retry the build.
- **"The Cloudflare application detection logic has been run in the root of a workspace":** Wrangler didn't find `wrangler.jsonc`. Check that **Root directory** is `/` and that the commit being built has the file.
- **"Your Wrangler configuration is missing a `previews` block":** the branch predates that block; rebase it on `main`.
- **A preview shows Cloudflare's plain "Not found" for a missing page:** previews don't use the site's `404.html`; production does.
