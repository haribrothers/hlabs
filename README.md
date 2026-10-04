# hlabs

hlabs is a home cloud for your Mac or Linux computer: an App Store for self-hosted apps, your files, backups and
remote access, in one calm dashboard. It runs your apps in Docker and keeps them reachable at home and, through
Tailscale, from anywhere.

- **Using hlabs:** the help, in [`apps/site/src/content/docs/help`](apps/site/src/content/docs/help/index.md) (and on
  the website).
- **Working on hlabs:** the developer docs, in
  [`apps/site/src/content/docs/developers`](apps/site/src/content/docs/developers/index.md): getting started, the
  menu-bar app, building the app, updates and signing, troubleshooting.
- **What hlabs does, in detail:** the product spec in [`docs/`](docs/README.md): stories, API, data model and decisions.

Quick start (details in [Getting started](apps/site/src/content/docs/developers/getting-started.md)):

```sh
pnpm install
pnpm fetch-binaries
pnpm dev        # hlabs on 127.0.0.1:7474, the dashboard on http://127.0.0.1:5173
```

hlabs is licensed under the [AGPL-3.0](LICENSE).
