# Dialog

A modal on level-3 glass that asks one question and offers two or three answers.

Radius `radius-window`, padding `space-7`, title `title-2`, body `body` in `ink-muted`. Sits on `scrim-strong`. Buttons right-aligned, primary (or destructive) last.

Title as a question or outcome ("Uninstall Jellyfin?"); body says what will happen to the user's data. Use `role="alertdialog"` for destructive confirmations. The consumer supplies the scrim, focus trap and Escape handling.
