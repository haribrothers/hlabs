//! Uninstalling hlabs, the menu-bar app's part (US-INST-21, US-INST-22, D-143): after the daemon's job has taken the
//! apps down, stop the daemon for good, then delete the data if asked, then put hlabs.app in the Trash. Deleting never
//! follows a link or goes onto another disk (a network drive still mounted inside), and never touches the home folder
//! itself or a folder above it.

// The menu's Uninstall is a Mac thing (D-145).
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;

/// Why macOS asks: "hlabs is trying to uninstall hlabs."
pub const REASON: &str = "uninstall hlabs";
/// The keychain service every hlabs secret is under (D-050).
pub const KEYCHAIN_SERVICE: &str = "dev.hlabs";

/// Whether hlabs may delete this folder: not `/`, not the home folder or anything above it, not on another disk.
pub fn deletable(path: &Path, home: &Path) -> bool {
    path.is_absolute()
        && path.components().count() > 2
        && !home.starts_with(path)
        && !path.starts_with("/Volumes")
}

/// Deletes a folder and everything in it, on its own disk only: links are removed, not followed, and anything mounted
/// inside stops it (`Err`), so a network drive's files are never deleted. A folder that isn't there is fine.
pub fn remove_tree(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::MetadataExt;
    let Ok(root) = std::fs::symlink_metadata(path) else {
        return Ok(());
    };
    fn walk(path: &Path, dev: u64) -> Result<(), String> {
        let meta =
            std::fs::symlink_metadata(path).map_err(|e| format!("{}: {e}", path.display()))?;
        if meta.dev() != dev {
            return Err(format!(
                "{} is another disk, still connected",
                path.display()
            ));
        }
        if meta.is_dir() {
            for entry in std::fs::read_dir(path).map_err(|e| format!("{}: {e}", path.display()))? {
                let entry = entry.map_err(|e| e.to_string())?;
                walk(&entry.path(), dev)?;
            }
            std::fs::remove_dir(path).map_err(|e| format!("{}: {e}", path.display()))
        } else {
            std::fs::remove_file(path).map_err(|e| format!("{}: {e}", path.display()))
        }
    }
    walk(path, root.dev())
}

/// Deletes every keychain item of the hlabs service (`security` deletes one per call).
#[cfg(target_os = "macos")]
pub fn delete_keychain_items() -> Result<(), String> {
    for _ in 0..1000 {
        let out = Command::new("/usr/bin/security")
            .args(["delete-generic-password", "-s", KEYCHAIN_SERVICE])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Ok(());
        }
    }
    Err("hlabs's keychain items kept coming back".to_owned())
}

/// Deletes the data folder and the storage root, each when hlabs may (the keychain items go separately).
pub fn delete_data(data_dir: &Path, storage_root: &Path, home: &Path) -> Result<(), String> {
    for dir in [data_dir, storage_root] {
        if deletable(dir, home) {
            remove_tree(dir)?;
        }
    }
    Ok(())
}

/// Puts the app in the Trash (`~/.Trash/hlabs.app`, or `hlabs 2.app`…).
pub fn trash_app(app: &Path, trash: &Path) -> Result<PathBuf, String> {
    let _ = std::fs::create_dir_all(trash);
    let dest = crate::first_launch::free_name(trash, "hlabs");
    std::fs::rename(app, &dest).map_err(|e| format!("{}: {e}", app.display()))?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("us-inst-22-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn us_inst_22_never_deletes_home_or_above_or_another_disk() {
        let home = Path::new("/Users/hari");
        assert!(deletable(Path::new("/Users/hari/hlabs"), home));
        assert!(deletable(
            Path::new("/Users/hari/Library/Application Support/hlabs"),
            home
        ));
        assert!(!deletable(Path::new("/Users/hari"), home));
        assert!(!deletable(Path::new("/Users"), home));
        assert!(!deletable(Path::new("/"), home));
        assert!(!deletable(Path::new("/Volumes/Photos/hlabs"), home));
        assert!(!deletable(Path::new("hlabs"), home));
    }

    #[test]
    fn us_inst_22_deletes_a_folder_without_following_links() {
        let root = temp("tree");
        let keep = root.join("elsewhere");
        std::fs::create_dir_all(&keep).unwrap();
        std::fs::write(keep.join("photo.jpg"), "x").unwrap();
        let data = root.join("hlabs");
        std::fs::create_dir_all(data.join("users/hari")).unwrap();
        std::fs::write(data.join("users/hari/notes.txt"), "x").unwrap();
        std::os::unix::fs::symlink(&keep, data.join("link")).unwrap();

        remove_tree(&data).unwrap();
        assert!(!data.exists());
        assert!(keep.join("photo.jpg").exists());
        // Already gone is fine.
        remove_tree(&data).unwrap();
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn us_inst_22_delete_data_skips_what_it_may_not_delete() {
        let root = temp("data");
        let home = root.join("home");
        let data = home.join("Library/Application Support/hlabs");
        std::fs::create_dir_all(&data).unwrap();
        std::fs::write(data.join("hlabs.db"), "x").unwrap();
        // A storage root that is the home folder itself is left alone.
        std::fs::write(home.join("keep.txt"), "x").unwrap();
        delete_data(&data, &home, &home).unwrap();
        assert!(!data.exists());
        assert!(home.join("keep.txt").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn us_inst_22_puts_the_app_in_the_trash() {
        let root = temp("trash");
        let app = root.join("Applications/hlabs.app");
        std::fs::create_dir_all(app.join("Contents")).unwrap();
        let trash = root.join(".Trash");
        std::fs::create_dir_all(trash.join("hlabs.app")).unwrap();
        let dest = trash_app(&app, &trash).unwrap();
        assert_eq!(dest, trash.join("hlabs 2.app"));
        assert!(!app.exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
