//! The daemon's log, read by the tray itself while hlabs isn't answering (US-INST-13): "Show logs"
//! opens the newest log file, and "Copy diagnostics" is built here without the API, with secrets
//! removed the same way the daemon's own report does (apps/daemon/src/tray/diagnostics.ts).

use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

pub const LOG_LINES: usize = 200;
const REDACTED: &str = "[redacted]";

/// The newest daemon log in `<dataDir>/logs` (pino-roll numbers them hlabsd.1.log, hlabsd.2.log…).
pub fn newest_log(logs_dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(logs_dir)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let n: u64 = name
                .strip_prefix("hlabsd.")?
                .strip_suffix(".log")?
                .parse()
                .ok()?;
            Some((n, entry.path()))
        })
        .max_by_key(|(n, _)| *n)
        .map(|(_, path)| path)
}

pub fn last_lines(path: Option<&Path>, count: usize) -> Vec<String> {
    let Some(text) = path.and_then(|p| std::fs::read_to_string(p).ok()) else {
        return Vec::new();
    };
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(count)..]
        .iter()
        .map(|l| (*l).to_owned())
        .collect()
}

static BEARER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]+").unwrap());
static URL_SECRET: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)([?&](?:token|key|secret|password)=)[^&\s"']+"#).unwrap());
static JSON_SECRET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?i)("[a-zA-Z]*(?:password|secret|token|cookie|authorization|apiKey)[a-zA-Z]*"\s*:\s*)"[^"]*""#,
    )
    .unwrap()
});
static SESSION: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)((?:hlabs_session|session)=)[^;\s"]+"#).unwrap());

/// Bearer tokens, tokens in addresses, password-like JSON values and session cookies.
pub fn redact(text: &str) -> String {
    let text = BEARER.replace_all(text, format!("${{1}}{REDACTED}"));
    let text = URL_SECRET.replace_all(&text, format!("${{1}}{REDACTED}"));
    let text = JSON_SECRET.replace_all(&text, format!("${{1}}\"{REDACTED}\""));
    SESSION
        .replace_all(&text, format!("${{1}}{REDACTED}"))
        .into_owned()
}

/// The report "Copy diagnostics" puts on the clipboard while hlabs isn't answering.
pub fn local_report(app_version: &str, service: &str, data_dir: &Path) -> String {
    let log = newest_log(&data_dir.join("logs"));
    let mut lines = vec![
        "hlabs diagnostics (from the menu-bar app; hlabs isn't answering)".to_owned(),
        format!("Menu-bar app: {app_version}"),
        format!("OS: {} ({})", std::env::consts::OS, std::env::consts::ARCH),
        "Background service:".to_owned(),
        service.trim().to_owned(),
        String::new(),
        format!("Last {LOG_LINES} lines of the hlabs log:"),
    ];
    lines.extend(last_lines(log.as_deref(), LOG_LINES));
    redact(&lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("hlabs-logs-{}", crate::token::new_token()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn us_inst_13_finds_the_newest_log() {
        let d = dir();
        assert_eq!(newest_log(&d), None);
        for n in [1, 3, 2] {
            std::fs::write(d.join(format!("hlabsd.{n}.log")), "x").unwrap();
        }
        std::fs::write(d.join("other.log"), "x").unwrap();
        assert_eq!(newest_log(&d), Some(d.join("hlabsd.3.log")));
    }

    #[test]
    fn us_inst_16_redacts_tokens_passwords_and_cookies() {
        assert_eq!(
            redact("Authorization: Bearer abc.DEF_123"),
            "Authorization: Bearer [redacted]"
        );
        assert_eq!(
            redact("http://x/setup?token=abc&y=1"),
            "http://x/setup?token=[redacted]&y=1"
        );
        assert_eq!(
            redact(r#"{"newPassword":"p","msg":"ok"}"#),
            r#"{"newPassword":"[redacted]","msg":"ok"}"#
        );
        assert_eq!(
            redact("hlabs_session=abc; x=1"),
            "hlabs_session=[redacted]; x=1"
        );
    }

    #[test]
    fn us_inst_13_the_local_report_has_the_last_200_lines_without_secrets() {
        let d = dir();
        std::fs::create_dir_all(d.join("logs")).unwrap();
        let mut text: Vec<String> = (0..250).map(|i| format!("line {i}")).collect();
        text.push("authorization: Bearer secret-token".into());
        std::fs::write(d.join("logs/hlabsd.1.log"), text.join("\n")).unwrap();
        let report = local_report("0.4.0", "state = not running", &d);
        assert!(report.contains("Menu-bar app: 0.4.0"));
        assert!(report.contains("state = not running"));
        assert!(!report.contains("line 50\n"));
        assert!(report.contains("line 249"));
        assert!(!report.contains("secret-token"));
        let log_part = report.split("hlabs log:\n").nth(1).unwrap();
        assert_eq!(log_part.lines().count(), 200);
    }
}
