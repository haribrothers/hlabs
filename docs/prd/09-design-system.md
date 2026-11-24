# 09 · Design system

The full design system is in [`docs/design/`](../design/). It was exported from the hlabs Design System artifact and the Home Cloud Dashboard canvas (115 screens). Treat `docs/design/` as the source of truth for values; `packages/ui` implements it.

## What's in `docs/design/`
| Path | What |
| --- | --- |
| `README.md` | Brand book: voice, wallpaper and glass levels, colour, type, spacing, shape, logo, iconography, layout, accessibility |
| `motion.md` | Durations, easing, springs and every motion moment |
| `tokens.json` | All tokens (colour with `glass`/`solid` themes, type, spacing, radius, shadow, blur, size) |
| `components/<Name>.md` | Guidelines per component (25 components) |
| `components/index.d.ts` | Props of every component |
| `reference/bundle.js`, `reference/bundle.css` | Working reference implementation (React 18, plain CSS). Port it to `packages/ui` with Tailwind + shadcn; keep the behaviour and values, not the code style. |
| `logos/` | All logo files (mark, lockup, simplified small mark, app icon) |
| `screens.md` | Every screen of the prototype: name, priority, phase, module, and what it shows |

## Rules for implementation
1. **Tokens become CSS variables** in `packages/ui/src/tokens.css` generated from `tokens.json` (script `pnpm ui:tokens`), themed by `data-theme="glass|solid"` and `data-accent="violet|mint|amber|rose"` on `<html>`. Tailwind 4 theme maps to those variables (`bg-surface-window`, `text-ink-muted`, `rounded-window` …). No hex values in components.
2. **Glass levels**: 1 (widgets on wallpaper), 2 (windows), 3 (dialogs, menus, toasts). Each has its token surface, blur and 1px `border-glass`. Solid theme removes blur.
3. **One white primary button per view.** Destructive buttons use `danger-fill`. Buttons are verbs, sentence case.
4. **Navigation**: on desktop and web (≥ 768px) the **Dock** (`Dock` component, D-054): six area tiles, pinned apps with a + tile, Search; dot for the current area and open apps; names on hover/focus; hover magnification with `motion.spring`, off with Reduce motion. On phones (< 768px) the **tab bar** (`TabBar`, no Search slot) docked to the bottom edge (D-172): `size-tab-bar` (49px) plus the home-indicator inset, at least `size-home-indicator` (34px) when the browser reports none; five tabs at least 44px wide with 8px between them; the current tab has the `accent-tab` colour and a soft highlight (`accent-wash`, `size-tab-lens` wide) behind its glyph that slides with `motion.spring`; a focus ring for keyboard focus only, inside the bar. Filled glyphs from `@hlabs/icons` in both.
5. **Charts** use `chart-1`…`chart-6` in fixed order, 2px lines, hairline grid, legends for ≥ 2 series, tooltips, arrow-key stepping and a hidden data table.
6. **Icons**: Lucide via `@hlabs/icons` only, stroke 2, sizes 16/20/24. App tiles use `AppLogo`: the app's gradient with its manifest logo inset at `LOGO_SCALE` (62%) of the tile, or a white glyph when there's no logo; the Dock draws app tiles the same way, and the hlabs mark above Home's greeting sits in a box the size of a Home app icon. **Files and folders** use `FileIcon` from `@hlabs/icons/files` (Papirus colour icons, D-053): folders follow the accent, special icons for top-level Home folders, Shared, app data and drives; photos and videos show thumbnails with the icon while loading. Import it only in the Files route (and Files dialogs, Trash, search results) so the icon data stays out of the main bundle.
7. **Logo**: `LogoMark` / `LogoLockup` from `@hlabs/icons`; the simplified mark is used automatically at ≤ 20px.
8. **Copy** follows the voice in `docs/design/README.md`: plain words, sentence case, say what happens to people's data, errors say what to do next, name the thing ("Uninstall Jellyfin?").
9. **Motion** follows `docs/design/motion.md`; Reduce motion turns movement into fades.

10. **The phone layout** (< 768px, D-172, Direction A · Native iOS-like) is built from `packages/ui`'s phone pieces (`components/phone.tsx`, `components/sheet.tsx`, `styles/phone.css`); the desktop never uses them:
    - **Headers** (`PhoneHeader`): top-level screens open with a `large-title` (34/41px bold); once it scrolls away a compact bar (`size-nav-bar`, 44px, on `surface-dialog`) shows the title centred. Pages you go into have a back button named after where you came from (`PhoneBackButton`, "‹ App Store", `row` text in `accent-link`).
    - **Lists** (`InsetGroup`, `InsetRow`, and the design system's `List` restyled on phones): inset grouped boxes (`radius-sm`, `solid-widget`; `solid-row` inside a sheet) with `size-row` (48px) rows, `row` text (17/22px), `footnote` subtitles (13/18px) and `size-icon-square` (30px) icon squares, in the areas' Dock colours for Backups, Usage and the App Store.
    - **Surfaces**: Home keeps the wallpaper under `scrim`; every other screen is `wall-base`, with the `solid-*` colours (the same in both themes) so long lists stay readable.
    - **Home**: `subhead` (15/20px) greeting under the title, widgets as a swipeable row two per screen with page dots (`PageDots`), a 4-column grid of `size-app-icon-phone` (60px, `radius-md`) tiles with `tile-name` (12/16px) names on one line.
    - **App Store rows**: `size-list-icon` (56px) logos, one `PillButton` (30px pill in a 44px hit area); full-width buttons are `size-button-phone` (50px) pills (`hl-p-primary`, `hl-p-secondary`).
    - **Sheets** (`BottomSheet`; `ModalDialog` becomes one on phones): a `size-grabber` grabber, the `scrim-strong` backdrop, `motion.springSoft` (a 150ms fade with Reduce motion), drag down past 30% or faster than 500px/s to dismiss, at most 92% of the visual viewport; with unsaved input only its own buttons close it.
    - **Fields** are 17px (iOS doesn't zoom into them) and every control's hit area is at least 44 × 44px.

11. **Tablets by touch** (≥ 768px with `(hover: none) and (pointer: coarse)`, D-175, D-176) keep the desktop layout; `watchInputMode()` (`packages/ui/src/lib/media.ts`) sets `<html data-input="touch">` and follows the media query live, and every rule in `styles/tablet.css` is scoped to it, so a computer with a mouse and a phone are unchanged:
    - **Targets**: buttons, icon buttons, tabs and segmented options are `size-control` (44px) with 15px labels; switches a 44px target with the 32px track inside; rows 56px with 16px text; menu items `size-row` with `row` text; fields at least `size-field-text-touch` (16px); what shows on hover on a computer (`hl-hover-reveal`) is always shown, at least 44px.
    - **Long press** (`useLongPress`, `packages/ui/src/lib/long-press.ts`): 500ms within 10px opens what a right-click opens, vibrates once, suppresses the OS callout and swallows the click it ends with; moving after it drags; `guardTapsOutsideMenus()` closes an open menu on a tap's click with nothing under it touched. A Home tile lifts over the blurred Home with the desktop's items beside it, `size-menu-touch` (272px) wide (`PhoneTileMenu beside`, TabletMenu). Charts show their tooltip under a held finger (`useHoldTooltip`).
    - **The Dock**: no magnification, names under a long press (`data-held`), pinned apps moved by a finger; it floats `size-dock-edge-touch` (28px) off the edge, or 16px above the home indicator's inset where that's more, and windows end that much higher and start below the status bar.
    - **Home**: the `display` greeting (40/46px), a 52px mark, a 52px search pill without keys, Edit Home as a 44px round button beside the bell, apps six to a row in landscape and four upright with 14px names on one line.
    - **iPad in portrait** (768–1023px by touch): windows fill the width with 24px margins; Settings' and Files' sidebars become lists you go into (`hl-t-list`, `size-row-touch` 60px rows with `size-icon-square-touch` 36px icon squares and `row` text) with `TabletBack` ("‹ Settings", "‹ Files"); the App Store is one column with its categories as chips over Discover and "‹ App Store" on the pages you go into.

## Screens
The canvas screens are the visual spec for each user story (story → `Screens:` → `docs/design/screens.md`). Where a story's acceptance criteria and a screen disagree, **the story wins** (stories were written after reviewing the architecture); note the difference in the PR.
