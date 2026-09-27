// The recovery codes, shown once after two-factor is turned on (US-ONB-12): download, copy, then Continue.
import { Button } from '@hlabs/ui';
import { onboardingCopy } from '../copy/onboarding';
import { CopyButton } from './copy-button';

const copy = onboardingCopy.twoFactor;

export const RECOVERY_FILE_NAME = 'hlabs-recovery-codes.txt';

/** The downloaded file: server, username, date and the 10 codes. */
export function recoveryCodesText(opts: { hostname: string; username: string; date: Date; codes: string[] }): string {
  const f = copy.file;
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

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = RECOVERY_FILE_NAME;
  a.click();
  URL.revokeObjectURL(url);
}

export function RecoveryCodes(props: {
  codes: string[];
  hostname: string;
  username: string;
  onContinue: () => void;
  continuing: boolean;
}) {
  const { codes } = props;
  return (
    <>
      <p role="note" className="m-0 mt-2 text-body text-ink-muted">
        {copy.codesWarning}
      </p>
      <ul className="m-0 mt-6 grid list-none grid-cols-2 gap-2 p-0" aria-label={copy.codesLabel}>
        {codes.map((code) => (
          <li key={code} className="rounded-sm bg-surface-input px-3 py-2 font-mono text-mono">
            {code}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => download(recoveryCodesText({ ...props, date: new Date() }))}
          >
            {copy.download}
          </Button>
          <CopyButton text={codes.join('\n')} label={copy.copyCodes} />
        </div>
        <Button size="lg" onClick={props.onContinue} disabled={props.continuing} aria-busy={props.continuing}>
          {onboardingCopy.continue}
        </Button>
      </div>
    </>
  );
}
