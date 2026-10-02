// The only procedures a notification's button may run (US-STATE-15). Anything else in `action_json` is dropped.
export const TOAST_MUTATIONS = [
  'apps.start',
  'apps.restart',
  'apps.uninstall',
  'backups.runNow',
  'settings.updates.check',
] as const;
export type ToastMutation = (typeof TOAST_MUTATIONS)[number];
