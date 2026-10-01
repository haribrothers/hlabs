// Leaving the dashboard for another address (an app's hostname, US-AUTH-18, US-HOME-03). One place, so tests can watch it.
export const browser = {
  assign(href: string) {
    window.location.assign(href);
  },
  /** Saves a file the dashboard fetched (downloaded logs, US-APP-10). */
  save(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
  /** A new tab, without giving the app a handle back to hlabs. */
  open(href: string) {
    window.open(href, '_blank', 'noopener,noreferrer');
  },
};
