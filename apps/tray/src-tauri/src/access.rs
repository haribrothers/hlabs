//! Keeping the tray's access to the daemon working (US-INST-16): a missing token is made again and
//! the daemon restarted to load it; two rejections in a row make the tray regenerate the token and
//! restart the daemon once; if it's still rejected the tray gives up and shows "Can't reach hlabs".
//! A keychain that refuses access is reported so the menu can ask for it.

use crate::launchd::DaemonService;
use crate::token::{new_token, TokenError, TokenStore};

/// What the menu shows about the tray's own access.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Access {
    /// The token is there; calls go out.
    Ready,
    /// The keychain refused access: "hlabs needs Keychain access to work" with "Try again".
    KeychainDenied,
    /// Still rejected after one repair, or the token couldn't be stored: "Can't reach hlabs".
    Unreachable,
}

/// How many rejections in a row make the tray repair the token.
const REJECTIONS_BEFORE_REPAIR: u32 = 2;

pub struct TokenGuard {
    store: Box<dyn TokenStore>,
    service: Box<dyn DaemonService>,
    token: Option<String>,
    access: Access,
    rejections: u32,
    repaired: bool,
}

impl TokenGuard {
    pub fn new(store: Box<dyn TokenStore>, service: Box<dyn DaemonService>) -> Self {
        Self {
            store,
            service,
            token: None,
            access: Access::Unreachable,
            rejections: 0,
            repaired: false,
        }
    }

    /// Whether a token is stored already (no token and no LaunchAgent means a first launch, US-INST-01).
    pub fn has_stored_token(&self) -> bool {
        matches!(self.store.get(), Ok(Some(_)))
    }

    pub fn access(&self) -> Access {
        self.access
    }

    /// The token to send, when access is ready.
    pub fn token(&self) -> Option<&str> {
        match self.access {
            Access::Ready => self.token.as_deref(),
            _ => None,
        }
    }

    /// Reads the token at start (and on "Try again"). A missing one is made, stored and the daemon
    /// restarted so it loads it.
    pub fn start(&mut self) -> Access {
        self.rejections = 0;
        self.repaired = false;
        match self.store.get() {
            Ok(Some(token)) => self.ready(token),
            Ok(None) => self.replace_token(),
            Err(err) => self.failed(err),
        }
    }

    /// A call succeeded: the token works.
    pub fn succeeded(&mut self) {
        self.rejections = 0;
        self.repaired = false;
    }

    /// The daemon answered TRAY_TOKEN_REJECTED. Returns the access after it.
    pub fn rejected(&mut self) -> Access {
        if self.access != Access::Ready {
            return self.access;
        }
        self.rejections += 1;
        if self.rejections < REJECTIONS_BEFORE_REPAIR {
            return self.access;
        }
        self.rejections = 0;
        if self.repaired {
            self.access = Access::Unreachable;
            return self.access;
        }
        self.repaired = true;
        self.replace_token()
    }

    fn replace_token(&mut self) -> Access {
        let token = new_token();
        if let Err(err) = self.store.set(&token) {
            return self.failed(err);
        }
        // The daemon also reads a new token by itself within 5 s (D-112); a failed restart isn't fatal.
        let _ = self.service.restart();
        self.ready(token)
    }

    fn ready(&mut self, token: String) -> Access {
        self.token = Some(token);
        self.access = Access::Ready;
        self.access
    }

    fn failed(&mut self, err: TokenError) -> Access {
        self.token = None;
        self.access = match err {
            TokenError::AccessDenied => Access::KeychainDenied,
            TokenError::Store(_) => Access::Unreachable,
        };
        self.access
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::token::tests::MemoryStore;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[derive(Clone, Default)]
    struct CountingService(Arc<AtomicU32>);
    impl DaemonService for CountingService {
        fn restart(&self) -> Result<(), String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    fn guard(store: MemoryStore) -> (TokenGuard, Arc<AtomicU32>) {
        let service = CountingService::default();
        let restarts = service.0.clone();
        (
            TokenGuard::new(Box::new(store), Box::new(service)),
            restarts,
        )
    }

    fn with_token(token: &str) -> MemoryStore {
        let store = MemoryStore::default();
        *store.token.lock().unwrap() = Some(token.into());
        store
    }

    #[test]
    fn us_inst_16_uses_the_stored_token_without_restarting() {
        let (mut g, restarts) = guard(with_token("abc"));
        assert_eq!(g.start(), Access::Ready);
        assert_eq!(g.token(), Some("abc"));
        assert_eq!(restarts.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn us_inst_16_a_missing_token_is_made_stored_and_the_daemon_restarted() {
        let (mut g, restarts) = guard(MemoryStore::default());
        assert_eq!(g.start(), Access::Ready);
        let token = g.token().unwrap().to_owned();
        assert_eq!(token.len(), 43);
        assert_eq!(restarts.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn us_inst_16_two_rejections_in_a_row_regenerate_once_then_give_up() {
        let (mut g, restarts) = guard(with_token("old"));
        g.start();
        // One rejection alone changes nothing.
        assert_eq!(g.rejected(), Access::Ready);
        assert_eq!(g.token(), Some("old"));
        // The second in a row regenerates and restarts the daemon once.
        assert_eq!(g.rejected(), Access::Ready);
        let new = g.token().unwrap().to_owned();
        assert_ne!(new, "old");
        assert_eq!(restarts.load(Ordering::SeqCst), 1);
        // Still rejected: give up, with no second restart.
        g.rejected();
        assert_eq!(g.rejected(), Access::Unreachable);
        assert_eq!(g.token(), None);
        assert_eq!(restarts.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn us_inst_16_a_success_between_rejections_resets_the_count() {
        let (mut g, restarts) = guard(with_token("t"));
        g.start();
        g.rejected();
        g.succeeded();
        assert_eq!(g.rejected(), Access::Ready);
        assert_eq!(g.token(), Some("t"));
        assert_eq!(restarts.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn us_inst_16_a_refused_keychain_asks_for_access_and_try_again_recovers() {
        let store = MemoryStore {
            denied: true,
            ..Default::default()
        };
        let (mut g, _) = guard(store);
        assert_eq!(g.start(), Access::KeychainDenied);
        assert_eq!(g.token(), None);
        // Rejections don't apply while there is no token.
        assert_eq!(g.rejected(), Access::KeychainDenied);
    }

    #[test]
    fn us_inst_16_try_again_starts_over() {
        let (mut g, _) = guard(with_token("t"));
        g.start();
        g.rejected();
        g.rejected();
        g.rejected();
        assert_eq!(g.rejected(), Access::Unreachable);
        assert_eq!(g.start(), Access::Ready);
    }
}
