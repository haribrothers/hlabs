//! hlabs tray (Tauri 2): a menu-bar icon that toggles the glass dropdown window; the background
//! service it installs and starts (US-INST-01); and its own access to the daemon with the local
//! token (US-INST-15, US-INST-16). States, actions and updates arrive with their phase 4 stories.

mod access;
mod bootstrap;
mod daemon;
mod health;
mod launchd;
mod logs;
mod paths;
mod token;
mod window;

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
    /// Setup was opened in the browser during this launch (US-INST-02: at most once by itself).
    setup_opened: bool,
}

struct Boot(Mutex<BootState>);

/// Whether hlabs answers `/healthz` (US-INST-13, US-STATE-07).
#[derive(Default)]
struct HealthWatch(Mutex<health::Monitor>);

/// The dashboard's address from the last `tray.status`, for "Open Dashboard" while hlabs is down.
#[derive(Default)]
struct LastDashboard(Mutex<Option<String>>);

const HEALTH_EVENT: &str = "health-changed";

fn health_state_of(app: &AppHandle) -> health::DaemonHealth {
    app.state::<HealthWatch>()
        .0
        .lock()
        .expect("health poisoned")
        .state()
        .clone()
}

fn update_health(app: &AppHandle, change: impl FnOnce(&mut health::Monitor)) {
    let (before, after) = {
        let watch = app.state::<HealthWatch>();
        let mut monitor = watch.0.lock().expect("health poisoned");
        let before = monitor.state().clone();
        change(&mut monitor);
        (before, monitor.state().clone())
    };
    if before != after {
        let _ = app.emit(HEALTH_EVENT, after);
    }
}

/// Asks `/healthz` every 5 s for as long as the tray runs.
async fn watch_health(app: AppHandle) {
    loop {
        tokio::time::sleep(health::POLL).await;
        let answer = bootstrap::check_health(DEFAULT_BASE_URL).await;
        update_health(&app, |m| {
            m.observe(answer, std::time::Instant::now());
        });
    }
}

#[tauri::command]
fn health_state(app: AppHandle) -> health::DaemonHealth {
    health_state_of(&app)
}

/// "Restart hlabs": restarts the background service and waits up to 60 s (US-STATE-07).
#[tauri::command]
async fn restart_daemon(app: AppHandle) -> Result<(), String> {
    update_health(&app, |m| m.restarting(std::time::Instant::now()));
    let restarted = tauri::async_runtime::spawn_blocking(|| launchd::default_service().restart())
        .await
        .map_err(|e| e.to_string())?;
    if let Err(err) = restarted {
        update_health(&app, |m| m.down(None, std::time::Instant::now()));
        return Err(err);
    }
    Ok(())
}

/// "Show logs": the newest daemon log file in the system's viewer, without the API (US-INST-13).
#[tauri::command]
fn show_logs(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let logs_dir = paths::data_dir().join("logs");
    let target = logs::newest_log(&logs_dir).unwrap_or(logs_dir);
    app.opener()
        .open_path(target.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// "Copy diagnostics" while hlabs isn't answering: built here from the log file (US-INST-13).
#[tauri::command]
async fn copy_local_diagnostics(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let version = app.package_info().version.to_string();
    let report = tauri::async_runtime::spawn_blocking(move || {
        let service = launchd::default_service().describe();
        logs::local_report(&version, &service, &paths::data_dir())
    })
    .await
    .map_err(|e| e.to_string())?;
    app.clipboard()
        .write_text(report)
        .map_err(|e| e.to_string())
}

fn update_boot(app: &AppHandle, change: impl FnOnce(&mut BootState)) {
    let state = {
        let boot = app.state::<Boot>();
        let mut state = boot.0.lock().expect("boot state poisoned");
        change(&mut state);
        state.clone()
    };
    let _ = app.emit(BOOT_EVENT, state);
}

fn set_boot(app: &AppHandle, step: BootStep, reason: Option<String>) {
    update_boot(app, |state| {
        state.step = step;
        state.reason = reason;
    });
}

/// Opens the tokenised setup URL from `tray.setupUrl` in the default browser (US-INST-02). `false`
/// when onboarding is already complete (the URL is null).
async fn open_setup_url(app: &AppHandle) -> Result<bool, DaemonError> {
    use tauri_plugin_opener::OpenerExt;
    let token = app
        .state::<Daemon>()
        .lock()
        .token()
        .map(str::to_owned)
        .ok_or(DaemonError::NoAccess)?;
    let data = DaemonClient::new(DEFAULT_BASE_URL, token)
        .call(CallKind::Query, "tray.setupUrl", &Value::Null)
        .await?;
    let Some(url) = daemon::setup_url(&data)? else {
        return Ok(false);
    };
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|_| DaemonError::Protocol)?;
    update_boot(app, |state| state.setup_opened = true);
    Ok(true)
}

/// Once the daemon answers: open setup by itself, once per launch, while onboarding is incomplete.
async fn started(app: &AppHandle) {
    set_boot(app, BootStep::Started, None);
    let already = app
        .state::<Boot>()
        .0
        .lock()
        .expect("boot state poisoned")
        .setup_opened;
    if !already {
        if let Err(err) = open_setup_url(app).await {
            eprintln!("hlabs tray: couldn't open setup: {err}");
        }
    }
}

/// The dashboard's current address from `tray.quickAction` (US-INST-06); only a web address.
async fn dashboard_url(app: &AppHandle, action: &str) -> Result<String, DaemonError> {
    let token = app
        .state::<Daemon>()
        .lock()
        .token()
        .map(str::to_owned)
        .ok_or(DaemonError::NoAccess)?;
    let answer = DaemonClient::new(DEFAULT_BASE_URL, token)
        .call(
            CallKind::Mutation,
            "tray.quickAction",
            &serde_json::json!({ "action": action }),
        )
        .await;
    match answer {
        Ok(data) => daemon::web_url(&data).ok_or(DaemonError::Protocol),
        // hlabs is down: the last address it gave; Caddy shows the "Can't reach hlabs" page there (US-INST-13).
        Err(DaemonError::Unreachable | DaemonError::Api { .. }) => app
            .state::<LastDashboard>()
            .0
            .lock()
            .expect("poisoned")
            .clone()
            .ok_or(DaemonError::Unreachable),
        Err(err) => Err(err),
    }
}

/// "Open Dashboard" (⌘D), or a page of it such as an app's logs for "Show startup log" (US-INST-11):
/// opens it in the default browser and closes the menu.
#[tauri::command]
async fn open_dashboard(app: AppHandle, path: Option<String>) -> Result<(), DaemonError> {
    use tauri_plugin_opener::OpenerExt;
    let base = dashboard_url(&app, "openDashboard").await?;
    let url = daemon::dashboard_page(&base, path.as_deref()).ok_or(DaemonError::Protocol)?;
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|_| DaemonError::Protocol)?;
    if let Some(menu) = app.get_webview_window(window::MENU_WINDOW) {
        let _ = menu.hide();
    }
    Ok(())
}

/// "Copy dashboard address": puts the address on the clipboard; the window says "Copied", then closes.
#[tauri::command]
async fn copy_dashboard_address(app: AppHandle) -> Result<(), DaemonError> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let url = dashboard_url(&app, "copyAddress").await?;
    app.clipboard()
        .write_text(url)
        .map_err(|_| DaemonError::Protocol)
}

/// Puts text on the clipboard ("Copy diagnostics", US-INST-12).
#[tauri::command]
fn copy_text(app: AppHandle, text: String) -> Result<(), DaemonError> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard()
        .write_text(text)
        .map_err(|_| DaemonError::Protocol)
}

/// "Open setup": fetches `tray.setupUrl` again and opens it (US-INST-02).
#[tauri::command]
async fn open_setup(app: AppHandle) -> Result<bool, DaemonError> {
    open_setup_url(&app).await
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
    if let (Ok(data), "tray.status") = (&result, path.as_str()) {
        if let Some(url) = daemon::web_url(&serde_json::json!({ "url": data.get("dashboardUrl") }))
        {
            *app.state::<LastDashboard>().0.lock().expect("poisoned") = Some(url);
        }
    }
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

/// Waits for `/healthz` (60 s), then reports started (and opens setup) or failed, and from then on
/// watches it every 5 s.
async fn wait_until_started(app: &AppHandle) {
    match bootstrap::wait_for_health(DEFAULT_BASE_URL, bootstrap::HEALTH_TIMEOUT).await {
        Waited::Ready => started(app).await,
        Waited::TimedOut => {
            set_boot(app, BootStep::Failed, None);
            update_health(app, |m| m.down(None, std::time::Instant::now()));
        }
        Waited::Failed(reason) => {
            set_boot(app, BootStep::Failed, Some(reason.clone()));
            update_health(app, |m| m.down(Some(reason), std::time::Instant::now()));
        }
    }
    tauri::async_runtime::spawn(watch_health(app.clone()));
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            daemon_call,
            tray_access,
            retry_access,
            boot_state,
            open_setup,
            open_dashboard,
            copy_dashboard_address,
            copy_text,
            health_state,
            restart_daemon,
            show_logs,
            copy_local_diagnostics
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let mut guard = TokenGuard::new(
                token::default_store(&paths::data_dir()),
                launchd::default_service(),
            );
            let boot = bundled_bootstrap(app.path().resource_dir()?.join("daemon"));
            let first_launch = boot
                .as_ref()
                .is_some_and(|b| b.is_first_launch(guard.has_stored_token()));
            if let Some(b) = &boot {
                if let Err(err) = b.prepare() {
                    eprintln!("hlabs tray: {err}");
                }
            }
            // The token exists before the LaunchAgent starts the daemon that reads it.
            guard.start();
            app.manage(Daemon(Mutex::new(guard)));
            app.manage(HealthWatch::default());
            app.manage(LastDashboard::default());
            app.manage(Boot(Mutex::new(BootState {
                first_launch,
                step: BootStep::Starting,
                reason: None,
                setup_opened: false,
            })));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // A release build with the daemon bundled installs and starts the background service;
                // in development (`pnpm dev:tray`) the daemon runs under `pnpm dev`.
                if let Some(b) = boot {
                    let installed =
                        tauri::async_runtime::spawn_blocking(move || b.install(first_launch)).await;
                    if !matches!(installed, Ok(Ok(_))) {
                        if let Ok(Err(err)) = installed {
                            eprintln!("hlabs tray: {err}");
                        }
                        return set_boot(&handle, BootStep::Failed, None);
                    }
                }
                wait_until_started(&handle).await;
            });

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
                        rect,
                        ..
                    } = event
                    {
                        window::toggle_menu(tray.app_handle(), &rect);
                    }
                })
                .build(app)?;
            app.manage(window::MenuState::default());
            if let Some(menu) = app.get_webview_window(window::MENU_WINDOW) {
                let handle = app.handle().clone();
                menu.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        window::on_blur(&handle);
                    }
                });
            }
            if first_launch {
                let rect = app
                    .tray_by_id("hlabs")
                    .and_then(|tray| tray.rect().ok().flatten());
                window::show_menu(app.handle(), rect.as_ref());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the hlabs tray");
}
