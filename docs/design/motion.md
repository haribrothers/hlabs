# Motion

Motion in hlabs is quick and quiet: it explains where something came from and where it went, then gets out of the way. Nothing loops, bounces for attention or delays an action.

## Durations and easing

| Token | Value | Use |
| --- | --- | --- |
| `--hl-dur-fast` · `motion.fast` | 120ms | Hover, press, colour and opacity changes |
| `--hl-dur` · `motion.base` | 200ms | Menus, toasts, switches, tooltips, most enter/exit |
| `--hl-dur-slow` · `motion.slow` | 320ms | Windows, sheets, page-level transitions |
| `--hl-ease` · `motion.ease` | cubic-bezier(.2, .8, .2, 1) | Anything arriving or moving |
| `--hl-ease-in` · `motion.easeIn` | cubic-bezier(.4, 0, 1, 1) | Anything leaving (exits run about 30% faster than entrances) |
| `--hl-ease-spring` | cubic-bezier(.34, 1.56, .64, 1) | App icon hover lift only |
| `motion.spring` | stiffness 520, damping 40, mass 0.9 | Tab-bar lens, Dock magnification, segmented control thumb, switch knob |
| `motion.springSoft` | stiffness 300, damping 30 | Phone sheets, drag-to-dismiss |

CSS variables live in `bundle.css`; the same values are exported as `Hlabs.motion` for Framer Motion.

## The moments

| Moment | What moves | Spec |
| --- | --- | --- |
| Tab bar (phone) | The glass lens slides to the new tab | Framer `layoutId="tab-lens"`, `motion.spring`. Glyph and label colour cross-fade at `fast`. |
| Dock hover (desktop) | Hovered tile grows to 1.35× from its bottom edge, neighbours to 1.14×; margins open so tiles never overlap; the name tooltip fades in at `fast` | CSS `transform: scale()` + margin transitions at `motion.spring` feel (200ms `cubic-bezier(.3,.7,.4,1)`), or Framer on the tile. Reduce motion: no growth, tooltip only. |
| Dock open-app dot | Dot fades in under a pinned app when its window opens | `fast` fade. |
| Window opens (Store, Settings, Files) | Window scales 0.96 → 1 and fades in; wallpaper scrim fades to `scrim` | `slow`, `ease`. Close: 1 → 0.98, fade out, `base`, `easeIn`. |
| Dialog | Scale 0.98 → 1, y 8 → 0, fade; `scrim-strong` fades | `base`, `ease`. |
| Menu / context menu | Fade and scale 0.96 → 1 from the trigger corner | `fast` in, instant out. |
| Toast | Slides in from the right 24px and fades | `base`, `ease`; exits up 8px with fade, `fast`. |
| Phone sheet | Slides up from the bottom | `motion.springSoft`; dismiss follows the finger. |
| App icon hover | Lifts 4px and scales 1.04 | `--hl-ease-spring`, 250ms. |
| Installing ring | Progress arc eases to each new value | `base`, `ease`; never spins without progress. |
| Status "working" dot | Pulses opacity 1 → 0.4 | 1.2s, only while working. |
| Stepper, progress bars | Fill width changes | `base`, `ease`. |
| Charts | Tooltip follows the cursor with no delay; data updates redraw without animation | Live numbers shouldn't wobble. |

## Reduced motion

With **Reduce motion** on (the OS setting, or Settings › Appearance), the duration variables drop to 0, and in Framer Motion use `useReducedMotion()` to swap every transform for a plain opacity fade at `fast`. No hover lift, no pulsing dot, no lens slide (the lens jumps). Progress still updates.

## Framer Motion example

```tsx
import { motion as m, useReducedMotion } from 'framer-motion';
import { motion } from './motion'; // a copy of Hlabs.motion in your UI package

const reduce = useReducedMotion();
<m.section
  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, transition: { duration: motion.base / 1000, ease: motion.easeIn } }}
  transition={{ duration: (reduce ? motion.fast : motion.slow) / 1000, ease: motion.ease }}
/>
```
