# TabBar

The floating Liquid Glass tab bar that moves between the six top-level areas **on phones and windows narrower than 768px**. Desktop and web use the `Dock` (D-054).

A capsule 22px above the bottom edge, `blur-bar` with `shadow-tabbar`. Each item is 82px (`size-tab-item`): filled 24px glyph above a `tab-label`. The selected item sits on a brighter glass lens and turns `accent-tab`. Counts use the red `badge`.

On phone pass `search={false}`; search lives inside the App Store and Files instead.

Keep it to the six areas: Home, App Store, Files, Usage, Backups, Settings. Don't add actions to it.
