# hlabs design system (brand book)

Your own cloud, running on this computer. hlabs is a home cloud OS for macOS and Linux: an app store for self-hosted apps, files, backups and remote access, behind one calm dashboard. This system is taken from the 113-screen prototype and is what the React UI (Vite, Tailwind, shadcn) is built from.

## Voice

hlabs talks like a capable friend who set up your server for you. Plain words, short sentences, no jargon on the surface; details are one click away for people who want them.

- **Say what happens to their stuff.** "Your photos stay in Files" beats "Volume retained".
- **Sentence case everywhere**, including buttons and titles. No full stops on buttons.
- **Verbs on buttons**: "Install", "Open", "Uninstall", "Save changes". Never "OK" or "Submit".
- **Errors say what to do next**: "Use at least 12 characters", "Plug in the backup drive and try again".
- **Name the thing**: "Uninstall Jellyfin?" not "Are you sure?".
- Docker, containers and ports only appear in advanced views and logs. Addresses and paths are set in `mono`.

Examples from the product: "Good evening, Hari" · "Last backup 2 hours ago" · "Also on your tailnet" · "Move Vaultwarden's data".

## Visual foundations

### The wallpaper and three glass levels

Everything floats on the **Dusk wallpaper**: three soft radial glows (`wall-coral` top-left, `wall-violet` top-right, `wall-teal` bottom) over `wall-base`. The glow colours are wallpaper only; they never appear on controls or text. In CSS it is the `.hl-wall` class.

Surfaces are frosted glass at three levels, each with a 1px `border-glass` rim:

| Level | Token | Blur | Radius | Used for |
| --- | --- | --- | --- | --- |
| 1 | `surface-widget` | `blur-widget` | `radius-xl` | Home widgets, search pill, bell |
| 2 | `surface-window` | `blur-window` | `radius-window` | App Store, Settings, Files, Usage, app windows |
| 3 | `surface-dialog` | `blur-window` | `radius-window` / `radius-lg` | Dialogs, sheets, menus, toasts |

Inside a window, grouped content sits on `surface-row`; controls on `surface-control`; inputs on `surface-input`. Windows dim the wallpaper with `scrim`; dialogs use `scrim-strong`.

**Reduce transparency** is the `solid` theme (`data-theme="solid"`): every surface swaps to an opaque value and blur is switched off. Design every screen so it still reads in solid.

### Colour

Text is always `ink` (white) on these dark surfaces, with `ink-muted` for secondary text and `ink-faint` for timestamps and hints (12px and up only). The only dark text is `ink-on-light`, used on `fill-primary`.

- **One white primary per view.** `fill-primary` pills are the loudest thing on screen; everything else is glass.
- **Accent** `accent` (violet) marks selection and progress: progress fills, selected borders, focus rings. `accent-strong` for switch tracks; `accent-link` for text links; `accent-tab` for the selected tab. `accent-wash` tints selected rows. Users can pick Mint, Amber or Rose in Appearance; only the accent family changes.
- **Status** colours `success`, `warning`, `danger` are for text, dots and icons. Destructive buttons use `danger-fill`.
- **Accent sets.** Settings › Appearance offers Violet (default), Mint, Amber and Rose. Each swaps only the accent family (`accent`, `accent-strong`, `accent-link`, `accent-tab`, `accent-wash`) via `data-accent="mint|amber|rose"` on the root; everything else stays put. Every set keeps links and tab labels above 7:1 and switch tracks above 3:1 on every surface:

  | Set | accent | accent-strong | accent-link | accent-tab |
  | --- | --- | --- | --- | --- |
  | Violet | #a78bfa | #8b5cf6 | #c4b5fd | #d9ccff |
  | Mint | #5eead4 | #0d9488 | #99f6e4 | #ccfbf1 |
  | Amber | #fbbf24 | #d97706 | #fde68a | #fef3c7 |
  | Rose | #f9a8d4 | #e5407f | #fbcfe8 | #fce7f3 |

- **Charts** use `chart-1` … `chart-6` (violet, coral, teal, amber, magenta, blue) in that fixed order. The set was checked for colour-blind separation and 3:1 contrast on `surface-window` and `surface-row`; it doesn't change with the accent. Series colours are for marks only; labels and values stay in `ink` and `ink-muted`. Backup success and failure use the status colours plus an icon, never a chart colour.
- **Badge** `badge` (#d92d20) is the red count on the Dock and tab bar; white text on it measures 4.8:1.

### Type

One family, **Plus Jakarta Sans** (Google Fonts), with a system fallback; `mono` for addresses, paths and logs.

- `display-xl` only for the onboarding welcome; `display` for the Home greeting.
- `title-1` window and onboarding titles; `title-2` dialog titles; `headline` card headlines.
- `body` for paragraphs; `body-sm` for row titles, menu items and buttons (at 600); `label` for section and field labels; `caption` for subtitles and hints; `tab-label` only in the tab bar.

### Spacing and shape

A 4px base. Windows and dialogs pad `space-7`; onboarding cards `space-10`. Rows pad `space-3` by `space-4`. A section label sits `space-2` above its box; sections are `space-5` apart. Card grids use `space-3` gaps; the widget grid `space-4`.

Corners grow with the surface: `radius-xs` menu items → `radius-sm` fields → `radius-md` list boxes → `radius-lg` cards and toasts → `radius-xl` widgets → `radius-window` windows and dialogs. Buttons, chips, the search pill and the tab bar are `radius-pill`. App tiles use `radius-icon`.

Shadows: `shadow-icon` for app tiles, `shadow-window` for windows and dialogs, `shadow-menu` for menus and toasts, `shadow-tabbar` for the tab bar's lit rim.

## Logo

The mark is a lowercase **h** whose arch turns into a cloud, with three dots inside: your own cloud, running at home. It's coloured along the stroke from `logo-coral` through `logo-violet` to `logo-teal`, the same three glows as the Dusk wallpaper, so the logo and the product feel like one thing.

- In the product (dark and glass surfaces) use `hlabs-mark.svg`; on white use `hlabs-mark-on-light.svg`.
- The **lockup** (mark + "hlabs" in Plus Jakarta Sans 700) goes on sign-in, the installer and About. Everywhere else the mark stands alone.
- The **app icon** is the white mark on a Dusk-glow tile. It's the only place the mark sits on a gradient.
- The **menu-bar / tray icon** is the simplified mark, `hlabs-mark-small-template.svg`: no dots and a slightly bolder stroke, because at 18px the dots blur together. It's black and used as a macOS template image so it follows light and dark menu bars. Use the simplified mark anywhere the logo is 20px or smaller.
- Clear space: about 12% of the mark's height on every side. Smallest: 24px for the gradient mark, 16px for the simplified mark.

All files and their rules are in [`logos/`](logos/README.md).

## Iconography

The icon library is **Lucide** (`lucide-react` 1.x, ISC licence), the same set shadcn uses. All icons come from one shared package, **`@hlabs/icons`**, used by both the web UI and the Tauri tray app. It re-exports Lucide and adds our own glyphs, so no app imports `lucide-react` directly.

- **UI icons**: Lucide on a 24px grid, stroke 2 (1.75 at 16px and below), round caps and joins, in `ink` or `ink-muted`. Sizes 16 (inline in text), 20 (rows, buttons), 24 (toolbars, empty states). Import by name, e.g. `import { Download, HardDrive } from '@hlabs/icons'`, so unused icons are tree-shaken out.
- **Tab bar and Dock**: six custom **filled** 24px glyphs plus Search (`Hlabs.glyphs`: home, store, files, usage, backups, settings, search), exported from `@hlabs/icons` as `TabHome`, `TabStore` and so on. They stay filled. On the phone tab bar the glass lens and `accent-tab` colour mark the selected tab; in the desktop Dock they sit white on fixed colour tiles (Home uses the white logo mark) and a dot marks the current area. Lucide has no filled style, which is why these are ours.
- **New custom icons** follow Lucide's grid and 2px keyline, so they sit alongside it without looking out of place. Propose a new one only when Lucide has nothing close.
- **App icons**: each app shows **its own logo from its App Store manifest** (a square PNG or SVG, at least 256px), filling a `size-app-icon` tile at `radius-icon` with `shadow-icon`. Don't add a border or tint to the logo. If the logo is missing or still loading, the tile falls back to a two-stop gradient with a white Lucide icon; the manifest can give the gradient colours, otherwise one is chosen from the app's name.
- **File and folder icons** (Files app only) are colour icons from the **Papirus** icon theme (GPL-3.0, compatible with hlabs' AGPL-3.0), in `@hlabs/icons/files` as `FileIcon`, and here as `Hlabs.FileIcon` (used by `FileItem`). They are the one place the UI uses full-colour icons, because people recognise a PDF or a spreadsheet by its colour. Rules:
  - **Folders follow the accent**: Violet → violet, Mint → teal, Amber → yellow, Rose → magenta.
  - **Special folders** have their own icon only at the top of a Home folder: Documents, Photos, Music, Videos, Downloads, Backups; also Shared, an app's data folder and a connected drive. Everything else is a plain folder, so a folder named "Music" deep inside Documents stays plain.
  - **Files** get one of 34 kinds from the extension (PDF, document, spreadsheet, archive, code, disk image …); unknown types get a plain page.
  - **Photos and videos show a thumbnail**, with the icon while it loads or if it fails.
  - Sizes: 72 in the grid (56 on phone) using the 64px art, 24 in list rows and 16/20 in menus using the 24px art, which is drawn for small sizes.
  - Icons are decorative; the file name next to it is the label. All files are in the **File icons** asset group.



## Layout

- **Desktop frame** 1440 × 900. Windows are `size-window` (1240px) wide, 100px from the left, over the dimmed wallpaper.
- **Dock** (desktop and web, 768px and up) floats centred, 14px above the bottom edge: the six areas as colour tiles, a divider, the person's pinned apps and a + tile, a divider, Search. Tiles are `size-dock-tile` (56px) and magnify on hover. See `components/Dock.md` and D-054.
- **Phone** 390px wide (anything under 768px). The Liquid Glass tab bar with the areas, no Search button; windows become full-screen sheets.
- **Home** is a greeting, a row of widgets, then the app grid (76px tiles, `space-6` row gap).
- Touch targets and fields are at least `size-control` (44px).

## Motion

Quick and quiet: 120ms for hover, 200ms for menus and toasts, 320ms for windows, one spring for the tab-bar lens and Dock magnification. Reduce motion turns every move into a plain fade. The full table of moments is in the Motion section.

## Accessibility

- Text meets 4.5:1 on its surface in both themes; `ink-faint` is only used at 12px and up. 
- Every interactive element shows a 2px `accent` focus ring.
- Charts carry a hidden data table, step with the arrow keys, and never use colour alone (legends, × marks on failures).
- Honour **Reduce motion** (no hover lift, no pulsing status dot) and **Reduce transparency** (the `solid` theme).
- State is never colour alone: status dots carry a word, app tiles carry a badge label.

## Where the screens are

Every screen of the prototype (113, by module, with its priority) is in [screens.md](screens.md) with an image in `screens/`. Build components from this folder; lay out screens from those images.
