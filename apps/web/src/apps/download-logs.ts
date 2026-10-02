// Downloads an app's whole logs (US-APP-10): every line Docker kept for the chosen container, or all of them, as a
// plain-text file. A failed download says so with "Try again".
import { appsCopy } from '../copy/apps';
import { browser } from '../lib/browser';
import { showToast } from '../lib/toasts';

const copy = appsCopy;

/** The file name the daemon gives (`immich-logs-20261001-1702.log`), or a plain one. */
function fileName(res: Response, appId: string): string {
  const named = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1];
  return named ?? `${appId}-logs.log`;
}

export async function downloadLogs(appId: string, service: string | undefined): Promise<void> {
  const query = service ? `?service=${encodeURIComponent(service)}` : '';
  try {
    const res = await fetch(`/api/apps/${encodeURIComponent(appId)}/logs/download${query}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`download answered ${res.status}`);
    browser.save(await res.blob(), fileName(res, appId));
  } catch {
    showToast({
      tone: 'danger',
      title: copy.downloadFailed,
      actions: [{ kind: 'retry', label: copy.tryAgain, run: () => void downloadLogs(appId, service) }],
    });
  }
}
