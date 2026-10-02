//! The tray token (US-INST-15, 07 §7.5, D-112): 32 random bytes, base64url, kept in the keychain
//! (service `dev.hlabs`, account `tray-token`) or, where there is no keychain (development, a Linux
//! desktop without Secret Service), in `<dataDir>/tray.token` with mode 0600. The daemon reads the
//! same item and keeps only its hash; the token never reaches the webview or a log.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use std::{fs, io, path::PathBuf};

pub const KEYCHAIN_SERVICE: &str = "dev.hlabs";
pub const KEYCHAIN_ACCOUNT: &str = "tray-token";
pub const TOKEN_FILE: &str = "tray.token";

#[derive(Debug, thiserror::Error)]
pub enum TokenError {
    /// The OS refused access to the keychain (US-INST-16: "hlabs needs Keychain access to work").
    #[error("keychain access was refused")]
    AccessDenied,
    #[error("the token store failed: {0}")]
    Store(String),
}

/// Where the token is kept.
pub trait TokenStore: Send + Sync {
    fn get(&self) -> Result<Option<String>, TokenError>;
    fn set(&self, token: &str) -> Result<(), TokenError>;
}

/// A new token: 32 random bytes, base64url without padding (43 characters).
pub fn new_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random source failed");
    URL_SAFE_NO_PAD.encode(bytes)
}

/// macOS Keychain / Linux Secret Service.
pub struct KeychainStore;

impl KeychainStore {
    fn entry() -> Result<keyring::Entry, TokenError> {
        keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(map_keyring)
    }
}

fn map_keyring(err: keyring::Error) -> TokenError {
    match err {
        keyring::Error::NoStorageAccess(_) => TokenError::AccessDenied,
        other => TokenError::Store(other.to_string()),
    }
}

impl TokenStore for KeychainStore {
    fn get(&self) -> Result<Option<String>, TokenError> {
        match Self::entry()?.get_password() {
            Ok(token) if !token.trim().is_empty() => Ok(Some(token.trim().to_owned())),
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(map_keyring(err)),
        }
    }

    fn set(&self, token: &str) -> Result<(), TokenError> {
        Self::entry()?.set_password(token).map_err(map_keyring)
    }
}

/// `<dataDir>/tray.token`, mode 0600.
pub struct FileStore {
    pub path: PathBuf,
}

impl TokenStore for FileStore {
    fn get(&self) -> Result<Option<String>, TokenError> {
        match fs::read_to_string(&self.path) {
            Ok(token) if !token.trim().is_empty() => Ok(Some(token.trim().to_owned())),
            Ok(_) => Ok(None),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(err) if err.kind() == io::ErrorKind::PermissionDenied => {
                Err(TokenError::AccessDenied)
            }
            Err(err) => Err(TokenError::Store(err.to_string())),
        }
    }

    fn set(&self, token: &str) -> Result<(), TokenError> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|e| TokenError::Store(e.to_string()))?;
        }
        let tmp = self.path.with_extension("token.tmp");
        write_private(&tmp, &format!("{token}\n")).map_err(|e| TokenError::Store(e.to_string()))?;
        fs::rename(&tmp, &self.path).map_err(|e| TokenError::Store(e.to_string()))
    }
}

#[cfg(unix)]
fn write_private(path: &std::path::Path, contents: &str) -> io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    file.set_permissions(fs::Permissions::from_mode(0o600))?;
    file.write_all(contents.as_bytes())
}

#[cfg(not(unix))]
fn write_private(path: &std::path::Path, contents: &str) -> io::Result<()> {
    fs::write(path, contents)
}

/// The keychain in a release build; the token file in development, where the daemon keeps its
/// secrets in files too (D-112).
pub fn default_store(data_dir: &std::path::Path) -> Box<dyn TokenStore> {
    if cfg!(debug_assertions) {
        Box::new(FileStore {
            path: data_dir.join(TOKEN_FILE),
        })
    } else {
        Box::new(KeychainStore)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::sync::Mutex;

    /// In-memory store for tests.
    #[derive(Default)]
    pub struct MemoryStore {
        pub token: Mutex<Option<String>>,
        pub denied: bool,
    }

    impl TokenStore for MemoryStore {
        fn get(&self) -> Result<Option<String>, TokenError> {
            if self.denied {
                return Err(TokenError::AccessDenied);
            }
            Ok(self.token.lock().unwrap().clone())
        }
        fn set(&self, token: &str) -> Result<(), TokenError> {
            if self.denied {
                return Err(TokenError::AccessDenied);
            }
            *self.token.lock().unwrap() = Some(token.to_owned());
            Ok(())
        }
    }

    #[test]
    fn us_inst_15_token_is_32_random_bytes_base64url() {
        let token = new_token();
        assert_eq!(token.len(), 43);
        assert_eq!(URL_SAFE_NO_PAD.decode(&token).unwrap().len(), 32);
        assert!(token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(new_token(), token);
    }

    #[cfg(unix)]
    #[test]
    fn us_inst_15_file_store_is_private_and_trims_newline() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("hlabs-token-{}", new_token()));
        let store = FileStore {
            path: dir.join(TOKEN_FILE),
        };
        assert_eq!(store.get().unwrap(), None);
        store.set("abc").unwrap();
        assert_eq!(store.get().unwrap().as_deref(), Some("abc"));
        let mode = fs::metadata(&store.path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        fs::remove_dir_all(dir).unwrap();
    }
}
