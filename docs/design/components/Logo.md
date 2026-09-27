# Logo

The hlabs mark (a lowercase h whose arch becomes a cloud) or the full lockup with the "hlabs" wordmark.

- `tone="color"` (default) on dark and glass surfaces: gradient `logo-coral` → `logo-violet` → `logo-teal`.
- `tone="on-light"` on white: deeper stops so every part keeps 3:1.
- `tone="white"`, `"ink"` or `"current"` when only one colour fits (photos, one-colour print, menus).
- `variant="lockup"` only on sign-in, the installer and About; everywhere else the mark stands alone.

Clear space is about 12% of the mark's height on every side. Smallest: 24px for the gradient mark, 16px for single colour. Inside a glass tile, put the gradient mark on `surface-control`; the gradient tile is reserved for the app icon.

In app code import `LogoMark` and `LogoLockup` from `@hlabs/icons`; the files for packaging and print are in `docs/design/logos/`.
