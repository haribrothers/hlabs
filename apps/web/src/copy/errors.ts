// Plain-words errors for every hlabsCode (US-STATE-17): a title that says what went wrong and a body that says what
// to do next, with values filled from the error's detail. Never raw messages, paths, container ids or tool output.
import type { HlabsCode } from '@hlabs/api';

export interface ErrorText {
  title: string;
  body: string;
}

type Detail = Record<string, unknown>;

const str = (d: Detail, key: string, fallback: string) => (typeof d[key] === 'string' ? (d[key] as string) : fallback);
const num = (d: Detail, key: string) => (typeof d[key] === 'number' ? (d[key] as number) : null);
const minutes = (seconds: number) => {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
};

/** What a running job is called in "Wait for … to finish". */
export const jobNames: Record<string, string> = {
  system_update: 'the hlabs update',
  restore: 'the restore',
  move_all_data: 'the data move',
  engine_switch: 'the engine switch',
  rename_host: 'the rename',
  factory_reset: 'the factory reset',
  app_install: 'the app install',
  app_update: 'the app update',
  app_uninstall: 'the uninstall',
  app_move_data: 'the app data move',
  app_deploy_custom: 'the app setup',
  starter_apps: 'the starter apps',
  backup: 'the backup',
  engine_install: 'the engine install',
  engine_start: 'the engine start',
  engine_restart: 'the engine restart',
  prune_images: 'the clean-up',
  files_move: 'the file move',
  diagnostics: 'the diagnostics bundle',
  hlabs_uninstall: 'the uninstall',
};

const tryAgain = 'Try again. If it keeps happening, check the logs in Settings › Advanced.';

export const errorCopy = {
  generic: { title: 'Something went wrong', body: tryAgain } satisfies ErrorText,
  offline: { title: "Can't reach hlabs", body: 'Check your connection and try again.' } satisfies ErrorText,
  /** A mutation the person isn't allowed to make (US-STATE-20). */
  forbiddenToast: "You don't have access to that.",
  codes: {
    // General
    NOT_IMPLEMENTED: () => ({ title: "This isn't ready yet", body: 'It arrives with a later update of hlabs.' }),
    VALIDATION_FAILED: () => ({ title: "Something doesn't look right", body: 'Check what you entered and try again.' }),
    NOT_FOUND: () => ({ title: "This isn't here any more", body: 'It may have been removed or renamed.' }),
    AUTH_REQUIRED: () => ({ title: "You're logged out", body: 'Log in again to carry on.' }),
    ACCESS_DENIED: () => ({ title: "You don't have access to that", body: 'Ask an admin if you need it.' }),
    CSRF_REJECTED: () => ({ title: "That didn't go through", body: 'Reload the page and try again.' }),
    INTERNAL: () => ({ title: 'Something went wrong', body: tryAgain }),
    JOB_EXCLUSIVE_RUNNING: (d) => ({
      title: 'hlabs is busy',
      body: `Wait for ${jobNames[str(d, 'runningKind', '')] ?? 'what it’s doing'} to finish, then try again.`,
    }),
    JOB_NOT_CANCELLABLE: () => ({ title: "This can't be stopped now", body: 'It will finish on its own shortly.' }),
    DAEMON_STARTING: () => ({
      title: 'hlabs is starting',
      body: 'This usually takes less than a minute. Try again then.',
    }),
    DISK_FULL: () => ({ title: 'This computer is out of space', body: 'Free up some disk space, then try again.' }),
    // Auth
    AUTH_INVALID_CREDENTIALS: () => ({ title: "That didn't match", body: 'Check your username and password.' }),
    AUTH_INVALID_PASSWORD: () => ({ title: "That password isn't right", body: 'Check it and try again.' }),
    AUTH_LOCKED: (d) => {
      const seconds =
        num(d, 'retryAfterSeconds') ?? (num(d, 'until') !== null ? (num(d, 'until')! - Date.now()) / 1000 : 900);
      return { title: 'Too many tries', body: `Wait ${minutes(seconds)}, then try again.` };
    },
    AUTH_TOTP_INVALID: () => ({
      title: "That code didn't work",
      body: 'Use the newest code from your authenticator app.',
    }),
    AUTH_RECOVERY_INVALID: () => ({
      title: "That recovery code didn't work",
      body: 'Each code works once. Try another.',
    }),
    AUTH_CHALLENGE_EXPIRED: () => ({ title: 'That took too long', body: 'Log in again from the start.' }),
    AUTH_RESET_EXPIRED: () => ({ title: 'This reset link has expired', body: 'Ask an admin for a new one.' }),
    AUTH_SECRET_UNAVAILABLE: () => ({
      title: "hlabs can't reach its keychain",
      body: 'Unlock this computer, then try again.',
    }),
    TOTP_INVALID_CODE: () => ({
      title: "That code didn't work",
      body: 'Use the newest code from your authenticator app.',
    }),
    TOTP_REQUIRED_SELF_FIRST: () => ({
      title: 'Turn on two-factor login first',
      body: 'Set it up for your own account before requiring it for everyone.',
    }),
    TOTP_REQUIRED_BY_ADMIN: () => ({
      title: 'Two-factor login is required',
      body: 'Your admin requires it for everyone, so it stays on.',
    }),
    TRAY_TOKEN_REJECTED: () => ({ title: "The menu bar app isn't connected", body: 'Quit it and open it again.' }),
    PASSWORD_TOO_SHORT: () => ({ title: 'That password is too short', body: 'Use at least 12 characters.' }),
    PASSWORD_TOO_COMMON: () => ({ title: 'That password is too common', body: 'Choose one that’s harder to guess.' }),
    PASSWORD_UNCHANGED: () => ({ title: "That's your current password", body: 'Choose a new one.' }),
    USERNAME_INVALID: () => ({
      title: "That username won't work",
      body: 'Use lowercase letters, numbers and dashes, starting with a letter.',
    }),
    USERNAME_TAKEN: () => ({ title: 'That username is taken', body: 'Choose another one.' }),
    LAST_ADMIN: () => ({ title: 'hlabs needs at least one admin', body: 'Make someone else an admin first.' }),
    INVITE_INVALID: () => ({
      title: "This invite doesn't work anymore",
      body: 'Ask the person who invited you for a new link.',
    }),
    // Onboarding
    ONBOARDING_SETUP_TOKEN_REQUIRED: () => ({
      title: 'Open setup from this computer',
      body: 'Use the link from the hlabs menu bar app or the install script.',
    }),
    ONBOARDING_COMPLETE: () => ({ title: 'hlabs is already set up', body: 'Log in to carry on.' }),
    ONBOARDING_USERS_EXIST: () => ({ title: 'An admin already exists', body: 'Log in with that account.' }),
    ONBOARDING_INCOMPLETE: () => ({ title: "Setup isn't finished", body: 'Go back and complete the missing step.' }),
    ONBOARDING_STEP_INVALID: () => ({
      title: "That step isn't available yet",
      body: 'Finish the steps before it first.',
    }),
    // Engine
    ENGINE_UNAVAILABLE: () => ({
      title: "The container engine isn't running",
      body: 'Start it in Settings › Engine & startup.',
    }),
    ENGINE_START_FAILED: () => ({
      title: "The engine didn't start",
      body: 'Try again, or restart this computer.',
    }),
    ENGINE_INSTALL_UNSUPPORTED: () => ({
      title: "hlabs can't install an engine here",
      body: 'Install Docker yourself, then try again.',
    }),
    ENGINE_DOWNLOAD_TIMEOUT: () => ({
      title: 'The download stalled',
      body: 'Check your internet connection and try again.',
    }),
    // Apps
    APP_PORT_IN_USE: (d) => ({
      title: `${str(d, 'app', 'The app')} couldn't start`,
      body: `Port ${num(d, 'port') ?? str(d, 'port', 'it needs')} is already in use by another program.`,
    }),
    APP_NO_PLATFORM: () => ({
      title: "This app doesn't run on this computer",
      body: "It isn't made for this kind of processor.",
    }),
    APP_NETWORK_UNREACHABLE: () => ({
      title: "The app couldn't be downloaded",
      body: 'Check your internet connection and try again.',
    }),
    APP_HEALTH_TIMEOUT: (d) => ({
      title: `${str(d, 'app', 'The app')} didn't start in time`,
      body: 'Check its logs, then try again.',
    }),
    APP_HAS_DEPENDENTS: () => ({
      title: 'Other apps need this one',
      body: 'Uninstall the apps that use it first.',
    }),
    APP_ENV_INVALID: () => ({ title: "A setting isn't right", body: 'Check the app’s settings and try again.' }),
    APP_DISK_FULL: () => ({ title: 'There’s no space for this app', body: 'Free up some disk space, then try again.' }),
    APP_BUSY: (d) => ({
      title: `${str(d, 'app', 'The app')} is busy`,
      body: 'Wait for it to finish what it’s doing, then try again.',
    }),
    APP_UPDATE_ROLLED_BACK: (d) => ({
      title: "The update didn't start",
      body: `hlabs went back to ${str(d, 'fromVersion', 'the previous version')}. Nothing was lost.`,
    }),
    APP_ROLLBACK_FAILED: () => ({
      title: "The app couldn't be restored",
      body: "Neither the new version nor the previous one started. Check the app's logs.",
    }),
    HOSTNAME_TAKEN: () => ({ title: 'That address is taken', body: 'Choose another name.' }),
    // Storage, files and network
    STORAGE_NOT_WRITABLE: () => ({
      title: "hlabs can't save files there",
      body: 'Choose a folder you can write to, or check the drive.',
    }),
    NAS_UNREACHABLE: () => ({ title: "Can't reach the NAS", body: 'Check the address and that the NAS is on.' }),
    NAS_AUTH_FAILED: () => ({ title: "The NAS didn't accept that", body: 'Check the username and password.' }),
    NAS_READ_ONLY: () => ({ title: 'That share is read-only', body: 'Choose a share hlabs can write to.' }),
    NAS_HELPER_MISSING: () => ({
      title: "hlabs can't connect to network drives here",
      body: 'Reinstall hlabs to add the missing helper.',
    }),
    FILES_ACCESS_DENIED: () => ({ title: "You don't have access to that", body: 'Ask the person who shared it.' }),
    FILES_READ_ONLY: () => ({ title: 'This folder is read-only', body: 'Save it somewhere else.' }),
    FILES_NO_SPACE: () => ({ title: 'There’s no space left there', body: 'Free up some space, then try again.' }),
    FILES_NAME_EXISTS: () => ({ title: 'That name is taken', body: 'Choose another name.' }),
    FILES_INVALID_PATH: () => ({ title: "That place doesn't exist", body: 'It may have been moved or removed.' }),
    FILES_INVALID_NAME: () => ({ title: "That name won't work", body: 'Names can’t contain / or be empty.' }),
    TAILSCALE_PERMISSION_DENIED: () => ({
      title: 'Tailscale needs permission first',
      body: 'Run sudo tailscale set --operator=hlabs once on this computer, then try again.',
    }),
    DNS_SERVER_UNREACHABLE: () => ({
      title: "The DNS server isn't answering",
      body: 'Check its address and that it is running, then try again.',
    }),
    DNS_SERVER_AUTH_FAILED: () => ({
      title: 'Pi-hole refused the app password',
      body: 'Make an app password in Pi-hole under Settings › Web interface / API, then paste it here.',
    }),
    TAILSCALE_NOT_RUNNING: () => ({
      title: "Tailscale isn't running",
      body: 'Open Tailscale on this computer so hlabs can take its addresses off your tailnet, then try again.',
    }),
    TAILSCALE_SERVE_CONFLICT: (d) => ({
      title:
        num(d, 'port') !== null
          ? `Port ${num(d, 'port')} is already served on your tailnet`
          : 'A port is already served',
      body: 'Something else on this computer uses it with Tailscale Serve. Choose another port or stop that first.',
    }),
    NETWORK_PORT_IN_USE: (d) => ({
      title: num(d, 'port') !== null ? `Port ${num(d, 'port')} is in use` : 'That port is in use',
      body: 'Another program is using it. Choose another port or close that program.',
    }),
    TAILSCALE_HTTPS_DISABLED: () => ({
      title: 'HTTPS is off in Tailscale',
      body: 'Turn on HTTPS certificates in your Tailscale admin console.',
    }),
    // Backups and restore
    BACKUP_DEST_UNREACHABLE: () => ({
      title: "Can't reach the backup destination",
      body: 'Check that it’s connected and on.',
    }),
    BACKUP_DEST_AUTH_FAILED: () => ({
      title: "The backup destination didn't accept that",
      body: 'Check its username and password.',
    }),
    BACKUP_DEST_FULL: () => ({
      title: 'The backup destination is full',
      body: 'Free up space there or keep fewer backups.',
    }),
    BACKUP_DEST_DUPLICATE: () => ({ title: 'That destination is already added', body: 'Choose a different one.' }),
    BACKUP_REPO_LOCKED: () => ({
      title: 'Another backup is using this destination',
      body: 'Wait for it to finish, then try again.',
    }),
    BACKUP_REPO_PASSWORD_WRONG: () => ({
      title: "That backup password isn't right",
      body: 'Use the password from when these backups were made.',
    }),
    BACKUP_PREHOOK_FAILED: () => ({
      title: "An app couldn't get ready for the backup",
      body: 'Check its logs, then run the backup again.',
    }),
    BACKUP_INTERRUPTED: () => ({
      title: 'The backup was interrupted',
      body: 'Run it again; it carries on where it stopped.',
    }),
    RESTORE_NOT_CANCELLABLE: () => ({
      title: "The restore can't be stopped now",
      body: 'Stopping it here could damage your data. It will finish soon.',
    }),
    // Updates
    UPDATE_CHECK_FAILED: () => ({ title: "Couldn't check for updates", body: 'Check your internet connection.' }),
    UPDATE_SIGNATURE_INVALID: () => ({
      title: "This update couldn't be verified",
      body: "It wasn't installed. Try again later.",
    }),
  } satisfies Record<HlabsCode, (detail: Detail) => ErrorText>,
};
