// Before an app window loads its frame (D-097): can this browser open the app's address? Over HTTPS, an address whose
// certificate the browser doesn't trust fails without a word inside a frame (there's no "proceed anyway" there), so
// the window asks first. A no-cors request fails the same way an untrusted certificate (or an unknown name) does,
// and succeeds with an opaque answer otherwise. A slow answer counts as reachable: the frame's own timers handle it.
const CHECK_MS = 8_000;

/** Only on the real dashboard (HTTPS): development and e2e run over plain HTTP, where there's no certificate. */
export const shouldCheckAddress = () => window.location.protocol === 'https:';

export async function addressReachable(url: string): Promise<boolean> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), CHECK_MS);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: timeout.signal });
    return true;
  } catch {
    return timeout.signal.aborted;
  } finally {
    clearTimeout(timer);
  }
}
