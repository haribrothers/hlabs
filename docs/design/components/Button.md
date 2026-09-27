# Button

A pill-shaped action button; the white **primary** pill is the one thing each view is for.

- **primary**: `fill-primary` with `ink-on-light` text. At most one per view: "Continue", "Install", "Save changes".
- **secondary**: `surface-control` glass with `ink`. Everything else: "Cancel", "Open", "Restart".
- **destructive**: `danger-fill` with `ink` (5.4:1). Only for the confirm button of an irreversible action: "Uninstall", "Empty trash".
- **link**: `accent-link` text, no fill. Inline actions: "Use another account", "Learn more".

Sizes: `sm` 34px (rows, toolbars), `md` 42px (dialogs), `lg` 48px (onboarding, sign in). Radius `radius-pill`.

Label: verb first, sentence case, no full stop. In a dialog the primary goes last (right).

The consumer provides the label and handler; pass `href` to render a link.
