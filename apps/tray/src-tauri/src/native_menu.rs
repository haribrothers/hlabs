//! The native tray menu on a Linux desktop (US-INST-26, D-145). The menu window works out the items for each state, as
//! on a Mac, and hands them over (`set_native_menu`); this builds them with libayatana-appindicator through Tauri,
//! changes their text, enabled and checked state in place when only those changed (so an open menu updates), and
//! rebuilds it when the items themselves changed. A click goes back to the window as a `native-menu` event.
//! Also: the white icon for dark panels, and the one-time notice on GNOME without the AppIndicator extension.

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::sync::Mutex;

/// One item of the menu, from the window (native-menu.tsx `NativeItem`).
#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NativeItem {
    Item {
        id: String,
        label: String,
        enabled: bool,
        checked: Option<bool>,
    },
    Separator,
}

/// What can't change in place: each item's kind, id and whether it has a tick.
pub fn shape(items: &[NativeItem]) -> Vec<String> {
    items
        .iter()
        .map(|i| match i {
            NativeItem::Item { id, checked, .. } => {
                format!("{id}{}", if checked.is_some() { "+check" } else { "" })
            }
            NativeItem::Separator => "-".to_owned(),
        })
        .collect()
}

/// The menu as built: its shape and its items, to change in place.
#[derive(Default)]
pub struct NativeMenuState(pub Mutex<Option<(Vec<String>, Vec<Built>)>>);

pub enum Built {
    Item(tauri::menu::MenuItem<tauri::Wry>),
    Check(tauri::menu::CheckMenuItem<tauri::Wry>),
    Separator,
}

/// The glyph in white, keeping its shape (Linux panels are dark; template images are a Mac thing).
pub fn white(rgba: &[u8]) -> Vec<u8> {
    let mut out = rgba.to_vec();
    for px in out.chunks_exact_mut(4) {
        px[0] = 255;
        px[1] = 255;
        px[2] = 255;
    }
    out
}

/// The notice is for GNOME without a StatusNotifier watcher (no AppIndicator extension), once.
pub fn needs_appindicator_notice(desktop: &str, has_watcher: bool, shown_before: bool) -> bool {
    !has_watcher && !shown_before && desktop.split(':').any(|d| d.eq_ignore_ascii_case("GNOME"))
}

pub const APPINDICATOR_TITLE: &str = "hlabs is running";
pub const APPINDICATOR_BODY: &str =
    "Install the AppIndicator extension to see hlabs in the top bar";
/// Remembers the notice was shown, in the data dir.
pub const APPINDICATOR_FLAG: &str = ".appindicator-notice";

/// Whether something on the session bus shows tray icons (`org.kde.StatusNotifierWatcher`).
#[cfg(target_os = "linux")]
pub fn has_status_notifier_watcher() -> bool {
    std::process::Command::new("dbus-send")
        .args([
            "--session",
            "--print-reply",
            "--dest=org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus.NameHasOwner",
            "string:org.kde.StatusNotifierWatcher",
        ])
        .output()
        .map(|out| String::from_utf8_lossy(&out.stdout).contains("boolean true"))
        // Without dbus-send nothing can be told: no notice.
        .unwrap_or(true)
}

#[cfg(target_os = "linux")]
fn build(
    app: &tauri::AppHandle,
    items: &[NativeItem],
) -> tauri::Result<(tauri::menu::Menu<tauri::Wry>, Vec<Built>)> {
    use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
    let menu = Menu::new(app)?;
    let mut built = Vec::new();
    for item in items {
        match item {
            NativeItem::Item {
                id,
                label,
                enabled,
                checked: Some(checked),
            } => {
                let check =
                    CheckMenuItem::with_id(app, id, label, *enabled, *checked, None::<&str>)?;
                menu.append(&check)?;
                built.push(Built::Check(check));
            }
            NativeItem::Item {
                id, label, enabled, ..
            } => {
                let plain = MenuItem::with_id(app, id, label, *enabled, None::<&str>)?;
                menu.append(&plain)?;
                built.push(Built::Item(plain));
            }
            NativeItem::Separator => {
                menu.append(&PredefinedMenuItem::separator(app)?)?;
                built.push(Built::Separator);
            }
        }
    }
    Ok((menu, built))
}

/// US-INST-26: the window's items for the native menu (Linux; nothing elsewhere).
#[tauri::command]
pub fn set_native_menu(
    app: tauri::AppHandle,
    state: tauri::State<'_, NativeMenuState>,
    items: Vec<NativeItem>,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let mut current = state.0.lock().map_err(|e| e.to_string())?;
        let wanted = shape(&items);
        if let Some((built_shape, built)) = current.as_ref() {
            if *built_shape == wanted {
                for (item, handle) in items.iter().zip(built) {
                    match (item, handle) {
                        (NativeItem::Item { label, enabled, .. }, Built::Item(h)) => {
                            h.set_text(label).map_err(|e| e.to_string())?;
                            h.set_enabled(*enabled).map_err(|e| e.to_string())?;
                        }
                        (
                            NativeItem::Item {
                                label,
                                enabled,
                                checked,
                                ..
                            },
                            Built::Check(h),
                        ) => {
                            h.set_text(label).map_err(|e| e.to_string())?;
                            h.set_enabled(*enabled).map_err(|e| e.to_string())?;
                            h.set_checked(checked.unwrap_or(false))
                                .map_err(|e| e.to_string())?;
                        }
                        _ => {}
                    }
                }
                return Ok(());
            }
        }
        let (menu, built) = build(&app, &items).map_err(|e| e.to_string())?;
        let tray = app.tray_by_id("hlabs").ok_or("no tray icon")?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        *current = Some((wanted, built));
    }
    let _ = (&app, &state, &items);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, label: &str, checked: Option<bool>) -> NativeItem {
        NativeItem::Item {
            id: id.into(),
            label: label.into(),
            enabled: true,
            checked,
        }
    }

    #[test]
    fn us_inst_26_text_changes_in_place_and_other_items_rebuild_the_menu() {
        let running = vec![
            item("status", "hlabs · Running · 11 apps", None),
            NativeItem::Separator,
            item("item-3", "Start at login", Some(true)),
        ];
        let later = vec![
            item(
                "status",
                "hlabs · Running · 10 of 11 apps · 1 needs attention",
                None,
            ),
            NativeItem::Separator,
            item("item-3", "Start at login", Some(false)),
        ];
        assert_eq!(shape(&running), shape(&later));
        let paused = vec![
            item("status", "hlabs · Paused · apps stopped", None),
            item("action", "Resume apps", None),
        ];
        assert_ne!(shape(&running), shape(&paused));
        assert_eq!(shape(&running), vec!["status", "-", "item-3+check"]);
    }

    #[test]
    fn us_inst_26_reads_the_items_the_window_sends() {
        let items: Vec<NativeItem> = serde_json::from_str(
            r#"[{"kind":"item","id":"status","label":"hlabs · Running · 11 apps","enabled":false,"checked":null},
                {"kind":"separator"},
                {"kind":"item","id":"item-5","label":"Start at login","enabled":true,"checked":true}]"#,
        )
        .unwrap();
        assert_eq!(items[1], NativeItem::Separator);
        assert_eq!(items[2], item("item-5", "Start at login", Some(true)));
    }

    #[test]
    fn us_inst_26_the_icon_is_white_and_keeps_its_shape() {
        let rgba = [0, 0, 0, 255, 0, 0, 0, 0, 10, 20, 30, 128];
        assert_eq!(
            white(&rgba),
            vec![255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 128]
        );
    }

    #[test]
    fn us_inst_26_the_appindicator_notice_is_for_gnome_without_it_once() {
        assert!(needs_appindicator_notice("ubuntu:GNOME", false, false));
        assert!(!needs_appindicator_notice("ubuntu:GNOME", true, false));
        assert!(!needs_appindicator_notice("GNOME", false, true));
        assert!(!needs_appindicator_notice("KDE", false, false));
    }
}
