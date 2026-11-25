// What only works at home or on the tailnet (US-SYS-47, D-182, 07 §7.11 control 5): the riskiest changes, refused with
// HOME_ONLY when the request came through the public dashboard (Caddy's public listener marks it `X-Hlabs-Via: public`),
// for everyone, admins too. The daemon enforces this list for every procedure (DaemonContext.handle); the dashboard
// reads it to show those controls with "At home only" there. A new procedure must choose: the contract test
// (packages/api us-sys-47.test.ts) fails until it's here or on the list of what works from anywhere.
//
// Stopping exposure is never home-only: making an app or the dashboard private, turning off all public access, and
// signing out everywhere work from the public address too.

/** Where a request came from (`auth.me.via`): the public dashboard, the tailnet, or anywhere else (home). */
export type Via = 'home' | 'tailnet' | 'public';

/**
 * `always`: refused from the public address whatever its input. `makingPublic`: refused unless the input is
 * `{ public: false }` (making something private always works). `neverServed`: first-run setup, invites and reset links,
 * which the public address never serves at all ("Open this at home or on your tailnet.").
 */
export type HomeOnlyRule = 'always' | 'makingPublic' | 'neverServed';

export const HOME_ONLY_PROCEDURES = {
  // Factory reset.
  'system.factoryReset': 'always',

  // Public access and every other Network & remote access change (Tailscale, ports, DNS, the server's name).
  'public.cloudflareSignIn': 'always',
  'public.setupCloudflare': 'always',
  'public.remove': 'always',
  'public.setDashboard': 'makingPublic',
  'public.setDashboardAccess': 'always',
  'apps.setPublic': 'makingPublic',
  'network.setHostname': 'always',
  'network.remote.connect': 'always',
  'network.remote.disconnect': 'always',
  'network.setPorts': 'always',
  'network.setDnsServer': 'always',
  'network.testDnsServer': 'always',
  'network.setRemoteMode': 'always',

  // App sources and libraries, deploying your own apps, an app's permissions and its secrets.
  'store.sources.inspect': 'always',
  'store.sources.add': 'always',
  'store.sources.remove': 'always',
  'store.copyToLibrary': 'always',
  'apps.deployCustom': 'always',
  'apps.setPermissions': 'always',
  'apps.setMounts': 'always',
  'apps.revealSecret': 'always',

  // People: inviting, roles, deleting, reset links, the people policy (requiring two-factor), and who gets in (D-183).
  'invites.create': 'always',
  'invites.update': 'always',
  'users.updateRole': 'always',
  'users.delete': 'always',
  'users.enable': 'always',
  'users.resetPasswordLink': 'always',
  'users.setAppAccess': 'always',
  'users.updatePolicy': 'always',

  // My own password, two-factor on or off, new recovery codes.
  'account.changePassword': 'always',
  'account.totp.begin': 'always',
  'account.totp.confirm': 'always',
  'account.totp.disable': 'always',
  'account.recoveryCodes.regenerate': 'always',

  // Restoring a backup, adding, changing or removing a destination (a new one could copy everything out), showing the
  // backup password (D-184).
  'backups.restore': 'always',
  'backups.destinations.add': 'always',
  'backups.destinations.update': 'always',
  'backups.destinations.remove': 'always',
  'backups.exportRepoPassword': 'always',

  // An app's configuration (its names, ports and environment), whether it asks for the hlabs login, and AI access
  // tokens: each changes what's reachable or who gets in (D-184).
  'apps.setConfig': 'always',
  'apps.setAuthMode': 'always',
  'ai.tokens.create': 'always',

  // Moving where data lives, switching the container engine.
  'storage.moveAll': 'always',
  'apps.moveData': 'always',
  'settings.engine.switch': 'always',

  // Never served on the public address: first-run setup, invites and reset links (US-SYS-46).
  'onboarding.checkSystem': 'neverServed',
  'onboarding.confirmSystem': 'neverServed',
  'onboarding.installEngine': 'neverServed',
  'onboarding.setStep': 'neverServed',
  'onboarding.createAdmin': 'neverServed',
  'onboarding.setupTotp': 'neverServed',
  'onboarding.confirmTotp': 'neverServed',
  'onboarding.setStorage': 'neverServed',
  'onboarding.connectRemote': 'neverServed',
  'onboarding.starterApps': 'neverServed',
  'onboarding.installStarterApps': 'neverServed',
  'onboarding.findBackups': 'neverServed',
  'onboarding.listRestorePoints': 'neverServed',
  'onboarding.restoreFromBackup': 'neverServed',
  'onboarding.complete': 'neverServed',
  'invites.inspect': 'neverServed',
  'invites.accept': 'neverServed',
  'auth.resetPassword': 'neverServed',
} as const satisfies Record<string, HomeOnlyRule>;

export type HomeOnlyProcedure = keyof typeof HOME_ONLY_PROCEDURES;

/** The rule for a procedure path, or null when it works from anywhere. */
export function homeOnlyRule(path: string): HomeOnlyRule | null {
  return Object.hasOwn(HOME_ONLY_PROCEDURES, path) ? HOME_ONLY_PROCEDURES[path as HomeOnlyProcedure] : null;
}

/**
 * Whether a call to `path` with `input` only works at home: always for most, and for making things public unless the
 * input makes it private (`{ public: false }`). Without `input`, whether the control that makes something public is.
 */
export function isHomeOnly(path: string, input?: unknown): boolean {
  const rule = homeOnlyRule(path);
  if (rule === null) return false;
  if (rule !== 'makingPublic') return true;
  return !(typeof input === 'object' && input !== null && (input as { public?: unknown }).public === false);
}
