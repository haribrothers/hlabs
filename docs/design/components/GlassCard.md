# GlassCard

A frosted surface at one of three glass levels; everything in hlabs sits on one.

- **Level 1** (`surface-widget`, `blur-widget`): widgets directly on the wallpaper. Radius `radius-xl`.
- **Level 2** (`surface-window`, `blur-window`): windows such as App Store, Settings and Files. Radius `radius-window`.
- **Level 3** (`surface-dialog`): dialogs, menus, toasts. Nearly opaque so text stays readable.

Every level has a 1px `border-glass` rim. With Reduce transparency (`data-theme="solid"`) blur is off and the solid values are used. Don't stack two cards of the same level.
