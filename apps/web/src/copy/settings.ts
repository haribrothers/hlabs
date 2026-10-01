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

/** The pages the daemon answers with on app hostnames (US-AUTH-17, US-AUTH-19), outside the dashboard. */
export const appPageCopy = {
  notFoundCode: '404',
  notFoundTitle: 'This page doesn’t exist',
  notFoundBody: 'If you followed a link to an app, it may have been uninstalled or renamed.',
  notFoundDocTitle: 'Page not found · hlabs',
  engineStoppedDocTitle: 'Engine stopped · hlabs',
  noAccessBody: (app: string, admin: string | null) =>
    `${app} hasn’t been shared with you. Ask ${admin ?? 'an admin'} to share it with you.`,
  member: 'Member',
} as const;
