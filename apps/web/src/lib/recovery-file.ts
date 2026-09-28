// The recovery codes file (US-ONB-12, US-ACCT-09): server, username, date and the 10 codes, one per line.
import { onboardingCopy } from '../copy/onboarding';

const f = onboardingCopy.twoFactor.file;

export function recoveryCodesText(opts: { hostname: string; username: string; date: Date; codes: string[] }): string {
  return [
    f.title,
    `${f.server}: ${opts.hostname}`,
    `${f.username}: ${opts.username}`,
    `${f.created}: ${opts.date.toISOString().slice(0, 10)}`,
    '',
    f.note,
    '',
    ...opts.codes,
    '',
  ].join('\n');
}

/** Saves text as a file in the browser's downloads. */
export function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
