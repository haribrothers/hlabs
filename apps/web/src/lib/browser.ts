// Leaving the dashboard for another address (an app's hostname, US-AUTH-18). One place, so tests can watch it.
export const browser = {
  assign(href: string) {
    window.location.assign(href);
  },
};
