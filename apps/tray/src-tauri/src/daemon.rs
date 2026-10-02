//! The tray's connection to hlabsd (US-INST-15): tRPC over HTTP on `127.0.0.1:7474`, with the tray
//! token as `Authorization: Bearer`. Only `tray.*` procedures accept it. The token stays in Rust: the
//! webview calls procedures through the `daemon_call` command and never sees it.

use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;

pub const DEFAULT_BASE_URL: &str = "http://127.0.0.1:7474";

#[derive(Debug, thiserror::Error, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DaemonError {
    /// Nothing answered on the daemon's port (US-INST-13).
    #[error("hlabs isn't answering")]
    Unreachable,
    /// The daemon refused the tray token (TRAY_TOKEN_REJECTED; US-INST-16 repairs it).
    #[error("the tray token was rejected")]
    TokenRejected,
    /// The tray has no usable token (keychain refused, or gave up after a repair; US-INST-16).
    #[error("the tray has no access to hlabs")]
    NoAccess,
    /// Any other tRPC error, with its hlabsCode for the UI's copy.
    #[error("{hlabs_code}")]
    Api {
        #[serde(rename = "hlabsCode")]
        hlabs_code: String,
        status: u16,
    },
    #[error("unexpected answer from hlabs")]
    Protocol,
}

#[derive(Deserialize)]
struct Envelope {
    result: Option<ResultBody>,
    error: Option<ErrorBody>,
}

#[derive(Deserialize)]
struct ResultBody {
    data: Option<Value>,
}

#[derive(Deserialize)]
struct ErrorBody {
    data: Option<ErrorData>,
}

#[derive(Deserialize)]
struct ErrorData {
    #[serde(rename = "hlabsCode")]
    hlabs_code: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CallKind {
    Query,
    Mutation,
}

/// The token is checked by the daemon only; it is never logged or formatted (US-INST-16).
#[derive(Clone)]
pub struct DaemonClient {
    base_url: String,
    token: String,
    http: reqwest::Client,
}

impl std::fmt::Debug for DaemonClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DaemonClient")
            .field("base_url", &self.base_url)
            .field("token", &"Bearer [redacted]")
            .finish()
    }
}

impl DaemonClient {
    pub fn new(base_url: impl Into<String>, token: impl Into<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            // Loopback only; never a system proxy.
            .no_proxy()
            .build()
            .expect("the HTTP client could not be built");
        Self {
            base_url: base_url.into().trim_end_matches('/').to_owned(),
            token: token.into(),
            http,
        }
    }

    /// Calls `tray.*` procedure `path` with `input` (tRPC v11, no transformer).
    pub async fn call(
        &self,
        kind: CallKind,
        path: &str,
        input: &Value,
    ) -> Result<Value, DaemonError> {
        let url = format!("{}/trpc/{}", self.base_url, path);
        let request = match kind {
            CallKind::Query => {
                let mut req = self.http.get(&url);
                if !input.is_null() {
                    req = req.query(&[("input", input.to_string())]);
                }
                req
            }
            CallKind::Mutation => self
                .http
                .post(&url)
                .header("content-type", "application/json")
                .body(input.to_string()),
        };
        let response = request
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|_| DaemonError::Unreachable)?;
        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .map_err(|_| DaemonError::Unreachable)?;
        parse(status, &body)
    }
}

/// The setup URL from `tray.setupUrl`'s answer: `None` once onboarding is complete. Only a web address
/// is ever opened (US-INST-02).
pub fn setup_url(data: &Value) -> Result<Option<String>, DaemonError> {
    match data.get("url") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(url)) if url.starts_with("http://") || url.starts_with("https://") => {
            Ok(Some(url.clone()))
        }
        Some(_) => Err(DaemonError::Protocol),
    }
}

fn parse(status: u16, body: &str) -> Result<Value, DaemonError> {
    let envelope: Envelope = serde_json::from_str(body).map_err(|_| DaemonError::Protocol)?;
    if let Some(error) = envelope.error {
        let hlabs_code = error
            .data
            .and_then(|d| d.hlabs_code)
            .unwrap_or_else(|| "INTERNAL".to_owned());
        if hlabs_code == "TRAY_TOKEN_REJECTED" {
            return Err(DaemonError::TokenRejected);
        }
        return Err(DaemonError::Api { hlabs_code, status });
    }
    envelope
        .result
        .map(|r| r.data.unwrap_or(Value::Null))
        .ok_or(DaemonError::Protocol)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    /// A one-request HTTP server that records the request and sends `response`.
    fn serve_once(status: &str, body: &str) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let (tx, rx) = mpsc::channel();
        let response = format!(
            "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        );
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).unwrap();
            tx.send(String::from_utf8_lossy(&buf[..n]).into_owned())
                .unwrap();
            stream.write_all(response.as_bytes()).unwrap();
        });
        (url, rx)
    }

    #[tokio::test]
    async fn us_inst_15_sends_the_token_as_bearer_to_trpc() {
        let (url, rx) = serve_once("200 OK", r#"{"result":{"data":{"state":"running"}}}"#);
        let client = DaemonClient::new(url, "secret-token");
        let data = client
            .call(CallKind::Query, "tray.status", &Value::Null)
            .await
            .unwrap();
        assert_eq!(data["state"], "running");
        let request = rx.recv().unwrap().to_lowercase();
        assert!(request.starts_with("get /trpc/tray.status "));
        assert!(request.contains("authorization: bearer secret-token"));
    }

    #[tokio::test]
    async fn us_inst_15_mutations_post_their_input() {
        let (url, rx) = serve_once("200 OK", r#"{"result":{"data":null}}"#);
        let client = DaemonClient::new(url, "t");
        let input = serde_json::json!({ "enabled": true });
        client
            .call(CallKind::Mutation, "tray.setStartAtLogin", &input)
            .await
            .unwrap();
        let request = rx.recv().unwrap();
        assert!(request.starts_with("POST /trpc/tray.setStartAtLogin "));
        assert!(request.ends_with(r#"{"enabled":true}"#));
    }

    #[tokio::test]
    async fn us_inst_15_maps_a_rejected_token() {
        let (url, _rx) = serve_once(
            "401 Unauthorized",
            r#"{"error":{"message":"x","code":-32001,"data":{"hlabsCode":"TRAY_TOKEN_REJECTED","httpStatus":401}}}"#,
        );
        let err = DaemonClient::new(url, "bad")
            .call(CallKind::Query, "tray.status", &Value::Null)
            .await
            .unwrap_err();
        assert!(matches!(err, DaemonError::TokenRejected));
    }

    #[tokio::test]
    async fn us_inst_15_maps_other_errors_and_an_absent_daemon() {
        let (url, _rx) = serve_once(
            "403 Forbidden",
            r#"{"error":{"message":"x","code":-32003,"data":{"hlabsCode":"ACCESS_DENIED","httpStatus":403}}}"#,
        );
        let err = DaemonClient::new(url, "t")
            .call(CallKind::Query, "users.list", &Value::Null)
            .await
            .unwrap_err();
        assert!(
            matches!(err, DaemonError::Api { ref hlabs_code, status: 403 } if hlabs_code == "ACCESS_DENIED")
        );

        // A port nothing listens on.
        let free = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap();
        let err = DaemonClient::new(format!("http://{free}"), "t")
            .call(CallKind::Query, "tray.status", &Value::Null)
            .await
            .unwrap_err();
        assert!(matches!(err, DaemonError::Unreachable));
    }

    #[test]
    fn us_inst_02_only_a_web_setup_url_is_opened() {
        let ok =
            serde_json::json!({ "url": "http://127.0.0.1:7474/setup?token=abc", "lanUrls": [] });
        assert_eq!(
            setup_url(&ok).unwrap().as_deref(),
            Some("http://127.0.0.1:7474/setup?token=abc")
        );
        assert_eq!(
            setup_url(&serde_json::json!({ "url": null })).unwrap(),
            None
        );
        assert!(setup_url(&serde_json::json!({ "url": "file:///etc/passwd" })).is_err());
        assert!(setup_url(&serde_json::json!({ "url": 3 })).is_err());
    }

    #[test]
    fn us_inst_16_debug_output_never_shows_the_token() {
        let client = DaemonClient::new(DEFAULT_BASE_URL, "very-secret");
        let shown = format!("{client:?}");
        assert!(!shown.contains("very-secret"));
        assert!(shown.contains("[redacted]"));
    }
}
