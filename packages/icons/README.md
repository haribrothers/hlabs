# @hlabs/icons

Every icon in hlabs comes from this package: the web UI and the Tauri tray app import from here, never from `lucide-react` directly.

```tsx
import { Download, HardDrive, iconDefaults } from '@hlabs/icons'; // Lucide, tree-shaken
import { tabGlyphs, TabHome } from '@hlabs/icons';                 // filled tab-bar glyphs
import { LogoMark, LogoLockup } from '@hlabs/icons';               // the hlabs logo
import { AppLogo } from '@hlabs/icons';                            // an app's logo with fallback
import { AppIconManifest, resolveAppIcon } from '@hlabs/icons/manifest'; // zod schema (daemon)
import { FileIcon, fileKindOf, folderKindOf } from '@hlabs/icons/files';   // Files app icons (Papirus)
```

## UI icons (Lucide)

Outline, 24px grid, stroke 2, round caps and joins. Sizes: 16 inline with text, 20 in rows and buttons (`iconDefaults`), 24 in toolbars and empty states. Colour comes from `currentColor`, so set `ink` or `ink-muted` on the parent.

Icon-only buttons need an `aria-label` on the button; the icon itself stays decorative.

## Tab-bar glyphs

`TabHome`, `TabStore`, `TabFiles`, `TabUsage`, `TabBackups`, `TabSettings`, `TabSearch`, also as `tabGlyphs[id]`. Filled, 24px, always filled whether or not the tab is selected. They're decorative by default because the tab label sits under them.

```tsx
const Glyph = tabGlyphs[tab.id];
<Glyph />
```

## Logo

```tsx
<LogoMark />                         // gradient, for dark and glass surfaces (default)
<LogoMark tone="on-light" size={32}/> // on white
<LogoMark tone="current" />          // follows text colour
<LogoLockup size={40} />             // mark + "hlabs", sign-in / installer / About
```

Tones: `color`, `on-light`, `white`, `ink`, `current`. `size` is the height; width follows the 201:163 ratio. At 20px and below the mark is automatically **simplified** (no dots, slightly bolder stroke) because the dots blur together at that size; override with `simplified`. Pass `title=""` when a visible "hlabs" label is next to it.

Static files for packaging are in `assets/`:

| File | Use |
| --- | --- |
| `hlabs-app-icon.svg`, `hlabs-app-icon-1024.png` | App icon source. Run `pnpm tauri icon node_modules/@hlabs/icons/assets/hlabs-app-icon-1024.png` to generate the macOS `.icns`, Windows `.ico` and Linux PNGs. Also the PWA icon and favicon. |
| `tray/hlabsTemplate.png`, `tray/hlabsTemplate@2x.png` | macOS menu-bar icon (18 / 36 px), the simplified mark. Black + alpha; set `iconAsTemplate(true)` in Tauri so macOS tints it for light and dark menu bars. |
| `tray/hlabs-tray-{22,24,32,48}.png` | Linux tray (white on transparent; GNOME and KDE panels are dark by default). 22 and 24 use the simplified mark. |
| `hlabs-mark*.svg`, `hlabs-lockup*.svg` | The logo for docs, the website and the installer DMG background. `hlabs-mark-small-*.svg` is the simplified mark for 20px and below. |

## App logos

```tsx
<AppLogo name="Jellyfin" src={app.icon.logoUrl} colors={app.icon.gradient ?? undefined} />
```

Shows the app's own logo from its manifest, filling the tile. While it loads, or if it's missing or fails, the tile shows a two-stop gradient (from the manifest, otherwise picked from the app's name, so it's stable) with a white Lucide icon. Sizes: 76 on Home, 56 in Store cards, 60 on phone, 40 in lists.

### Manifest fields

In an app's `hlabs-app.yml`:

```yaml
icon:
  logo: logo.svg                  # square PNG or SVG, at least 256px; path in the app folder, or https URL
  gradient: ["#8b5cf6", "#4c1d95"] # optional fallback tile colours
  fallback: film                  # optional Lucide icon name (kebab-case)
```

The daemon validates it with `AppIconManifest` and sends the UI a `ResolvedAppIcon` from `resolveAppIcon(icon, '/api/apps/<id>/assets/')`.

To turn `fallback` into a component in the UI, use Lucide's dynamic import so unused icons stay out of the bundle:

```tsx
import { DynamicIcon } from 'lucide-react/dynamic';
<AppLogo name={app.name} src={app.icon.logoUrl} fallbackIcon={app.icon.fallback ? <DynamicIcon name={app.icon.fallback} size={34} /> : undefined} />
```

## File and folder icons (Files app)

Colour icons for files and folders come from the [Papirus icon theme](https://github.com/PapirusDevelopmentTeam/papirus-icon-theme) (decision D-053). They live in a separate entry, `@hlabs/icons/files`, so only the Files screens load them (about 41 KB gzip).

```tsx
<FileIcon name="Holiday.pdf" />                            // kind from the extension
<FileIcon name="clip" mime="video/mp4" />                  // falls back to the MIME type
<FileIcon folder path="/home/Photos" accent={accent} />     // folder, special icon for Photos
<FileIcon folder path="/home/Photos/2025" accent={accent} size={24} /> // plain folder, list row
```

- **Folders follow the accent**: Violet → violet, Mint → teal, Amber → yellow, Rose → magenta. Pass the current `data-accent`.
- **Special folders** get their own icon, only at the top of a Home folder (`/home/<Name>` or `/users/<user>/<Name>`): Documents, Photos/Pictures, Music, Videos/Movies, Downloads, Backups/Restored. Also `/shared` (shared), `/appdata/<app>` (apps) and `/drives/<drive>` (network). Everything else is a plain folder. Override with `folderKind`.
- **Files**: 34 kinds (`FileKind`), picked by `fileKindOf(name, mime)`; unknown types get a generic page.
- **Sizes**: 64px art for grid tiles (72 in the grid, 56 on phone) and previews, 24px art at 32px and below (list rows 24, menus 16/20). `FileIcon` picks the right one.
- **Photos and videos** show a thumbnail in the grid; render `FileIcon` underneath while the thumbnail loads or if it fails.
- The icon is decorative (`alt=""`); the file name next to it is the label.

Raw SVGs are in `assets/file-icons/{24,64}/`, listed in `assets/file-icons/manifest.json`. To update them from a newer Papirus release, run `python3 scripts/build-file-icons.py <path-to-papirus-checkout>`, then `pnpm build`.

### Licence

The Papirus icons are **GPL-3.0** (© Papirus Development Team), see `assets/file-icons/LICENSE-papirus.txt`. That's compatible with hlabs' AGPL-3.0. Keep the licence file and the entry in `NOTICE` when shipping; don't mix these icons into the Lucide set or the logo.

## Scripts

`pnpm build` (tsup, ESM + types) · `pnpm typecheck` · `pnpm test` (vitest + jsdom).
