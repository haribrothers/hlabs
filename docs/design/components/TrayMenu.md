# TrayMenu

The Mac menu-bar dropdown: status, three live numbers, and quick actions.

It's the Tauri tray window, drawn in glass like a native menu. The header shows the logo, a `StatusDot` (Running, Starting…, Stopped, Needs attention) and CPU, memory and free space. Actions follow the order in the prototype: Open Dashboard, Copy address, Back up now, then toggles, then Quit.

On Linux the desktop draws the tray menu itself, so there it's plain text items with the status as a disabled first line (see `LinuxTray`).
