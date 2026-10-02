//! First launch and every launch after it (US-INST-01): the tray makes the data dir, the tray token
//! (US-INST-15), the LaunchAgent `dev.hlabs.daemon` that runs the bundled `node hlabsd.mjs`, loads it
//! with `launchctl bootstrap`, registers itself as a login item and waits for `/healthz`.

use crate::launchd::{service_target, Runner, LAUNCH_AGENT_LABEL};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// `launchctl bootstrap` says the service is already loaded (e.g. by a copy of hlabs run from the .dmg).
const ALREADY_LOADED: i32 = 5;
/// How long the daemon gets to answer `/healthz` (US-INST-01).
pub const HEALTH_TIMEOUT: Duration = Duration::from_secs(60);

/// Where things go on this computer.
#[derive(Debug, Clone)]
pub struct Layout {
    /// `~/Library/Application Support/hlabs`.
    pub data_dir: PathBuf,
    /// `~/Library/LaunchAgents`.
    pub launch_agents_dir: PathBuf,
    /// The bundle's `Contents/Resources/daemon`: `node`, `hlabsd.mjs` and what they need.
    pub daemon_dir: PathBuf,
    pub uid: u32,
}

impl Layout {
    pub fn plist_path(&self) -> PathBuf {
        self.launch_agents_dir
            .join(format!("{LAUNCH_AGENT_LABEL}.plist"))
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn path_str(p: &Path) -> String {
    xml_escape(&p.to_string_lossy())
}

/// The LaunchAgent: runs at load, restarted when it crashes (not when it exits cleanly), with the
/// PATH where container engines live (launchd's own PATH is minimal).
pub fn plist(layout: &Layout) -> String {
    let node = path_str(&layout.daemon_dir.join("node"));
    let main = path_str(&layout.daemon_dir.join("hlabsd.mjs"));
    let cwd = path_str(&layout.daemon_dir);
    let log = path_str(&layout.data_dir.join("logs").join("launchd.log"));
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{node}</string>
    <string>{main}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>{cwd}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>{log}</string>
  <key>StandardErrorPath</key>
  <string>{log}</string>
</dict>
</plist>
"#
    )
}

/// What this launch found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Launch {
    /// Never ran for this user (no LaunchAgent and no tray token): the first-launch window shows.
    First,
    /// The LaunchAgent was from another version (other paths): rewritten and reloaded, no window.
    Updated,
    /// Everything was in place.
    Unchanged,
}

/// Registering the tray as a login item (`SMAppService.mainApp` on macOS).
pub trait LoginItem: Send + Sync {
    fn register(&self) -> Result<(), String>;
}

pub struct Bootstrap<R: Runner> {
    pub layout: Layout,
    pub runner: R,
    pub login_item: Box<dyn LoginItem>,
}

impl<R: Runner> Bootstrap<R> {
    /// True when hlabs has never run for this user: no LaunchAgent and no tray token.
    pub fn is_first_launch(&self, has_token: bool) -> bool {
        !self.layout.plist_path().exists() && !has_token
    }

    /// Makes the data dir.
    pub fn prepare(&self) -> Result<(), String> {
        std::fs::create_dir_all(self.layout.data_dir.join("logs"))
            .map_err(|e| format!("couldn't create {}: {e}", self.layout.data_dir.display()))
    }

    /// Writes and loads the LaunchAgent (after the token exists). On a first launch the tray also
    /// becomes a login item.
    pub fn install(&self, first: bool) -> Result<Launch, String> {
        let path = self.layout.plist_path();
        let wanted = plist(&self.layout);
        let current = std::fs::read_to_string(&path).ok();
        let target = service_target(self.layout.uid);
        let domain = format!("gui/{}", self.layout.uid);
        let launch = if current.as_deref() == Some(wanted.as_str()) {
            if !self.loaded(&target)? {
                self.bootstrap(&domain, &target, &path)?;
            }
            Launch::Unchanged
        } else {
            std::fs::create_dir_all(&self.layout.launch_agents_dir)
                .map_err(|e| format!("couldn't create LaunchAgents: {e}"))?;
            std::fs::write(&path, &wanted)
                .map_err(|e| format!("couldn't write {}: {e}", path.display()))?;
            if current.is_some() {
                // An older hlabs's agent: stop it so the new paths are used.
                let _ = self.runner.run("/bin/launchctl", &["bootout", &target]);
            }
            self.bootstrap(&domain, &target, &path)?;
            if first {
                Launch::First
            } else {
                Launch::Updated
            }
        };
        if first {
            // Not fatal: hlabs works without it, it just won't open at login (US-INST-09 shows it).
            if let Err(err) = self.login_item.register() {
                eprintln!("hlabs tray: couldn't add the login item: {err}");
            }
        }
        Ok(launch)
    }

    fn loaded(&self, target: &str) -> Result<bool, String> {
        Ok(self.runner.run("/bin/launchctl", &["print", target])?.ok())
    }

    fn bootstrap(&self, domain: &str, target: &str, plist: &Path) -> Result<(), String> {
        let plist = plist.to_string_lossy();
        let ran = self
            .runner
            .run("/bin/launchctl", &["bootstrap", domain, &plist])?;
        if ran.ok() {
            return Ok(());
        }
        if ran.code == Some(ALREADY_LOADED) {
            // Already loaded (e.g. by another copy of hlabs): restart it so it runs this one.
            let kick = self
                .runner
                .run("/bin/launchctl", &["kickstart", "-k", target])?;
            if kick.ok() {
                return Ok(());
            }
            return Err(format!(
                "launchctl kickstart failed: {}",
                kick.stderr.trim()
            ));
        }
        Err(format!("launchctl bootstrap failed: {}", ran.stderr.trim()))
    }
}

/// What `/healthz` said.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Health {
    Ready,
    /// Not ready yet: nothing answered (`None`), or a 503 with a reason that waiting may fix
    /// (`starting`, `updating`).
    NotYet(Option<String>),
    /// The daemon won't become ready by waiting (e.g. `migration_failed`), with its reason.
    Failed(String),
}

/// Reasons `/healthz` gives that waiting won't fix (05 §Non-tRPC HTTP).
const FATAL_REASONS: [&str; 2] = ["migration_failed", "storage_unavailable"];

pub fn read_health(status: u16, body: &str) -> Health {
    if status == 200 {
        return Health::Ready;
    }
    let reason = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("reason").and_then(|r| r.as_str()).map(str::to_owned));
    match reason {
        Some(r) if FATAL_REASONS.contains(&r.as_str()) => Health::Failed(r),
        other => Health::NotYet(other),
    }
}

/// One `/healthz` request.
pub async fn check_health(base_url: &str) -> Health {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .no_proxy()
        .build()
    {
        Ok(c) => c,
        Err(_) => return Health::NotYet(None),
    };
    match client.get(format!("{base_url}/healthz")).send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            read_health(status, &res.text().await.unwrap_or_default())
        }
        Err(_) => Health::NotYet(None),
    }
}

/// How waiting for the daemon ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Waited {
    Ready,
    TimedOut,
    Failed(String),
}

/// Polls `/healthz` every second until it's ready, fails, or `timeout` passes.
pub async fn wait_for_health(base_url: &str, timeout: Duration) -> Waited {
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        match check_health(base_url).await {
            Health::Ready => return Waited::Ready,
            Health::Failed(reason) => return Waited::Failed(reason),
            Health::NotYet(_) => {}
        }
        if tokio::time::Instant::now() >= deadline {
            return Waited::TimedOut;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

/// `SMAppService.mainApp`: the tray opens at login (on by default, US-INST-09).
#[cfg(target_os = "macos")]
pub struct MainAppLoginItem;

#[cfg(target_os = "macos")]
impl LoginItem for MainAppLoginItem {
    fn register(&self) -> Result<(), String> {
        use objc2_service_management::SMAppService;
        // SAFETY: mainAppService and registerAndReturnError are plain ServiceManagement calls.
        unsafe {
            SMAppService::mainAppService()
                .registerAndReturnError()
                .map_err(|e| e.localizedDescription().to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::launchd::tests::FakeRunner;
    use crate::launchd::Ran;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct CountingLoginItem(Arc<AtomicU32>);
    impl LoginItem for CountingLoginItem {
        fn register(&self) -> Result<(), String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    /// Answers `launchctl` subcommands with the given codes (default 0).
    #[derive(Default)]
    struct ScriptedRunner {
        calls: Mutex<Vec<String>>,
        codes: Vec<(&'static str, i32)>,
    }
    impl Runner for ScriptedRunner {
        fn run(&self, program: &str, args: &[&str]) -> Result<Ran, String> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("{program} {}", args.join(" ")));
            let code = self
                .codes
                .iter()
                .find(|(sub, _)| args.first() == Some(sub))
                .map(|(_, c)| *c)
                .unwrap_or(0);
            Ok(Ran {
                code: Some(code),
                stderr: String::new(),
            })
        }
    }

    fn layout() -> Layout {
        let base = std::env::temp_dir().join(format!("hlabs-boot-{}", crate::token::new_token()));
        Layout {
            data_dir: base.join("Application Support/hlabs"),
            launch_agents_dir: base.join("LaunchAgents"),
            daemon_dir: PathBuf::from("/Applications/hlabs.app/Contents/Resources/daemon"),
            uid: 501,
        }
    }

    fn boot<R: Runner>(runner: R) -> (Bootstrap<R>, Arc<AtomicU32>) {
        let login = CountingLoginItem::default();
        let count = login.0.clone();
        (
            Bootstrap {
                layout: layout(),
                runner,
                login_item: Box::new(login),
            },
            count,
        )
    }

    #[test]
    fn us_inst_01_the_launch_agent_runs_the_bundled_node_and_daemon() {
        let p = plist(&layout());
        assert!(p.contains("<string>dev.hlabs.daemon</string>"));
        assert!(p.contains(
            "<string>/Applications/hlabs.app/Contents/Resources/daemon/node</string>\n    <string>/Applications/hlabs.app/Contents/Resources/daemon/hlabsd.mjs</string>"
        ));
        assert!(p.contains("<key>RunAtLoad</key>\n  <true/>"));
        // Restarted when it crashes, not after a clean exit.
        assert!(p.contains("<key>SuccessfulExit</key>\n    <false/>"));
        assert!(p.contains("<string>production</string>"));
    }

    #[test]
    fn us_inst_01_paths_are_escaped() {
        let mut l = layout();
        l.daemon_dir = PathBuf::from("/Apps/A & B <x>/daemon");
        assert!(plist(&l).contains("/Apps/A &amp; B &lt;x&gt;/daemon/node"));
    }

    #[test]
    fn us_inst_01_first_launch_means_no_agent_and_no_token() {
        let (b, _) = boot(FakeRunner::default());
        assert!(b.is_first_launch(false));
        assert!(!b.is_first_launch(true));
        std::fs::create_dir_all(&b.layout.launch_agents_dir).unwrap();
        std::fs::write(b.layout.plist_path(), "x").unwrap();
        assert!(!b.is_first_launch(false));
    }

    #[test]
    fn us_inst_01_first_launch_writes_loads_and_registers_the_login_item() {
        let (b, logins) = boot(ScriptedRunner::default());
        b.prepare().unwrap();
        assert!(b.layout.data_dir.is_dir());
        assert_eq!(b.install(true).unwrap(), Launch::First);
        assert_eq!(
            std::fs::read_to_string(b.layout.plist_path()).unwrap(),
            plist(&b.layout)
        );
        let calls = b.runner.calls.lock().unwrap().clone();
        assert_eq!(
            calls,
            vec![format!(
                "/bin/launchctl bootstrap gui/501 {}",
                b.layout.plist_path().display()
            )]
        );
        assert_eq!(logins.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn us_inst_01_already_loaded_counts_as_success_after_kickstart() {
        let (b, _) = boot(ScriptedRunner {
            codes: vec![("bootstrap", 5)],
            ..Default::default()
        });
        assert_eq!(b.install(true).unwrap(), Launch::First);
        let calls = b.runner.calls.lock().unwrap().clone();
        assert_eq!(
            calls[1],
            "/bin/launchctl kickstart -k gui/501/dev.hlabs.daemon"
        );
    }

    #[test]
    fn us_inst_01_a_failed_bootstrap_is_an_error() {
        let (b, _) = boot(ScriptedRunner {
            codes: vec![("bootstrap", 3)],
            ..Default::default()
        });
        assert!(b.install(true).is_err());
    }

    #[test]
    fn us_inst_01_an_older_agent_is_rewritten_and_reloaded_without_a_first_launch() {
        let (b, logins) = boot(ScriptedRunner::default());
        std::fs::create_dir_all(&b.layout.launch_agents_dir).unwrap();
        std::fs::write(b.layout.plist_path(), "<plist>old paths</plist>").unwrap();
        assert!(!b.is_first_launch(true));
        assert_eq!(b.install(false).unwrap(), Launch::Updated);
        assert_eq!(
            std::fs::read_to_string(b.layout.plist_path()).unwrap(),
            plist(&b.layout)
        );
        let calls = b.runner.calls.lock().unwrap().clone();
        assert_eq!(calls[0], "/bin/launchctl bootout gui/501/dev.hlabs.daemon");
        assert!(calls[1].starts_with("/bin/launchctl bootstrap gui/501 "));
        assert_eq!(logins.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn us_inst_01_an_unchanged_loaded_agent_is_left_alone() {
        let (b, _) = boot(ScriptedRunner::default());
        std::fs::create_dir_all(&b.layout.launch_agents_dir).unwrap();
        std::fs::write(b.layout.plist_path(), plist(&b.layout)).unwrap();
        assert_eq!(b.install(false).unwrap(), Launch::Unchanged);
        let calls = b.runner.calls.lock().unwrap().clone();
        assert_eq!(calls, vec!["/bin/launchctl print gui/501/dev.hlabs.daemon"]);
    }

    #[test]
    fn us_inst_01_an_unchanged_agent_that_isnt_loaded_is_loaded() {
        let (b, _) = boot(ScriptedRunner {
            codes: vec![("print", 113)],
            ..Default::default()
        });
        std::fs::create_dir_all(&b.layout.launch_agents_dir).unwrap();
        std::fs::write(b.layout.plist_path(), plist(&b.layout)).unwrap();
        assert_eq!(b.install(false).unwrap(), Launch::Unchanged);
        let calls = b.runner.calls.lock().unwrap().clone();
        assert!(calls[1].starts_with("/bin/launchctl bootstrap gui/501 "));
    }

    #[test]
    fn us_inst_01_healthz_ready_starting_and_failed() {
        assert_eq!(read_health(200, r#"{"status":"ok"}"#), Health::Ready);
        assert_eq!(
            read_health(503, r#"{"reason":"starting"}"#),
            Health::NotYet(Some("starting".into()))
        );
        // A stopped engine doesn't fail /healthz; anything unknown just means "not yet".
        assert_eq!(read_health(503, "nonsense"), Health::NotYet(None));
        assert_eq!(
            read_health(503, r#"{"reason":"migration_failed"}"#),
            Health::Failed("migration_failed".into())
        );
    }

    #[tokio::test]
    async fn us_inst_01_waiting_gives_up_when_nothing_answers() {
        let free = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let waited = wait_for_health(&format!("http://{free}"), Duration::from_millis(10)).await;
        assert_eq!(waited, Waited::TimedOut);
    }
}
