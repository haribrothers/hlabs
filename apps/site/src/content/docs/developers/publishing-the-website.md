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

### 1. Create the Worker from the repo

1. In the Cloudflare dashboard, open **Workers & Pages** (under **Compute** in the sidebar) › **Create application**.
2. Choose **Continue with GitHub** (or **Import a repository**), let the Cloudflare app see `haribrothers/hlabs`, and select the repo.
3. Fill in the form with the settings in step 2, then **Create and deploy**. The first build publishes to `hlabs-site.<your-subdomain>.workers.dev`.

### 2. Build settings

For a Worker that already exists: **Workers & Pages** › `hlabs-site` › **Settings** › **Build**. Each part has its own edit (pencil) button, and changes apply to the next build.

| Where in Settings › Build | Field | Value |
| --- | --- | --- |
| Git repository | Repository | `haribrothers/hlabs` |
| Build configuration | Build command | `pnpm install --frozen-lockfile --filter "@hlabs/site..." --filter hlabs && pnpm site:build` |
| Build configuration | Deploy command | `npx wrangler deploy` (the default) |
| Build configuration | Preview command | the default, `npx wrangler preview` (older screens: `npx wrangler versions upload`) |
| Build configuration | Root directory | `/` (leave empty) |
| Build variables and secrets | Variables | `PNPM_VERSION` = `9.15.9` |
| Branch control | Production branch | `main` |
| Branch control | Enable Preview Builds | On |
| Build watch paths | Include paths | `apps/site/*`, `store/*`, `scripts/site-*`, `wrangler.jsonc` |
| Build watch paths | Exclude paths | none |

- **Node:** the build uses the version in `.nvmrc` (22). Cloudflare reads it like `nvm` does, so there's no `NODE_VERSION`.
- **pnpm:** `PNPM_VERSION` keeps the build on the pnpm the lockfile was made with (`packageManager` in `package.json`).
- **Releases:** Cloudflare sets `CI=true` in its builds, so when the build can't read the releases from GitHub it stops instead of publishing a download page without them, and the live site stays as it was.
- **Nothing at runtime:** nothing goes under **Settings › Variables and secrets** (the Worker's runtime): the site has no code.

These settings live only in Cloudflare's dashboard. `wrangler.jsonc` can't hold them: Workers Builds ignores Wrangler's `build` block.

#### Build watch paths

A new Worker builds on any change (Include paths `*`). Until the paths are set, a pull request that only changes the daemon still gets a site build.

1. **Settings** › **Build** › **Build watch paths** › edit (pencil).
2. Replace `*` with the include paths from the table, one per field. A trailing `*` matches everything under that folder.
3. The **Production** and **Previews Base** tabs at the top of Builds each have their own paths: set and save both.

Only changes to the site start a build: its folder, the store's apps (the catalogue is built from them), its build scripts and `wrangler.jsonc`. A change elsewhere that the site also uses, such as the design tokens in `packages/ui` or the lockfile, reaches it at the site's next build or the next release. Cloudflare builds regardless of the paths when a push has no file changes, 3,000 files or more, or 20 commits or more.

### 3. The deploy hook for releases

Spine doesn't need this: its version is written into its site's files and merged before the tag, so that merge rebuilds the site. hlabs's site reads the releases from GitHub when it builds, and a release only exists once `release.yml` has published it, after the last push to `main`.

The hook is made in Cloudflare, on the Worker; GitHub only keeps its address.

1. In Cloudflare: **Workers & Pages** › `hlabs-site` › **Settings** › **Build** › **Deploy Hooks** › **Add deploy hook**. (No Build section there means the Worker isn't connected to GitHub: connect it under **Git repository**, or create it again with **Continue with GitHub**.)
2. Name it `release.yml`, branch `main`, and **Create**. Copy the hook's address.
3. In GitHub: the repo's **Settings** tab › **Secrets and variables** › **Actions** › **New repository secret**. Name it `CLOUDFLARE_SITE_DEPLOY_HOOK` and paste the address.

Anyone with the address can start a build, so keep it only in that secret. If it ever leaks, delete the hook, make a new one and replace the secret. Without the secret, `release.yml` skips this step and the site shows the release at its next build.

### 4. The domain and HTTPS

**Settings** › **Domains & Routes**:

- **Custom domain:** **Add** › **Custom domain** › `hlabs.h4loom.com` › **Add Custom Domain**. `h4loom.com` has to be a zone on this Cloudflare account. Cloudflare creates the DNS record and the certificate. It refuses a name that already has a CNAME record, so delete any `hlabs` CNAME first.
- **workers.dev** and **Preview URLs:** on (`wrangler.jsonc` sets both).
- Leave **Observability** (Workers Logs) off.

In the `h4loom.com` zone › **SSL/TLS** › **Edge Certificates**, check that **Always Use HTTPS** is on, **Minimum TLS Version** is TLS 1.2 and **Automatic HTTPS Rewrites** is on. If you set these up for Spine, they already apply. The site sends `Strict-Transport-Security` for `hlabs.h4loom.com` only; leave the zone's own HSTS setting as it is.

### 5. Check it

1. Retry the latest build (**Deployments**), or push a commit that changes the site. The log ends with `pnpm site:build`'s "releases.json: stable …" line, the Astro build and Wrangler's upload.
2. Open `https://hlabs.h4loom.com/`: the home page. `/download/` shows the latest release (or says there isn't one yet), and `/help/` the help.
3. `curl -sI https://hlabs.h4loom.com/install.sh` answers `content-type: text/plain` and `cache-control: public, max-age=300` once there's a signed release.
4. `curl -sI https://hlabs.h4loom.com/` shows the `content-security-policy` and `strict-transport-security` headers.

## When something goes wrong

- **A push gets no "Workers Builds: hlabs-site" check at all:** Cloudflare's GitHub app can't see the repo. On GitHub: your picture › **Settings** › **Applications** › **Installed GitHub Apps** › **Cloudflare Workers and Pages** › **Configure**, and include `haribrothers/hlabs` under **Repository access**. Then push again, or start the build from **Deployments**.
- **The build fails reading the releases:** GitHub didn't answer, or refused because of its limit on requests without a token from Cloudflare's shared build machines. Retry the build. If it keeps happening, give the build a token: on GitHub, **Settings** › **Developer settings** › **Fine-grained tokens**, with access to **Public repositories** only and no permissions, saved under **Build variables and secrets** as the secret `GITHUB_TOKEN`.
- **"The Cloudflare application detection logic has been run in the root of a workspace":** Wrangler didn't find `wrangler.jsonc`. Check that **Root directory** is `/` and that the commit being built has the file.
- **"Your Wrangler configuration is missing a `previews` block":** the branch predates that block; rebase it on `main`.
- **A preview shows Cloudflare's plain "Not found" for a missing page:** previews don't use the site's `404.html`; production does.
