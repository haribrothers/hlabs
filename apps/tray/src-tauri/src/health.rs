//! Whether hlabs is answering, as the tray sees it (US-INST-13, US-STATE-07): `/healthz` every 5 s;
//! after 10 s without an answer the menu says "Can't reach hlabs". A 503 that says hlabs is starting
//! or updating shows those states instead; one waiting won't fix (`migration_failed`) at once.

use crate::bootstrap::Health;
use std::time::{Duration, Instant};

/// How often the tray asks `/healthz`.
pub const POLL: Duration = Duration::from_secs(5);
/// How long `/healthz` may go unanswered before the tray says "Can't reach hlabs".
pub const GRACE: Duration = Duration::from_secs(10);
/// How long "Restart hlabs" waits for `/healthz` (US-STATE-07).
pub const RESTART_WAIT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum DaemonHealth {
    Up,
    Starting,
    Updating,
    /// "Can't reach hlabs", with `/healthz`'s reason when it gave one.
    Down {
        reason: Option<String>,
    },
    /// "Restarting…" after "Restart hlabs", until it answers or 60 s pass.
    Restarting,
}

pub struct Monitor {
    state: DaemonHealth,
    failing_since: Option<Instant>,
    restart_until: Option<Instant>,
}

impl Default for Monitor {
    fn default() -> Self {
        Self {
            state: DaemonHealth::Up,
            failing_since: None,
            restart_until: None,
        }
    }
}

impl Monitor {
    pub fn state(&self) -> &DaemonHealth {
        &self.state
    }

    /// The service is down from the start (the first launch's 60 s passed).
    pub fn down(&mut self, reason: Option<String>, now: Instant) {
        self.restart_until = None;
        self.failing_since = Some(now);
        self.state = DaemonHealth::Down { reason };
    }

    /// "Restart hlabs" was chosen.
    pub fn restarting(&mut self, now: Instant) {
        self.restart_until = Some(now + RESTART_WAIT);
        self.state = DaemonHealth::Restarting;
    }

    /// One `/healthz` answer. Returns the new state.
    pub fn observe(&mut self, health: Health, now: Instant) -> &DaemonHealth {
        if let Health::Ready = health {
            self.failing_since = None;
            self.restart_until = None;
            self.state = DaemonHealth::Up;
            return &self.state;
        }
        let since = *self.failing_since.get_or_insert(now);
        if let Some(until) = self.restart_until {
            if now < until {
                return &self.state;
            }
            // The restart didn't bring hlabs back within 60 s.
            self.restart_until = None;
            self.state = DaemonHealth::Down {
                reason: reason_of(&health),
            };
            return &self.state;
        }
        self.state = match health {
            Health::NotYet(Some(r)) if r == "starting" => DaemonHealth::Starting,
            Health::NotYet(Some(r)) if r == "updating" => DaemonHealth::Updating,
            Health::Failed(reason) => DaemonHealth::Down {
                reason: Some(reason),
            },
            other if now.duration_since(since) >= GRACE => DaemonHealth::Down {
                reason: reason_of(&other),
            },
            // Not answering for under 10 s: keep what the menu shows.
            _ => self.state.clone(),
        };
        &self.state
    }
}

fn reason_of(health: &Health) -> Option<String> {
    match health {
        Health::Failed(r) | Health::NotYet(Some(r)) => Some(r.clone()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn us_state_07_down_after_10_s_without_an_answer() {
        let t0 = Instant::now();
        let mut m = Monitor::default();
        assert_eq!(*m.observe(Health::NotYet(None), t0), DaemonHealth::Up);
        assert_eq!(
            *m.observe(Health::NotYet(None), t0 + Duration::from_secs(5)),
            DaemonHealth::Up
        );
        assert_eq!(
            *m.observe(Health::NotYet(None), t0 + Duration::from_secs(10)),
            DaemonHealth::Down { reason: None }
        );
        // Back within 5 s of answering again.
        assert_eq!(
            *m.observe(Health::Ready, t0 + Duration::from_secs(15)),
            DaemonHealth::Up
        );
    }

    #[test]
    fn us_inst_13_a_reason_waiting_wont_fix_shows_at_once() {
        let mut m = Monitor::default();
        assert_eq!(
            *m.observe(Health::Failed("migration_failed".into()), Instant::now()),
            DaemonHealth::Down {
                reason: Some("migration_failed".into())
            }
        );
    }

    #[test]
    fn us_state_07_starting_and_updating_are_not_down() {
        let t0 = Instant::now();
        let mut m = Monitor::default();
        assert_eq!(
            *m.observe(Health::NotYet(Some("starting".into())), t0),
            DaemonHealth::Starting
        );
        assert_eq!(
            *m.observe(
                Health::NotYet(Some("updating".into())),
                t0 + Duration::from_secs(30)
            ),
            DaemonHealth::Updating
        );
    }

    #[test]
    fn us_state_07_restarting_until_it_answers_or_60_s_pass() {
        let t0 = Instant::now();
        let mut m = Monitor::default();
        m.down(None, t0);
        m.restarting(t0);
        assert_eq!(
            *m.observe(Health::NotYet(None), t0 + Duration::from_secs(30)),
            DaemonHealth::Restarting
        );
        assert_eq!(
            *m.observe(Health::NotYet(None), t0 + Duration::from_secs(60)),
            DaemonHealth::Down { reason: None }
        );
        m.restarting(t0 + Duration::from_secs(70));
        assert_eq!(
            *m.observe(Health::Ready, t0 + Duration::from_secs(80)),
            DaemonHealth::Up
        );
    }
}
