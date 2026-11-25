// The only procedures a notification's button may run (US-STATE-15). Anything else in `action_json` is dropped.
export const TOAST_MUTATIONS = [
  'apps.start',
  'apps.restart',
  'apps.uninstall',
  'apps.reinstall',
  'backups.runNow',
  'settings.updates.check',
  // "Make private" on `app.public_attack` (US-APP-29): only ever `{ appId, public: false }` from a toast.
  'apps.setPublic',
] as const;
export type ToastMutation = (typeof TOAST_MUTATIONS)[number];
