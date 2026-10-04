//! The OS confirms the person at the computer before the tray resets a password (US-INST-18): on
//! macOS `LocalAuthentication` (Touch ID or this Mac's login password); the Linux desktop's polkit
//! prompt comes with the Linux tray (phase 6).

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

/// Without a way to ask the OS, nothing is reset.
#[cfg(not(target_os = "macos"))]
pub struct Unsupported;

#[cfg(not(target_os = "macos"))]
impl OsConfirm for Unsupported {
    fn confirm(&self, _reason: &str) -> Result<bool, String> {
        Err("this computer can't confirm who you are yet".to_owned())
    }
}

pub fn default_confirm() -> Box<dyn OsConfirm> {
    #[cfg(target_os = "macos")]
    return Box::new(LocalAuthentication);
    #[cfg(not(target_os = "macos"))]
    Box::new(Unsupported)
}
