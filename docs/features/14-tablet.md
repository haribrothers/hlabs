# Tablets: touch on the desktop layout

iPads and other tablets (768px and wider, a touch screen and no mouse) keep the desktop layout, the Dock and windows (D-054), made fit for fingers (D-175). Touch is told apart from a mouse by the input, not the width: `(hover: none) and (pointer: coarse)` sets `data-input="touch"` on `<html>`, so a laptop with a touch screen and a mouse keeps the mouse layout, and a phone keeps the phone layout of D-172.

| Feature | Name | Priority | Phase | Screens |
| --- | --- | --- | --- | --- |
| F-TAB-01 | Touch on tablets | P2 | 7 | `TabletHome`, `TabletHomePortrait`, `TabletWindow`, `TabletMenu`, `TabletFiles`, `TabletSettingsPortrait` |

### US-TAB-01 · Touch-sized controls on a tablet
**Feature:** F-TAB-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `TabletHome`, `TabletWindow`
**As** anyone on an iPad, **I want** every control big enough for a finger and nothing that needs a mouse to appear, **so that** I can use hlabs by touch.

**Acceptance criteria**
- **Given** a touch screen with no mouse at 768px or wider, **then** `<html data-input="touch">` is set and the desktop layout is used.
- **Given** touch, **then** every button, row, switch, tab and Dock tile is at least 44 × 44px, and text fields are 16px or larger (so iOS doesn't zoom).
- **Given** touch, **then** controls that appear on hover (a row's actions, a tile's close button, a chart's tooltip) are shown all the time or behind a tap, and tooltips appear on long-press instead of hover.
- **Given** a mouse is connected to the tablet, **then** the mouse layout applies (the media query changes, no reload).

### US-TAB-02 · Long-press for every right-click menu
**Feature:** F-TAB-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `TabletMenu`
**As** anyone on an iPad, **I want** a long-press to open what a right-click opens, **so that** no action is mouse-only.

**Acceptance criteria**
- **Given** touch, **when** I hold a Home tile, a pinned Dock app, or a file or folder for 500ms, **then** the phone vibrates once if it can and the same menu as a right-click opens at my finger, and the OS's own callout is held back.
- **Given** the menu is open, **when** I tap anywhere outside it, **then** it closes and nothing under that tap is opened.
- **Given** a long-press that moves more than 10px before 500ms, **then** it's a scroll or a drag, not a menu.

### US-TAB-03 · Drag by touch
**Feature:** F-TAB-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `TabletHome`, `TabletFiles`
**As** anyone on an iPad, **I want** to drag with my finger where I'd drag with a mouse, **so that** arranging Home and moving files work by touch.

**Acceptance criteria**
- **Given** Home in edit mode (US-HOME-16), **when** I hold a tile and move it, **then** it follows my finger and drops where I lift it, as with a mouse; the page doesn't scroll while I drag.
- **Given** the Dock's pinned apps, **when** I hold one and move it, **then** it moves along the Dock (US-HOME-22).
- **Given** Files, **when** I hold a file and move it over a folder, **then** it moves there as with a mouse drag (US-FILE-14), with Undo.

### US-TAB-04 · The Dock on a touch screen
**Feature:** F-TAB-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `TabletHome`
**As** anyone on an iPad, **I want** the Dock to work by tapping, **so that** it doesn't depend on hovering.

**Acceptance criteria**
- **Given** touch, **then** Dock tiles don't magnify, their names show under a long-press instead of on hover, and a tap opens the area or app at once.
- **Given** touch, **then** the Dock clears the home indicator (`env(safe-area-inset-bottom)`) and its tiles stay at least 44px.

### US-TAB-05 · iPad in portrait
**Feature:** F-TAB-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `TabletHomePortrait`, `TabletSettingsPortrait`
**As** anyone on an iPad held upright, **I want** windows to fit the narrower screen, **so that** nothing is cut off or cramped.

**Acceptance criteria**
- **Given** a width from 768px to 1023px, **then** windows fill the width with the page's margins, and a window's sidebar (Settings, the App Store, Files) becomes a list you go into and come back from, as drawn.
- **Given** Home, **then** the app grid and the widgets reflow to the width without overlapping the Dock.
- **Given** I rotate the iPad, **then** the layout changes at once and keeps the page I'm on.

### US-TAB-06 · The on-screen keyboard and the Home Screen app on a tablet
**Feature:** F-TAB-01 · **Priority:** P2 · **Phase:** 7 · **Screens:** `TabletWindow`
**As** anyone on an iPad, **I want** fields to stay visible above the keyboard and hlabs to work as a Home Screen app, **so that** typing and launching feel native.

**Acceptance criteria**
- **Given** the on-screen keyboard opens, **then** the focused field scrolls into view above it and a dialog or sheet stays usable.
- **Given** hlabs added to the iPad's Home Screen, **then** it opens without Safari's bars, respects the safe areas and the status bar, and has no gap under the Dock (the iOS band of D-172 is handled the same way).

## Implementation notes
- Touch is a mode of the desktop layout (`data-input="touch"` and `@media (hover: none) and (pointer: coarse)`), not a third layout; the phone layout stays below 768px.
- Tests run in Playwright with an iPad viewport (1180 × 820 landscape, 820 × 1180 portrait), `hasTouch` and `isMobile`, in a `tablet` project.
- As built: D-176 (long press on a Files item opens its menu, a tap outside a menu closes it on its click, the portrait lists, the Dock's first-run specs).
