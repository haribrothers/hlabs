//! The OS confirms the person at the computer before the tray resets a password (US-INST-18): on
//! macOS `LocalAuthentication` (Touch ID or this Mac's login password); on a Linux desktop a polkit
//! prompt (US-INST-26, D-145).

/// Why the OS asks: macOS shows "hlabs is trying to reset an hlabs password."
pub const REASON: &str = "reset an hlabs password";

pub trait OsConfirm: Send + Sync {
    /// Asks the OS and waits; `Ok(false)` when the person cancelled or it didn't confirm them.
    fn confirm(&self, reason: &str) -> Result<bool, String>;
}

#[cfg(target_os = "macos")]
pub struct LocalAuthentication;

#[cfg(target_os = "macos")]
impl OsConfirm for LocalAuthentication {
    fn confirm(&self, reason: &str) -> Result<bool, String> {
        use block2::RcBlock;
        use objc2::runtime::Bool;
        use objc2_foundation::{NSError, NSString};
        use objc2_local_authentication::{LAContext, LAPolicy};

        let (tx, rx) = std::sync::mpsc::channel::<bool>();
        let reply = RcBlock::new(move |success: Bool, _error: *mut NSError| {
            let _ = tx.send(success.as_bool());
        });
        // SAFETY: a fresh context; the reply block owns its sender and is kept alive by the context.
        unsafe {
            let context = LAContext::new();
            context.evaluatePolicy_localizedReason_reply(
                LAPolicy::DeviceOwnerAuthentication,
                &NSString::from_str(reason),
                &reply,
            );
        }
        rx.recv_timeout(std::time::Duration::from_secs(300))
            .map_err(|_| "macOS didn't answer".to_owned())
    }
}

/// The polkit action a .deb or .rpm installs (D-145): the person's own password (`auth_self`).
#[cfg(target_os = "linux")]
pub const POLKIT_HELPER: &str = "/usr/lib/hlabs/hlabs-confirm";

/// A Linux desktop: polkit asks, through `pkexec`. With the package's action it's the person's own password; an
/// AppImage has none, so it's an administrator's (`pkexec /usr/bin/true`).
#[cfg(target_os = "linux")]
pub struct Polkit;

#[cfg(target_os = "linux")]
impl OsConfirm for Polkit {
    fn confirm(&self, _reason: &str) -> Result<bool, String> {
        let target = if std::path::Path::new(POLKIT_HELPER).exists() {
            POLKIT_HELPER
        } else {
            "/usr/bin/true"
        };
        let status = std::process::Command::new("pkexec")
            .arg(target)
            .status()
            .map_err(|e| format!("pkexec: {e}"))?;
        // 126: the prompt was dismissed; 127: not authorised.
        Ok(status.success())
    }
}

/// Without a way to ask the OS, nothing is reset.
#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub struct Unsupported;

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
impl OsConfirm for Unsupported {
    fn confirm(&self, _reason: &str) -> Result<bool, String> {
        Err("this computer can't confirm who you are yet".to_owned())
    }
}

pub fn default_confirm() -> Box<dyn OsConfirm> {
    #[cfg(target_os = "macos")]
    return Box::new(LocalAuthentication);
    #[cfg(target_os = "linux")]
    return Box::new(Polkit);
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    Box::new(Unsupported)
}
