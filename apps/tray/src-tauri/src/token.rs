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
    /// Forgets the token (uninstalling hlabs, US-INST-22); one that isn't there is fine.
    fn delete(&self) -> Result<(), TokenError>;
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

    fn delete(&self) -> Result<(), TokenError> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(map_keyring(err)),
        }
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

    fn delete(&self) -> Result<(), TokenError> {
        match fs::remove_file(&self.path) {
            Err(err) if err.kind() != io::ErrorKind::NotFound => {
                Err(TokenError::Store(err.to_string()))
            }
            _ => Ok(()),
        }
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

/// The keychain in a release build (Secret Service on a Linux desktop, falling back to the 0600 file when it doesn't
/// answer, D-112, D-145); the token file in development, where the daemon keeps its secrets in files too.
pub fn default_store(data_dir: &std::path::Path) -> Box<dyn TokenStore> {
    let file = FileStore {
        path: data_dir.join(TOKEN_FILE),
    };
    if cfg!(debug_assertions) {
        return Box::new(file);
    }
    if cfg!(target_os = "linux") {
        return Box::new(Fallback {
            primary: Box::new(KeychainStore),
            file,
        });
    }
    Box::new(KeychainStore)
}

/// Secret Service, or the file when Secret Service can't be reached (a desktop without a keyring); the daemon reads
/// both (D-112).
pub struct Fallback {
    pub primary: Box<dyn TokenStore>,
    pub file: FileStore,
}

impl TokenStore for Fallback {
    fn get(&self) -> Result<Option<String>, TokenError> {
        match self.primary.get() {
            Ok(Some(token)) => Ok(Some(token)),
            // Nothing there, or no Secret Service: the file may hold it.
            Ok(None) | Err(_) => self.file.get(),
        }
    }

    fn set(&self, token: &str) -> Result<(), TokenError> {
        match self.primary.set(token) {
            Ok(()) => {
                // An older copy in the file would be read first by nothing, but it shouldn't linger.
                let _ = self.file.delete();
                Ok(())
            }
            Err(_) => self.file.set(token),
        }
    }

    fn delete(&self) -> Result<(), TokenError> {
        let _ = self.primary.delete();
        self.file.delete()
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
        fn delete(&self) -> Result<(), TokenError> {
            *self.token.lock().unwrap() = None;
            Ok(())
        }
    }

    #[test]
    fn us_inst_27_without_secret_service_the_token_goes_in_the_0600_file() {
        let dir = std::env::temp_dir().join(format!("us-inst-27-token-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let store = Fallback {
            primary: Box::new(MemoryStore {
                denied: true,
                ..Default::default()
            }),
            file: FileStore {
                path: dir.join(TOKEN_FILE),
            },
        };
        store.set("tok").unwrap();
        assert_eq!(store.get().unwrap().as_deref(), Some("tok"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(dir.join(TOKEN_FILE))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        // With Secret Service, it goes there and the file goes.
        let store = Fallback {
            primary: Box::new(MemoryStore::default()),
            file: FileStore {
                path: dir.join(TOKEN_FILE),
            },
        };
        store.set("tok2").unwrap();
        assert_eq!(store.get().unwrap().as_deref(), Some("tok2"));
        assert!(!dir.join(TOKEN_FILE).exists());
        fs::remove_dir_all(dir).unwrap();
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
