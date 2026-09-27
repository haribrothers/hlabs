# AppIcon

An installed app on Home: a gradient tile, a white icon, and the name underneath, with state shown on the tile.

Tile `size-app-icon` (76px), radius `radius-icon`, `shadow-icon`.

**Logo first.** Pass the app's own logo from its App Store manifest as `src` (square PNG or SVG, at least 256px). It fills the tile edge to edge; don't add a border or tint. The two `colors` are the fallback: while the logo loads, or if the manifest has none, the tile shows that gradient with a white Lucide `icon` from `@hlabs/icons`.

States: `running` (plain), `installing` (ring shows `progress`, name reads "Installing… 62%"), `update`, `stopped` (tile dims), `error`. Badges sit on the top-right corner. The whole thing is one button or link.
