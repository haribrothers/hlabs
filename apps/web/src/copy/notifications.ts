// The bell and notifications panel on Home (US-HOME-13, 14). Sentence case.
export const notificationsCopy = {
  bell: (unread: number) => (unread > 0 ? `Notifications, ${unread} new` : 'Notifications'),
  title: 'Notifications',
  markAllRead: 'Mark all read',
  today: 'Today',
  earlier: 'Earlier',
  empty: "You're all caught up",
  unread: 'Unread',
  dismiss: (title: string) => `Dismiss "${title}"`,
  showMore: 'Show more',
  couldntLoad: "Couldn't load notifications.",
  retry: 'Try again',
  /** The app an action was about has gone (US-HOME-14). */
  appGone: 'That app is no longer installed',
} as const;
