// Settings (09-account-people.md, 10-system-settings.md). Sentence case, plain words.
export const settingsCopy = {
  title: 'Settings',
  sections: 'Settings sections',
  back: 'Settings',
  empty: 'Nothing here yet.',
  sectionTitle: (section: string) => `${section} · Settings · hlabs`,
  section: {
    account: 'Account',
    users: 'Users',
    appearance: 'Appearance',
    notifications: 'Notifications',
    network: 'Network & remote access',
    storage: 'Storage',
    engine: 'Engine & startup',
    backups: 'Backups',
    updates: 'Updates',
    advanced: 'Advanced',
    about: 'About',
  },
} as const;

/** The access-denied and not-found cards (US-STATE-20). */
export const accessCopy = {
  noAccessTitle: "You don't have access to this",
  noAccessBody: 'Ask an admin if you need it.',
  noAccessDocTitle: 'No access · hlabs',
  signedInAs: (username: string) => `Signed in as @${username}`,
  notFoundTitle: 'Page not found',
  notFoundBody: 'This page doesn’t exist.',
  goHome: 'Go to Home',
} as const;
