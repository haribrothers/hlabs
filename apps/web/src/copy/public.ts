// Public apps through Cloudflare Tunnel (US-SYS-43, 44, US-APP-27…29; D-150, D-171): Settings › Network's Public
// access group, an app's "Public on the internet" row, the AppPublic dialog and Visits.
import type { VisitResult } from '@hlabs/api';

const dayMonth = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
/** "since 3 Dec by Hari" */
const sinceBy = (since: number, by: string | null) =>
  by ? `since ${dayMonth(since)} by ${by}` : `since ${dayMonth(since)}`;
const accessLine = (access: 'hlabs' | 'ownLogin', appName: string) =>
  access === 'hlabs' ? 'hlabs login with two-factor' : `${appName}'s own login`;

export const publicCopy = {
  // Settings › Network & remote access › Public access (US-SYS-43, 44)
  publicAccess: 'Public access',
  publicAccessHint: 'Make single apps reachable from the internet. Your dashboard never is.',
  cloudflareTunnel: 'Cloudflare Tunnel',
  notSetUpHint:
    'Public apps go through Cloudflare Tunnel, at names under a domain of yours. Your tailnet stays private.',
  setUp: 'Set up Cloudflare Tunnel…',
  connected: 'Connected',
  seesTraffic: 'Cloudflare sees the traffic to your public apps',
  waitingForSignIn: 'Waiting for sign-in…',
  settingUp: 'Setting up…',
  notWorking: 'Not working',
  removing: 'Removing…',
  reasons: {
    connector: "Cloudflare Tunnel isn't running. hlabs keeps trying to start it; check your internet connection.",
    credentialMissing:
      "hlabs's Cloudflare sign-in isn't in this computer's keychain any more. Remove Cloudflare Tunnel and set it up again.",
    remove: "Cloudflare didn't let hlabs delete the tunnel yet. Your apps are private. Try Remove… again.",
  } as Record<string, string>,
  setupFailed: "Setup didn't finish",
  remove: 'Remove…',
  publicApps: 'Public apps',
  noPublicApps: 'No apps are public.',
  publicBadge: 'Public',
  visits: 'Visits',
  makePrivate: 'Make private',
  turnOffAll: 'Turn off all public access…',
  turnOffAllHint: 'Makes every app private. Cloudflare Tunnel stays set up.',
  accessLine,
  sinceBy,
  loadFailed: "Couldn't load public access.",
  tryAgain: 'Try again',

  // PublicSetup (US-SYS-43)
  setupTitle: 'Set up Cloudflare Tunnel',
  setupIntro:
    'Apps you make public get names under a domain of yours, like photos.example.com. Nothing changes on your router, and your tailnet stays private.',
  needFirst: 'You need first',
  needDomain: 'A domain of yours, added to your Cloudflare account',
  needDomainHint: 'A free Cloudflare account is enough.',
  howToAddDomain: 'How to add a domain to Cloudflare',
  seesTrafficTitle: 'Cloudflare will see the traffic to your public apps.',
  seesTrafficBody:
    "What hlabs gets from Cloudflare is kept in this computer's keychain, never in hlabs's database or logs. hlabs only changes the DNS records it makes.",
  signIn: 'Sign in to Cloudflare',
  useToken: 'Use an API token instead',
  useSignIn: 'Sign in to Cloudflare instead',
  cancel: 'Cancel',
  close: 'Close',
  checkAndSetUp: 'Check and set up',
  waitingTitle: 'Waiting for you in Cloudflare…',
  waitingHint: 'In the tab that opened, sign in, pick your domain and approve hlabs. This window carries on by itself.',
  openAgain: 'Open Cloudflare again',
  opensInNewTab: '(opens in a new tab)',
  domain: 'Domain',
  domainPlaceholder: 'example.com',
  domainInvalid: 'Enter a domain such as example.com',
  apiToken: 'API token',
  tokenHint: 'Make one in Cloudflare under My Profile › API Tokens, for this domain only, with:',
  tokenPermissions: ['Zone · DNS · Edit', 'Account · Cloudflare Tunnel · Edit'],
  tokenTooShort: 'Paste the whole token',
  steps: {
    signedIn: (domain: string) => `Signed in to Cloudflare for ${domain}`,
    signedInNoDomain: 'Signed in to Cloudflare',
    tokenChecked: (domain: string) => `Cloudflare accepted the token for ${domain}`,
    signingIn: 'Signing in to Cloudflare…',
    tunnel: 'Making the tunnel…',
    tunnelDone: 'Tunnel “hlabs” made',
    connector: 'Starting the connector…',
    connectorDone: 'Connector started',
  },
  setUpDone: 'Cloudflare Tunnel is set up',
  setUpDoneBody: 'Make an app public from its settings, in its Access section.',
  signInFailed: "Couldn't start signing in to Cloudflare. Try again.",

  // PublicRemove (US-SYS-43)
  removeTitle: 'Remove Cloudflare Tunnel?',
  removeBody:
    'hlabs makes these apps private first, then deletes the tunnel, the DNS records it made and its Cloudflare sign-in from this computer.',
  removeBodyNone: 'hlabs deletes the tunnel, the DNS records it made and its Cloudflare sign-in from this computer.',
  removeKeeps: "Your domain's other DNS records, like a website or email, aren't touched.",
  removeConfirm: 'Make private and remove',
  removeConfirmNone: 'Remove',
  removed: 'Cloudflare Tunnel is removed',
  removeFailed: "Cloudflare Tunnel couldn't be removed",

  // PublicTurnOffAll (US-SYS-44)
  turnOffAllTitle: 'Turn off all public access?',
  turnOffAllBody:
    'These apps stop answering on the internet within seconds. Cloudflare Tunnel stays set up, so you can make apps public again later.',
  turnOffAllNotice: 'The other admins get a notification, and the audit log records it.',
  turnOffAllConfirm: 'Turn off public access',
  turnedOffAll: 'Public access is off',
  turnedOffAllBody: 'Every app is private. Cloudflare Tunnel stays set up.',
  turnOffAllFailed: "Public access couldn't be turned off for every app",

  // An app's Access section (US-APP-27)
  publicOnInternet: 'Public on the internet',
  notPublic: (app: string) => `Not public. Only your home network and tailnet can open ${app}.`,
  makePublicEllipsis: 'Make public…',
  setUpFirst: 'Set up public access in Settings › Network first.',
  openNetworkSettings: 'Open Network settings',
  notAllowed: (app: string, reason: string | null) =>
    `${app} can't be made public: ${reason ?? 'it can control your other apps.'}`,
  neverPublic: 'Never public',
  publicLine: (access: 'hlabs' | 'ownLogin', appName: string, since: number, by: string | null) =>
    `Cloudflare Tunnel · ${accessLine(access, appName)} · ${sinceBy(since, by)}`,
  change: 'Change…',
  requireLoginWhilePublic: (app: string) => `On while ${app} is public with the hlabs login`,
  autoUpdateWhilePublic: (app: string) => `On while ${app} is public`,
  makePrivateTitle: (app: string) => `Make ${app} private?`,
  makePrivateBody: (address: string, app: string) =>
    `${address} stops answering within seconds. ${app} stays as it is at home and on your tailnet.`,
  madePrivate: (app: string) => `${app} is private`,
  madePublic: (app: string) => `${app} is public`,
  publicChanged: (app: string) => `${app}'s public address is changed`,
  makePrivateFailed: (app: string) => `${app} couldn't be made private`,
  makePublicFailed: (app: string) => `${app} couldn't be made public`,

  // AppPublic (US-APP-27, US-APP-28)
  makePublicTitle: (app: string) => `Make ${app} public`,
  changeTitle: (app: string) => `Change ${app}'s public address`,
  address: 'Address',
  addressLabel: (domain: string) => `Name under ${domain}`,
  addressHint: (domain: string, app: string) =>
    `A name of its own under ${domain}. hlabs adds it to the domain's DNS and takes it out again when ${app} is private.`,
  labelInvalid: 'Use lowercase letters, numbers and hyphens, starting and ending with a letter or number.',
  labelTaken: (host: string) => `${host} is used by another public app. Choose another name.`,
  hostnameTaken: (host: string) => `${host} is already in your domain's DNS. Choose another name.`,
  whoCanGetIn: 'Who can get in',
  hlabsLogin: (app: string) => `People with an hlabs account and access to ${app}`,
  hlabsLoginHint: 'They sign in to hlabs first, with two-factor.',
  ownLogin: (app: string) => `${app}'s own login only`,
  ownLoginHint: "Its phone and desktop apps connect. hlabs doesn't ask for a login.",
  twoFactorOn: 'Two-factor on',
  cantGetInYet: "Can't get in yet",
  noTwoFactor: (names: string[]) =>
    names.length === 1
      ? `${names[0]} hasn't turned on two-factor login yet, so can't get in until then.`
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)} haven't turned on two-factor login yet, so can't get in until then.`,
  nobodyHasTwoFactor:
    'Nobody with access has two-factor login on yet, so nobody could get in. Turn it on in Settings › Account first.',
  whoHasAccess: 'Who has access',
  ownLoginWarning: (app: string) =>
    `Anyone on the internet can reach ${app}'s sign-in page. Use a strong password for every ${app} account.`,
  understand: 'I understand',
  reachNote: 'Anyone on the internet can reach this address. hlabs asks for a login first.',
  mediaNote:
    "Cloudflare's terms limit streaming large amounts of video through its network. Check them before sharing a media library.",
  updatesStayOn: (app: string) => `Automatic updates stay on while ${app} is public.`,
  makePublic: 'Make public',
  save: 'Save',
  working: (address: string) => `Setting up ${address}…`,

  // Visits (US-APP-29)
  visitsTitle: (app: string) => `Visits to ${app}`,
  visitsLead: 'in the last 7 days. Kept for 7 days, never in backups.',
  requestsTo: 'Requests to',
  back: (app: string) => `Back to ${app}`,
  refused: (ip: string, until: string, failures: number) => ({
    strong: `${ip} is refused until ${until}.`,
    rest: `It got the password wrong ${failures} times in 10 minutes.`,
  }),
  refusedAdvice: (app: string) => `If you don't know who that is, make ${app} private.`,
  show: 'Show',
  all: 'All',
  results: {
    signedIn: 'Signed in',
    askedToSignIn: 'Asked to sign in',
    refused: 'Refused',
    tooManyTries: 'Too many tries',
  } satisfies Record<VisitResult, string>,
  when: 'When',
  from: 'From',
  page: 'Page',
  result: 'Result',
  noVisits: 'No visits in the last 7 days.',
  noVisitsFiltered: 'No visits like that in the last 7 days.',
  loadMore: 'Show more',
  today: 'Today',
  yesterday: 'Yesterday',
  notPublicNow: (app: string) => `${app} isn't public now. Visits from when it was are kept for 7 days.`,
  visitsFailed: "Couldn't load the visits.",
} as const;

/** A country's name from Cloudflare's two-letter code ("NL" → "Netherlands"); the code when the browser can't say. */
export function countryName(code: string | null): string | null {
  if (!code || code === 'XX' || code === 'T1') return null;
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
