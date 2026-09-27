//! hlabs tray (Tauri 2). Phase 0 skeleton: a menu-bar icon that toggles the glass dropdown window.
//! Bootstrap (LaunchAgent/systemd), local auth, updates and the daemon connection arrive in phase 4.

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/hlabsTemplate@2x.png"))?;
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
                            let _ = if visible { window.hide() } else { window.show().and_then(|_| window.set_focus()) };
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the hlabs tray");
}
