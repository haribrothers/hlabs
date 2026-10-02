//! Where hlabs keeps its data, matching the daemon's `platform/paths.ts` (02 §2.3).

use std::path::PathBuf;

/// The daemon's data dir: `HLABS_DATA_DIR` when set; in a development build the repository's
/// `.dev-data` (what `pnpm dev` uses); otherwise the platform's place for it.
pub fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("HLABS_DATA_DIR") {
        return PathBuf::from(dir);
    }
    if cfg!(debug_assertions) {
        return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../.dev-data");
    }
    platform_data_dir(&home())
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

pub fn platform_data_dir(home: &std::path::Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support/hlabs")
    } else {
        home.join(".local/share/hlabs")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_dir_matches_the_daemon() {
        let dir = platform_data_dir(std::path::Path::new("/Users/a"));
        if cfg!(target_os = "macos") {
            assert_eq!(
                dir,
                PathBuf::from("/Users/a/Library/Application Support/hlabs")
            );
        } else {
            assert_eq!(dir, PathBuf::from("/Users/a/.local/share/hlabs"));
        }
    }
}
