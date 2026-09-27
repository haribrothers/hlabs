# FileItem

A file or folder in the Files browser, as a grid tile or a list row.

- Icons are the Papirus colour icons from `FileIcon` (D-053). Folders follow the accent (Violet → violet, Mint → teal, Amber → yellow, Rose → magenta); pass `path` (or `folderKind`) so Documents, Photos, Music, Videos, Downloads, Backups, Shared, app data and drives get their own folder icon.
- Files pick their icon from the name's extension (or `mime`, or `kind`). Photos and videos with a `thumbnail` show it instead; the icon shows while it loads.
- Grid tiles are 132px wide with a 72px icon; list rows use the 24px icon and show name, size and modified date.
- Selected items get `accent-wash` with a 1.5px `accent` ring. Multi-select uses the same state.
- Names truncate with an ellipsis and show in full on hover (`title`) and in the details panel.

Click selects, double-click (or Enter) opens, right-click opens the file `Menu`.
