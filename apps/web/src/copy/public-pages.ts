// hlabs's pages on a public app's address (US-APP-27, US-APP-28; D-178; the PublicSignIn screen): the sign-in in front
// of the app, signing out, "<App> isn't running" and "no access". Built into the fallback bundle (pages.html).

const minutes = (seconds: number | null, fallback: number) => {
  const m = Math.max(1, Math.ceil((seconds ?? fallback) / 60));
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
};

export const publicPageCopy = {
  signInTitle: (app: string) => `Sign in to open ${app}`,
  signInDocTitle: (app: string) => `Sign in · ${app}`,
  lead: (host: string) => `${host} is shared from an hlabs home server. Sign in with your hlabs account.`,
  codeLead: 'One more step. hlabs asks everyone for a code before opening a public app.',
  username: 'Username',
  password: 'Password',
  notYourAppAccount: (app: string) => `Your hlabs account, not your ${app} one.`,
  continue: 'Continue',
  forgot: 'Forgot your password? Ask the person who runs this hlabs.',
  codePrompt: 'Type the 6-digit code from your authenticator app.',
  code: '6-digit code',
  verify: 'Verify',
  useRecoveryCode: 'Use a recovery code',
  recoveryPrompt: 'Type one of the recovery codes you saved when you turned on two-factor login.',
  recoveryCode: 'Recovery code',
  useCode: 'Use the 6-digit code instead',
  wrongPassword: 'That username or password is wrong. Check them and try again.',
  wrongCode: "That code didn't work. Try the newest one.",
  expired: 'That took too long. Sign in again.',
  locked: (seconds: number | null) => `Too many tries. Try again in ${minutes(seconds, 60)}.`,
  no2faTitle: 'Turn on two-factor login first.',
  no2faBody: (app: string) =>
    `Opening ${app} from the internet needs it. Turn it on in hlabs at home, under Settings › Account, then come back here.`,
  back: 'Back',
  tooManyTries: (seconds: number | null) => `Too many tries from your address. Try again in ${minutes(seconds, 3600)}.`,
  protectedBy: 'Protected by hlabs',
  signOutTitle: (app: string) => `Sign out of ${app}?`,
  signOutBody: 'You’ll need your hlabs account and code to open it here again.',
  signOut: 'Sign out',
  notRunningTitle: (app: string) => `${app} isn't running`,
  notRunningBody: 'Try again later.',
} as const;
