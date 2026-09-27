# 07 · Files

Files is the household's file browser: everyone signed in can browse, preview, upload and organise the files in their private Home folder, and admins also reach the Shared folder, app data, network drives and external drives. It replaces "copy it to the Mac mini over AirDrop" with one place that works the same from a laptop or a phone, and it can publish folders to the local network as SMB shares.

**Screens:** `FilesBrowser` (P2), `FilePreview` (P2), `FilesUpload` (P2), `NetworkDrives` (P2), `FilesShare` (P3), `FilesExternal` (P3), `FilesTrash` (P3), `FilesList` (Nice to have), `FilesContextMenu` (Nice to have), `FilesMove` (Nice to have), `FilesRename` (Nice to have), `FilesLoading` (Nice to have).
**Depends on:** 03-sign-in.md (sessions), 04-home.md (desktop windows, Dock, Spotlight), 06-apps.md (app folder mounts, Open with), 08-usage-backups.md (Use for backups), 09-account-people.md (member "See the Shared folder in Files" permission), 10-system-settings.md (SettingsStorage, storage root).

## Features

| ID | Feature | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-FILE-01 | Browse files | P2 | 5 | `FilesBrowser` |
| F-FILE-02 | Preview files | P2 | 5 | `FilePreview` |
| F-FILE-03 | Upload files | P2 | 5 | `FilesUpload` |
| F-FILE-04 | Connect a network drive | P2 | 5 | `NetworkDrives` |
| F-FILE-05 | Share a folder on the network | P3 | 8 | `FilesShare` |
| F-FILE-06 | External drives | P3 | 8 | `FilesExternal` |
| F-FILE-07 | Trash | P3 | 8 | `FilesTrash` |
| F-FILE-08 | List view and multi-selection | Nice to have | 9 | `FilesList` |
| F-FILE-09 | Right-click menu | Nice to have | 9 | `FilesContextMenu` |
| F-FILE-10 | Move to | Nice to have | 9 | `FilesMove` |
| F-FILE-11 | Rename | Nice to have | 9 | `FilesRename` |
| F-FILE-12 | Loading, empty and error states | Nice to have | 9 | `FilesLoading` |

## User stories

### US-FILE-01 · See my places in the sidebar
**Feature:** F-FILE-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilesBrowser`
**As** anyone signed in, **I want** a sidebar with my folders, drives and Trash, **so that** I can jump to any place I'm allowed to use in one click.

**Acceptance criteria**
- **Given** an admin opens Files, **when** the window renders, **then** the sidebar shows three groups: "Files" (Recents, Home, Photos, Downloads, Shared with me), "Locations" (This computer, one row per connected network or external drive, "+ Connect a drive") and "Other" (App data, Trash), with the storage bar "<used> of <total> used" at the bottom (for example "114 GB of 256 GB used").
- **Given** a member opens Files, **when** the sidebar renders, **then** it shows only Recents, Home, Photos, Downloads and Trash, plus "Shared with me" only if their "See the Shared folder in Files" permission is on; "Locations", "App data", "+ Connect a drive" and the storage bar are not rendered.
- **Given** a member calls `files.list` with a path outside `/home` (or `/shared` without permission), **when** the daemon checks access, **then** it returns `FORBIDDEN` with `hlabsCode` `FILES_ACCESS_DENIED`, regardless of what the UI shows.
- **Given** a user's Home folder has no `Photos`, `Documents` or `Downloads` folder, **when** Files is opened the first time, **then** those three folders are created (existing folders are never touched).
- **Given** a network drive's status is not `mounted`, **when** the sidebar renders, **then** its row shows a StatusDot in the offline state and its name stays clickable.
- **Given** the active place, **when** the user clicks another sidebar row, **then** that row is highlighted (`aria-current="page"`) and the main area shows its root; Photos and Downloads open `/home/Photos` and `/home/Downloads`.
- **Given** the admin clicks "This computer", **then** the main area lists one folder per user's Home (by display name) and "Shared", so admins can reach every Home folder.
- **Given** phase 5, **then** the Trash row and external drive rows are hidden until phase 8 ships (D-036).

**Implementation notes**
- API: `files.list`, `storage.locations.list` (admin), `storage.summary` (admin, for the bar), `files.recent` (new, see API additions). Paths are virtual: `/home`, `/shared`, `/drives/<id>`, plus new admin-only `/users/<username>` and `/appdata/<appId>`.
- Data: `storage_locations`, `users`; Shared permission from 09-account-people.md.
- UI: List + ListRow for the sidebar, StatusDot for drive state, StackedBar or Progress for the storage bar. Recents shows the 50 most recently modified files across the user's Home (and Shared if allowed), newest first.
- App data is read-only in Files (browse and download only) to protect running apps; mutations under `/appdata` return `FILES_READ_ONLY`.
- Edge: symlinks that resolve outside the jail are hidden from listings and rejected with `FILES_INVALID_PATH`; `..` segments are rejected.

### US-FILE-02 · Browse a folder in grid view
**Feature:** F-FILE-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilesBrowser`
**As** anyone signed in, **I want** to see a folder's contents as a grid with breadcrumbs, **so that** I can find a file quickly and know where I am.

**Acceptance criteria**
- **Given** a folder is open, **when** it renders in grid view, **then** each entry is a FileItem: folders first (showing "24 items"), then files (showing size, e.g. "1.2 MB"), each group sorted by name A to Z; files show their Papirus file icon (PDF, spreadsheet, document, archive …, D-053) or, for photos and videos, a thumbnail (the icon shows while it loads or if it fails); folders use the accent colour, and Documents, Photos, Music, Videos, Downloads and Backups at the top of a Home folder get their own folder icon.
- **Given** the folder `/home/Documents`, **then** the breadcrumb reads "Home › Documents"; clicking "Home" opens `/home`; when the path has more than 4 segments, the middle segments collapse into a "…" Menu.
- **Given** the user double-clicks (or presses Enter on) a folder, **then** it opens; on a file, it opens FilePreview.
- **Given** a folder is open, **then** the URL is `/files?path=<virtual path>` and browser back/forward moves between folders.
- **Given** a folder in the user's Home, **then** the footer shows "<n> items · <total size of files>" (e.g. "12 items · 5.1 GB") and "Private to you · <Display name>'s Home folder"; in Shared it shows "Everyone who can see Shared can open this"; on a drive it shows the drive name.
- **Given** the Grid view / List view toggle (Segmented), **when** the user switches, **then** the choice is remembered in localStorage for that browser.
- The Grid view / List view toggle is hidden until phase 9 ships (D-036); until then only grid view exists.
- **Given** keyboard use, **then** arrow keys move focus between FileItems, Enter opens, and every FileItem has an accessible name of its file name plus "folder" or its size.

**Implementation notes**
- API: `files.list` (path, sort) returns `{ items: [{ name, kind, size, childCount, modifiedAt, mime }], nextCursor }`, paged at 200.
- UI: FileItem (uses `FileIcon` from `@hlabs/icons/files`, which takes the kind from `name`/`mime` and the folder icon from the virtual path), Segmented for view, Menu for collapsed breadcrumbs. Thumbnails come from `GET /api/files/preview/:token?w=256` (resized with sharp, cached in `<dataDir>/cache/thumbs`, keyed by path + mtime).
- Hidden files (names starting with ".") and hlabs partial uploads are not listed.
- Edge: folder deleted while open shows "This folder no longer exists" with a "Go to Home" Button.

### US-FILE-03 · Create a folder
**Feature:** F-FILE-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilesBrowser`
**As** anyone signed in, **I want** to create a folder from the toolbar, **so that** I can organise my files.

**Acceptance criteria**
- **Given** a writable folder is open, **when** the user clicks "New folder", **then** a Dialog titled "New folder" opens with a TextField prefilled "Untitled folder" (selected) and buttons "Cancel" and "Create".
- **Given** a valid name, **when** the user clicks "Create" or presses Enter, **then** the folder is created, the dialog closes and the new folder is focused in the grid.
- **Given** a name that already exists in the folder, **then** "Create" shows the inline error "A folder called “<name>” already exists here." and nothing is created.
- **Given** a name that is empty, contains "/" or is longer than 255 bytes, **then** the inline error "Use a shorter name without “/”." is shown and "Create" is disabled.
- **Given** a read-only place (App data, a read-only drive), **then** "New folder", "Upload" and "Share folder" are disabled with the tooltip "This folder is read only".
- "Share folder" is hidden until phase 8 ships (D-036).

**Implementation notes**
- API: `files.mkdir` (path, name) → `CONFLICT` / `FILES_NAME_EXISTS`, `BAD_REQUEST` / `FILES_INVALID_NAME`.
- UI: Dialog, TextField, Button.
- Edge: leading/trailing spaces are trimmed before validation.

### US-FILE-04 · Search files
**Feature:** F-FILE-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilesBrowser`
**As** anyone signed in, **I want** to search by file name, **so that** I can find a file without remembering where I saved it.

**Acceptance criteria**
- **Given** the "Search files" field, **when** the user types at least 2 characters, **then** after a 250 ms pause results are shown for the current place and all its subfolders (case-insensitive, name contains the query).
- **Given** results, **then** they render as FileItems with their folder shown under the name (e.g. "Home › Documents › Bills") and at most 200 results, with "Showing the first 200 results" when capped.
- **Given** no matches, **then** the main area shows "No files match “<query>”".
- **Given** the search field is focused, **when** the user presses Esc or clears it, **then** the folder view returns.
- **Given** a member, **then** results never include paths outside their Home (and Shared if allowed).

**Implementation notes**
- API: `files.search` (root path, query, limit 200). Walks the directory tree with a 5 s time budget; if exceeded, returns partial results with `truncated: true` and the UI shows "Showing the first results".
- Global ⌘K search uses `home.searchEverything`, which calls the same service (04-home.md).

### US-FILE-05 · Download files
**Feature:** F-FILE-01 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilesBrowser`
**As** anyone signed in, **I want** to download a file or folder, **so that** I can use it on the device I'm holding.

**Acceptance criteria**
- **Given** a file, **when** the user chooses Download (preview header, context menu or selection bar), **then** the browser downloads it with its original name via `GET /api/files/download?path=`.
- **Given** a folder or several items, **when** downloaded, **then** a zip named "<folder name>.zip" (or "hlabs files.zip" for a multi-selection) is streamed without being built on disk first.
- **Given** a video is downloaded, **then** HTTP range requests are honoured so interrupted downloads can resume.
- **Given** a member requests a path outside their access, **then** the endpoint returns 403 and no bytes.
- Download from the context menu and the selection bar is hidden until phase 9 ships (D-036); until then Download is in the preview header only.

**Implementation notes**
- API: `GET /api/files/download` (extended to accept repeated `path` parameters, see API additions). Auth is the session cookie; CSRF not needed for GET.
- Edge: file names with non-ASCII characters use `Content-Disposition: attachment; filename*=UTF-8''…`.

### US-FILE-06 · Preview a file
**Feature:** F-FILE-02 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilePreview`
**As** anyone signed in, **I want** to look at images, videos, PDFs and text files without downloading them, **so that** I can check a file quickly.

**Acceptance criteria**
- **Given** an image (JPEG, PNG, GIF, WebP, SVG), **when** opened, **then** it is shown fitted to the preview area; a video (MP4, WebM, MOV in H.264) plays in a native video element with controls; a PDF shows in the browser's PDF viewer; a text file (txt, md, csv, json, yml, log, common source code) shows its first 1 MB in monospace.
- **Given** any other type (e.g. XLSX, ZIP, HEIC), **then** the preview shows the file's icon, "No preview for this kind of file" and a "Download" Button.
- **Given** the preview is open, **then** the header shows the file name, "Share", "Download" and a "•••" Menu (Rename…, Move to…, Move to Trash; each is hidden until the phase that ships it, D-036; "Share" is hidden until phase 9 ships, D-036), and the close button has the label "Close preview".
- **Given** the preview is open, **when** the user presses Left/Right or clicks "Previous file"/"Next file", **then** the previous/next file in the current folder order is shown (folders are skipped); Esc closes the preview and returns focus to the FileItem.
- **Given** the "Details" panel, **then** it shows Size, Dimensions (images and videos only, e.g. "4032 × 3024"), Modified (e.g. "12 Sep 2026") and Location (e.g. "Home › Documents", clickable to open that folder).
- **Given** a preview URL, **then** it is signed, valid for 5 minutes and bound to the requesting user; an expired token returns 410 and the UI requests a new one silently.

**Implementation notes**
- API: `files.preview` (returns a signed URL), `files.stat` (size, mtime, dimensions read from the image header or `ffprobe`-free MP4 box parsing; omit dimensions if unknown), `GET /api/files/preview/:token` with range support.
- UI: Dialog (full window on desktop, sheet on phone), Button, Menu, List for details.
- Edge: SVGs are served with `Content-Security-Policy: sandbox` and `Content-Type: image/svg+xml` to prevent script execution.

### US-FILE-07 · Open a file with an app
**Feature:** F-FILE-02 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilePreview`
**As** anyone signed in, **I want** to see which installed apps can use this file, **so that** I can open it in Immich or Nextcloud.

**Acceptance criteria**
- **Given** a file inside a folder that an installed app has mounted (for example `/home/Photos` mounted by Immich), **when** its preview opens, **then** "Open with" lists those apps with their AppIcon and name.
- **Given** the user clicks an app, **then** the app's URL opens in a new tab.
- **Given** a member, **then** only apps they have access to (`app_access`) are listed.
- **Given** no app mounts the file's folder, **then** the "Open with" section is not rendered.

**Implementation notes**
- API: `files.openWith` (new): matches the path against `app_mounts` (storage location + subpath) for apps in state `running`.
- Data: `app_mounts`, `apps`, `app_access`.
- UI: AppIcon, ListRow. Deep links into apps are out of scope; the app's home URL is opened.

### US-FILE-08 · Upload files with progress
**Feature:** F-FILE-03 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilesUpload`
**As** anyone signed in, **I want** to upload files by picking or dropping them, **so that** I can get files from my device onto hlabs.

**Acceptance criteria**
- **Given** a writable folder, **when** the user clicks "Upload", **then** the system file picker opens with multiple selection.
- **Given** the user drags files over the Files window, **then** an overlay reads "Drop to upload to <folder name>" (e.g. "Drop to upload to Documents"); dropping starts the upload into the open folder.
- **Given** uploads are running, **then** the Uploads panel shows "Uploading <n> files", an estimate ("About 1 min left", from a 10 s rolling average) and one row per file with status "Done", "<p>% · <sent> of <total>" (e.g. "62% · 1.1 of 1.8 GB") with a Progress bar, or "Waiting".
- **Given** several files, **then** they upload one at a time in the order chosen.
- **Given** all files finish, **then** after 5 s the panel collapses to a Toast "<n> files uploaded" and the folder listing refreshes.
- **Given** a dropped folder, **then** a Toast says "Folders can't be uploaded yet. Upload the files inside instead." and other dropped files still upload.
- **Given** the file is larger than the free space on the target minus 1 GB, **then** that row shows "Not enough space" and no data is sent.

**Implementation notes**
- API: `POST /api/files/upload` creates an `upload_sessions` row (path, size, onConflict) and returns its id; chunks are sent with `PATCH /api/files/upload/:id` (8 MB, `Upload-Offset` header); `HEAD` returns the current offset; `DELETE` cancels (see API additions).
- Data: `upload_sessions`. Bytes are written to a hidden `.<name>.hlabs-part` file in the target folder and renamed on completion, so partial files never appear.
- UI: GlassCard panel, Progress, Button, Toast.
- Edge: errors map `hlabsCode` `FILES_NO_SPACE`, `FILES_ACCESS_DENIED`, `FILES_READ_ONLY` to row messages.

### US-FILE-09 · Pause, resume and cancel uploads
**Feature:** F-FILE-03 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilesUpload`
**As** anyone signed in, **I want** uploads to survive pauses and flaky connections, **so that** a 2 GB video doesn't have to start over.

**Acceptance criteria**
- **Given** uploads are running, **when** the user clicks "Pause", **then** the current chunk finishes, no new chunks are sent and the button becomes "Resume".
- **Given** a chunk fails with a network error, **then** it is retried after 1, 2, 4, 8 and 16 s; after the fifth failure the row shows "Paused · connection lost" and the panel shows "Resume".
- **Given** the user clicks "Resume", **then** the client asks the server for the current offset and continues from there, not from zero.
- **Given** the page is reloaded mid-upload, **then** Files shows "<n> uploads were interrupted" with "Choose files again"; picking the same file (same name and size) into the same folder resumes from the stored offset.
- **Given** the user clicks "Cancel all", **then** every unfinished upload is deleted on the server (session and partial file) and finished files are kept.
- **Given** an upload session has had no chunk for 24 hours, **then** the daemon deletes the session and its partial file.

**Implementation notes**
- API: `HEAD`/`PATCH`/`DELETE /api/files/upload/:id`.
- Data: `upload_sessions.received` updated after each chunk is fsynced.
- Edge: two tabs resuming the same session get `409` on the second; the second tab shows the upload as running elsewhere.

### US-FILE-10 · Handle name conflicts when uploading
**Feature:** F-FILE-03 · **Priority:** P2 · **Phase:** 5 · **Screens:** `FilesUpload`
**As** anyone signed in, **I want** to decide what happens when a file with the same name exists, **so that** I never overwrite something by accident.

**Acceptance criteria**
- **Given** an upload whose name already exists in the target folder, **when** it reaches the front of the queue, **then** a Dialog asks "“<name>” already exists in <folder>" with buttons "Skip", "Keep both" and "Replace", and a checkbox "Do this for every conflict".
- **Given** "Keep both", **then** the upload is saved as "<name> (2).<ext>" (next free number).
- **Given** "Replace", **then** the existing file is moved to Trash and the upload takes its name.
- **Given** "Skip", **then** that row shows "Skipped" and the queue continues.
- **Given** the checkbox is ticked, **then** the choice is applied to the remaining conflicts in this batch without asking again.

**Implementation notes**
- API: conflict check via `files.stat` before creating the session; `onConflict: skip | keepBoth | replace` passed to `POST /api/files/upload`, re-checked server-side at completion.
- Data: `trash_items` for the replaced file.
- UI: Dialog, Button, Switch or checkbox.

### US-FILE-11 · Connect an SMB or NFS drive
**Feature:** F-FILE-04 · **Priority:** P2 · **Phase:** 5 · **Screens:** `NetworkDrives`
**As** an admin, **I want** to connect a NAS share, **so that** its files appear in Files and apps can use it.

**Acceptance criteria**
- **Given** the admin clicks "+ Connect a drive", **then** a Dialog "Connect a network drive" opens with "Found on your network" listing servers discovered by mDNS within 5 s (e.g. "nas.local · SMB · 3 shares"), and "Or enter an address" with a TextField accepting `smb://host/share`, `\\host\share` or `nfs://host/path`.
- **Given** the admin selects a discovered server, **then** its shares are listed and one can be chosen; the address field is filled with `smb://<host>/<share>`.
- **Given** SMB, **then** "Username" and "Password" fields are shown; for NFS they are hidden.
- **Given** the admin clicks "Connect", **then** hlabs tests the connection first (10 s timeout) and on success mounts the share, adds a sidebar row "<Host> · <Share>" (e.g. "NAS · Media") and closes the dialog.
- **Given** the test fails, **then** the dialog stays open with an inline error: "Wrong username or password", "Can't reach <host>" or "There's no share called “<share>” on <host>".
- **Given** "Reconnect automatically after restart" is on (default on), **then** the daemon mounts the drive at startup and retries every 60 s while it is unreachable.
- **Given** "Let apps use this drive (you choose which ones)" is on, **then** the drive appears as a folder option in InstallSheet and AppPermissions (06-apps.md); off, it is only visible in Files.
- **Given** a member, **then** "+ Connect a drive" is not shown and `storage.locations.addNetwork` returns `FORBIDDEN`.

**Implementation notes**
- API: `storage.locations.discover` (new), `storage.locations.testNetwork` (returns the share list for a host when no share is given), `storage.locations.addNetwork`.
- Data: `storage_locations` (kind `smb`/`nfs`, `secret_ref`); password stored in the OS keychain (AES-GCM file on headless Linux), never in SQLite. Needs two flags on `storage_locations`: `auto_mount` and `apps_allowed` (see Open questions).
- Mount: macOS `mount_smbfs`/`mount_nfs` into `<dataDir>/mounts/<id>`; Linux via the privileged helper (`mount.cifs`). Password is passed via a credentials file (0600, deleted after mount), never on the command line.
- UI: Dialog, List, TextField, Switch, Button. Audit log entry `storage.addNetwork`.

### US-FILE-12 · Disconnect or recover a network drive
**Feature:** F-FILE-04 · **Priority:** P2 · **Phase:** 5 · **Screens:** `NetworkDrives`, `FilesBrowser`
**As** an admin, **I want** to see when a network drive is offline and remove it, **so that** broken drives don't confuse me or my apps.

**Acceptance criteria**
- **Given** a network drive is unreachable, **when** the admin opens it, **then** the main area shows "Can't reach <drive name>" and a "Try again" Button that re-attempts the mount.
- **Given** the admin right-clicks a drive in the sidebar, **then** a Menu shows "Disconnect".
- **Given** no app mounts the drive, **when** "Disconnect" is confirmed in a Dialog "Disconnect <drive name>?" (body "Files on the drive are not deleted."), **then** it is unmounted, its keychain secret deleted and the row removed.
- **Given** one or more apps mount the drive, **then** the dialog says "<App> uses this drive. Choose another folder for it first." and offers no disconnect button.

**Implementation notes**
- API: `storage.locations.remove`, `storage.locations.list` (status). Status changes are pushed with the new `storage.locationChanged` event.
- Data: `storage_locations.status`, `last_seen_at`; `app_mounts`.

### US-FILE-13 · Share a folder on the local network
**Feature:** F-FILE-05 · **Priority:** P3 · **Phase:** 8 · **Screens:** `FilesShare`
**As** anyone signed in, **I want** to publish a folder as a network share, **so that** I can open it from Finder, Windows Explorer or a TV app.

**Acceptance criteria**
- **Given** a folder in the user's Home (or, for admins, any folder in Home folders, Shared or a drive), **when** the user clicks "Share folder", **then** a Dialog "Share “<folder>” on your network" opens with the body "Open it from Finder, Windows Explorer or a TV app like a normal network drive."
- **Given** the "Share this folder" Switch is turned on, **then** the "Address" row shows `smb://<hostname>/<share name>` (e.g. `smb://hlabs.local/Documents`) with a "Copy" Button that copies it and shows the Toast "Address copied".
- **Given** "Who can open it", **then** the user picks one of "Only me" (read and write) or "Everyone with an hlabs account (read only)".
- **Given** the user clicks "Save", **then** the share is live within 10 s; clicking "Cancel" discards changes.
- **Given** another share already uses the folder name, **then** the share name gets a suffix ("Documents-2") and the address shows it.
- **Given** the switch is turned off and saved, **then** the share is removed and connected clients are disconnected.
- **Given** a shared folder, **then** its FileItem shows a "Shared" Badge.
- **Given** I haven't set a network-share password yet, **when** I turn sharing on, **then** the Dialog asks for one ("Network share password", at least 12 characters, with the hint "Used only when a device opens this share. It's separate from your hlabs password."); I can change it later from the same Dialog.
- **Given** macOS, **when** a share is saved, **then** hlabs configures it through macOS File Sharing (`sharing` command) and turns File Sharing on if needed; **given** Linux, **then** hlabs runs and reconfigures its Samba container.

**Implementation notes**
- API: `files.shares.get` / `files.shares.set` / `files.shares.remove` (new).
- Data: `file_shares` (`protocol` `smb`, `read_only`, `users_json`).
- Server (D-051): macOS uses its built-in File Sharing via the `sharing` command; Linux uses an hlabs-managed Samba container whose config is regenerated from `file_shares` on every change. Share users authenticate with their network-share password (`users.share_password_ref`, stored in the form the share server needs, never the hlabs password).

### US-FILE-14 · Detect and browse an external drive
**Feature:** F-FILE-06 · **Priority:** P3 · **Phase:** 8 · **Screens:** `FilesExternal`
**As** an admin, **I want** plugged-in USB drives to appear in Files, **so that** I can copy files to and from them.

**Acceptance criteria**
- **Given** a USB or Thunderbolt drive is mounted by the OS, **when** 5 s pass, **then** it appears under "Locations" with its volume name and the event `storage.locationChanged` updates open windows.
- **Given** the admin opens it, **then** the header shows the drive name and "<free> free of <size> · <bus> · <filesystem>" (e.g. "1.2 TB free of 2 TB · USB · exFAT"), with "Use for backups" and "Eject" Buttons, and the folder grid below.
- **Given** the footer, **then** it reads "Apps can use this drive only if you allow it in their Permissions. Eject before unplugging."
- **Given** "Use for backups", **then** the Add backup destination flow opens with type "Drive" and this drive's path prefilled (08-usage-backups.md).
- **Given** a drive is unplugged without ejecting, **then** its row disappears, apps using it get state `error`, and an admin notification "<drive> was unplugged without ejecting" is created.
- **Given** a member, **then** external drives never appear and `/drives/<id>` returns `FILES_ACCESS_DENIED`.

**Implementation notes**
- API: `storage.locations.list` (kind `external`), `storage.locationChanged` event (new).
- Detection: macOS watches `/Volumes` and reads `diskutil info -plist`; Linux listens to UDisks2 over D-Bus (desktop) or watches `/media` and `/run/media` (headless). System and boot volumes are excluded.
- Data: a `storage_locations` row (kind `external`) is created on first sight and kept, so app mounts survive re-plugging; `status` becomes `missing` when unplugged.
- UI: GlassCard header, Button, FileItem.

### US-FILE-15 · Eject an external drive
**Feature:** F-FILE-06 · **Priority:** P3 · **Phase:** 8 · **Screens:** `FilesExternal`
**As** an admin, **I want** to eject a drive safely, **so that** I don't corrupt files when unplugging it.

**Acceptance criteria**
- **Given** no running app uses the drive and no upload, move or backup job targets it, **when** the admin clicks "Eject", **then** it is unmounted, the Toast "<drive> can be unplugged" is shown and the row disappears.
- **Given** running apps mount the drive, **then** a Dialog "Stop <n> apps and eject?" lists them; confirming stops them, ejects, and leaves them stopped.
- **Given** an active job uses the drive, **then** Eject is disabled with the tooltip "Wait for <job> to finish".
- **Given** the OS refuses (busy), **then** the Toast "Something is still using <drive>. Close it and try again." is shown and the drive stays.

**Implementation notes**
- API: `storage.locations.eject`, `apps.stop`, `jobs.list`.
- macOS `diskutil eject`; Linux UDisks2 `Unmount` + `PowerOff`.

### US-FILE-16 · Move items to Trash with undo
**Feature:** F-FILE-07 · **Priority:** P3 · **Phase:** 8 · **Screens:** `FilesTrash`, `FilesBrowser`
**As** anyone signed in, **I want** deleted files to go to Trash first, **so that** I can get them back after a mistake.

**Acceptance criteria**
- **Given** one or more selected items in Home or Shared, **when** the user chooses "Move to Trash" or presses Delete/Backspace, **then** they disappear from the folder and a Toast "<n> items moved to Trash" with "Undo" shows for 8 s; Undo restores them.
- **Given** items on a network or external drive, **then** a Dialog "Delete <n> items for good?" with "You can't undo this." and a destructive "Delete" Button is shown instead, because Trash only covers this computer.
- **Given** an item deleted from Shared, **then** it goes to the Trash of the user who deleted it.
- **Given** a read-only place, **then** "Move to Trash" is disabled.

**Implementation notes**
- API: `files.trash` (paths) → `{ trashItemIds }`, `files.restoreFromTrash` for Undo.
- Data: `trash_items` (`owner_user_id`, `original_path`, `trash_path` under `<storageRoot>/.trash/<userId>/<id>`, `size`). Move is a rename on the same filesystem, so it's instant.
- UI: Toast with action, Dialog.

### US-FILE-17 · Restore items from Trash
**Feature:** F-FILE-07 · **Priority:** P3 · **Phase:** 8 · **Screens:** `FilesTrash`
**As** anyone signed in, **I want** to see what I deleted and restore it, **so that** I can undo a delete days later.

**Acceptance criteria**
- **Given** the user opens Trash, **then** the header shows "Trash", "Restore all" and "Empty trash" and the note "Items are deleted for good after 30 days."; items are listed newest first.
- **Given** an item, **then** its row shows the name, "From <original folder> · deleted <relative day>" (e.g. "From Documents › Bills · deleted yesterday"), "<n> days left" (30 minus whole days since deletion; "4 days left" shown in the warning colour when 7 or fewer) and a "Restore" Button.
- **Given** "Restore", **then** the item goes back to its original path; if its folder no longer exists it is recreated; if the name is taken it is restored as "<name> (2)".
- **Given** the original location was on a drive that is not connected, **then** the Toast "Couldn't restore. <drive> isn't connected." is shown and the item stays in Trash.
- **Given** "Restore all", **then** every item is restored with the same rules and a Toast "<n> items restored".
- **Given** Trash is empty, **then** the list shows "Trash is empty" and both header buttons are disabled.
- **Given** a member, **then** they see only their own trash items; admins also see only their own.

**Implementation notes**
- API: `files.listTrash` (new, paginated), `files.restoreFromTrash` (ids; omitted ids means all).
- Data: `trash_items` filtered by `owner_user_id`.
- UI: List, ListRow, Button, Badge for days left.

### US-FILE-18 · Empty Trash manually and automatically
**Feature:** F-FILE-07 · **Priority:** P3 · **Phase:** 8 · **Screens:** `FilesTrash`
**As** anyone signed in, **I want** Trash to clean itself up, **so that** deleted files don't fill the disk forever.

**Acceptance criteria**
- **Given** "Empty trash", **when** clicked, **then** a Dialog "Empty trash?" says "<n> items (<size>) will be deleted for good. You can't undo this." with "Cancel" and a destructive "Empty trash" Button.
- **Given** the user confirms, **then** only their trash items are permanently deleted and the storage bar updates.
- **Given** an item has been in Trash for 30 days, **when** the hourly scheduler task runs, **then** it is permanently deleted and its `trash_items` row removed.
- **Given** a file in `.trash` is missing on disk, **then** its row is removed without error.

**Implementation notes**
- API: `files.emptyTrash`. Large deletions run as a job (`kind` `empty_trash`) and report via `job.progress`.
- Data: `trash_items.deleted_at`; scheduler task `trash.autoEmpty` every hour.
- Edge: a trash item whose owner was deleted is purged with the user's Home per 09-account-people.md.

### US-FILE-19 · Switch to list view and sort
**Feature:** F-FILE-08 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `FilesList`
**As** anyone signed in, **I want** a list with name, date and size columns, **so that** I can scan and sort many files.

**Acceptance criteria**
- **Given** the user picks "List view", **then** the folder shows a table with columns "Name", "Modified" and "Size"; folders show their item count in Size.
- **Given** Modified, **then** dates within 7 days are relative ("2 days ago", "3 weeks ago" up to 4 weeks), older dates in the same year are "12 Sep 2026", and older than 6 months show month and year ("Aug 2026").
- **Given** the user clicks a column header, **then** the list sorts by it; clicking again reverses; the active header shows an arrow ("Name ↑"); folders always stay above files.
- **Given** the sort, **then** it is kept per browser in localStorage and applies to grid view too.

**Implementation notes**
- API: `files.list` with `sort: { by: name|modified|size, dir: asc|desc }`.
- UI: List, ListRow, FileItem (row variant). Column headers are buttons with `aria-sort`.

### US-FILE-20 · Select several items
**Feature:** F-FILE-08 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `FilesList`
**As** anyone signed in, **I want** to select several files at once, **so that** I can move, download or delete them together.

**Acceptance criteria**
- **Given** list or grid view, **then** click selects one item, Cmd/Ctrl-click toggles an item, Shift-click selects a range, each row has a checkbox labelled "Select <name>", and Cmd/Ctrl+A selects all.
- **Given** one or more items are selected, **then** a selection bar replaces the toolbar actions with "<n> selected", "Move to…", "Share", "Download", "Move to Trash" and "✕" (label "Clear selection").
- **Given** a selection, **then** the footer reads "<n> items · <k> selected · <size of selected files>" (e.g. "12 items · 3 selected · 4.7 MB") and the hint "Shift-click to select a range" is shown.
- **Given** Esc or "✕", **then** the selection clears.
- **Given** "Share" with a selection that isn't exactly one folder, **then** it uses the device's share sheet for files (Web Share API) and is hidden where unsupported.
- **Given** the folder changes, **then** the selection clears.

**Implementation notes**
- UI: FileItem selected state, Button, Toast. Selection is client state; actions call `files.move`, `files.trash`, `/api/files/download`.
- Accessibility: the list uses `role="grid"` with `aria-selected`; selection count is announced via a live region.

### US-FILE-21 · Use the right-click menu
**Feature:** F-FILE-09 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `FilesContextMenu`
**As** anyone signed in, **I want** a right-click menu on files, **so that** common actions are one click away.

**Acceptance criteria**
- **Given** the user right-clicks a file (or presses Shift+F10 / the Menu key), **then** a Menu opens with "Open ↵", "Open with ›", "Share…", "Copy link", "Download", "Rename…", "Move to…", "Duplicate" and "Move to Trash ⌫", grouped with separators.
- **Given** the item is not selected, **then** it becomes the only selection; if it is part of a multi-selection, the menu applies to all selected items and hides "Open", "Open with", "Copy link" and "Rename…".
- **Given** "Open with ›", **then** a submenu lists apps from `files.openWith`, or "No apps" (disabled).
- **Given** "Copy link", **then** `https://<hostname>/files?path=<path>` is copied and the Toast "Link copied · only people who can open this folder can use it" is shown.
- **Given** "Duplicate", **then** a copy named "<name> copy.<ext>" (then "copy 2") is created next to it and selected.
- **Given** a read-only place, **then** Rename, Move to, Duplicate and Move to Trash are disabled.
- **Given** the menu is open, **then** arrow keys move, Enter activates, Esc closes and returns focus to the item.

**Implementation notes**
- API: `files.copy` (Duplicate), `files.openWith`, plus the actions of other stories.
- UI: Menu with shortcut hints. "Share…" on a folder opens FilesShare (US-FILE-13); on a file it uses the Web Share API.

### US-FILE-22 · Move items to another folder
**Feature:** F-FILE-10 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `FilesMove`
**As** anyone signed in, **I want** to pick a destination folder from a tree, **so that** I can reorganise files without dragging.

**Acceptance criteria**
- **Given** "Move to…" for 3 items, **then** a Dialog "Move 3 items to…" shows a folder tree starting at Home (the current folder marked "current"), then Photos, "Shared with me" and connected drives the user can write to.
- **Given** the user selects a folder, **then** the primary Button reads "Move to <folder>" (e.g. "Move to Taxes"); it is disabled for the current folder and for any moved folder or its subfolders.
- **Given** "+ New folder", **then** a folder is created inside the selected one and selected.
- **Given** the move is on the same disk, **then** it completes immediately and the Toast "Moved 3 items to Taxes" with "Undo" appears.
- **Given** the move crosses disks (e.g. Home to NAS · Media) or is larger than 1 GB, **then** it runs as a job: the Toast shows a Progress bar and the files are deleted from the source only after the copy is verified.
- **Given** a name conflict at the destination, **then** the same Skip / Keep both / Replace Dialog as uploads is shown.
- **Given** drag and drop of items onto a folder or sidebar row, **then** the same move happens.

**Implementation notes**
- API: `files.list` (folders only, lazy per tree node), `files.mkdir`, `files.move` → `{ done: true }` or `{ jobId }`; progress via `job.progress`.
- UI: Dialog, List (tree with `role="tree"`), Button, Progress, Toast.
- Edge: cancelling a cross-disk job leaves the source untouched and removes partial copies.

### US-FILE-23 · Rename a file or folder
**Feature:** F-FILE-11 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `FilesRename`
**As** anyone signed in, **I want** to rename an item safely, **so that** I don't break the file type by accident.

**Acceptance criteria**
- **Given** "Rename…" on a file, **then** a Dialog "Rename" opens with a "New name" TextField containing the name without its extension (e.g. "Lease agreement"), selected, and the extension (".pdf") shown next to it, not editable.
- **Given** a file with an extension, **then** the helper text reads "The .pdf ending is kept so apps still know how to open it." with the real extension.
- **Given** a folder or a file without an extension, **then** the whole name is editable and no helper text is shown.
- **Given** the user clicks "Rename" or presses Enter, **then** the item is renamed and stays selected; "Cancel" or Esc closes without changes.
- **Given** the new name exists, is empty, contains "/" or is over 255 bytes, **then** the same inline errors as New folder are shown and "Rename" is disabled.
- **Given** the item is mounted by an app or shared on the network, **then** a warning says "<App> uses this folder. Renaming it will break that." and requires a second click on "Rename anyway".

**Implementation notes**
- API: `files.rename` (path, newName); F2 opens the dialog for the focused item.
- Data: renaming a shared folder updates `file_shares.path`.
- UI: Dialog, TextField, Button.

### US-FILE-24 · See skeletons while a folder loads
**Feature:** F-FILE-12 · **Priority:** Nice to have · **Phase:** 9 · **Screens:** `FilesLoading`
**As** anyone signed in, **I want** a clear loading state, **so that** I know hlabs is working on a slow drive.

**Acceptance criteria**
- **Given** `files.list` hasn't returned within 150 ms, **then** the main area shows skeleton FileItems (12 in grid view, 8 rows in list view) with `aria-busy="true"` and the label "Loading files"; the sidebar, breadcrumb and toolbar stay interactive.
- **Given** a cached listing exists for the folder, **then** it is shown immediately and refreshed in the background with no skeleton.
- **Given** reduce motion is on (OS setting or hlabs appearance), **then** skeletons don't shimmer.
- **Given** loading takes more than 10 s, **then** the text "Still loading… this drive is slow to respond" appears under the skeletons.
- **Given** the request fails, **then** the area shows "Couldn't load this folder" and a "Try again" Button.
- **Given** a folder with no items, **then** the area shows "This folder is empty" and "Drop files here or use Upload" (the second line only when writable).

**Implementation notes**
- UI: FileItem skeleton variant; TanStack Query cache keyed by path and sort.
- Edge: switching folders while loading cancels the previous request.

## API additions
Merged into [05-api](../prd/05-api.md) under "Contract additions from the feature files".

## Open questions
Resolved as defaults in [12-decisions](../prd/12-decisions.md); the few that remain are in [13-risks-open-questions](../prd/13-risks-open-questions.md).
