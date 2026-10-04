//! The daemon's background service (02 §2.3): the LaunchAgent `dev.hlabs.daemon` on macOS. The tray
//! owns it (D-042). Commands run through `Runner` so tests can see exactly what would be run.

use std::process::Command;

pub const LAUNCH_AGENT_LABEL: &str = "dev.hlabs.daemon";

/// The result of a command: exit code (None when killed by a signal) and stderr.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ran {
    pub code: Option<i32>,
    pub stderr: String,
}

impl Ran {
    pub fn ok(&self) -> bool {
        self.code == Some(0)
    }
}

pub trait Runner: Send + Sync {
    fn run(&self, program: &str, args: &[&str]) -> Result<Ran, String>;
}

pub struct SystemRunner;

impl Runner for SystemRunner {
    fn run(&self, program: &str, args: &[&str]) -> Result<Ran, String> {
        let out = Command::new(program)
            .args(args)
            .output()
            .map_err(|e| format!("{program}: {e}"))?;
        Ok(Ran {
            code: out.status.code(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        })
    }
}

/// Restarting the daemon, e.g. so it loads a new tray token (US-INST-16), or stopping it while hlabs updates and
/// starting it again (US-INST-20).
pub trait DaemonService: Send + Sync {
    fn restart(&self) -> Result<(), String>;
    /// Stops the daemon and unloads it so launchd doesn't start it again (`launchctl bootout`).
    fn stop(&self) -> Result<(), String> {
        Ok(())
    }
    /// Loads it again from its LaunchAgent (`launchctl bootstrap`), which starts it.
    fn start(&self) -> Result<(), String> {
        Ok(())
    }
    /// What the OS says about the service, for "Copy diagnostics" (US-INST-13).
    fn describe(&self) -> String;
}

/// `gui/<uid>/dev.hlabs.daemon`.
pub fn service_target(uid: u32) -> String {
    format!("gui/{uid}/{LAUNCH_AGENT_LABEL}")
}

/// The LaunchAgent, through `launchctl` (macOS).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub struct LaunchAgent<R: Runner> {
    pub runner: R,
    pub uid: u32,
    /// `~/Library/LaunchAgents/dev.hlabs.daemon.plist`.
    pub plist: std::path::PathBuf,
}

impl<R: Runner> DaemonService for LaunchAgent<R> {
    fn restart(&self) -> Result<(), String> {
        let target = service_target(self.uid);
        let ran = self
            .runner
            .run("/bin/launchctl", &["kickstart", "-k", &target])?;
        if ran.ok() {
            Ok(())
        } else {
            Err(format!("launchctl kickstart failed: {}", ran.stderr.trim()))
        }
    }

    fn stop(&self) -> Result<(), String> {
        let ran = self
            .runner
            .run("/bin/launchctl", &["bootout", &service_target(self.uid)])?;
        // 3: not loaded, so already stopped.
        if ran.ok() || ran.code == Some(3) {
            Ok(())
        } else {
            Err(format!("launchctl bootout failed: {}", ran.stderr.trim()))
        }
    }

    fn start(&self) -> Result<(), String> {
        let domain = format!("gui/{}", self.uid);
        let plist = self.plist.to_string_lossy();
        let ran = self
            .runner
            .run("/bin/launchctl", &["bootstrap", &domain, &plist])?;
        // 5: already loaded (it came back by itself).
        if ran.ok() || ran.code == Some(5) {
            Ok(())
        } else {
            Err(format!("launchctl bootstrap failed: {}", ran.stderr.trim()))
        }
    }

    fn describe(&self) -> String {
        match self
            .runner
            .run("/bin/launchctl", &["print", &service_target(self.uid)])
        {
            Ok(ran) if ran.ok() => "loaded".to_owned(),
            Ok(_) => "not loaded".to_owned(),
            Err(err) => err,
        }
    }
}

/// In development the daemon runs under `pnpm dev`, not launchd, and it reads a new token by itself
/// (D-112), so there is nothing to restart.
pub struct NoService;

impl DaemonService for NoService {
    fn restart(&self) -> Result<(), String> {
        Ok(())
    }

    fn describe(&self) -> String {
        "not run by launchd (development)".to_owned()
    }
}

/// The service for this build: the LaunchAgent in a macOS release build; nothing otherwise (the
/// Linux desktop tray, with its systemd user unit, ships in phase 6).
pub fn default_service() -> Box<dyn DaemonService> {
    #[cfg(target_os = "macos")]
    if !cfg!(debug_assertions) {
        // SAFETY: getuid has no preconditions and can't fail.
        let uid = unsafe { libc::getuid() };
        let home = std::env::var_os("HOME")
            .map(std::path::PathBuf::from)
            .unwrap_or_default();
        return Box::new(LaunchAgent {
            runner: SystemRunner,
            uid,
            plist: home
                .join("Library/LaunchAgents")
                .join(format!("{LAUNCH_AGENT_LABEL}.plist")),
        });
    }
    Box::new(NoService)
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Records commands and answers each with `code`.
    #[derive(Default)]
    pub struct FakeRunner {
        pub calls: Mutex<Vec<String>>,
        pub code: i32,
    }

    impl Runner for FakeRunner {
        fn run(&self, program: &str, args: &[&str]) -> Result<Ran, String> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("{program} {}", args.join(" ")));
            Ok(Ran {
                code: Some(self.code),
                stderr: if self.code == 0 {
                    String::new()
                } else {
                    "boom".into()
                },
            })
        }
    }

    #[test]
    fn us_inst_16_restart_kickstarts_the_launch_agent() {
        let agent = LaunchAgent {
            runner: FakeRunner::default(),
            uid: 501,
            plist: "/p.plist".into(),
        };
        agent.restart().unwrap();
        assert_eq!(
            *agent.runner.calls.lock().unwrap(),
            vec!["/bin/launchctl kickstart -k gui/501/dev.hlabs.daemon"]
        );
    }

    #[test]
    fn us_inst_16_a_failed_restart_is_reported() {
        let agent = LaunchAgent {
            runner: FakeRunner {
                code: 113,
                ..Default::default()
            },
            uid: 501,
            plist: "/p.plist".into(),
        };
        assert!(agent.restart().unwrap_err().contains("boom"));
    }

    #[test]
    fn us_inst_20_stop_boots_out_and_start_bootstraps_the_agent() {
        let agent = LaunchAgent {
            runner: FakeRunner::default(),
            uid: 501,
            plist: "/Users/a/Library/LaunchAgents/dev.hlabs.daemon.plist".into(),
        };
        agent.stop().unwrap();
        agent.start().unwrap();
        assert_eq!(
            *agent.runner.calls.lock().unwrap(),
            vec![
                "/bin/launchctl bootout gui/501/dev.hlabs.daemon",
                "/bin/launchctl bootstrap gui/501 /Users/a/Library/LaunchAgents/dev.hlabs.daemon.plist"
            ]
        );
    }
}
