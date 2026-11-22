# The built-in store's 100 apps

Approved by Hari on 23 Nov 2026 (D-161, answering Q-20). The 14 apps of D-048 plus 86 ported in four waves (D-148). Each app passes the install matrix before its wave merges. "Public" is the first read for Q-21: each app is decided while porting it and Hari approves the candidates in the wave's pull request.

"Needs" lists what an app asks for beyond the compose rules (06), which its manifest declares and its page shows as risky access where 07 §7.6 says so.

## Already in the store (D-048) (14)

| App                               | Group           | ARM64 | Needs                                 | hlabs already does | Public    | Drafted from |
| --------------------------------- | --------------- | ----- | ------------------------------------- | ------------------ | --------- | ------------ |
| Audiobookshelf (`audiobookshelf`) | Books           | yes   | —                                     | —                  | candidate | —            |
| Gitea (`gitea`)                   | Developer       | yes   | —                                     | —                  | candidate | —            |
| Immich (`immich`)                 | Files & photos  | yes   | —                                     | —                  | candidate | —            |
| Syncthing (`syncthing`)           | Files & photos  | yes   | Raw ports 22000 tcp/udp (sync)        | —                  | never     | —            |
| Nextcloud (`nextcloud`)           | Files & photos  | yes   | —                                     | —                  | candidate | —            |
| Paperless-ngx (`paperless-ngx`)   | Files & photos  | yes   | —                                     | —                  | candidate | —            |
| Home Assistant (`home-assistant`) | Home automation | yes   | USB devices optional (Zigbee, Z-Wave) | —                  | candidate | —            |
| Open WebUI (`open-webui`)         | Local AI        | yes   | —                                     | —                  | check     | —            |
| Jellyfin (`jellyfin`)             | Media           | yes   | GPU device optional (transcoding)     | —                  | candidate | —            |
| Uptime Kuma (`uptime-kuma`)       | Monitoring      | yes   | —                                     | —                  | check     | —            |
| AdGuard Home (`adguard-home`)     | Networking      | yes   | Raw port 53 tcp/udp (DNS)             | —                  | never     | —            |
| n8n (`n8n`)                       | Productivity    | yes   | —                                     | —                  | check     | —            |
| Mealie (`mealie`)                 | Productivity    | yes   | —                                     | —                  | candidate | —            |
| Vaultwarden (`vaultwarden`)       | Security        | yes   | —                                     | —                  | candidate | —            |

## Wave 1: media and books (23)

| App                              | Group | ARM64    | Needs                                                         | hlabs already does | Public       | Drafted from |
| -------------------------------- | ----- | -------- | ------------------------------------------------------------- | ------------------ | ------------ | ------------ |
| Calibre-Web (`calibre-web`)      | Books | yes      | —                                                             | —                  | check        | Runtipi      |
| Komga (`komga`)                  | Books | yes      | —                                                             | —                  | check        | Runtipi      |
| Kavita (`kavita`)                | Books | yes      | —                                                             | —                  | check        | Runtipi      |
| BookLore (`booklore`)            | Books | yes      | —                                                             | —                  | check        | Upstream     |
| qBittorrent (`qbittorrent`)      | Media | yes      | Raw port 6881 tcp/udp (peers)                                 | —                  | never        | Runtipi      |
| Navidrome (`navidrome`)          | Media | yes      | —                                                             | —                  | candidate    | Runtipi      |
| Sonarr (`sonarr`)                | Media | yes      | —                                                             | —                  | never        | Runtipi      |
| Jackett (`jackett`)              | Media | yes      | —                                                             | —                  | never        | Runtipi      |
| Transmission (`transmission`)    | Media | yes      | Raw port 51413 tcp/udp (peers)                                | —                  | never        | Runtipi      |
| Radarr (`radarr`)                | Media | yes      | —                                                             | —                  | never        | Runtipi      |
| RomM (`romm`)                    | Media | yes      | —                                                             | —                  | check        | Runtipi      |
| Prowlarr (`prowlarr`)            | Media | yes      | Its own FlareSolverr for sites behind a browser check         | —                  | never        | Runtipi      |
| Tautulli (`tautulli`)            | Media | yes      | —                                                             | —                  | never        | Runtipi      |
| Lidarr (`lidarr`)                | Media | yes      | —                                                             | —                  | never        | Runtipi      |
| Pinchflat (`pinchflat`)          | Media | x86 only | —                                                             | —                  | no own login | Runtipi      |
| Emby (`emby`)                    | Media | yes      | Closed source; GPU device optional                            | —                  | candidate    | Runtipi      |
| Bazarr (`bazarr`)                | Media | yes      | —                                                             | —                  | never        | Runtipi      |
| Plex (`plex`)                    | Media | yes      | Closed source; plex.tv account; GPU device optional           | —                  | candidate    | Runtipi      |
| SABnzbd (`sabnzbd`)              | Media | yes      | —                                                             | —                  | never        | Runtipi      |
| MeTube (`metube`)                | Media | yes      | —                                                             | —                  | no own login | Runtipi      |
| Jellyseerr (`jellyseerr`)        | Media | yes      | —                                                             | —                  | check        | CasaOS       |
| Deluge (`deluge`)                | Media | yes      | Raw port 6881 tcp/udp (peers)                                 | —                  | never        | Runtipi      |
| Tube Archivist (`tubearchivist`) | Media | yes      | Elasticsearch and Redis inside the app (about 2 GB of memory) | —                  | check        | Runtipi      |

## Wave 2: files and productivity (23)

| App                                 | Group          | ARM64 | Needs                         | hlabs already does | Public       | Drafted from |
| ----------------------------------- | -------------- | ----- | ----------------------------- | ------------------ | ------------ | ------------ |
| PhotoPrism (`photoprism`)           | Files & photos | yes   | —                             | —                  | candidate    | Runtipi      |
| Duplicati (`duplicati`)             | Files & photos | yes   | Reads the folders it backs up | backups            | never        | Runtipi      |
| PairDrop (`pairdrop`)               | Files & photos | yes   | —                             | —                  | no own login | Runtipi      |
| Stirling-PDF (`stirling-pdf`)       | Files & photos | yes   | —                             | —                  | no own login | Runtipi      |
| copyparty (`copyparty`)             | Files & photos | yes   | —                             | —                  | check        | CasaOS       |
| FileBrowser Quantum (`filebrowser`) | Files & photos | yes   | —                             | —                  | check        | Runtipi      |
| Seafile (`seafile`)                 | Files & photos | yes   | —                             | —                  | candidate    | Upstream     |
| Excalidraw (`excalidraw`)           | Productivity   | yes   | —                             | —                  | no own login | Runtipi      |
| Memos (`memos`)                     | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| Trilium Notes (`trilium`)           | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| Karakeep (`karakeep`)               | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| ArchiveBox (`archivebox`)           | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| Docmost (`docmost`)                 | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| Linkwarden (`linkwarden`)           | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| FreshRSS (`freshrss`)               | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| AFFiNE (`affine`)                   | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| SearXNG (`searxng`)                 | Productivity   | yes   | —                             | —                  | no own login | Runtipi      |
| Wiki.js (`wikijs`)                  | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| BookStack (`bookstack`)             | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| Planka (`planka`)                   | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| Grocy (`grocy`)                     | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| Homebox (`homebox`)                 | Productivity   | yes   | —                             | —                  | check        | Runtipi      |
| Vikunja (`vikunja`)                 | Productivity   | yes   | —                             | —                  | check        | Runtipi      |

## Wave 3: AI, developer, finance, security and other (21)

| App                          | Group     | ARM64 | Needs                                                                   | hlabs already does | Public       | Drafted from |
| ---------------------------- | --------- | ----- | ----------------------------------------------------------------------- | ------------------ | ------------ | ------------ |
| Portainer (`portainer`)      | Developer | yes   | The Docker socket (controls every app): never public                    | app management     | never        | Runtipi      |
| code-server (`code-server`)  | Developer | yes   | A shell in the browser: never public                                    | —                  | never        | Runtipi      |
| NocoDB (`nocodb`)            | Developer | yes   | —                                                                       | —                  | check        | Runtipi      |
| IT-Tools (`it-tools`)        | Developer | yes   | —                                                                       | —                  | no own login | Runtipi      |
| Dockge (`dockge`)            | Developer | yes   | The Docker socket (controls every app): never public                    | app management     | never        | Runtipi      |
| Forgejo (`forgejo`)          | Developer | yes   | —                                                                       | —                  | candidate    | Runtipi      |
| Actual Budget (`actual`)     | Finance   | yes   | —                                                                       | —                  | check        | Runtipi      |
| Firefly III (`firefly-iii`)  | Finance   | yes   | —                                                                       | —                  | check        | Runtipi      |
| Ghostfolio (`ghostfolio`)    | Finance   | yes   | —                                                                       | —                  | check        | Runtipi      |
| Wallos (`wallos`)            | Finance   | yes   | —                                                                       | —                  | check        | Runtipi      |
| OpenClaw (`openclaw`)        | Local AI  | yes   | Acts for you (shell, browser, messages): risky access, never public     | —                  | never        | Runtipi      |
| Ollama (`ollama`)            | Local AI  | yes   | GPU device optional; CPU only on a Mac (Docker can't use the Mac's GPU) | —                  | never        | Runtipi      |
| Langflow (`langflow`)        | Local AI  | yes   | —                                                                       | —                  | check        | CasaOS       |
| LobeChat (`lobechat`)        | Local AI  | yes   | —                                                                       | —                  | check        | Runtipi      |
| AnythingLLM (`anythingllm`)  | Local AI  | yes   | —                                                                       | —                  | check        | CasaOS       |
| LibreChat (`librechat`)      | Local AI  | yes   | —                                                                       | —                  | check        | CasaOS       |
| ntfy (`ntfy`)                | Other     | yes   | —                                                                       | —                  | check        | Runtipi      |
| Kiwix (`kiwix`)              | Other     | yes   | Large downloads (offline Wikipedia is ~100 GB)                          | —                  | no own login | Runtipi      |
| Crafty Controller (`crafty`) | Other     | yes   | Raw port 25565 (Minecraft) and others per server                        | —                  | check        | Runtipi      |
| PrivateBin (`privatebin`)    | Security  | yes   | —                                                                       | —                  | no own login | Runtipi      |
| 2FAuth (`2fauth`)            | Security  | yes   | —                                                                       | —                  | check        | Runtipi      |

## Wave 4: home automation, networking and monitoring (19)

| App                                     | Group           | ARM64 | Needs                                                                                                    | hlabs already does | Public       | Drafted from |
| --------------------------------------- | --------------- | ----- | -------------------------------------------------------------------------------------------------------- | ------------------ | ------------ | ------------ |
| Homebridge (`homebridge`)               | Home automation | yes   | Host network (HomeKit needs it)                                                                          | —                  | never        | Runtipi      |
| Node-RED (`node-red`)                   | Home automation | yes   | —                                                                                                        | —                  | never        | Runtipi      |
| ESPHome (`esphome`)                     | Home automation | yes   | Host network for finding devices (optional); USB for first flash                                         | —                  | never        | Runtipi      |
| Frigate (`frigate`)                     | Home automation | yes   | Devices optional (Coral, GPU); large shared memory; camera streams                                       | —                  | check        | CasaOS       |
| Zigbee2MQTT (`zigbee2mqtt`)             | Home automation | yes   | USB device (Zigbee adapter); its own MQTT broker (Mosquitto, raw port 1883 for Home Assistant)           | —                  | never        | Runtipi      |
| Matter Server (`matter-server`)         | Home automation | yes   | Host network and IPv6 (Matter needs them); kept only if its dashboard works through Caddy, else replaced | —                  | never        | Runtipi      |
| Grafana (`grafana`)                     | Monitoring      | yes   | —                                                                                                        | —                  | check        | Runtipi      |
| Netdata (`netdata`)                     | Monitoring      | yes   | Host PID, /proc and /sys, the Docker socket (read only)                                                  | —                  | never        | Runtipi      |
| changedetection.io (`changedetection`)  | Monitoring      | yes   | —                                                                                                        | —                  | check        | Runtipi      |
| Glances (`glances`)                     | Monitoring      | yes   | Host PID, the Docker socket (read only)                                                                  | —                  | never        | Runtipi      |
| Beszel (`beszel`)                       | Monitoring      | yes   | Its agent: host network and the Docker socket (read only)                                                | —                  | never        | Runtipi      |
| Dozzle (`dozzle`)                       | Monitoring      | yes   | The Docker socket (read only)                                                                            | app management     | never        | Runtipi      |
| Scrutiny (`scrutiny`)                   | Monitoring      | yes   | Disk devices and SYS_RAWIO; Linux only in practice (a Mac's disks aren't visible to Docker)              | —                  | never        | Upstream     |
| Pi-hole (`pi-hole`)                     | Networking      | yes   | Raw port 53 tcp/udp (DNS); can't run beside AdGuard Home                                                 | —                  | never        | Runtipi      |
| Tailscale (`tailscale`)                 | Networking      | yes   | NET_ADMIN and /dev/net/tun                                                                               | remote access      | never        | Runtipi      |
| WireGuard Easy (`wg-easy`)              | Networking      | yes   | NET_ADMIN, sysctls, raw port 51820 udp                                                                   | remote access      | never        | CasaOS       |
| LibreSpeed (`librespeed`)               | Networking      | yes   | —                                                                                                        | —                  | no own login | Runtipi      |
| DDNS Updater (`ddns-updater`)           | Networking      | yes   | —                                                                                                        | —                  | never        | Runtipi      |
| Speedtest Tracker (`speedtest-tracker`) | Networking      | yes   | —                                                                                                        | —                  | check        | Runtipi      |

## Left out

Cloudflared (public apps use hlabs's own controls, D-150); Bitcoin and Lightning apps (D-148); Readarr (retired in 2025); Pingvin Share (archived); the original File Browser and Python Matter Server (archived; their successors are listed); Nginx Proxy Manager (needs ports 80 and 443, which Caddy holds); Homarr, Homepage and Heimdall (hlabs is the dashboard); MinIO (community edition cut back in 2025); Overseerr (Jellyseerr covers it); Mosquitto and FlareSolverr on their own (no web page: inside Zigbee2MQTT and Prowlarr instead). Cut to make 100, and first in line to replace an app that can't be packaged: NZBGet, Autobrr, ownCloud Infinite Scale, Resilio Sync, ConvertX, Scrypted, WatchYourLAN, MySpeed, Gatus, CyberChef, Semaphore, LocalAI, Flowise.
