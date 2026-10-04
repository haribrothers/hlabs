//! "Quit hlabs" (US-INST-10, D-120): a warning dialog first, then the daemon stops every app, the background
//! service is stopped and the menu-bar app exits. The words come from the window (apps/tray/src/copy.ts).

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// A native warning dialog: `ok` and, unless it's None, `cancel`. True when `ok` was chosen.
#[tauri::command]
pub async fn confirm_dialog(
    app: AppHandle,
    title: String,
    message: String,
    ok: String,
    cancel: Option<String>,
) -> bool {
    let buttons = match cancel {
        Some(cancel) => MessageDialogButtons::OkCancelCustom(ok, cancel),
        None => MessageDialogButtons::OkCustom(ok),
    };
    let only_ok = matches!(buttons, MessageDialogButtons::OkCustom(_));
    let chosen = app
        .dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Warning)
        .buttons(buttons)
        .blocking_show();
    chosen && !only_ok
}
