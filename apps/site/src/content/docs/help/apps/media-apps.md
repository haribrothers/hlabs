---
title: Download and organise films, shows and music
description: How Sonarr, Radarr, Lidarr, Prowlarr and the download apps work together in hlabs, and the addresses to connect them.
features: [F-STORE-13]
---

For admins. The App Store has a set of apps that find, download and file films, TV shows and music for you, ready to watch in Jellyfin, Plex or Emby. Each one is installed on its own, and they share two places in **Shared**:

- **Downloads**: every download app saves here (qBittorrent, Transmission, Deluge and SABnzbd).
- **Media**: your libraries, in **Media/TV**, **Media/Movies** and **Media/Music**. Jellyfin, Plex and Emby read the whole **Media** folder.

Keep the folders the App Store suggests when you install them, and the apps find each other's files without any changes.

## Connect them

Apps reach each other by name. Use these addresses in their settings:

| App | Address |
| --- | --- |
| qBittorrent | `http://qbittorrent:8080` |
| Transmission | `http://transmission:9091` |
| Deluge | `http://deluge:8112` |
| SABnzbd | `http://sabnzbd:8080` |
| Prowlarr | `http://prowlarr:9696` |
| Jackett | `http://jackett:9117` |
| Sonarr | `http://sonarr:8989` |
| Radarr | `http://radarr:7878` |
| Lidarr | `http://lidarr:8686` |
| Jellyfin | `http://jellyfin:8096` |
| Plex | `http://plex:32400` |

A typical set-up:

1. Install a download app (qBittorrent for torrents, SABnzbd for Usenet) and Prowlarr for search sites.
2. In Prowlarr, add your search sites, then add Sonarr, Radarr and Lidarr under **Settings › Apps** with their addresses and API keys (each app shows its key in **Settings › General**).
3. In Sonarr, Radarr and Lidarr, add the download app under **Settings › Download clients**, and the library folder (`/tv`, `/movies` or `/music`) under **Settings › Media management › Root folders**.
4. Add Seerr if you want your family to ask for films and shows themselves.

Sonarr, Radarr, Lidarr, Prowlarr, Bazarr, Jackett, qBittorrent and Transmission don't ask for their own password: the hlabs login protects them. Deluge's first password is `deluge`; change it in its preferences.

Some search sites check for a browser first. Prowlarr comes with FlareSolverr for them: add it in Prowlarr under **Settings › Indexers › Indexer proxies** at `http://flaresolverr:8191`.

## Opening ports

The download apps work without opening a port on your router. Plex opens port 32400 on your network so its apps on your TV and phones can find it, and asks you to confirm when you install it.
