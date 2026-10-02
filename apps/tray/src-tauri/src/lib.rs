//! hlabs tray (Tauri 2): a menu-bar icon that toggles the glass dropdown window; the background
//! service it installs and starts (US-INST-01); and its own access to the daemon with the local
//! token (US-INST-15, US-INST-16). States, actions and updates arrive with their phase 4 stories.

mod access;
mod bootstrap;
mod daemon;
mod launchd;
mod paths;
mod token;

use access::{Access, TokenGuard};
use bootstrap::Waited;
use daemon::{CallKind, DaemonClient, DaemonError, DEFAULT_BASE_URL};
use serde_json::Value;
use std::sync::Mutex;
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

/// The event the window listens to when the tray's access changes.
const ACCESS_EVENT: &str = "access-changed";
/// The event the window listens to while the background service starts (US-INST-01).
const BOOT_EVENT: &str = "boot-changed";

/// Starting the background service (US-INST-01).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
enum BootStep {
    Starting,
    Started,
    /// `/healthz` didn't answer within 60 s, or the LaunchAgent couldn't be loaded: "Can't reach hlabs".
    Failed,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BootState {
    /// Never ran for this user: the first-launch window.
    first_launch: bool,
    step: BootStep,
    /// Why it failed, from `/healthz` (e.g. `migration_failed`); none for a timeout.
    reason: Option<String>,
}

struct Boot(Mutex<BootState>);

fn set_boot(app: &AppHandle, step: BootStep, reason: Option<String>) {
    let state = {
        let boot = app.state::<Boot>();
        let mut state = boot.0.lock().expect("boot state poisoned");
        state.step = step;
        state.reason = reason;
        state.clone()
    };
    let _ = app.emit(BOOT_EVENT, state);
}

/// The background service's start, for the window.
#[tauri::command]
fn boot_state(boot: State<'_, Boot>) -> BootState {
    boot.0.lock().expect("boot state poisoned").clone()
}

struct Daemon(Mutex<TokenGuard>);

impl Daemon {
    fn lock(&self) -> std::sync::MutexGuard<'_, TokenGuard> {
        self.0.lock().expect("token guard poisoned")
    }
}

fn announce(app: &AppHandle, before: Access, after: Access) {
    if before != after {
        let _ = app.emit(ACCESS_EVENT, after);
    }
}

/// Calls a `tray.*` procedure for the window. The token stays here; other procedures are refused
/// before anything is sent (the daemon refuses them too). A rejected token is repaired (US-INST-16).
#[tauri::command]
async fn daemon_call(
    app: AppHandle,
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
    let token = daemon
        .lock()
        .token()
        .map(str::to_owned)
        .ok_or(DaemonError::NoAccess)?;
    let result = DaemonClient::new(DEFAULT_BASE_URL, token)
        .call(kind, &path, &input.unwrap_or(Value::Null))
        .await;
    let mut guard = daemon.lock();
    match &result {
        Ok(_) => guard.succeeded(),
        Err(DaemonError::TokenRejected) => {
            let before = guard.access();
            let after = guard.rejected();
            announce(&app, before, after);
        }
        Err(_) => {}
    }
    result
}

/// The tray's own access: `ready`, `keychainDenied` or `unreachable`.
#[tauri::command]
fn tray_access(daemon: State<'_, Daemon>) -> Access {
    daemon.lock().access()
}

/// "Try again": reads the token again (macOS asks for keychain access again).
#[tauri::command]
fn retry_access(app: AppHandle, daemon: State<'_, Daemon>) -> Access {
    let mut guard = daemon.lock();
    let before = guard.access();
    let after = guard.start();
    announce(&app, before, after);
    after
}

/// The bootstrap for a macOS release build that has the daemon bundled; `None` otherwise.
fn bundled_bootstrap(
    daemon_dir: std::path::PathBuf,
) -> Option<bootstrap::Bootstrap<launchd::SystemRunner>> {
    #[cfg(target_os = "macos")]
    if !cfg!(debug_assertions) && daemon_dir.join("node").exists() {
        let home = std::path::PathBuf::from(std::env::var_os("HOME")?);
        return Some(bootstrap::Bootstrap {
            layout: bootstrap::Layout {
                data_dir: paths::data_dir(),
                launch_agents_dir: home.join("Library/LaunchAgents"),
                daemon_dir,
                // SAFETY: getuid has no preconditions and can't fail.
                uid: unsafe { libc::getuid() },
            },
            runner: launchd::SystemRunner,
            login_item: Box::new(bootstrap::MainAppLoginItem),
        });
    }
    let _ = daemon_dir;
    None
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .invoke_handler(tauri::generate_handler![
            daemon_call,
            tray_access,
            retry_access,
            boot_state
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let mut guard = TokenGuard::new(
                token::default_store(&paths::data_dir()),
                launchd::default_service(),
            );
            let daemon_dir = app.path().resource_dir()?.join("daemon");
            let first_launch = match bundled_bootstrap(daemon_dir) {
                // A release build with the daemon bundled: install and start the background service.
                Some(boot) => {
                    let first = boot.is_first_launch(guard.has_stored_token());
                    if let Err(err) = boot.prepare() {
                        eprintln!("hlabs tray: {err}");
                    }
                    // The token exists before the LaunchAgent starts the daemon that reads it.
                    guard.start();
                    let handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        let installed =
                            tauri::async_runtime::spawn_blocking(move || boot.install(first)).await;
                        match installed {
                            Ok(Ok(_)) => {}
                            Ok(Err(err)) => {
                                eprintln!("hlabs tray: {err}");
                                return set_boot(&handle, BootStep::Failed, None);
                            }
                            Err(_) => return set_boot(&handle, BootStep::Failed, None),
                        }
                        match bootstrap::wait_for_health(
                            DEFAULT_BASE_URL,
                            bootstrap::HEALTH_TIMEOUT,
                        )
                        .await
                        {
                            Waited::Ready => set_boot(&handle, BootStep::Started, None),
                            Waited::TimedOut => set_boot(&handle, BootStep::Failed, None),
                            Waited::Failed(reason) => {
                                set_boot(&handle, BootStep::Failed, Some(reason))
                            }
                        }
                    });
                    first
                }
                // Development (`pnpm dev:tray`): the daemon runs under `pnpm dev`.
                None => {
                    guard.start();
                    false
                }
            };
            app.manage(Daemon(Mutex::new(guard)));
            app.manage(Boot(Mutex::new(BootState {
                first_launch,
                step: if first_launch || cfg!(not(debug_assertions)) {
                    BootStep::Starting
                } else {
                    BootStep::Started
                },
                reason: None,
            })));

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
            if first_launch {
                if let Some(window) = app.get_webview_window("menu") {
                    let _ = window.show().and_then(|_| window.set_focus());
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the hlabs tray");
}
