//! hlabs on a Linux desktop (US-INST-27, D-145): the daemon runs as the systemd user unit `hlabsd.service`, and the
//! menu-bar app opens at login from `~/.config/autostart/hlabs.desktop`. The first launch writes both and starts the
//! daemon; "Start at login" turns both on or off. An AppImage first copies the daemon out of itself, since its own
//! folder disappears when it quits, and uses ports 8443 and 8080 (it can't let Caddy use 80 and 443 without root).

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use crate::bootstrap::{Launch, LoginItem};
use crate::launchd::{DaemonService, Runner};
use std::path::{Path, PathBuf};

pub const UNIT: &str = "hlabsd.service";
const SYSTEMCTL: &str = "systemctl";

/// Where things go for this user.
#[derive(Debug, Clone)]
pub struct LinuxLayout {
    /// `~/.local/share/hlabs`.
    pub data_dir: PathBuf,
    /// `~/.config`.
    pub config_dir: PathBuf,
    /// The daemon bundle the unit runs: `/usr/lib/hlabs/daemon`, or the AppImage's copy in the data dir.
    pub daemon_dir: PathBuf,
    /// What opens the menu-bar app at login: its executable, or the AppImage file.
    pub tray_exec: PathBuf,
    /// Running from an AppImage.
    pub appimage: bool,
}

impl LinuxLayout {
    pub fn unit_path(&self) -> PathBuf {
        self.config_dir.join("systemd/user").join(UNIT)
    }

    pub fn autostart_path(&self) -> PathBuf {
        self.config_dir.join("autostart/hlabs.desktop")
    }
}

/// systemd quotes a path with spaces as one argument when it's in double quotes.
fn quoted(p: &Path) -> String {
    format!("\"{}\"", p.to_string_lossy().replace('"', "\\\""))
}

/// The user unit: Node runs hlabsd from the daemon bundle; systemd restarts it whatever way it stops (an update ends
/// it on purpose, D-118), and it starts with the user's session when enabled.
pub fn unit(layout: &LinuxLayout) -> String {
    let node = quoted(&layout.daemon_dir.join("node"));
    let main = quoted(&layout.daemon_dir.join("hlabsd.mjs"));
    format!(
        "# hlabs (US-INST-27, D-145), written by the hlabs menu-bar app.\n\
         [Unit]\n\
         Description=hlabs home cloud\n\
         Documentation=https://hlabs.h4loom.com/help/\n\
         After=network-online.target\n\
         \n\
         [Service]\n\
         Type=simple\n\
         Environment=NODE_ENV=production\n\
         WorkingDirectory={dir}\n\
         ExecStart={node} {main}\n\
         Restart=always\n\
         RestartSec=2\n\
         \n\
         [Install]\n\
         WantedBy=default.target\n",
        // WorkingDirectory takes the path as it is: quotes would make it "not absolute".
        dir = layout.daemon_dir.display(),
    )
}

/// The autostart entry that opens the menu-bar app at login (the freedesktop autostart spec).
pub fn autostart(layout: &LinuxLayout) -> String {
    format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=hlabs\n\
         Comment=Your home cloud\n\
         Exec={exec}\n\
         Icon=hlabs\n\
         Terminal=false\n\
         X-GNOME-Autostart-enabled=true\n",
        exec = quoted(&layout.tray_exec),
    )
}

fn systemctl<R: Runner + ?Sized>(runner: &R, args: &[&str]) -> Result<(), String> {
    let mut all = vec!["--user"];
    all.extend_from_slice(args);
    let ran = runner.run(SYSTEMCTL, &all)?;
    if ran.ok() {
        Ok(())
    } else {
        Err(format!(
            "systemctl --user {} failed: {}",
            args.join(" "),
            ran.stderr.trim()
        ))
    }
}

/// The daemon as a systemd user unit (restart for a new tray token, stop and start around an update, quit).
pub struct SystemdUser<R: Runner> {
    pub runner: R,
}

impl<R: Runner> DaemonService for SystemdUser<R> {
    fn restart(&self) -> Result<(), String> {
        systemctl(&self.runner, &["restart", UNIT])
    }

    fn stop(&self) -> Result<(), String> {
        systemctl(&self.runner, &["stop", UNIT])
    }

    fn start(&self) -> Result<(), String> {
        systemctl(&self.runner, &["start", UNIT])
    }

    fn describe(&self) -> String {
        match self.runner.run(SYSTEMCTL, &["--user", "is-active", UNIT]) {
            Ok(ran) if ran.ok() => "active".to_owned(),
            Ok(_) => "not active".to_owned(),
            Err(err) => err,
        }
    }
}

/// "Start at login" on Linux: the autostart entry and the unit's enablement, together.
pub struct LinuxLoginItem<R: Runner> {
    pub layout: LinuxLayout,
    pub runner: R,
}

impl<R: Runner> LoginItem for LinuxLoginItem<R> {
    fn register(&self) -> Result<(), String> {
        let path = self.layout.autostart_path();
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        std::fs::write(&path, autostart(&self.layout))
            .map_err(|e| format!("{}: {e}", path.display()))?;
        systemctl(&self.runner, &["enable", UNIT])
    }

    fn unregister(&self) -> Result<(), String> {
        match std::fs::remove_file(self.layout.autostart_path()) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
        systemctl(&self.runner, &["disable", UNIT])
    }

    fn enabled(&self) -> Option<bool> {
        let autostart = self.layout.autostart_path().exists();
        let unit = self
            .runner
            .run(SYSTEMCTL, &["--user", "is-enabled", UNIT])
            .ok()?
            .ok();
        Some(autostart && unit)
    }
}

/// Copies a folder, keeping file modes and links (node_modules has a few).
fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let dest = to.join(entry.file_name());
        if kind.is_dir() {
            copy_tree(&entry.path(), &dest)?;
        } else if kind.is_symlink() {
            std::os::unix::fs::symlink(std::fs::read_link(entry.path())?, &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}

/// The AppImage's daemon copy is from this version: `.version` in it says which.
const COPY_VERSION: &str = ".version";

/// Copies the daemon bundle out of the AppImage when the copy is missing or from another version; true when it did.
pub fn sync_daemon(from: &Path, to: &Path, version: &str) -> Result<bool, String> {
    let marker = to.join(COPY_VERSION);
    if std::fs::read_to_string(&marker).ok().as_deref() == Some(version) {
        return Ok(false);
    }
    let staging = to.with_extension("new");
    let _ = std::fs::remove_dir_all(&staging);
    copy_tree(from, &staging)
        .map_err(|e| format!("couldn't copy hlabs to {}: {e}", to.display()))?;
    std::fs::write(staging.join(COPY_VERSION), version).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(to);
    std::fs::rename(&staging, to).map_err(|e| format!("{}: {e}", to.display()))?;
    Ok(true)
}

pub struct LinuxBootstrap<R: Runner> {
    pub layout: LinuxLayout,
    pub runner: R,
    pub login_item: Box<dyn LoginItem>,
    /// The AppImage's own daemon bundle, copied to `layout.daemon_dir` (None for a .deb or .rpm).
    pub bundled_daemon: Option<PathBuf>,
    pub version: String,
}

impl<R: Runner> LinuxBootstrap<R> {
    /// True when hlabs has never run for this user: no unit and no tray token.
    pub fn is_first_launch(&self, has_token: bool) -> bool {
        !self.layout.unit_path().exists() && !has_token
    }

    /// Makes the data dir and, from an AppImage, the daemon's copy.
    pub fn prepare(&self) -> Result<(), String> {
        std::fs::create_dir_all(self.layout.data_dir.join("logs"))
            .map_err(|e| format!("couldn't create {}: {e}", self.layout.data_dir.display()))?;
        if let Some(from) = &self.bundled_daemon {
            sync_daemon(from, &self.layout.daemon_dir, &self.version)?;
        }
        Ok(())
    }

    /// Ports 8443 and 8080 for an AppImage's first run (its Caddy can't use 80 and 443), saved before the daemon starts.
    fn unprivileged_ports(&self) -> Result<(), String> {
        let node = self.layout.daemon_dir.join("node");
        let main = self.layout.daemon_dir.join("hlabsd.mjs");
        let ran = self.runner.run(
            "env",
            &[
                "NODE_ENV=production",
                &node.to_string_lossy(),
                &main.to_string_lossy(),
                "--set-ports",
                "8443",
                "8080",
            ],
        )?;
        if ran.ok() {
            Ok(())
        } else {
            Err(format!("couldn't save the ports: {}", ran.stderr.trim()))
        }
    }

    /// Writes the unit (after the token exists) and starts the daemon. On a first launch the unit is enabled and the
    /// autostart entry written (Start at login is on by default); later, a changed unit restarts the daemon.
    pub fn install(&self, first: bool) -> Result<Launch, String> {
        let path = self.layout.unit_path();
        let current = std::fs::read_to_string(&path).ok();
        let wanted = unit(&self.layout);
        let changed = current.as_deref() != Some(wanted.as_str());
        if changed {
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
            }
            std::fs::write(&path, &wanted)
                .map_err(|e| format!("couldn't write {}: {e}", path.display()))?;
            systemctl(&self.runner, &["daemon-reload"])?;
        }
        if first && self.layout.appimage {
            self.unprivileged_ports()?;
        }
        if first {
            systemctl(&self.runner, &["enable", "--now", UNIT])?;
            // Not fatal: hlabs works without it, it just won't open at login (Start at login shows it).
            if let Err(err) = self.login_item.register() {
                eprintln!("hlabs tray: couldn't turn on start at login: {err}");
            }
            return Ok(Launch::First);
        }
        if changed && current.is_some() {
            systemctl(&self.runner, &["restart", UNIT])?;
            return Ok(Launch::Updated);
        }
        systemctl(&self.runner, &["start", UNIT])?;
        Ok(if changed {
            Launch::Updated
        } else {
            Launch::Unchanged
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::launchd::tests::FakeRunner;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("us-inst-27-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn layout(home: &Path, appimage: bool) -> LinuxLayout {
        LinuxLayout {
            data_dir: home.join(".local/share/hlabs"),
            config_dir: home.join(".config"),
            daemon_dir: if appimage {
                home.join(".local/share/hlabs/daemon")
            } else {
                PathBuf::from("/usr/lib/hlabs/daemon")
            },
            tray_exec: if appimage {
                home.join("Apps/hlabs.AppImage")
            } else {
                PathBuf::from("/usr/bin/hlabs-tray")
            },
            appimage,
        }
    }

    fn boot(home: &Path, appimage: bool, runner: FakeRunner) -> LinuxBootstrap<FakeRunner> {
        let l = layout(home, appimage);
        LinuxBootstrap {
            login_item: Box::new(LinuxLoginItem {
                layout: l.clone(),
                runner: FakeRunner::default(),
            }),
            layout: l,
            runner,
            bundled_daemon: None,
            version: "1.0.0".into(),
        }
    }

    #[test]
    fn us_inst_27_the_unit_runs_the_bundled_daemon_and_restarts_it() {
        let text = unit(&layout(Path::new("/home/hari"), false));
        assert!(text.contains(
            "ExecStart=\"/usr/lib/hlabs/daemon/node\" \"/usr/lib/hlabs/daemon/hlabsd.mjs\""
        ));
        assert!(text.contains("Environment=NODE_ENV=production"));
        assert!(text.contains("\nWorkingDirectory=/usr/lib/hlabs/daemon\n"));
        assert!(text.contains("Restart=always"));
        assert!(text.contains("WantedBy=default.target"));
        let entry = autostart(&layout(Path::new("/home/hari"), true));
        assert!(entry.contains("Exec=\"/home/hari/Apps/hlabs.AppImage\""));
    }

    #[test]
    fn us_inst_27_first_launch_writes_the_unit_enables_it_and_turns_on_start_at_login() {
        let home = temp("first");
        let b = boot(&home, false, FakeRunner::default());
        assert!(b.is_first_launch(false));
        assert!(!b.is_first_launch(true));
        b.prepare().unwrap();
        assert_eq!(b.install(true).unwrap(), Launch::First);
        assert!(b.layout.unit_path().exists());
        assert!(b.layout.autostart_path().exists());
        assert!(!b.is_first_launch(false));
        assert_eq!(
            b.runner.calls(),
            vec![
                "systemctl --user daemon-reload".to_owned(),
                "systemctl --user enable --now hlabsd.service".to_owned(),
            ]
        );
        std::fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn us_inst_27_later_launches_start_it_and_a_changed_unit_restarts_it() {
        let home = temp("later");
        let b = boot(&home, false, FakeRunner::default());
        b.install(true).unwrap();
        let b = boot(&home, false, FakeRunner::default());
        assert_eq!(b.install(false).unwrap(), Launch::Unchanged);
        assert_eq!(
            b.runner.calls(),
            vec!["systemctl --user start hlabsd.service".to_owned()]
        );

        std::fs::write(b.layout.unit_path(), "an older unit").unwrap();
        let b = boot(&home, false, FakeRunner::default());
        assert_eq!(b.install(false).unwrap(), Launch::Updated);
        assert_eq!(
            b.runner.calls(),
            vec![
                "systemctl --user daemon-reload".to_owned(),
                "systemctl --user restart hlabsd.service".to_owned(),
            ]
        );
        std::fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn us_inst_27_an_appimage_copies_its_daemon_and_uses_ports_8443_and_8080() {
        let home = temp("appimage");
        let bundled = home.join("squashfs/usr/lib/hlabs/daemon");
        std::fs::create_dir_all(bundled.join("bin")).unwrap();
        std::fs::write(bundled.join("hlabsd.mjs"), "v1").unwrap();
        std::os::unix::fs::symlink("hlabsd.mjs", bundled.join("link.mjs")).unwrap();
        let mut b = boot(&home, true, FakeRunner::default());
        b.bundled_daemon = Some(bundled.clone());
        b.prepare().unwrap();
        let copy = &b.layout.daemon_dir;
        assert_eq!(
            std::fs::read_to_string(copy.join("hlabsd.mjs")).unwrap(),
            "v1"
        );
        assert!(copy.join("link.mjs").is_symlink());
        // The same version isn't copied again; another one is.
        assert!(!sync_daemon(&bundled, copy, "1.0.0").unwrap());
        std::fs::write(bundled.join("hlabsd.mjs"), "v2").unwrap();
        assert!(sync_daemon(&bundled, copy, "1.0.1").unwrap());
        assert_eq!(
            std::fs::read_to_string(copy.join("hlabsd.mjs")).unwrap(),
            "v2"
        );

        b.install(true).unwrap();
        let calls = b.runner.calls();
        assert!(calls[1].contains("--set-ports 8443 8080"), "{calls:?}");
        assert_eq!(calls[2], "systemctl --user enable --now hlabsd.service");
        std::fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn us_inst_27_start_at_login_turns_the_autostart_entry_and_the_unit_on_and_off() {
        let home = temp("login");
        let item = LinuxLoginItem {
            layout: layout(&home, false),
            runner: FakeRunner::default(),
        };
        item.register().unwrap();
        assert!(item.layout.autostart_path().exists());
        item.unregister().unwrap();
        assert!(!item.layout.autostart_path().exists());
        assert_eq!(
            item.runner.calls(),
            vec![
                "systemctl --user enable hlabsd.service".to_owned(),
                "systemctl --user disable hlabsd.service".to_owned(),
            ]
        );
        std::fs::remove_dir_all(home).unwrap();
    }
}
