// "Can't reach hlabs" (US-STATE-04…06): shared by the in-app state and the fallback page Caddy serves when the daemon
// doesn't answer. Plain words; no version, hostnames or user names.
export const healthCopy = {
  title: "Can't reach hlabs",
  tryingIn: (seconds: number) => `Trying again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}…`,
  trying: 'Trying again…',
  tryNow: 'Try now',
  checks: [
    'Check that the hlabs icon is in the menu bar (or tray) on the host computer.',
    'Make sure that computer is awake and on the same network, or on Tailscale.',
  ],
  linuxCheck: 'On a Linux server, run',
  /** D-017: the unit is hlabsd (a desktop runs `systemctl --user status hlabsd`). */
  linuxCommand: 'systemctl status hlabsd',
  copyCommand: 'Copy command',
  copied: 'Copied',
  checksLabel: 'Things to check',
} as const;

/**
 * One line under the title for why hlabs is down (US-STATE-05); null: no line. Every /healthz reason has an entry,
 * plus the dashboard's own `update_stuck`. Never raw error text.
 */
export const reasonCopy: Record<string, string | null> = {
  starting: 'hlabs is starting. This usually takes less than a minute.',
  daemon_unreachable: null,
  updating: null,
  migration_failed:
    "hlabs couldn't update its database. Your data hasn't been changed. Open the hlabs app on the host computer to see details.",
  storage_unavailable: "hlabs can't find its storage folder. Check that the drive is connected.",
  update_stuck: 'The update is taking longer than expected. Open the hlabs app on the host computer to see details.',
};

/** The line for a reason; unknown reasons get none. */
export const reasonLine = (reason: string | null): string | null => (reason ? (reasonCopy[reason] ?? null) : null);
