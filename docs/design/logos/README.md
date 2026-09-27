# Logos

The hlabs mark is a lowercase **h** whose arch becomes a cloud, with three dots inside: your own cloud, running at home. Colour runs along the stroke from coral to violet to teal, the three glows of the Dusk wallpaper.

| File | Use it for |
| --- | --- |
| `hlabs-mark.svg` | The mark on dark or glass surfaces (every in-product use). Gradient `logo-coral` → `logo-violet` → `logo-teal`; dots coral, `accent`, teal. |
| `hlabs-mark-on-light.svg` | The mark on white or light backgrounds (website, docs, printed). Deeper stops: #f0643f → #6d4aff → #0e9f99. |
| `hlabs-mark-white.svg` | Single-colour white, on photos, the wallpaper or a coloured fill. |
| `hlabs-mark-ink.svg` | Single-colour `ink-on-light` (#1b1433), for one-colour print and light UI. |
| `hlabs-mark-small-template.svg` | The **simplified mark** (no dots, slightly bolder) in pure black: the macOS menu-bar template image (macOS tints it for light and dark menu bars). |
| `hlabs-mark-small-white.svg` | The simplified mark in white: Linux tray at 22–24px, favicon, and anywhere the mark is 20px or smaller. |
| `hlabs-lockup.svg` | Mark plus the "hlabs" wordmark (Plus Jakarta Sans 700, outlined) on dark. Sign-in, installer, About. |
| `hlabs-lockup-on-light.svg` | The lockup on light backgrounds. |
| `hlabs-app-icon.svg` | 1024px app icon: the white mark on a Dusk-glow tile. Source for the macOS `.icns`, Linux `.png` sizes, the PWA icon and the favicon. |

Rules:
- Clear space around the mark: at least the height of one dot's row (about 12% of the mark's height) on every side.
- At 20px and below the three dots blur together, so use the simplified mark. Smallest: 16px for the simplified mark, 24px for the gradient mark.
- Keep the gradient's direction (coral at the bottom of the stem, teal at the right of the cloud). Don't recolour, outline, rotate, add shadows or put the gradient mark on a busy photo.
- The wordmark is always lowercase "hlabs". In running text it's plain type, not the lockup.
- Inside a glass tile (sign-in, onboarding, Home header) use `hlabs-mark.svg` on `surface-control`; the gradient tile is only the app icon.
