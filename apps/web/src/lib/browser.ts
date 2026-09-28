// Leaving the dashboard for another address (an app's hostname, US-AUTH-18, US-HOME-03). One place, so tests can watch it.
export const browser = {
  assign(href: string) {
    window.location.assign(href);
  },
  /** A new tab, without giving the app a handle back to hlabs. */
  open(href: string) {
    window.open(href, '_blank', 'noopener,noreferrer');
  },
};
