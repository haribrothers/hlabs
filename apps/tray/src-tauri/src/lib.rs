//! hlabs tray (Tauri 2): a menu-bar icon that toggles the glass dropdown window, and the tray's own
//! access to the daemon with the local token (US-INST-15). Bootstrap (LaunchAgent), states, actions
//! and updates arrive with their phase 4 stories.

mod daemon;
mod paths;
mod token;

use daemon::{CallKind, DaemonClient, DaemonError, DEFAULT_BASE_URL};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};

/// The tray's connection to the daemon; `None` while the token can't be read (US-INST-16).
#[derive(Default)]
struct Daemon(Mutex<Option<DaemonClient>>);

/// Calls a `tray.*` procedure for the webview. The token stays here; other procedures are refused
/// before anything is sent (the daemon refuses them too).
#[tauri::command]
async fn daemon_call(
    daemon: State<'_, Daemon>,
    kind: CallKind,
    path: String,
    input: Option<Value>,
) -> Result<Value, DaemonError> {
    if !path.starts_with("tray.") {
        return Err(DaemonError::Api {
            hlabs_code: "ACCESS_DENIED".to_owned(),
            status: 403,
        });
    }
    let client = daemon
        .0
        .lock()
        .expect("daemon state poisoned")
        .clone()
        .ok_or(DaemonError::TokenRejected)?;
    client
        .call(kind, &path, &input.unwrap_or(Value::Null))
        .await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .manage(Daemon::default())
        .invoke_handler(tauri::generate_handler![daemon_call])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let store = token::default_store(&paths::data_dir());
            match token::ensure_token(store.as_ref()) {
                Ok((token, _created)) => {
                    *app.state::<Daemon>()
                        .0
                        .lock()
                        .expect("daemon state poisoned") =
                        Some(DaemonClient::new(DEFAULT_BASE_URL, token));
                }
                // Never log the token; only that it couldn't be read.
                Err(err) => eprintln!("hlabs tray: {err}"),
            }

            let icon =
                tauri::image::Image::from_bytes(include_bytes!("../icons/hlabsTemplate@2x.png"))?;
            TrayIconBuilder::with_id("hlabs")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("hlabs")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("menu") {
                            let visible = window.is_visible().unwrap_or(false);
                            let _ = if visible {
                                window.hide()
                            } else {
                                window.show().and_then(|_| window.set_focus())
                            };
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the hlabs tray");
}
