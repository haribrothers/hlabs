# FileIcon

Colour icon for a file or folder in the Files app, from the Papirus icon theme (GPL-3.0, D-053). Used inside `FileItem`; use it directly in menus, dialogs (Move, Rename, Share), Trash rows and search results.

- `name` (+ optional `mime`) picks the file kind from the extension: 34 kinds, `unknown` for the rest. Or pass `kind`.
- `folder`: a folder kind (`plain`, `documents`, `pictures`, `music`, `videos`, `downloads`, `shared`, `apps`, `backup`, `network`, `private`), or `true` with a `path` to work it out. Special icons only at the top of a Home folder, plus `/shared`, `/appdata/<app>` and `/drives/<drive>`.
- `accent`: folders follow the accent (Violet → violet, Mint → teal, Amber → yellow, Rose → magenta). Defaults to the page's `data-accent`.
- `size`: 72 in the grid, 56 on phone, 24 in lists, 16/20 in menus. 32 and below use the 24px art.
- Decorative (`alt=""`); the name next to it is the label.

In the app, import from `@hlabs/icons/files` (loaded only with Files). All files are in the File icons asset group.
