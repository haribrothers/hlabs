//! hlabs updates in the tray (US-INST-19, D-034, D-117): the Tauri updater reads the signed manifest on the channel
//! `tray.status` gives, checked against the public key in tauri.conf.json (the same key the daemon embeds, D-118).
//! HLABS_UPDATE_ENDPOINT (with `{channel}`) points debug builds at another server, for the signed test update.

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
    if cfg!(debug_assertions) {
        std::env::var("HLABS_UPDATE_ENDPOINT").ok()
    } else {
        None
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

pub fn updater(app: &AppHandle, channel: &str) -> Result<tauri_plugin_updater::Updater, String> {
    let url = Url::parse(&endpoint(channel, override_endpoint().as_deref())).map_err(|e| e.to_string())?;
    app.updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

/// A newer signed version on the channel, or None when up to date; Err when offline or the manifest is bad.
#[tauri::command]
pub async fn check_update(app: AppHandle, channel: String) -> Result<Option<UpdateInfo>, String> {
    let update = updater(&app, &channel)?.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_and_beta_manifests_on_github_releases() {
        assert_eq!(
            endpoint("stable", None),
            "https://github.com/haribrothers/hlabs/releases/latest/download/latest.json"
        );
        assert_eq!(endpoint("beta", None), "https://github.com/haribrothers/hlabs/releases/download/beta/latest.json");
    }

    #[test]
    fn an_override_takes_the_channel() {
        assert_eq!(endpoint("beta", Some("http://127.0.0.1:8080/{channel}.json")), "http://127.0.0.1:8080/beta.json");
    }
}
