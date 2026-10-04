// The public key hlabs updates are signed with (Tauri updater / minisign format: base64 of the .pub file). This is
// the development key (D-118); the release key replaces it in phase 6, before anything is installed from a release.
// The tray embeds the same key (apps/tray/src-tauri/tauri.conf.json, plugins.updater.pubkey).
export const UPDATE_PUBLIC_KEY =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEVDODhBNzA0NDlEQkI2NTEKUldSUnR0dEpCS2VJN0hIdTI3UTk5c2FsckgxeVlIWFc5RWFBcjIxMGpuOWp4ZTdRTzJSZk5jbHEK';
