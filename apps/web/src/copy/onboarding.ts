// Words for onboarding (docs/features/02-onboarding.md). Sentence case, plain words.
export const onboardingCopy = {
  welcomeTitle: 'Welcome to hlabs',
  welcomeSubtitle: 'Your own cloud, running on this computer.',
  getStarted: 'Get started',
  setupTime: 'Setup takes about five minutes',
  startFailed: "Couldn't start setup. Try again.",
  stepNames: {
    system: 'System check',
    account: 'Admin account',
    twoFactor: 'Two-factor login',
    storage: 'Storage',
    remote: 'Remote access',
    apps: 'Starter apps',
  },
  titles: {
    system: 'Checking this computer',
    account: 'Create your admin account',
    twoFactor: 'Add two-factor login',
    storage: 'Where should your data live?',
    done: "You're all set",
  },
  finishOnHost: 'Finish setup on the computer running hlabs.',
} as const;
