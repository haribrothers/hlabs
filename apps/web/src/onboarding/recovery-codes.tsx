// The recovery codes, shown once after two-factor is turned on (US-ONB-12): download, copy, then Continue.
import { Button } from '@hlabs/ui';
import { onboardingCopy } from '../copy/onboarding';
import { downloadText, recoveryCodesText } from '../lib/recovery-file';
import { CopyButton } from './copy-button';

const copy = onboardingCopy.twoFactor;

export const RECOVERY_FILE_NAME = 'hlabs-recovery-codes.txt';

export { recoveryCodesText };

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
            onClick={() => downloadText(recoveryCodesText({ ...props, date: new Date() }), RECOVERY_FILE_NAME)}
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
