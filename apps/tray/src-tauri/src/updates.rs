//! hlabs updates in the tray (US-INST-19, US-INST-20, D-034, D-117): the Tauri updater reads the signed manifest on the
//! channel `tray.status` gives, checked against the public key in tauri.conf.json (the same key the daemon embeds,
//! D-118). HLABS_UPDATE_ENDPOINT (with `{channel}`) points it at another server, for the signed test update; what that
//! serves still has to be signed with the hlabs key.
//!
//! Applying one ("Restart to update", or the dashboard's "Update now"): download and check it first (nothing changes
//! if that fails), write `update-state.json` for the updating pages (US-STATE-01), stop the daemon, replace the app
//! (tray, daemon and helper binaries are all in it), start the daemon again and relaunch the tray. If replacing fails,
//! the old daemon starts again and the marker stays, so it can say the update didn't install (US-STATE-03).

use serde::Serialize;
use tauri::{AppHandle, Url};
use tauri_plugin_updater::UpdaterExt;

const RELEASES: &str = "https://github.com/haribrothers/hlabs/releases";

/// Where the manifest for a channel lives. `override_endpoint` is HLABS_UPDATE_ENDPOINT (debug builds only).
pub fn endpoint(channel: &str, override_endpoint: Option<&str>) -> String {
    if let Some(e) = override_endpoint {
        return e.replace("{channel}", channel);
    }
    match channel {
        "beta" => format!("{RELEASES}/download/beta/latest.json"),
        _ => format!("{RELEASES}/latest/download/latest.json"),
    }
}

fn override_endpoint() -> Option<String> {
    std::env::var("HLABS_UPDATE_ENDPOINT").ok()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

pub fn updater(app: &AppHandle, channel: &str) -> Result<tauri_plugin_updater::Updater, String> {
    let url = Url::parse(&endpoint(channel, override_endpoint().as_deref()))
        .map_err(|e| e.to_string())?;
    app.updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

/// A newer signed version on the channel, or None when up to date; Err when offline or the manifest is bad.
#[tauri::command]
pub async fn check_update(app: AppHandle, channel: String) -> Result<Option<UpdateInfo>, String> {
    let update = updater(&app, &channel)?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone(),
    }))
}

/// The marker the daemon and the updating pages read (`<data dir>/update-state.json`).
pub const STATE_FILE: &str = "update-state.json";

#[derive(Debug, Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    pub from_version: String,
    pub to_version: String,
    pub started_at: u64,
}

/// The steps after the download: marker, stop, replace, start, relaunch. `install` replaces the app; `relaunch`
/// starts the new tray (and doesn't return in the real app).
pub fn apply_downloaded(
    service: &dyn crate::launchd::DaemonService,
    data_dir: &std::path::Path,
    state: &UpdateState,
    install: impl FnOnce() -> Result<(), String>,
    relaunch: impl FnOnce(),
) -> Result<(), String> {
    let marker = data_dir.join(STATE_FILE);
    std::fs::write(
        &marker,
        serde_json::to_vec(state).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("couldn't write {}: {e}", marker.display()))?;
    if let Err(err) = service.stop() {
        let _ = std::fs::remove_file(&marker);
        return Err(err);
    }
    let installed = install();
    // Whichever version is in place now starts again.
    let started = service.start();
    installed?;
    started?;
    relaunch();
    Ok(())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// "Restart to update" (US-INST-20): the newer version on the channel, downloaded and checked, then applied.
#[tauri::command]
pub async fn apply_update(app: AppHandle, channel: String) -> Result<(), String> {
    let update = updater(&app, &channel)?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "hlabs is up to date".to_owned())?;
    // The signature is checked as it downloads; a bad one stops here, before anything changes.
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    let state = UpdateState {
        from_version: app.package_info().version.to_string(),
        to_version: update.version.clone(),
        started_at: now_ms(),
    };
    let service = crate::launchd::default_service();
    apply_downloaded(
        service.as_ref(),
        &crate::paths::data_dir(),
        &state,
        || update.install(&bytes).map_err(|e| e.to_string()),
        || app.restart(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::launchd::DaemonService;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Service {
        calls: Mutex<Vec<&'static str>>,
        fail_stop: bool,
    }
    impl DaemonService for Service {
        fn restart(&self) -> Result<(), String> {
            Ok(())
        }
        fn stop(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("stop");
            if self.fail_stop {
                Err("bootout failed".into())
            } else {
                Ok(())
            }
        }
        fn start(&self) -> Result<(), String> {
            self.calls.lock().unwrap().push("start");
            Ok(())
        }
        fn describe(&self) -> String {
            String::new()
        }
    }

    fn state() -> UpdateState {
        UpdateState {
            from_version: "1.4.0".into(),
            to_version: "1.5.0".into(),
            started_at: 1,
        }
    }

    fn temp_dir() -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("hlabs-update-{}-{}", std::process::id(), now_ms()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn us_inst_20_marker_stop_replace_start_relaunch_in_that_order() {
        let dir = temp_dir();
        let service = Service::default();
        let order = Mutex::new(Vec::new());
        apply_downloaded(
            &service,
            &dir,
            &state(),
            || {
                assert!(
                    dir.join(STATE_FILE).exists(),
                    "the marker is written before the files are replaced"
                );
                assert_eq!(*service.calls.lock().unwrap(), vec!["stop"]);
                order.lock().unwrap().push("install");
                Ok(())
            },
            || order.lock().unwrap().push("relaunch"),
        )
        .unwrap();
        assert_eq!(*service.calls.lock().unwrap(), vec!["stop", "start"]);
        assert_eq!(*order.lock().unwrap(), vec!["install", "relaunch"]);
        let marker: UpdateState =
            serde_json::from_slice(&std::fs::read(dir.join(STATE_FILE)).unwrap()).unwrap();
        assert_eq!(marker, state());
    }

    #[test]
    fn us_inst_20_a_failed_replace_starts_the_old_daemon_and_keeps_the_marker() {
        let dir = temp_dir();
        let service = Service::default();
        let relaunched = Mutex::new(false);
        let err = apply_downloaded(
            &service,
            &dir,
            &state(),
            || Err("disk full".into()),
            || *relaunched.lock().unwrap() = true,
        )
        .unwrap_err();
        assert_eq!(err, "disk full");
        assert_eq!(*service.calls.lock().unwrap(), vec!["stop", "start"]);
        assert!(!*relaunched.lock().unwrap());
        assert!(dir.join(STATE_FILE).exists());
    }

    #[test]
    fn us_inst_20_if_the_daemon_cant_be_stopped_nothing_changes() {
        let dir = temp_dir();
        let service = Service {
            fail_stop: true,
            ..Default::default()
        };
        let err = apply_downloaded(
            &service,
            &dir,
            &state(),
            || panic!("must not install"),
            || {},
        )
        .unwrap_err();
        assert!(err.contains("bootout"));
        assert!(!dir.join(STATE_FILE).exists());
    }

    #[test]
    fn stable_and_beta_manifests_on_github_releases() {
        assert_eq!(
            endpoint("stable", None),
            "https://github.com/haribrothers/hlabs/releases/latest/download/latest.json"
        );
        assert_eq!(
            endpoint("beta", None),
            "https://github.com/haribrothers/hlabs/releases/download/beta/latest.json"
        );
    }

    #[test]
    fn an_override_takes_the_channel() {
        assert_eq!(
            endpoint("beta", Some("http://127.0.0.1:8080/{channel}.json")),
            "http://127.0.0.1:8080/beta.json"
        );
    }
}
