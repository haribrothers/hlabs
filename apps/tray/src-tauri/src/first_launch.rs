//! Before anything is set up on a Mac (US-INST-03, US-INST-04, D-142): hlabs needs macOS 14, and it runs from
//! Applications, so the background service never points at a copy that disappears (a disk image, Downloads). Both are
//! native alerts, shown before the menu-bar app has anything on screen.

// Mac only (US-INST-03, US-INST-04).
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::path::{Path, PathBuf};
use std::process::Command;

/// The oldest macOS hlabs runs on (D-039).
pub const MIN_MACOS: u32 = 14;

pub const TOO_OLD_TITLE: &str = "hlabs needs macOS 14 or later";
pub const TOO_OLD_MESSAGE: &str =
    "Update macOS in System Settings › General › Software Update, then open hlabs again.";
pub const MOVE_TITLE: &str = "Move hlabs to Applications?";
pub const MOVE_MESSAGE: &str =
    "hlabs runs from your Applications folder, so it keeps working after you eject the disk image or tidy up Downloads.";
pub const MOVE_BUTTON: &str = "Move to Applications";
pub const QUIT_BUTTON: &str = "Quit";
pub const MOVE_FAILED_TITLE: &str = "Couldn't move hlabs.";
pub const MOVE_FAILED_MESSAGE: &str = "Drag it into Applications, then open it again.";

/// The major version of a macOS product version ("14.2.1" → 14).
pub fn major_version(product_version: &str) -> Option<u32> {
    product_version.trim().split('.').next()?.parse().ok()
}

/// Whether hlabs can run on this macOS; an unknown version gets the benefit of the doubt.
pub fn macos_supported(product_version: Option<&str>) -> bool {
    product_version
        .and_then(major_version)
        .map_or(true, |major| major >= MIN_MACOS)
}

/// This Mac's macOS version ("15.1"), from `kern.osproductversion`.
#[cfg(target_os = "macos")]
pub fn macos_version() -> Option<String> {
    let name = std::ffi::CString::new("kern.osproductversion").ok()?;
    let mut buf = [0u8; 64];
    let mut len = buf.len();
    // SAFETY: the name is NUL-terminated and buf/len describe a writable buffer of len bytes.
    let rc = unsafe {
        libc::sysctlbyname(
            name.as_ptr(),
            buf.as_mut_ptr().cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    if rc != 0 || len == 0 {
        return None;
    }
    let text = &buf[..len];
    let end = text.iter().position(|b| *b == 0).unwrap_or(text.len());
    Some(String::from_utf8_lossy(&text[..end]).into_owned())
}

/// The `.app` this executable is inside (`…/hlabs.app/Contents/MacOS/hlabs-tray` → `…/hlabs.app`).
pub fn app_bundle(exe: &Path) -> Option<PathBuf> {
    let app = exe.parent()?.parent()?.parent()?;
    (app.extension().is_some_and(|e| e == "app")).then(|| app.to_path_buf())
}

/// Whether the app runs from `/Applications` or `~/Applications` (or a folder inside them).
pub fn in_applications(app: &Path, home: &Path) -> bool {
    app.starts_with("/Applications") || app.starts_with(home.join("Applications"))
}

#[derive(Debug, thiserror::Error)]
pub enum MoveError {
    #[error("copying hlabs into {0} failed: {1}")]
    Copy(PathBuf, String),
    #[error("replacing the hlabs already in {0} failed: {1}")]
    Replace(PathBuf, String),
}

/// A name in `dir` that isn't taken: `hlabs.app`, then `hlabs 2.app`, `hlabs 3.app`…
pub(crate) fn free_name(dir: &Path, stem: &str) -> PathBuf {
    let first = dir.join(format!("{stem}.app"));
    if !first.exists() {
        return first;
    }
    (2..)
        .map(|n| dir.join(format!("{stem} {n}.app")))
        .find(|p| !p.exists())
        .expect("a free name")
}

/// Moves a folder to the Trash; across disks (or when that fails) it's deleted instead.
fn to_trash(path: &Path, trash: &Path) -> std::io::Result<()> {
    let _ = std::fs::create_dir_all(trash);
    if std::fs::rename(path, free_name(trash, "hlabs")).is_ok() {
        return Ok(());
    }
    std::fs::remove_dir_all(path)
}

/// Copies `app` to `<applications>/hlabs.app` (an older copy goes to the Trash first) and moves the original to the
/// Trash when its disk allows it (a disk image doesn't). `ditto --noqtn` keeps the bundle as it is but leaves out the
/// quarantine mark, which would otherwise make macOS run the copy from a temporary place again (App Translocation).
pub fn move_to_applications(
    app: &Path,
    applications: &Path,
    trash: &Path,
) -> Result<PathBuf, MoveError> {
    let dest = applications.join("hlabs.app");
    let staging = applications.join(".hlabs.app.moving");
    let _ = std::fs::remove_dir_all(&staging);
    let copied = Command::new("/usr/bin/ditto")
        .arg("--noqtn")
        .arg(app)
        .arg(&staging)
        .output()
        .map_err(|e| MoveError::Copy(applications.to_path_buf(), e.to_string()))?;
    if !copied.status.success() {
        let _ = std::fs::remove_dir_all(&staging);
        let why = String::from_utf8_lossy(&copied.stderr).trim().to_string();
        return Err(MoveError::Copy(applications.to_path_buf(), why));
    }
    if dest.exists() {
        if let Err(e) = to_trash(&dest, trash) {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(MoveError::Replace(
                applications.to_path_buf(),
                e.to_string(),
            ));
        }
    }
    if let Err(e) = std::fs::rename(&staging, &dest) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(MoveError::Copy(applications.to_path_buf(), e.to_string()));
    }
    // The original: gone from Downloads, left on a read-only disk image.
    if app != dest {
        let _ = std::fs::rename(app, free_name(trash, "hlabs"));
    }
    Ok(dest)
}

/// Opens `app` once this process has quit, so the single-instance check lets the new copy start.
pub fn relaunch_after_exit(app: &Path) -> std::io::Result<()> {
    Command::new("/bin/sh")
        .arg("-c")
        .arg(r#"while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec /usr/bin/open "$2""#)
        .arg("sh")
        .arg(std::process::id().to_string())
        .arg(app)
        .spawn()
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn us_inst_03_needs_macos_14() {
        assert_eq!(major_version("14.2.1"), Some(14));
        assert_eq!(major_version("15"), Some(15));
        assert_eq!(major_version("x"), None);
        assert!(!macos_supported(Some("13.6.1")));
        assert!(macos_supported(Some("14.0")));
        assert!(macos_supported(Some("26.1")));
        assert!(macos_supported(None));
        assert_eq!(TOO_OLD_TITLE, "hlabs needs macOS 14 or later");
    }

    #[test]
    fn us_inst_04_knows_where_it_runs_from() {
        let home = Path::new("/Users/hari");
        let exe = |app: &str| PathBuf::from(format!("{app}/Contents/MacOS/hlabs-tray"));
        assert_eq!(
            app_bundle(&exe("/Volumes/hlabs/hlabs.app")),
            Some(PathBuf::from("/Volumes/hlabs/hlabs.app"))
        );
        assert_eq!(app_bundle(Path::new("/usr/local/bin/hlabs-tray")), None);
        assert!(in_applications(Path::new("/Applications/hlabs.app"), home));
        assert!(in_applications(
            Path::new("/Users/hari/Applications/hlabs.app"),
            home
        ));
        assert!(!in_applications(
            Path::new("/Volumes/hlabs/hlabs.app"),
            home
        ));
        assert!(!in_applications(
            Path::new("/Users/hari/Downloads/hlabs.app"),
            home
        ));
        assert!(!in_applications(
            Path::new("/private/var/folders/x/T/AppTranslocation/ABC/d/hlabs.app"),
            home
        ));
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("us-inst-04-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fake_app(dir: &Path, marker: &str) -> PathBuf {
        let app = dir.join("hlabs.app");
        std::fs::create_dir_all(app.join("Contents/MacOS")).unwrap();
        std::fs::write(app.join("Contents/MacOS/hlabs-tray"), marker).unwrap();
        app
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn us_inst_04_moves_into_applications_and_the_original_and_an_old_copy_to_the_trash() {
        let root = temp("move");
        let (downloads, applications, trash) = (
            root.join("Downloads"),
            root.join("Applications"),
            root.join(".Trash"),
        );
        let app = fake_app(&downloads, "new");
        fake_app(&applications, "old");

        let dest = move_to_applications(&app, &applications, &trash).unwrap();
        assert_eq!(dest, applications.join("hlabs.app"));
        assert_eq!(
            std::fs::read_to_string(dest.join("Contents/MacOS/hlabs-tray")).unwrap(),
            "new"
        );
        assert!(!app.exists());
        assert!(!applications.join(".hlabs.app.moving").exists());
        let trashed: Vec<String> = std::fs::read_dir(&trash)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(trashed.len(), 2, "{trashed:?}");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn us_inst_04_a_copy_that_fails_changes_nothing() {
        use std::os::unix::fs::PermissionsExt;
        let root = temp("fail");
        let (downloads, applications, trash) = (
            root.join("Downloads"),
            root.join("Applications"),
            root.join(".Trash"),
        );
        let app = fake_app(&downloads, "new");
        std::fs::create_dir_all(&applications).unwrap();
        std::fs::set_permissions(&applications, std::fs::Permissions::from_mode(0o555)).unwrap();

        let result = move_to_applications(&app, &applications, &trash);
        std::fs::set_permissions(&applications, std::fs::Permissions::from_mode(0o755)).unwrap();
        // Root can write anywhere; the copy then works and there's nothing to check.
        // SAFETY: getuid has no preconditions.
        if unsafe { libc::getuid() } != 0 {
            assert!(matches!(result, Err(MoveError::Copy(..))), "{result:?}");
            assert!(app.exists());
            assert!(!applications.join("hlabs.app").exists());
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
