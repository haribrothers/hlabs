// How hlabsd starts itself again (US-SYS-31, US-SYS-38; D-133): it stops cleanly and exits with code 75, and the
// service manager starts it again: launchd's LaunchAgent (`KeepAlive { SuccessfulExit = false }`, D-113) on a Mac, and
// systemd (`Restart=always`, D-118, D-145) on Linux. A clean exit (0) is a stop that launchd leaves alone.

/** EX_TEMPFAIL: "try again", the code that makes launchd and systemd start hlabsd again. */
export const RESTART_EXIT_CODE = 75;

let exitCode = 0;

/** The code the daemon exits with once it has stopped (main.ts). */
export const plannedExitCode = () => exitCode;

/** Stops the daemon the usual way (SIGTERM: Caddy, the mDNS names and the database closed) and exits with 75. */
export function requestRestart(): void {
  exitCode = RESTART_EXIT_CODE;
  process.kill(process.pid, 'SIGTERM');
}
