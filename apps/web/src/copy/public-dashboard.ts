// The public dashboard (US-SYS-45…48; D-182, 07 §7.11): its row in Settings › Network's Public access, making it public
// (DashboardPublic), Cloudflare's sign-in in front (CloudflareAccessSetup), the sign-in there (LoginPublic), "At home
// only" and its explanation (HomeOnlyAction), and Home there (HomePublicAddress).
import type { HomeOnlyProcedure } from '@hlabs/shared';

/** "Asha hasn't", "Asha and Ravi haven't". */
const hasnt = (names: readonly string[]) =>
  names.length === 0
    ? "An admin hasn't"
    : names.length === 1
      ? `${names[0]} hasn't`
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)} haven't`;

const dayMonth = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * What each home-only procedure does, as the explanation names it: "<what> only works from hlabs at home or on your
 * tailnet…". Every procedure on the list has words, so `HOME_ONLY` from the daemon is explained too.
 */
const homeOnlyWhat: Record<HomeOnlyProcedure, string> = {
  'system.factoryReset': 'A factory reset',
  'public.cloudflareSignIn': 'Setting up Cloudflare Tunnel',
  'public.setupCloudflare': 'Setting up Cloudflare Tunnel',
  'public.remove': 'Removing Cloudflare Tunnel',
  'public.setDashboard': 'Making the dashboard public',
  'public.setDashboardAccess': "Changing Cloudflare's sign-in in front of the dashboard",
  'apps.setPublic': 'Making an app public',
  'network.setHostname': "Changing the server's name",
  'network.remote.connect': 'Connecting Tailscale',
  'network.remote.disconnect': 'Disconnecting Tailscale',
  'network.setPorts': "Changing hlabs's ports",
  'network.setDnsServer': 'Changing the DNS server',
  'network.testDnsServer': 'Changing the DNS server',
  'network.setRemoteMode': 'Changing how your tailnet reaches apps',
  'store.sources.inspect': 'Adding an app source',
  'store.sources.add': 'Adding an app source',
  'store.sources.remove': 'Removing an app source',
  'store.copyToLibrary': 'Copying an app to your library',
  'apps.deployCustom': 'Deploying your own app',
  'apps.setPermissions': "Changing an app's permissions",
  'apps.setMounts': "Changing an app's folders",
  'apps.revealSecret': "Showing an app's secrets",
  'invites.create': 'Inviting someone',
  'invites.update': 'Changing an invite',
  'users.updateRole': "Changing someone's role",
  'users.delete': 'Deleting a person',
  'users.enable': 'Turning an account back on',
  'users.resetPasswordLink': 'Making a reset link',
  'users.setAppAccess': 'Changing who can open which app',
  'users.updatePolicy': 'Changing what members can do',
  'account.changePassword': 'Changing your password',
  'account.totp.begin': 'Turning on two-factor login',
  'account.totp.confirm': 'Turning on two-factor login',
  'account.totp.disable': 'Turning off two-factor login',
  'account.recoveryCodes.regenerate': 'Making new recovery codes',
  'backups.restore': 'Restoring a backup',
  'backups.destinations.add': 'Adding a backup destination',
  'backups.destinations.update': 'Changing a backup destination',
  'backups.destinations.remove': 'Removing a backup destination',
  'backups.exportRepoPassword': 'Showing the backup password',
  'apps.setConfig': "Changing an app's settings",
  'apps.setAuthMode': 'Changing "Require hlabs login"',
  'ai.tokens.create': 'Making an AI access token',
  'storage.moveAll': 'Moving where data lives',
  'apps.moveData': "Moving an app's data",
  'settings.engine.switch': 'Switching the container engine',
  'onboarding.checkSystem': 'Setting up hlabs',
  'onboarding.confirmSystem': 'Setting up hlabs',
  'onboarding.installEngine': 'Setting up hlabs',
  'onboarding.setStep': 'Setting up hlabs',
  'onboarding.createAdmin': 'Setting up hlabs',
  'onboarding.setupTotp': 'Setting up hlabs',
  'onboarding.confirmTotp': 'Setting up hlabs',
  'onboarding.setStorage': 'Setting up hlabs',
  'onboarding.connectRemote': 'Setting up hlabs',
  'onboarding.starterApps': 'Setting up hlabs',
  'onboarding.installStarterApps': 'Setting up hlabs',
  'onboarding.findBackups': 'Setting up hlabs',
  'onboarding.listRestorePoints': 'Setting up hlabs',
  'onboarding.restoreFromBackup': 'Setting up hlabs',
  'onboarding.complete': 'Setting up hlabs',
  'invites.inspect': 'Accepting an invite',
  'invites.accept': 'Accepting an invite',
  'auth.resetPassword': 'Using a reset link',
};

export const publicDashboardCopy = {
  // On the public address (US-SYS-47, HomeOnlyAction, HomePublicAddress)
  banner: "You're using hlabs from the internet. Some changes only work at home or on your tailnet.",
  atHomeOnly: 'At home only',
  /** A control's accessible name there: "Remove…, at home only". */
  atHomeOnlyLabel: (label: string) => `${label.replace(/…$/, '')}, at home only`,
  homeOnlyTitle: 'Do this at home or on your tailnet',
  homeOnlyWhat,
  homeOnlyBody: (what: string | null) =>
    `${what ?? 'This'} only works from hlabs at home or on your tailnet, so someone with your password and code can't do it from the internet.`,
  ok: 'OK',
  /** Setup, invites and reset links there (US-SYS-46). */
  notHereTitle: 'Open this at home or on your tailnet.',
  notHereBody:
    'Setting up hlabs, invites and reset links never work from the internet. Open the link on a device at home or on your tailnet.',

  // Home there (HomePublicAddress)
  tilePublic: (app: string, host: string) => `${app}, public, opens ${host}`,
  tileAway: (app: string) => `${app}, at home only`,
  opensAtHome: (app: string) => `${app} opens at home or on your tailnet.`,
  notPublicNote: "It isn't public, so it can't be reached from the internet.",
  makeAppPublic: (app: string) => `Make ${app} public…`,
  dockAway: (app: string) => `${app} · At home only`,

  // Settings › Network › Public access: the Dashboard row (US-SYS-45, SettingsNetworkPublicDashboard)
  publicAccessHint: 'Make single apps, or the dashboard itself, reachable from the internet.',
  dashboard: 'Dashboard',
  notPublic: 'Not public. Reach it at home or on your tailnet.',
  needsTunnel: 'Set up Cloudflare Tunnel first to make the dashboard public.',
  makePublic: 'Make public…',
  makePrivate: 'Make private',
  change: 'Change…',
  publicAt: 'Public at',
  sinceBy: (since: number, by: string | null) =>
    by ? `since ${dayMonth(since)} by ${by}` : `since ${dayMonth(since)}`,
  accessLine: (n: number) => `Cloudflare's sign-in in front · ${n} email ${n === 1 ? 'address' : 'addresses'}`,
  addAccess: "Add Cloudflare's sign-in…",
  removeAccess: 'Remove',
  turnOffAllHint: 'Makes the dashboard and every app private. Cloudflare Tunnel stays set up.',
  turnOffAllBody:
    'The dashboard and these apps stop answering on the internet within seconds, and everyone signed in to the dashboard there is signed out. Cloudflare Tunnel stays set up.',
  turnedOffAllBody: 'The dashboard and every app are private. Cloudflare Tunnel stays set up.',
  removeBody:
    'hlabs makes the dashboard and these apps private first, then deletes the tunnel, the DNS records it made and its Cloudflare sign-in from this computer.',
  removeBodyDashboardOnly:
    'hlabs makes the dashboard private first, then deletes the tunnel, the DNS records it made and its Cloudflare sign-in from this computer.',
  /** In the Remove and Turn off all confirmations: the dashboard first, then the apps. */
  dashboardRow: 'hlabs dashboard',
  working: 'Making it public…',
  turningOff: 'Making it private…',

  // DashboardPublic (US-SYS-45)
  makePublicTitle: 'Make the dashboard public',
  address: 'Address',
  addressLabel: (domain: string) => `Name under ${domain}`,
  addressHint: (domain: string) =>
    `A name of its own under ${domain}. hlabs adds it to the domain's DNS and takes it out again when the dashboard is private.`,
  whatChanges:
    'Anyone on the internet can reach the sign-in page. Everyone signs in with two-factor, and some changes only work at home.',
  onlyAtHome: 'Only at home',
  onlyAtHomeHint:
    "From the internet these say “Do this at home or on your tailnet”, so a stolen password and code can't do them.",
  homeOnlyList: [
    'Factory reset',
    'Public access and the network',
    'App sources and libraries',
    'Deploying your own apps',
    'App permissions and secrets',
    'People, roles and invites',
    'Passwords and two-factor',
    'Restoring backups',
    'Moving where data lives',
    'Switching the engine',
  ],
  alwaysWork: 'Making things private, turning off public access and signing out everywhere always work.',
  adminsWithTwoFactor: 'Admins with two-factor',
  twoFactorOn: 'Two-factor on',
  noTwoFactorYet: 'No two-factor yet',
  blocked: (names: readonly string[]) =>
    `${hasnt(names)} turned on two-factor login yet. Every admin needs it before the dashboard can be public.`,
  membersNote: "Members without two-factor can't sign in there until they turn it on.",
  password: 'Password',
  passwordHint: "Your hlabs password, to confirm it's you.",
  wrongPassword: "That password isn't right. Check it and try again.",
  othersTold: 'The other admins are told when the dashboard is made public.',
  cancel: 'Cancel',
  confirm: 'Make the dashboard public',
  madePublic: 'The dashboard is public',
  madePublicBody: (address: string) => `It answers at ${address}. Everyone signs in there with two-factor.`,
  makePublicFailed: "The dashboard couldn't be made public",
  accessFailed: "Cloudflare's sign-in couldn't be added",
  accessFailedBody: "The dashboard is public with hlabs's sign-in. Add Cloudflare's from its row in Public access.",

  // Make private (US-SYS-45)
  makePrivateTitle: 'Make the dashboard private?',
  makePrivateBody: (address: string) =>
    `${address} stops answering within seconds, and everyone signed in there is signed out. hlabs stays as it is at home and on your tailnet.`,
  makePrivateBodyHere: (address: string) =>
    `${address} stops answering within seconds, and everyone signed in there is signed out, you too. hlabs stays as it is at home and on your tailnet.`,
  madePrivate: 'The dashboard is private',
  makePrivateFailed: "The dashboard couldn't be made private",

  // Cloudflare's sign-in in front (US-SYS-48, CloudflareAccessSetup)
  accessTitle: "Add Cloudflare's sign-in in front",
  accessChangeTitle: "Change Cloudflare's sign-in",
  accessToggle: "Add Cloudflare's sign-in in front (recommended)",
  accessExplain:
    "Cloudflare asks for a code sent to an email address on your list before showing hlabs's sign-in. It's free for up to 50 people.",
  emailsAllowed: 'Email addresses allowed',
  addEmail: 'Add an email address',
  add: 'Add',
  removeEmail: (email: string) => `Remove ${email}`,
  emailsHint: 'Press Return after each one. Only admins see this list.',
  emailInvalid: 'Enter an email address such as hari@example.com.',
  emailsNeeded: 'Add at least one email address.',
  emailsTooMany: 'Cloudflare allows up to 50 people for free.',
  accessMade: (hostname: string) => ({
    before: 'hlabs makes this in Cloudflare Zero Trust for',
    hostname,
    after: 'and removes it when the dashboard is private.',
  }),
  needsToken:
    "Your Cloudflare sign-in can't manage Cloudflare Access. Add an API token with Account · Access: Apps and Policies · Edit.",
  apiToken: 'API token',
  tokenHint: 'Make one in Cloudflare under My Profile › API Tokens, with:',
  tokenPermission: 'Account · Access: Apps and Policies · Edit',
  tokenKept: "Kept in this computer's keychain with your other Cloudflare sign-in.",
  tokenTooShort: 'Paste the whole token',
  addAccessConfirm: "Add Cloudflare's sign-in",
  save: 'Save',
  accessAdded: "Cloudflare's sign-in is in front of the dashboard",
  accessChanged: "Cloudflare's sign-in is changed",
  removeAccessTitle: "Remove Cloudflare's sign-in?",
  removeAccessBody:
    "Anyone on the internet can reach hlabs's sign-in page again. Everyone still signs in with two-factor.",
  accessRemoved: "Cloudflare's sign-in is removed",

  // LoginPublic (US-SYS-46)
  signInTitle: 'Sign in to hlabs',
  twoFactorNeeded: 'Two-factor login is needed from the internet.',
  continue: 'Continue',
  forgotPublic: 'Forgot your password? Ask the person who runs this hlabs.',
  no2faStrong: 'Turn on two-factor login first.',
  no2faRest: 'Signing in from the internet needs it. Turn it on in hlabs at home, under Settings › Account.',
  back: 'Back',
  lockedLine: (minutes: number) => `Too many tries. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
  addressLockedLine: 'Too many tries from this network. Try again in about an hour.',
  fromInternet: 'From the internet ·',
} as const;
