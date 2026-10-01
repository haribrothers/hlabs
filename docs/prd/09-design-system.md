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
4. **Navigation**: on desktop and web (≥ 768px) the **Dock** (`Dock` component, D-054): six area tiles, pinned apps with a + tile, Search; dot for the current area and open apps; names on hover/focus; hover magnification with `motion.spring`, off with Reduce motion. On phones (< 768px) the Liquid Glass **tab bar** (`TabBar`, no Search slot); the selected tab has a glass lens and `accent-tab` colour and the lens slides with `motion.spring`. Filled glyphs from `@hlabs/icons` in both.
5. **Charts** use `chart-1`…`chart-6` in fixed order, 2px lines, hairline grid, legends for ≥ 2 series, tooltips, arrow-key stepping and a hidden data table.
6. **Icons**: Lucide via `@hlabs/icons` only, stroke 2, sizes 16/20/24. App tiles use `AppLogo`: the app's gradient with its manifest logo inset at `LOGO_SCALE` (62%) of the tile, or a white glyph when there's no logo; the Dock draws app tiles the same way, and the hlabs mark above Home's greeting sits in a box the size of a Home app icon. **Files and folders** use `FileIcon` from `@hlabs/icons/files` (Papirus colour icons, D-053): folders follow the accent, special icons for top-level Home folders, Shared, app data and drives; photos and videos show thumbnails with the icon while loading. Import it only in the Files route (and Files dialogs, Trash, search results) so the icon data stays out of the main bundle.
7. **Logo**: `LogoMark` / `LogoLockup` from `@hlabs/icons`; the simplified mark is used automatically at ≤ 20px.
8. **Copy** follows the voice in `docs/design/README.md`: plain words, sentence case, say what happens to people's data, errors say what to do next, name the thing ("Uninstall Jellyfin?").
9. **Motion** follows `docs/design/motion.md`; Reduce motion turns movement into fades.

## Screens
The canvas screens are the visual spec for each user story (story → `Screens:` → `docs/design/screens.md`). Where a story's acceptance criteria and a screen disagree, **the story wins** (stories were written after reviewing the architecture); note the difference in the PR.
