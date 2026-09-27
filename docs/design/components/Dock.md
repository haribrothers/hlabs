# Dock

Desktop and web navigation, in the spirit of the macOS Dock (D-054). Used at 768px wide and up; phones and narrow windows keep `TabBar`.

- **Order**: the six areas · divider · the person's pinned apps (0–8) and the dashed **+** tile · divider · Search. Family members get Home, Files and Settings.
- **Tiles**: `size-dock-tile` (56px), `radius-dock-tile`, white filled 28px glyph. Home is the hlabs app icon (white mark on the Dusk gradient). Area colours are fixed and don't follow the accent: App Store blue, Files cyan, Usage magenta, Backups amber, Settings grey. Pinned apps show their manifest logo, or their gradient tile.
- **Shelf**: Liquid Glass (`blur-bar`, `shadow-tabbar`), `radius-dock`, 14px above the bottom edge, centred. Solid theme: no blur.
- **Dot**: 5px white under the current area and under apps with an open window.
- **Badge**: `badge` count on App Store (updates) and on apps that report one.
- **Hover**: the tile grows to 1.35×, its neighbours to 1.14×, and the name appears in a glass tooltip above. `magnify={false}` or Reduce motion keeps the name and drops the growth.
- **Keyboard**: Tab into the Dock, arrow keys move, Home/End jump, Enter opens; focus shows a white ring and the name.
- **Pinned app menu** (right-click or long-press, via `onAppMenu` + `Menu`): Open · Open in a new tab · App settings · Remove from Dock. Areas and Search can't be removed.
- Below 1280px wide pinned apps shrink to 48px.
