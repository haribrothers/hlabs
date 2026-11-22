// The public key hlabs updates are signed with (Tauri updater / minisign format: base64 of the .pub file): the hlabs
// release key (minisign key id B70D799832CB6AD2, D-141, D-146). Its private half signs every release in release.yml.
// The tray embeds the same key (apps/tray/src-tauri/tauri.conf.json, plugins.updater.pubkey). To try an update from
// your own builds, put your development key's public half in both places, and don't commit it
// (apps/site/src/content/docs/developers/updates-and-signing.md).
export const UPDATE_PUBLIC_KEY =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEI3MEQ3OTk4MzJDQjZBRDIKUldUU2Fzc3ltSGtOdDhiUzVURk5qTUd1enAveVhNS1pWZGwrTGtEQllsakRwMTlkV1JiM3RyVVYK';
