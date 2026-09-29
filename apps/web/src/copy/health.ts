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
